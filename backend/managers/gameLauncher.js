const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getResolvedAppDir, findClientPath } = require('../core/paths');
const { setupWaylandEnvironment, setupGpuEnvironment } = require('../utils/platformUtils');
const {
  saveInstallPath,
  loadJavaPath,
  getUuidForUser,
  getAuthServerUrl,
  getAuthDomain,
  loadVersionBranch,
  loadVersionClient,
  saveVersionClient,
  loadUsername,
  hasUsername,
  checkLaunchReady
} = require('../core/config');
const { resolveJavaPath, getJavaExec, getBundledJavaPath, detectSystemJava, JAVA_EXECUTABLE } = require('./javaManager');
const { getLatestClientVersion } = require('../services/versionManager');
const { FORCE_CLEAN_INSTALL_VERSION, CLEAN_INSTALL_TEST_VERSION } = require('../core/testConfig');
const { ensureGameInstalled } = require('./differentialUpdateManager');
const { syncModsForCurrentProfile } = require('./modManager');
const { getUserDataPath } = require('../utils/userDataMigration');
const { syncServerList } = require('../utils/serverListSync');

// Client patcher for custom auth server (sanasol.ws)
let clientPatcher = null;
try {
  clientPatcher = require('../utils/clientPatcher');
} catch (err) {
  console.log('[Launcher] Client patcher not available:', err.message);
}

const execAsync = promisify(exec);

// Fetch tokens from the auth server (properly signed with server's Ed25519 key)
async function fetchAuthTokens(uuid, name) {
  const authServerUrl = getAuthServerUrl();
  try {
    console.log(`Fetching auth tokens from ${authServerUrl}/game-session/child`);

    const response = await fetch(`${authServerUrl}/game-session/child`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uuid: uuid,
        name: name,
        scopes: ['hytale:server', 'hytale:client']
      })
    });

    if (!response.ok) {
      throw new Error(`Auth server returned ${response.status}`);
    }

    const data = await response.json();
    console.log('Auth tokens received from server');

    return {
      identityToken: data.IdentityToken || data.identityToken,
      sessionToken: data.SessionToken || data.sessionToken
    };
  } catch (error) {
    console.error('Failed to fetch auth tokens:', error.message);
    // Fallback to local generation if server unavailable
    return generateLocalTokens(uuid, name);
  }
}

// Fallback: Generate tokens locally (won't pass signature validation but allows offline testing)
function generateLocalTokens(uuid, name) {
  console.log('Using locally generated tokens (fallback mode)');
  const authServerUrl = getAuthServerUrl();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 36000;

  const header = Buffer.from(JSON.stringify({
    alg: 'EdDSA',
    kid: '2025-10-01',
    typ: 'JWT'
  })).toString('base64url');

  const identityPayload = Buffer.from(JSON.stringify({
    sub: uuid,
    name: name,
    username: name,
    entitlements: ['game.base'],
    scope: 'hytale:server hytale:client',
    iat: now,
    exp: exp,
    iss: authServerUrl,
    jti: uuidv4()
  })).toString('base64url');

  const sessionPayload = Buffer.from(JSON.stringify({
    sub: uuid,
    scope: 'hytale:server',
    iat: now,
    exp: exp,
    iss: authServerUrl,
    jti: uuidv4()
  })).toString('base64url');

  const signature = crypto.randomBytes(64).toString('base64url');

  return {
    identityToken: `${header}.${identityPayload}.${signature}`,
    sessionToken: `${header}.${sessionPayload}.${signature}`
  };
}

