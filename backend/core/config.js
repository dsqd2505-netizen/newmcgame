const fs = require('fs');
const path = require('path');
const os = require('os');

// =============================================================================
// UUID PERSISTENCE FIX - Atomic writes, backups, validation
// =============================================================================

// Default auth domain - can be overridden by env var or config
const DEFAULT_AUTH_DOMAIN = 'auth.sanasol.ws';

// Get auth domain from env, config, or default
function getAuthDomain() {
  // First check environment variable
  if (process.env.HYTALE_AUTH_DOMAIN) {
    return process.env.HYTALE_AUTH_DOMAIN;
  }
  // Then check config file
  const config = loadConfig();
  if (config.activeProfileId && config.profiles && config.profiles[config.activeProfileId]) {
    // Allow profile to override auth domain if ever needed
    // but for now stick to global or env
  }
  if (config.authDomain) {
    return config.authDomain;
  }
  // Fall back to default
  return DEFAULT_AUTH_DOMAIN;
}

// Get full auth server URL
// Domain already includes subdomain (auth.sanasol.ws), so use directly
function getAuthServerUrl() {
  const domain = getAuthDomain();
  return `https://${domain}`;
}

// Save auth domain to config
function saveAuthDomain(domain) {
  saveConfig({ authDomain: domain || DEFAULT_AUTH_DOMAIN });
}

function getAppDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Local', 'HytaleF2P');
  } else if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'HytaleF2P');
  } else {
    return path.join(home, '.hytalef2p');
  }
}

const CONFIG_FILE = path.join(getAppDir(), 'config.json');
const CONFIG_BACKUP = path.join(getAppDir(), 'config.json.bak');
const CONFIG_TEMP = path.join(getAppDir(), 'config.json.tmp');

// =============================================================================
// CONFIG VALIDATION
// =============================================================================

/**
 * Validate config structure - ensures critical data is intact
 */
function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }
  // If userUuids exists, it must be an object
  if (config.userUuids !== undefined && typeof config.userUuids !== 'object') {
    return false;
  }
  // If username exists, it must be a non-empty string
  if (config.username !== undefined && (typeof config.username !== 'string')) {
    return false;
  }
  return true;
}

// =============================================================================
// CONFIG LOADING - With backup recovery
// =============================================================================

/**
 * Load config with automatic backup recovery
 * Never returns empty object silently if data existed before
 */
function loadConfig() {
  // Try primary config first
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      if (data.trim()) {
        const config = JSON.parse(data);
        if (validateConfig(config)) {
          return config;
        }
        console.warn('[Config] Primary config invalid structure, trying backup...');
      }
    }
  } catch (err) {
    console.error('[Config] Failed to load primary config:', err.message);
  }

  // Try backup config
  try {
    if (fs.existsSync(CONFIG_BACKUP)) {
      const data = fs.readFileSync(CONFIG_BACKUP, 'utf8');
      if (data.trim()) {
        const config = JSON.parse(data);
        if (validateConfig(config)) {
          console.log('[Config] Recovered from backup successfully');
          // Restore primary from backup
          try {
            fs.writeFileSync(CONFIG_FILE, data, 'utf8');
            console.log('[Config] Primary config restored from backup');
          } catch (restoreErr) {
            console.error('[Config] Failed to restore primary from backup:', restoreErr.message);
          }
          return config;
        }
      }
    }
  } catch (err) {
    console.error('[Config] Failed to load backup config:', err.message);
  }

  // No valid config - return empty (fresh install)
  console.log('[Config] No valid config found - fresh install');
  return {};
}

// =============================================================================
// CONFIG SAVING - Atomic writes with backup
// =============================================================================

/**
 * Save config atomically with backup
 * Uses temp file + rename pattern to prevent corruption
 * Creates backup before overwriting
 */
