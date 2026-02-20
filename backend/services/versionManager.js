const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const { getOS, getArch } = require('../utils/platformUtils');
const { smartRequest } = require('../utils/proxyClient');

const BASE_PATCH_URL = 'https://game.authbp.xyz/dl';
const MANIFEST_API = 'https://files.hytalef2p.com/api/patch_manifest';
const NEW_API_BASE_URL = 'https://game.authbp.xyz';

// Cache for /infos (all platforms)
let infosCache = null;
let infosCacheTime = 0;
const API_CACHE_DURATION = 60000; // 1 minute

/**
 * GET /infos
 * Returns: { "windows-amd64": { "release": { buildVersion, newest }, "pre-release": {...} }, ... }
 */
async function fetchNewAPI(branch = 'release') {
  const now = Date.now();

  if (infosCache && (now - infosCacheTime) < API_CACHE_DURATION) {
    console.log('[NewAPI] Using cached /infos data');
  } else {
    try {
      console.log('[NewAPI] Fetching /infos from:', NEW_API_BASE_URL + '/infos');
      const response = await axios.get(`${NEW_API_BASE_URL}/infos`, {
        timeout: 15000,
        headers: { 'User-Agent': 'Hytale-F2P-Launcher' }
      });
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid /infos response structure');
      }
      infosCache = response.data;
      infosCacheTime = now;
      console.log('[NewAPI] /infos fetched successfully');
    } catch (error) {
      console.error('[NewAPI] Error fetching /infos:', error.message);
      if (!infosCache) throw error;
      console.log('[NewAPI] Using expired /infos cache due to error');
    }
  }

  // Return the platform-specific branch info for compatibility
  const osName = getOS();
  const arch   = getArch();
  const platformKey = `${osName}-${arch}`;
  const platformData = infosCache[platformKey];

  if (!platformData || !platformData[branch]) {
    throw new Error(`No /infos data for platform ${platformKey} branch ${branch}`);
  }

  const branchData = platformData[branch];
  // Normalise to old format: { version: 9, client_version: "9.pwr" }
  return {
    version:        branchData.newest,
    client_version: `${branchData.newest}.pwr`,
    buildVersion:   branchData.buildVersion,
  };
}

async function getLatestVersionFromNewAPI(branch = 'release') {
  try {
    const apiData = await fetchNewAPI(branch);
    const version = apiData.client_version;
    console.log(`[NewAPI] Latest version for ${branch}: ${version}`);
    return version;
  } catch (error) {
    console.error('[NewAPI] Error getting latest version:', error.message);
    throw error;
  }
}

/**
 * Calls GET /latest?branch=&version= and returns the proxied pwr URL
 * for the current platform from the steps array.
 */
async function getPWRUrlFromNewAPI(branch = 'release', version = '9.pwr', sourceVersion = null) {
  // Direct construction of the smart download URL, bypassing /latest call
  // This matches the updated dl.js route logic
  const buildNumber = extractVersionNumber(version);
  const url = buildArchiveUrl(buildNumber, branch);
  console.log(`[NewAPI] Constructed PWR URL (direct): ${url}`);
  return url;
}

async function getLatestClientVersion(branch = 'release') {
  try {
    console.log(`[NewAPI] Fetching latest client version from new API (branch: ${branch})...`);
    
    // Toujours utiliser la nouvelle API cobylobby
    const latestVersion = await getLatestVersionFromNewAPI(branch);
    console.log(`[NewAPI] Latest client version for ${branch}: ${latestVersion}`);
    return latestVersion;
    
  } catch (error) {
    console.error('[NewAPI] Error fetching client version from new API:', error.message);
    
    // Fallback: /infos retry direct
    console.log('[NewAPI] Retrying /infos directly as fallback...');
    try {
      const response = await axios.get(`${NEW_API_BASE_URL}/infos`, {
        timeout: 40000,
        headers: { 'User-Agent': 'Hytale-F2P-Launcher' }
      });
      const osName = getOS();
      const arch   = getArch();
      const platformKey = `${osName}-${arch}`;
      const branchData  = response.data?.[platformKey]?.[branch];
      if (branchData && branchData.newest) {
        const version = `${branchData.newest}.pwr`;
        console.log(`Latest client version for ${branch} (fallback /infos): ${version}`);
        return version;
      }
      console.log('Warning: Invalid /infos response, falling back to 9.pwr');
      return '9.pwr';
    } catch (fallbackError) {
      console.error('Error in fallback /infos:', fallbackError.message);
      console.log('Warning: API unavailable, falling back to latest known version (9.pwr)');
      return '9.pwr';
    }
  }
}

