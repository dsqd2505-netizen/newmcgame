const fs = require('fs');
const path = require('path');
const { smartDownloadStream } = require('./proxyClient');

// Domain configuration
const ORIGINAL_DOMAIN = 'hytale.com';
const MIN_DOMAIN_LENGTH = 4;
const MAX_DOMAIN_LENGTH = 16;

// DualAuth ByteBuddy Agent (runtime class transformation, no JAR modification)
const DUALAUTH_AGENT_URL = 'https://github.com/sanasol/hytale-auth-server/releases/latest/download/dualauth-agent.jar';
const DUALAUTH_AGENT_FILENAME = 'dualauth-agent.jar';

function getTargetDomain() {
  if (process.env.HYTALE_AUTH_DOMAIN) {
    return process.env.HYTALE_AUTH_DOMAIN;
  }
  try {
    const { getAuthDomain } = require('../core/config');
    return getAuthDomain();
  } catch (e) {
    return 'auth.sanasol.ws';
  }
}

const DEFAULT_NEW_DOMAIN = 'auth.sanasol.ws';

/**
 * Patches HytaleClient binary to replace hytale.com with custom domain
 * Server auth is handled by DualAuth ByteBuddy Agent (-javaagent: flag)
 *
 * Supports domains from 4 to 16 characters:
 * - All F2P traffic routes to single endpoint: https://{domain} (no subdomains)
 * - Domains <= 10 chars: Direct replacement, subdomains stripped
 * - Domains 11-16 chars: Split mode - first 6 chars replace subdomain prefix, rest replaces domain
 */
class ClientPatcher {
  constructor() {
    this.patchedFlag = '.patched_custom';
  }

  /**
   * Get the target domain for patching
   */
  getNewDomain() {
    const domain = getTargetDomain();
    if (domain.length < MIN_DOMAIN_LENGTH) {
      console.warn(`Warning: Domain "${domain}" is too short (min ${MIN_DOMAIN_LENGTH} chars)`);
      console.warn(`Using default domain: ${DEFAULT_NEW_DOMAIN}`);
      return DEFAULT_NEW_DOMAIN;
    }
    if (domain.length > MAX_DOMAIN_LENGTH) {
      console.warn(`Warning: Domain "${domain}" is too long (max ${MAX_DOMAIN_LENGTH} chars)`);
      console.warn(`Using default domain: ${DEFAULT_NEW_DOMAIN}`);
      return DEFAULT_NEW_DOMAIN;
    }
    return domain;
  }

  /**
   * Calculate the domain patching strategy based on length
   */
  getDomainStrategy(domain) {
    if (domain.length <= 10) {
      return {
        mode: 'direct',
        mainDomain: domain,
        subdomainPrefix: '',
        description: `Direct replacement: hytale.com -> ${domain}`
      };
    } else {
      const prefix = domain.slice(0, 6);
      const suffix = domain.slice(6);
      return {
        mode: 'split',
        mainDomain: suffix,
        subdomainPrefix: prefix,
        description: `Split mode: subdomain prefix="${prefix}", main domain="${suffix}"`
      };
    }
  }

  /**
   * Convert a string to the length-prefixed byte format used by the client
   */
  stringToLengthPrefixed(str) {
    const length = str.length;
    const result = Buffer.alloc(4 + length + (length - 1));
    result[0] = length;
    result[1] = 0x00;
    result[2] = 0x00;
    result[3] = 0x00;

    let pos = 4;
    for (let i = 0; i < length; i++) {
      result[pos++] = str.charCodeAt(i);
      if (i < length - 1) {
        result[pos++] = 0x00;
      }
    }
    return result;
  }

  /**
   * Convert a string to UTF-16LE bytes (how .NET stores strings)
   */
  stringToUtf16LE(str) {
    const buf = Buffer.alloc(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      buf.writeUInt16LE(str.charCodeAt(i), i * 2);
    }
    return buf;
  }

  /**
   * Find all occurrences of a pattern in a buffer
   */
  findAllOccurrences(buffer, pattern) {
    const positions = [];
    let pos = 0;
    while (pos < buffer.length) {
      const index = buffer.indexOf(pattern, pos);
      if (index === -1) break;
      positions.push(index);
      pos = index + 1;
    }
    return positions;
  }