function saveConfig(update) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const configDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Load current config
      const currentConfig = loadConfig();
      const newConfig = { ...currentConfig, ...update };
      const data = JSON.stringify(newConfig, null, 2);

      // 1. Write to temp file first
      fs.writeFileSync(CONFIG_TEMP, data, 'utf8');

      // 2. Verify temp file is valid JSON
      const verification = JSON.parse(fs.readFileSync(CONFIG_TEMP, 'utf8'));
      if (!validateConfig(verification)) {
        throw new Error('Config validation failed after write');
      }

      // 3. Backup current config (if exists and valid)
      if (fs.existsSync(CONFIG_FILE)) {
        try {
          const currentData = fs.readFileSync(CONFIG_FILE, 'utf8');
          if (currentData.trim()) {
            fs.writeFileSync(CONFIG_BACKUP, currentData, 'utf8');
          }
        } catch (backupErr) {
          console.warn('[Config] Could not create backup:', backupErr.message);
          // Continue anyway - saving new config is more important
        }
      }

      // 4. Atomic rename (this is the critical operation)
      fs.renameSync(CONFIG_TEMP, CONFIG_FILE);

      return true;
    } catch (err) {
      lastError = err;
      console.error(`[Config] Save attempt ${attempt}/${maxRetries} failed:`, err.message);

      // Clean up temp file on failure
      try {
        if (fs.existsSync(CONFIG_TEMP)) {
          fs.unlinkSync(CONFIG_TEMP);
        }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }

      if (attempt < maxRetries) {
        // Small delay before retry
        const delay = attempt * 100;
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait (sync delay)
        }
      }
    }
  }

  // All retries failed - this is critical
  console.error('[Config] CRITICAL: Failed to save config after all retries:', lastError.message);
  throw new Error(`Failed to save config: ${lastError.message}`);
}

// =============================================================================
// USERNAME MANAGEMENT - No silent fallbacks
// =============================================================================

/**
 * Save username to config
 * When changing username, the UUID is preserved (rename, not new identity)
 * Validates username before saving
 */
function saveUsername(username) {
  if (!username || typeof username !== 'string') {
    throw new Error('Invalid username: must be a non-empty string');
  }
  const newName = username.trim();
  if (!newName) {
    throw new Error('Invalid username: cannot be empty or whitespace');
  }
  if (newName.length > 16) {
    throw new Error('Invalid username: must be 16 characters or less');
  }

  const config = loadConfig();
  const currentName = config.username ? config.username.trim() : null;
  const userUuids = config.userUuids || {};

  // Check if we're actually changing the username (case-insensitive comparison)
  const isRename = currentName && currentName.toLowerCase() !== newName.toLowerCase();

  if (isRename) {
    // Find the UUID for the current username
    const currentKey = Object.keys(userUuids).find(
      k => k.toLowerCase() === currentName.toLowerCase()
    );

    if (currentKey && userUuids[currentKey]) {
      // Check if target username already exists (would be a different identity)
      const targetKey = Object.keys(userUuids).find(
        k => k.toLowerCase() === newName.toLowerCase()
      );

      if (targetKey) {
        // Target username already exists - this is switching identity, not renaming
        console.log(`[Config] Switching to existing identity: "${newName}" (UUID already exists)`);
      } else {
        // Rename: move UUID from old name to new name
        const uuid = userUuids[currentKey];
        delete userUuids[currentKey];
        userUuids[newName] = uuid;
        console.log(`[Config] Renamed identity: "${currentKey}" → "${newName}" (UUID preserved: ${uuid})`);
      }
    }
  } else if (currentName && currentName !== newName) {
    // Case change only - update the key to preserve the new casing
    const currentKey = Object.keys(userUuids).find(
      k => k.toLowerCase() === currentName.toLowerCase()
    );
    if (currentKey && currentKey !== newName) {
      const uuid = userUuids[currentKey];
      delete userUuids[currentKey];
      userUuids[newName] = uuid;
      console.log(`[Config] Updated username case: "${currentKey}" → "${newName}"`);
    }
  }

  // Save both username and updated userUuids
  saveConfig({ username: newName, userUuids });
  console.log(`[Config] Username saved: "${newName}"`);
  return newName;
}

/**
 * Load username from config
 * Returns null if no username set (caller must handle)
 */
function loadUsername() {
  const config = loadConfig();
  const username = config.username;
  if (username && typeof username === 'string' && username.trim()) {
    return username.trim();
  }
  return null; // No username set - caller must handle this
}