// Fonction utilitaire pour extraire le numéro de version
// Supporte les formats: "7.pwr", "v8", "v8-windows-amd64.pwr", etc.
function extractVersionNumber(version) {
  if (!version) return 0;
  
  // Nouveau format: "v8" ou "v8-xxx.pwr"
  const vMatch = version.match(/v(\d+)/);
  if (vMatch) {
    return parseInt(vMatch[1]);
  }
  
  // Ancien format: "7.pwr"
  const pwrMatch = version.match(/(\d+)\.pwr/);
  if (pwrMatch) {
    return parseInt(pwrMatch[1]);
  }
  
  // Fallback: essayer de parser directement
  const num = parseInt(version);
  return isNaN(num) ? 0 : num;
}

function buildArchiveUrl(buildNumber, branch = 'release') {
  const os = getOS();
  const arch = getArch();
  // Smart format: /dl/windows/amd64/release/0/10.pwr (0 = full install)
  return `${BASE_PATCH_URL}/${os}/${arch}/${branch}/0/${buildNumber}.pwr`;
}

async function checkArchiveExists(buildNumber, branch = 'release') {
  const url = buildArchiveUrl(buildNumber, branch);
  try {
    const response = await axios.head(url, { timeout: 10000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function discoverAvailableVersions(latestKnown, branch = 'release', maxProbe = 50) {
  const available = [];
  const latest = extractVersionNumber(latestKnown);
  
  for (let i = latest; i >= Math.max(1, latest - maxProbe); i--) {
    const exists = await checkArchiveExists(i, branch);
    if (exists) {
      available.push(`${i}.pwr`);
    }
  }
  
  return available;
}

async function fetchPatchManifest(branch = 'release') {
  try {
    const os = getOS();
    const arch = getArch();
    const response = await smartRequest(`${MANIFEST_API}?branch=${branch}&os=${os}&arch=${arch}`, {
      timeout: 10000
    });
    return response.data.patches || {};
  } catch (error) {
    console.error('Failed to fetch patch manifest:', error.message);
    return {};
  }
}

async function extractVersionDetails(targetVersion, branch = 'release') {
  const buildNumber = extractVersionNumber(targetVersion);
  const previousBuild = buildNumber - 1;
  const sourceVersion = previousBuild > 0 ? `${previousBuild}.pwr` : null;
  
  // const manifest = await fetchPatchManifest(branch);
  // const patchInfo = manifest[buildNumber];

  // Use constructed URL pointing to our smart dl.js route
  const fullUrl = buildArchiveUrl(buildNumber, branch);
  
  return {
    version: targetVersion,
    buildNumber: buildNumber,
    buildName: `HYTALE-Build-${buildNumber}`,
    fullUrl: fullUrl,
    differentialUrl: null,
    checksum: null,
    sourceVersion: sourceVersion,
    isDifferential: false,
    releaseNotes: null
  };
}

function canUseDifferentialUpdate(currentVersion, targetDetails) {
  if (!targetDetails) return false;
  if (!targetDetails.differentialUrl) return false;
  if (!targetDetails.isDifferential) return false;
  
  if (!currentVersion) return false;
  
  const currentBuild = extractVersionNumber(currentVersion);
  const expectedSource = extractVersionNumber(targetDetails.sourceVersion);
  
  return currentBuild === expectedSource;
}

function needsIntermediatePatches(currentVersion, targetVersion) {
  if (!currentVersion) return [];
  
  const current = extractVersionNumber(currentVersion);
  const target = extractVersionNumber(targetVersion);
  
  const intermediates = [];
  for (let i = current + 1; i <= target; i++) {
    intermediates.push(`${i}.pwr`);
  }
  
  return intermediates;
}

async function computeFileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function validateChecksum(filePath, expectedChecksum) {
  if (!expectedChecksum) return true;
  
  const actualChecksum = await computeFileChecksum(filePath);
  return actualChecksum === expectedChecksum;
}

function getInstalledClientVersion() {
  try {
    const { loadVersionClient } = require('../core/config');
    return loadVersionClient();
  } catch (err) {
    return null;
  }
}

module.exports = {
  getLatestClientVersion,
  buildArchiveUrl,
  checkArchiveExists,
  discoverAvailableVersions,
  extractVersionDetails,
  canUseDifferentialUpdate,
  needsIntermediatePatches,
  computeFileChecksum,
  validateChecksum,
  getInstalledClientVersion,
  fetchNewAPI,
  getLatestVersionFromNewAPI,
  getPWRUrlFromNewAPI,
  extractVersionNumber
};