  /**
   * Replace bytes in buffer - only overwrites the length of new bytes
   */
  replaceBytes(buffer, oldBytes, newBytes) {
    let count = 0;
    const result = Buffer.from(buffer);

    if (newBytes.length > oldBytes.length) {
      console.warn(`  Warning: New pattern (${newBytes.length}) longer than old (${oldBytes.length}), skipping`);
      return { buffer: result, count: 0 };
    }

    const positions = this.findAllOccurrences(result, oldBytes);
    for (const pos of positions) {
      newBytes.copy(result, pos);
      count++;
    }

    return { buffer: result, count };
  }

  /**
   * Smart domain replacement that handles both null-terminated and non-null-terminated strings
   */
  findAndReplaceDomainSmart(data, oldDomain, newDomain) {
    let count = 0;
    const result = Buffer.from(data);

    const oldUtf16NoLast = this.stringToUtf16LE(oldDomain.slice(0, -1));
    const newUtf16NoLast = this.stringToUtf16LE(newDomain.slice(0, -1));

    const oldLastCharByte = oldDomain.charCodeAt(oldDomain.length - 1);
    const newLastCharByte = newDomain.charCodeAt(newDomain.length - 1);

    const positions = this.findAllOccurrences(result, oldUtf16NoLast);

    for (const pos of positions) {
      const lastCharPos = pos + oldUtf16NoLast.length;
      if (lastCharPos + 1 > result.length) continue;

      const lastCharFirstByte = result[lastCharPos];

      if (lastCharFirstByte === oldLastCharByte) {
        newUtf16NoLast.copy(result, pos);
        result[lastCharPos] = newLastCharByte;

        if (lastCharPos + 1 < result.length) {
          const secondByte = result[lastCharPos + 1];
          if (secondByte === 0x00) {
            console.log(`  Patched UTF-16LE occurrence at offset 0x${pos.toString(16)}`);
          } else {
            console.log(`  Patched length-prefixed occurrence at offset 0x${pos.toString(16)} (metadata: 0x${secondByte.toString(16)})`);
          }
        }
        count++;
      }
    }

    return { buffer: result, count };
  }

  /**
   * Apply all domain patches using length-prefixed format
   */
  applyDomainPatches(data, domain, protocol = 'https://') {
    let result = Buffer.from(data);
    let totalCount = 0;
    const strategy = this.getDomainStrategy(domain);

    console.log(`  Patching strategy: ${strategy.description}`);

    // 1. Patch telemetry/sentry URL
    const oldSentry = 'https://ca900df42fcf57d4dd8401a86ddd7da2@sentry.hytale.com/2';
    const newSentry = `${protocol}t@${domain}/2`;

    console.log(`  Patching sentry: ${oldSentry.slice(0, 30)}... -> ${newSentry}`);
    const sentryResult = this.replaceBytes(
      result,
      this.stringToLengthPrefixed(oldSentry),
      this.stringToLengthPrefixed(newSentry)
    );
    result = sentryResult.buffer;
    if (sentryResult.count > 0) {
      console.log(`    Replaced ${sentryResult.count} sentry occurrence(s)`);
      totalCount += sentryResult.count;
    }

    // 2. Patch main domain
    console.log(`  Patching domain: ${ORIGINAL_DOMAIN} -> ${strategy.mainDomain}`);
    const domainResult = this.replaceBytes(
      result,
      this.stringToLengthPrefixed(ORIGINAL_DOMAIN),
      this.stringToLengthPrefixed(strategy.mainDomain)
    );
    result = domainResult.buffer;
    if (domainResult.count > 0) {
      console.log(`    Replaced ${domainResult.count} domain occurrence(s)`);
      totalCount += domainResult.count;
    }

    // 3. Patch subdomain prefixes
    const subdomains = ['https://tools.', 'https://sessions.', 'https://account-data.', 'https://telemetry.'];
    const newSubdomainPrefix = protocol + strategy.subdomainPrefix;

    for (const sub of subdomains) {
      console.log(`  Patching subdomain: ${sub} -> ${newSubdomainPrefix}`);
      const subResult = this.replaceBytes(
        result,
        this.stringToLengthPrefixed(sub),
        this.stringToLengthPrefixed(newSubdomainPrefix)
      );
      result = subResult.buffer;
      if (subResult.count > 0) {
        console.log(`    Replaced ${subResult.count} occurrence(s)`);
        totalCount += subResult.count;
      }
    }

    return { buffer: result, count: totalCount };
  }