/**
 * Load username with fallback to 'Player'
 * Use this only for display purposes, NOT for UUID lookup
 */
function loadUsernameWithDefault() {
  return loadUsername() || 'Player';
}

/**
 * Check if username is configured
 */
function hasUsername() {
  return loadUsername() !== null;
}

// =============================================================================
// UUID MANAGEMENT - Persistent and safe
// =============================================================================

/**
 * Normalize username for UUID lookup (case-insensitive, trimmed)
 */
function normalizeUsername(username) {
  if (!username || typeof username !== 'string') return null;
  return username.trim().toLowerCase();
}

/**
 * Get UUID for a username
 * Creates new UUID only if user explicitly doesn't exist
 * Uses case-insensitive lookup to prevent duplicates, but preserves original case for display
 */
function getUuidForUser(username) {
  const { v4: uuidv4 } = require('uuid');

  if (!username || typeof username !== 'string' || !username.trim()) {
    throw new Error('Cannot get UUID: username is required');
  }

  const displayName = username.trim();
  const normalizedLookup = displayName.toLowerCase();

  const config = loadConfig();
  const userUuids = config.userUuids || {};

  // Case-insensitive lookup - find existing key regardless of case
  const existingKey = Object.keys(userUuids).find(k => k.toLowerCase() === normalizedLookup);

  if (existingKey) {
    // Found existing - return UUID, update display name if case changed
    const existingUuid = userUuids[existingKey];

    // If user typed different case, update the key to new case (preserving UUID)
    if (existingKey !== displayName) {
      console.log(`[Config] Updating username case: "${existingKey}" → "${displayName}"`);
      delete userUuids[existingKey];
      userUuids[displayName] = existingUuid;
      saveConfig({ userUuids });
    }

    return existingUuid;
  }

  // Create new UUID for new user - store with original case
  const newUuid = uuidv4();
  userUuids[displayName] = newUuid;
  saveConfig({ userUuids });
  console.log(`[Config] Created new UUID for "${displayName}": ${newUuid}`);

  return newUuid;
}

/**
 * Get current user's UUID (based on saved username)
 */
function getCurrentUuid() {
  const username = loadUsername();
  if (!username) {
    throw new Error('Cannot get current UUID: no username configured');
  }
  return getUuidForUser(username);
}

/**
 * Get all UUID mappings (raw object)
 */
function getAllUuidMappings() {
  const config = loadConfig();
  return config.userUuids || {};
}

/**
 * Get all UUID mappings as array with current user flag
 */
function getAllUuidMappingsArray() {
  const config = loadConfig();
  const userUuids = config.userUuids || {};
  const currentUsername = loadUsername();
  // Case-insensitive comparison for isCurrent
  const normalizedCurrent = currentUsername ? currentUsername.toLowerCase() : null;

  return Object.entries(userUuids).map(([username, uuid]) => ({
    username,  // Original case preserved
    uuid,
    isCurrent: username.toLowerCase() === normalizedCurrent
  }));
}

/**
 * Set UUID for a specific user
 * Validates UUID format before saving
 * Preserves original case of username
 */
function setUuidForUser(username, uuid) {
  const { validate: validateUuid } = require('uuid');

  if (!username || typeof username !== 'string' || !username.trim()) {
    throw new Error('Invalid username');
  }

  if (!validateUuid(uuid)) {
    throw new Error('Invalid UUID format');
  }

  const displayName = username.trim();
  const normalizedLookup = displayName.toLowerCase();
  const config = loadConfig();
  const userUuids = config.userUuids || {};

  // Remove any existing entry with same name (case-insensitive)
  const existingKey = Object.keys(userUuids).find(k => k.toLowerCase() === normalizedLookup);
  if (existingKey) {
    delete userUuids[existingKey];
  }

  // Store with original case
  userUuids[displayName] = uuid;
  saveConfig({ userUuids });

  console.log(`[Config] UUID set for "${displayName}": ${uuid}`);
  return uuid;
}

/**
 * Generate a new UUID (without saving)
 */
function generateNewUuid() {
  const { v4: uuidv4 } = require('uuid');
  return uuidv4();
}