async function launchGame(playerNameOverride = null, progressCallback, javaPathOverride, installPathOverride, gpuPreference = 'auto', branchOverride = null) {
  // ==========================================================================
  // CACHE INVALIDATION: Clear proxyClient module cache to force fresh .env load
  // This prevents stale cached values from affecting multiple launch attempts
  // ==========================================================================
  try {
    const proxyClientPath = require.resolve('../utils/proxyClient');
    if (require.cache[proxyClientPath]) {
      delete require.cache[proxyClientPath];
      console.log('[Launcher] Cleared proxyClient cache for fresh .env load');
    }
  } catch (cacheErr) {
    console.warn('[Launcher] Could not clear proxyClient cache:', cacheErr.message);
  }

  // ==========================================================================
  // STEP 1: Validate player identity FIRST (before any other operations)
  // ==========================================================================
  const launchState = checkLaunchReady();

  // Load username from config - single source of truth
  let playerName = loadUsername();

  if (!playerName) {
    // No username configured - this is a critical error
    const error = new Error('No username configured. Please set your username in Settings before playing.');
    console.error('[Launcher] Launch blocked:', error.message);
    throw error;
  }

  // Allow override only if explicitly provided (for testing/migration)
  if (playerNameOverride && typeof playerNameOverride === 'string' && playerNameOverride.trim()) {
    const overrideName = playerNameOverride.trim();
    if (overrideName !== playerName && overrideName !== 'Player') {
      console.warn(`[Launcher] Username override requested: "${overrideName}" (saved: "${playerName}")`);
      // Use override for this session but DON'T save it - config is source of truth
      playerName = overrideName;
    }
  }

  // Warn if using default 'Player' name (likely misconfiguration)
  if (playerName === 'Player') {
    console.warn('[Launcher] Warning: Using default username "Player". This may cause cosmetic issues.');
  }

  console.log(`[Launcher] Launching game for player: "${playerName}"`);

  // ==========================================================================
  // STEP 2: Synchronize server list
  // ==========================================================================
  try {
    console.log('[Launcher] Synchronizing server list...');
    await syncServerList();
  } catch (syncError) {
    console.warn('[Launcher] Server list sync failed, continuing launch:', syncError.message);
  }

  // ==========================================================================
  // STEP 3: Setup paths and directories
  // ==========================================================================
  const branch = branchOverride || loadVersionBranch();
  const customAppDir = getResolvedAppDir(installPathOverride);
  const customGameDir = path.join(customAppDir, branch, 'package', 'game', 'latest');
  const customJreDir = path.join(customAppDir, branch, 'package', 'jre', 'latest');

  // NEW 2.2.0: Use centralized UserData location
  const userDataDir = getUserDataPath();

  const gameLatest = customGameDir;
  let clientPath = findClientPath(gameLatest);

  if (!clientPath) {
    throw new Error('Game is not installed. Please install the game first.');
  }

  // NOTE: We do NOT save username here anymore - username is only saved
  // when user explicitly changes it in Settings. This prevents accidental
  // overwrites from race conditions or default values.

  if (installPathOverride) {
    saveInstallPath(installPathOverride);
  }

  const configuredJava = (javaPathOverride !== undefined && javaPathOverride !== null
    ? javaPathOverride
    : loadJavaPath() || '').trim();
  let javaBin = null;

  if (configuredJava) {
    javaBin = await resolveJavaPath(configuredJava);
    if (!javaBin) {
      throw new Error(`Configured Java path not found: ${configuredJava}`);
    }
  } else {
    javaBin = getJavaExec(customJreDir);

    if (!getBundledJavaPath(customJreDir)) {
      const fallback = await detectSystemJava();
      if (fallback) {
        javaBin = fallback;
      } else {
        throw new Error('Java runtime not found. Please install the game first or configure Java path.');
      }
    }
  }

  const uuid = getUuidForUser(playerName);

  // Fetch tokens from auth server
  if (progressCallback) {
    progressCallback('Fetching authentication tokens...', null, null, null, null);
  }
  const { identityToken, sessionToken } = await fetchAuthTokens(uuid, playerName);

  // Patch client and server binaries to use custom auth server (BEFORE signing on macOS)
  // FORCE patch on every launch to ensure consistency
  const authDomain = getAuthDomain();
  if (clientPatcher) {
    try {
      if (progressCallback) {
        progressCallback('Patching game for custom server...', null, null, null, null);
      }
      console.log(`Force patching game binaries for ${authDomain}...`);

      const patchResult = await clientPatcher.ensureClientPatched(gameLatest, (msg, percent) => {
        // console.log(`[Patcher] ${msg}`);
        if (progressCallback && msg) {
          progressCallback(msg, percent, null, null, null);
        }
       }, null, branch);

      if (patchResult.success) {
        console.log(`Game patched successfully (${patchResult.patchCount} total occurrences)`);
        if (patchResult.client) {
          console.log(`  Client: ${patchResult.client.patchCount || 0} occurrences`);
        }
        if (patchResult.agent) {
          console.log(`  Agent: ${patchResult.agent.alreadyExists ? 'already present' : patchResult.agent.success ? 'downloaded' : 'failed'}`);
        }
      } else {
        console.warn('Game patching failed:', patchResult.error);
      }
    } catch (patchError) {
      console.warn('Game patching failed (game may not connect to custom server):', patchError.message);
    }
  }

  // macOS: Sign binaries AFTER patching so the patched binaries have valid signatures
  if (process.platform === 'darwin') {
    try {
      const appBundle = path.join(gameLatest, 'Client', 'Hytale.app');
      const serverDir = path.join(gameLatest, 'Server');

      const signPath = async (targetPath, deep = false) => {
        await execAsync(`xattr -cr "${targetPath}"`).catch(() => { });
        const deepFlag = deep ? '--deep ' : '';
        await execAsync(`codesign --force ${deepFlag}--sign - "${targetPath}"`).catch(() => { });
      };

      if (fs.existsSync(appBundle)) {
        await signPath(appBundle, true);
        console.log('Signed macOS app bundle (after patching)');
      } else {
        await signPath(path.dirname(clientPath), true);
        console.log('Signed macOS client binary (after patching)');
      }

      if (javaBin && fs.existsSync(javaBin)) {
        let jreRoot = path.dirname(path.dirname(javaBin));
        if (jreRoot.endsWith('Home')) {
          jreRoot = path.dirname(path.dirname(jreRoot));
        }
        await signPath(jreRoot, true);
        await signPath(javaBin, false);
        console.log('Signed Java runtime');
      }

      if (fs.existsSync(serverDir)) {
        await execAsync(`xattr -cr "${serverDir}"`).catch(() => { });
        await execAsync(`find "${serverDir}" -type f -perm +111 -exec codesign --force --sign - {} \\;`).catch(() => { });
        console.log('Signed server binaries (after patching)');
      }

      if (javaBin && fs.existsSync(javaBin)) {
        const javaWrapperPath = path.join(path.dirname(javaBin), 'java-wrapper');
        const wrapperScript = `#!/bin/bash
# Java wrapper for macOS - adds --disable-sentry to fix Sentry hang issue
REAL_JAVA="${javaBin}"
ARGS=("$@")
for i in "\${!ARGS[@]}"; do
  if [[ "\${ARGS[$i]}" == *"HytaleServer.jar"* ]]; then
    ARGS=("\${ARGS[@]:0:$((i+1))}" "--disable-sentry" "\${ARGS[@]:$((i+1))}")
    break
  fi
done
exec "$REAL_JAVA" "\${ARGS[@]}"
`;
        fs.writeFileSync(javaWrapperPath, wrapperScript, { mode: 0o755 });
        await signPath(javaWrapperPath, false);
        console.log('Created java wrapper with --disable-sentry fix');
        javaBin = javaWrapperPath;
      }
    } catch (signError) {
      console.log('Notice: macOS signing step failed:', signError.message);
      console.log('The game may still launch if Gatekeeper allows it');
    }
  }

  const args = [
    '--app-dir', gameLatest,
    '--java-exec', javaBin,
    '--auth-mode', 'authenticated',
    '--uuid', uuid,
    '--name', playerName,
    '--identity-token', identityToken,
    '--session-token', sessionToken,
    '--user-dir', userDataDir
  ];

  if (progressCallback) {
    progressCallback('Starting game...', null, null, null, null);
  }

  // Ensure mods are synced for the active profile before launching
  try {
    console.log('Syncing mods for active profile before launch...');
    if (progressCallback) progressCallback('Syncing mods...', null, null, null, null);
    await syncModsForCurrentProfile();
  } catch (syncError) {
    console.error('Failed to sync mods before launch:', syncError);
    // Continue anyway? Or fail? 
    // Warn user but continue might be safer to avoid blocking play if sync is just glitchy
  }

  console.log('Starting game...');
  console.log(`Command: "${clientPath}" ${args.join(' ')}`);

  const env = { ...process.env };

  const waylandEnv = setupWaylandEnvironment();
  Object.assign(env, waylandEnv);
  const gpuEnv = setupGpuEnvironment(gpuPreference);
  Object.assign(env, gpuEnv);
  // Linux: Replace bundled libzstd.so with system version to fix glibc 2.41+ crash
  // The bundled libzstd causes "free(): invalid pointer" on Steam Deck / Ubuntu LTS
  if (process.platform === 'linux' && process.env.HYTALE_NO_LIBZSTD_FIX !== '1') {
    const clientDir = path.dirname(clientPath);
    const bundledLibzstd = path.join(clientDir, 'libzstd.so');
    const backupLibzstd = path.join(clientDir, 'libzstd.so.bundled');

    // Common system libzstd paths
    const systemLibzstdPaths = [
      '/usr/lib64/libzstd.so.1',                  // Fedora/RHEL
      '/usr/lib/libzstd.so.1',                    // Arch Linux, Steam Deck
      '/usr/lib/x86_64-linux-gnu/libzstd.so.1'    // Debian/Ubuntu
    ];

    let systemLibzstd = null;
    for (const p of systemLibzstdPaths) {
      if (fs.existsSync(p)) {
        systemLibzstd = p;
        break;
      }
    }

    if (systemLibzstd && fs.existsSync(bundledLibzstd)) {
      try {
        const stats = fs.lstatSync(bundledLibzstd);

        // Only replace if it's not already a symlink to system version
        if (!stats.isSymbolicLink()) {
          // Backup bundled version
          if (!fs.existsSync(backupLibzstd)) {
            fs.renameSync(bundledLibzstd, backupLibzstd);
            console.log(`Linux: Backed up bundled libzstd.so`);
          } else {
            fs.unlinkSync(bundledLibzstd);
          }

          // Create symlink to system version
          fs.symlinkSync(systemLibzstd, bundledLibzstd);
          console.log(`Linux: Linked libzstd.so to system version (${systemLibzstd}) for glibc 2.41+ compatibility`);
        } else {
          const linkTarget = fs.readlinkSync(bundledLibzstd);
          console.log(`Linux: libzstd.so already linked to ${linkTarget}`);
        }
      } catch (libzstdError) {
        console.warn(`Linux: Could not replace libzstd.so: ${libzstdError.message}`);
      }
    }
  }

  // DualAuth Agent: Set JAVA_TOOL_OPTIONS so java picks up -javaagent: flag
  // This enables runtime auth patching without modifying the server JAR
  const agentJar = path.join(gameLatest, 'Server', 'dualauth-agent.jar');
  if (fs.existsSync(agentJar)) {
    const agentFlag = `-javaagent:${agentJar}`;
    env.JAVA_TOOL_OPTIONS = env.JAVA_TOOL_OPTIONS
      ? `${env.JAVA_TOOL_OPTIONS} ${agentFlag}`
      : agentFlag;
    console.log('DualAuth Agent: enabled via JAVA_TOOL_OPTIONS');
  }

  try {
    let spawnOptions = {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: env
    };

    if (process.platform === 'win32') {
      spawnOptions.shell = false;
      spawnOptions.windowsHide = true;
    }

    const child = spawn(clientPath, args, spawnOptions);

    // Release process reference immediately so it's truly independent
    // This works on all platforms (Windows, macOS, Linux)
    child.unref();

    console.log(`Game process started with PID: ${child.pid}`);

    let hasExited = false;
    let outputReceived = false;
    let launchCheckTimeout;

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        outputReceived = true;
        const msg = data.toString().trim();
        console.log(`Game output: ${msg}`);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        outputReceived = true;
        const msg = data.toString().trim();
        console.error(`Game error: ${msg}`);
      });
    }

    child.on('error', (error) => {
      hasExited = true;
      clearTimeout(launchCheckTimeout);
      console.error(`Failed to start game process: ${error.message}`);
      if (progressCallback) {
        progressCallback(`Failed to start game: ${error.message}`, -1, null, null, null);
      }
    });

    child.on('exit', (code, signal) => {
      hasExited = true;
      clearTimeout(launchCheckTimeout);
      
      if (code !== null) {
        console.log(`Game process exited with code ${code}`);
        if (code !== 0) {
          console.error(`[Launcher] Game crashed or exited with error code ${code}`);
          if (progressCallback) {
            progressCallback(`Game exited with error code ${code}`, -1, null, null, null);
          }
        }
      } else if (signal) {
        console.log(`Game process terminated by signal ${signal}`);
      }
    });

    // Process is detached and unref'd - it runs independently from the launcher
    // We cannot reliably detect if the game window actually appears from here,
    // so we report success after spawning. stdout/stderr logging above provides debugging info.
    console.log('Game process spawned and detached successfully');
    if (progressCallback) {
      progressCallback('Game launched successfully', 100, null, null, null);
    }

    // Return immediately after spawn
    return { success: true, installed: true, launched: true, pid: child.pid };
  } catch (spawnError) {
    console.error(`Error spawning game process: ${spawnError.message}`);
    if (progressCallback) {
      progressCallback(`Error launching game: ${spawnError.message}`, -1, null, null, null);
    }
    throw spawnError;
  }
}