  /**
   * Patch Discord invite URLs
   */
  patchDiscordUrl(data) {
    let count = 0;
    const result = Buffer.from(data);

    const oldUrl = '.gg/hytale';
    const newUrl = '.gg/hf2pdc';

    const lpResult = this.replaceBytes(
      result,
      this.stringToLengthPrefixed(oldUrl),
      this.stringToLengthPrefixed(newUrl)
    );

    if (lpResult.count > 0) {
      return { buffer: lpResult.buffer, count: lpResult.count };
    }

    // Fallback to UTF-16LE
    const oldUtf16 = this.stringToUtf16LE(oldUrl);
    const newUtf16 = this.stringToUtf16LE(newUrl);

    const positions = this.findAllOccurrences(result, oldUtf16);
    for (const pos of positions) {
      newUtf16.copy(result, pos);
      count++;
    }

    return { buffer: result, count };
  }

  /**
   * Check patch status of client binary
   */
  getPatchStatus(clientPath) {
    const newDomain = this.getNewDomain();
    const patchFlagFile = clientPath + this.patchedFlag;

    if (fs.existsSync(patchFlagFile)) {
      try {
        const flagData = JSON.parse(fs.readFileSync(patchFlagFile, 'utf8'));
        const currentDomain = flagData.targetDomain;

        if (currentDomain === newDomain) {
          const data = fs.readFileSync(clientPath);
          const strategy = this.getDomainStrategy(newDomain);
          const domainPattern = this.stringToLengthPrefixed(strategy.mainDomain);

          if (data.includes(domainPattern)) {
            return { patched: true, currentDomain, needsRestore: false };
          } else {
            console.log('  Flag exists but binary not patched (was updated?), needs re-patching...');
            return { patched: false, currentDomain: null, needsRestore: false };
          }
        } else {
          console.log(`  Currently patched for "${currentDomain}", need to change to "${newDomain}"`);
          return { patched: false, currentDomain, needsRestore: true };
        }
      } catch (e) {
        // Flag file corrupt
      }
    }
    return { patched: false, currentDomain: null, needsRestore: false };
  }

  /**
   * Check if client is already patched (backward compat)
   */
  isPatchedAlready(clientPath) {
    return this.getPatchStatus(clientPath).patched;
  }

  /**
   * Restore client from backup
   */
  restoreFromBackup(clientPath) {
    const backupPath = clientPath + '.original';
    if (fs.existsSync(backupPath)) {
      console.log('  Restoring original binary from backup for re-patching...');
      fs.copyFileSync(backupPath, clientPath);
      const patchFlagFile = clientPath + this.patchedFlag;
      if (fs.existsSync(patchFlagFile)) {
        fs.unlinkSync(patchFlagFile);
      }
      return true;
    }
    console.warn('  No backup found to restore - will try patching anyway');
    return false;
  }

  /**
   * Mark client as patched
   */
  markAsPatched(clientPath) {
    const newDomain = this.getNewDomain();
    const strategy = this.getDomainStrategy(newDomain);
    const patchFlagFile = clientPath + this.patchedFlag;
    const flagData = {
      patchedAt: new Date().toISOString(),
      originalDomain: ORIGINAL_DOMAIN,
      targetDomain: newDomain,
      patchMode: strategy.mode,
      mainDomain: strategy.mainDomain,
      subdomainPrefix: strategy.subdomainPrefix,
      patcherVersion: '2.1.0',
      verified: 'binary_contents'
    };
    fs.writeFileSync(patchFlagFile, JSON.stringify(flagData, null, 2));
  }

  /**
   * Create backup of original client binary
   */
  backupClient(clientPath) {
    const backupPath = clientPath + '.original';
    try {
      if (!fs.existsSync(backupPath)) {
        console.log(`  Creating backup at ${path.basename(backupPath)}`);
        fs.copyFileSync(clientPath, backupPath);
        return backupPath;
      }

      const currentSize = fs.statSync(clientPath).size;
      const backupSize = fs.statSync(backupPath).size;

      if (currentSize !== backupSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const oldBackupPath = `${clientPath}.original.${timestamp}`;
        console.log(`  File updated, archiving old backup to ${path.basename(oldBackupPath)}`);
        fs.renameSync(backupPath, oldBackupPath);
        fs.copyFileSync(clientPath, backupPath);
        return backupPath;
      }

      console.log('  Backup already exists');
      return backupPath;
    } catch (e) {
      console.error(`  Failed to create backup: ${e.message}`);
      return null;
    }
  }