/**
 * Delete UUID for a specific user
 * Uses case-insensitive lookup
 */
function deleteUuidForUser(username) {
  if (!username || typeof username !== 'string') {
    throw new Error('Invalid username');
  }

  const normalizedLookup = username.trim().toLowerCase();
  const config = loadConfig();
  const userUuids = config.userUuids || {};

  // Case-insensitive lookup
  const existingKey = Object.keys(userUuids).find(k => k.toLowerCase() === normalizedLookup);

  if (existingKey) {
    delete userUuids[existingKey];
    saveConfig({ userUuids });
    console.log(`[Config] UUID deleted for "${username}"`);
    return true;
  }

  return false;
}

/**
 * Reset current user's UUID (generates new one)
 */
function resetCurrentUserUuid() {
  const username = loadUsername();
  if (!username) {
    throw new Error('Cannot reset UUID: no username configured');
  }

  const { v4: uuidv4 } = require('uuid');
  const newUuid = uuidv4();

  return setUuidForUser(username, newUuid);
}

// =============================================================================
// JAVA PATH MANAGEMENT
// =============================================================================

function saveJavaPath(javaPath) {
  const trimmed = (javaPath || '').trim();
  saveConfig({ javaPath: trimmed });
}

function loadJavaPath() {
  const config = loadConfig();

  // Prefer Active Profile's Java Path
  if (config.activeProfileId && config.profiles && config.profiles[config.activeProfileId]) {
    const profile = config.profiles[config.activeProfileId];
    if (profile.javaPath && profile.javaPath.trim().length > 0) {
      return profile.javaPath;
    }
  }

  // Fallback to global setting
  return config.javaPath || '';
}

// =============================================================================
// INSTALL PATH MANAGEMENT
// =============================================================================

function saveInstallPath(installPath) {
  const trimmed = (installPath || '').trim();
  saveConfig({ installPath: trimmed });
}

function loadInstallPath() {
  const config = loadConfig();
  return config.installPath || '';
}

// =============================================================================
// DISCORD RPC SETTINGS
// =============================================================================

function saveDiscordRPC(enabled) {
  saveConfig({ discordRPC: !!enabled });
}

function loadDiscordRPC() {
  const config = loadConfig();
  return config.discordRPC !== undefined ? config.discordRPC : true;
}

// =============================================================================
// LANGUAGE SETTINGS
// =============================================================================

function saveLanguage(language) {
  saveConfig({ language: language || 'en' });
}

function loadLanguage() {
  const config = loadConfig();
  return config.language || 'en';
}

// =============================================================================
// LAUNCHER SETTINGS
// =============================================================================

function saveCloseLauncherOnStart(enabled) {
  saveConfig({ closeLauncherOnStart: !!enabled });
}

function loadCloseLauncherOnStart() {
  const config = loadConfig();
  return config.closeLauncherOnStart !== undefined ? config.closeLauncherOnStart : false;
}

function saveLauncherHardwareAcceleration(enabled) {
  saveConfig({ launcherHardwareAcceleration: !!enabled });
}

function loadLauncherHardwareAcceleration() {
  const config = loadConfig();
  return config.launcherHardwareAcceleration !== undefined ? config.launcherHardwareAcceleration : true;
}

// =============================================================================
// MODS MANAGEMENT
// =============================================================================

function saveModsToConfig(mods) {
  try {
    const config = loadConfig();

    if (config.activeProfileId && config.profiles && config.profiles[config.activeProfileId]) {
      config.profiles[config.activeProfileId].mods = mods;
    } else {
      config.installedMods = mods;
    }

    // Use atomic save
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write atomically
    const data = JSON.stringify(config, null, 2);
    fs.writeFileSync(CONFIG_TEMP, data, 'utf8');
    if (fs.existsSync(CONFIG_FILE)) {
      fs.copyFileSync(CONFIG_FILE, CONFIG_BACKUP);
    }
    fs.renameSync(CONFIG_TEMP, CONFIG_FILE);

    console.log('[Config] Mods saved successfully');
  } catch (error) {
    console.error('[Config] Error saving mods:', error);
    throw error;
  }
}