async function launchGameWithVersionCheck(playerNameOverride = null, progressCallback, javaPathOverride, installPathOverride, gpuPreference = 'auto', branchOverride = null) {
  try {
    // ==========================================================================
    // PRE-LAUNCH VALIDATION: Check username is configured
    // ==========================================================================
    const launchState = checkLaunchReady();

    if (!launchState.hasUsername) {
      const error = 'No username configured. Please set your username in Settings before playing.';
      console.error('[Launcher] Launch blocked:', error);
      if (progressCallback) {
        progressCallback(error, -1, null, null, null);
      }
      return { success: false, error: error, needsUsername: true };
    }

    console.log(`[Launcher] Pre-launch check passed. Username: "${launchState.username}"`);

    const branch = branchOverride || loadVersionBranch();

    if (progressCallback) {
      progressCallback('Checking for updates...', 0, null, null, null);
    }

    const installedVersion = loadVersionClient();
    const latestVersion = await getLatestClientVersion(branch);

    console.log(`Installed version: ${installedVersion}, Latest version: ${latestVersion} (branch: ${branch})`);

    let needsUpdate = false;
    if (!installedVersion || installedVersion !== latestVersion) {
      needsUpdate = true;
      console.log('Version mismatch or not installed, update required');
    }

    if (needsUpdate) {
      if (progressCallback) {
        progressCallback('Game update required, starting update process...', 10, null, null, null);
      }

      const customAppDir = getResolvedAppDir(installPathOverride);
      const customGameDir = path.join(customAppDir, branch, 'package', 'game', 'latest');
      const customToolsDir = path.join(customAppDir, 'butler');
      const customCacheDir = path.join(customAppDir, 'cache');

      try {
        let versionToInstall = latestVersion;
        if (FORCE_CLEAN_INSTALL_VERSION && !installedVersion) {
          versionToInstall = CLEAN_INSTALL_TEST_VERSION;
          console.log(`TESTING MODE: Clean install detected, forcing version ${versionToInstall} instead of ${latestVersion}`);
        }
        
        await ensureGameInstalled(versionToInstall, branch, progressCallback, customGameDir, customCacheDir, customToolsDir);
        console.log('Game updated successfully, patching will be forced on launch...');

        if (progressCallback) {
          progressCallback('Preparing game launch...', 90, null, null, null);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (updateError) {
        console.error('Update failed:', updateError);
        if (progressCallback) {
          progressCallback(`Update failed: ${updateError.message}`, -1, null, null, null);
        }
        throw updateError;
      }
    }

    if (progressCallback) {
      progressCallback('Launching game...', 80, null, null, null);
    }

    const launchResult = await launchGame(playerNameOverride, progressCallback, javaPathOverride, installPathOverride, gpuPreference, branch);
    
    // Ensure we always return a result
    if (!launchResult) {
      console.error('launchGame returned null/undefined, creating fallback response');
      return { success: false, error: 'Game launch failed - no response from launcher' };
    }
    
    return launchResult;
  } catch (error) {
    console.error('Error in version check and launch:', error);
    if (progressCallback) {
      progressCallback(`Error: ${error.message}`, -1, null, null, null);
    }
    // Always return an error response instead of throwing
    return { success: false, error: error.message || 'Unknown launch error' };
  }
}

module.exports = {
  launchGame,
  launchGameWithVersionCheck
};