  /**
   * Restore original client binary
   */
  restoreClient(clientPath) {
    const backupPath = clientPath + '.original';
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, clientPath);
      const patchFlagFile = clientPath + this.patchedFlag;
      if (fs.existsSync(patchFlagFile)) {
        fs.unlinkSync(patchFlagFile);
      }
      console.log('Client restored from backup');
      return true;
    }
    console.log('No backup found to restore');
    return false;
  }

  /**
   * Patch the client binary to use the custom domain
   */
  async patchClient(clientPath, progressCallback) {
    const newDomain = this.getNewDomain();
    const strategy = this.getDomainStrategy(newDomain);

    console.log('=== Client Patcher v2.1 ===');
    console.log(`Target: ${clientPath}`);
    console.log(`Domain: ${newDomain} (${newDomain.length} chars)`);
    console.log(`Mode: ${strategy.mode}`);
    if (strategy.mode === 'split') {
      console.log(`  Subdomain prefix: ${strategy.subdomainPrefix}`);
      console.log(`  Main domain: ${strategy.mainDomain}`);
    }

    if (!fs.existsSync(clientPath)) {
      const error = `Client binary not found: ${clientPath}`;
      console.error(error);
      return { success: false, error };
    }

    const patchStatus = this.getPatchStatus(clientPath);

    if (patchStatus.patched) {
      console.log(`Client already patched for ${newDomain}, skipping`);
      if (progressCallback) progressCallback('Client already patched', 100);
      return { success: true, alreadyPatched: true, patchCount: 0 };
    }

    if (patchStatus.needsRestore) {
      if (progressCallback) progressCallback('Restoring original for domain change...', 5);
      this.restoreFromBackup(clientPath);
    }

    if (progressCallback) progressCallback('Preparing to patch client...', 10);

    console.log('Creating backup...');
    const backupResult = this.backupClient(clientPath);
    if (!backupResult) {
      console.warn('  Could not create backup - proceeding without backup');
    }

    if (progressCallback) progressCallback('Reading client binary...', 20);

    console.log('Reading client binary...');
    const data = fs.readFileSync(clientPath);
    console.log(`Binary size: ${(data.length / 1024 / 1024).toFixed(2)} MB`);

    if (progressCallback) progressCallback('Patching domain references...', 50);

    console.log('Applying domain patches (length-prefixed format)...');
    const { buffer: patchedData, count } = this.applyDomainPatches(data, newDomain);

    console.log('Patching Discord URLs...');
    const { buffer: finalData, count: discordCount } = this.patchDiscordUrl(patchedData);

    if (count === 0 && discordCount === 0) {
      console.log('No occurrences found - trying legacy UTF-16LE format...');

      const legacyResult = this.findAndReplaceDomainSmart(data, ORIGINAL_DOMAIN, strategy.mainDomain);
      if (legacyResult.count > 0) {
        console.log(`Found ${legacyResult.count} occurrences with legacy format`);
        fs.writeFileSync(clientPath, legacyResult.buffer);
        this.markAsPatched(clientPath);
        return { success: true, patchCount: legacyResult.count, format: 'legacy' };
      }

      console.log('No occurrences found - binary may already be modified or has different format');
      return { success: true, patchCount: 0, warning: 'No occurrences found' };
    }

    if (progressCallback) progressCallback('Writing patched binary...', 80);

    console.log('Writing patched binary...');
    fs.writeFileSync(clientPath, finalData);

    this.markAsPatched(clientPath);

    if (progressCallback) progressCallback('Patching complete', 100);

    console.log(`Successfully patched ${count} domain occurrences and ${discordCount} Discord URLs`);
    console.log('=== Patching Complete ===');

    return { success: true, patchCount: count + discordCount };
  }

  /**
   * Get the path to the DualAuth Agent JAR in a directory
   */
  getAgentPath(dir) {
    return path.join(dir, DUALAUTH_AGENT_FILENAME);
  }

  /**
   * Download DualAuth ByteBuddy Agent (replaces old pre-patched JAR approach)
   * The agent provides runtime class transformation via -javaagent: flag
   * No server JAR modification needed - original JAR stays pristine
   */
  async ensureAgentAvailable(serverDir, progressCallback) {
    const agentPath = this.getAgentPath(serverDir);

    console.log('=== DualAuth Agent (ByteBuddy) ===');
    console.log(`Target: ${agentPath}`);

    // Check if agent already exists and is valid
    if (fs.existsSync(agentPath)) {
      try {
        const stats = fs.statSync(agentPath);
        if (stats.size > 1024) {
          console.log(`DualAuth Agent present (${(stats.size / 1024).toFixed(0)} KB)`);
          if (progressCallback) progressCallback('DualAuth Agent ready', 100);
          return { success: true, agentPath, alreadyExists: true };
        }
        // File exists but too small - corrupt, re-download
        console.log('Agent file appears corrupt, re-downloading...');
        fs.unlinkSync(agentPath);
      } catch (e) {
        console.warn('Could not check agent file:', e.message);
      }
    }

    // Download agent from GitHub releases
    if (progressCallback) progressCallback('Downloading DualAuth Agent...', 20);
    console.log(`Downloading from: ${DUALAUTH_AGENT_URL}`);

    try {
      // Ensure server directory exists
      if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
      }

      const tmpPath = agentPath + '.tmp';
      const file = fs.createWriteStream(tmpPath);

      const stream = await smartDownloadStream(DUALAUTH_AGENT_URL, (chunk, downloadedBytes, total) => {
        if (progressCallback && total) {
          const percent = 20 + Math.floor((downloadedBytes / total) * 70);
          progressCallback(`Downloading agent... ${(downloadedBytes / 1024).toFixed(0)} KB`, percent);
        }
      });

      stream.pipe(file);

      await new Promise((resolve, reject) => {
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
        stream.on('error', reject);
      });

      // Verify download
      const stats = fs.statSync(tmpPath);
      if (stats.size < 1024) {
        fs.unlinkSync(tmpPath);
        const error = 'Downloaded agent too small (corrupt or failed download)';
        console.error(error);
        return { success: false, error };
      }

      // Atomic move
      if (fs.existsSync(agentPath)) {
        fs.unlinkSync(agentPath);
      }
      fs.renameSync(tmpPath, agentPath);

      console.log(`DualAuth Agent downloaded (${(stats.size / 1024).toFixed(0)} KB)`);
      if (progressCallback) progressCallback('DualAuth Agent ready', 100);
      return { success: true, agentPath };

    } catch (downloadError) {
      console.error(`Failed to download DualAuth Agent: ${downloadError.message}`);
      // Clean up temp file
      const tmpPath = agentPath + '.tmp';
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
      return { success: false, error: downloadError.message };
    }
  }

  /**
   * Find client binary path based on platform
   */
  findClientPath(gameDir) {
    const candidates = [];

    if (process.platform === 'darwin') {
      candidates.push(path.join(gameDir, 'Client', 'Hytale.app', 'Contents', 'MacOS', 'HytaleClient'));
      candidates.push(path.join(gameDir, 'Client', 'HytaleClient'));
    } else if (process.platform === 'win32') {
      candidates.push(path.join(gameDir, 'Client', 'HytaleClient.exe'));
    } else {
      candidates.push(path.join(gameDir, 'Client', 'HytaleClient'));
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Find server JAR path
   */
  findServerPath(gameDir) {
    const candidates = [
      path.join(gameDir, 'Server', 'HytaleServer.jar'),
      path.join(gameDir, 'Server', 'server.jar')
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Ensure client is patched and DualAuth Agent is available before launching
   */
  async ensureClientPatched(gameDir, progressCallback, javaPath = null, branch = 'release') {
    const results = {
      client: null,
      agent: null,
      success: true
    };

    const clientPath = this.findClientPath(gameDir);
    if (clientPath) {
      if (progressCallback) progressCallback('Patching client binary...', 10);
      results.client = await this.patchClient(clientPath, (msg, pct) => {
        if (progressCallback) {
          progressCallback(`Client: ${msg}`, pct ? pct / 2 : null);
        }
      });
    } else {
      console.warn('Could not find HytaleClient binary');
      results.client = { success: false, error: 'Client binary not found' };
    }

    // Download DualAuth ByteBuddy Agent (runtime patching, no JAR modification)
    const serverDir = path.join(gameDir, 'Server');
    if (fs.existsSync(serverDir)) {
      if (progressCallback) progressCallback('Checking DualAuth Agent...', 50);
      results.agent = await this.ensureAgentAvailable(serverDir, (msg, pct) => {
        if (progressCallback) {
          progressCallback(`Agent: ${msg}`, pct ? 50 + pct / 2 : null);
        }
      });
    } else {
      console.warn('Server directory not found, skipping agent download');
      results.agent = { success: true, skipped: true };
    }

    results.success = (results.client && results.client.success) || (results.agent && results.agent.success);
    results.alreadyPatched = (results.client && results.client.alreadyPatched) && (results.agent && results.agent.alreadyExists);
    results.patchCount = results.client ? results.client.patchCount || 0 : 0;

    if (progressCallback) progressCallback('Patching complete', 100);

    return results;
  }
}

module.exports = new ClientPatcher();