function loadModsFromConfig() {
  try {
    const config = loadConfig();

    if (config.activeProfileId && config.profiles && config.profiles[config.activeProfileId]) {
      return config.profiles[config.activeProfileId].mods || [];
    }

    return config.installedMods || [];
  } catch (error) {
    console.error('[Config] Error loading mods:', error);
    return [];
  }
}

// =============================================================================
// FIRST LAUNCH DETECTION - FIXED
// =============================================================================

/**
 * Check if this is the first launch
 * FIXED: Was always returning true due to bug
 */
function isFirstLaunch() {
  const config = loadConfig();

  // If explicitly marked, use that
  if ('hasLaunchedBefore' in config) {
    return !config.hasLaunchedBefore;
  }

  // Check for any existing user data
  const hasUserData = config.installPath || config.username || config.javaPath ||
    config.chatUsername || config.userUuids ||
    Object.keys(config).length > 0;

  if (!hasUserData) {
    return true;
  }

  // FIXED: Was returning true here, should be false
  return false;
}

function markAsLaunched() {
  saveConfig({ hasLaunchedBefore: true, firstLaunchDate: new Date().toISOString() });
}

// =============================================================================
// GPU PREFERENCE
// =============================================================================

function saveGpuPreference(gpuPreference) {
  saveConfig({ gpuPreference: gpuPreference || 'auto' });
}

function loadGpuPreference() {
  const config = loadConfig();
  return config.gpuPreference || 'auto';
}

// =============================================================================
// VERSION MANAGEMENT
// =============================================================================

function saveVersionClient(versionClient) {
  saveConfig({ version_client: versionClient });
}

function loadVersionClient() {
  const config = loadConfig();
  return config.version_client !== undefined ? config.version_client : null;
}

function saveVersionBranch(versionBranch) {
  const branch = versionBranch || 'release';
  if (branch !== 'release' && branch !== 'pre-release') {
    console.warn(`[Config] Invalid branch "${branch}", defaulting to "release"`);
    saveConfig({ version_branch: 'release' });
  } else {
    saveConfig({ version_branch: branch });
  }
}

function loadVersionBranch() {
  const config = loadConfig();
  return config.version_branch || 'release';
}

// =============================================================================
// READY STATE - For UI to check before allowing launch
// =============================================================================

/**
 * Check if launcher is ready to launch game
 * Returns object with ready state and any issues
 */
function checkLaunchReady() {
  const issues = [];

  const username = loadUsername();
  if (!username) {
    issues.push('No username configured');
  } else if (username === 'Player') {
    issues.push('Using default username "Player"');
  }

  return {
    ready: issues.length === 0,
    hasUsername: !!username,
    username: username,
    issues: issues
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Core config
  loadConfig,
  saveConfig,
  validateConfig,

  // Username (no silent fallbacks)
  saveUsername,
  loadUsername,
  loadUsernameWithDefault,
  hasUsername,

  // UUID management
  getUuidForUser,
  getCurrentUuid,
  getAllUuidMappings,
  getAllUuidMappingsArray,
  setUuidForUser,
  generateNewUuid,
  deleteUuidForUser,
  resetCurrentUserUuid,

  // Java/Install paths
  saveJavaPath,
  loadJavaPath,
  saveInstallPath,
  loadInstallPath,

  // Settings
  saveDiscordRPC,
  loadDiscordRPC,
  saveLanguage,
  loadLanguage,
  saveCloseLauncherOnStart,
  loadCloseLauncherOnStart,
  saveLauncherHardwareAcceleration,
  loadLauncherHardwareAcceleration,

  // Mods
  saveModsToConfig,
  loadModsFromConfig,

  // Launch state
  isFirstLaunch,
  markAsLaunched,
  checkLaunchReady,

  // Auth server
  getAuthServerUrl,
  getAuthDomain,
  saveAuthDomain,

  // GPU
  saveGpuPreference,
  loadGpuPreference,

  // Version
  saveVersionClient,
  loadVersionClient,
  saveVersionBranch,
  loadVersionBranch,

  // Constants
  CONFIG_FILE
};
