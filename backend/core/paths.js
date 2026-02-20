const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadVersionBranch } = require('./config');

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

/**
 * Get centralized UserData saves directory (NEW in 2.2.0)
 * UserData is now stored separately from game installation
 */
function getHytaleSavesDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Local', 'HytaleSaves');
  } else if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'HytaleSaves');
  } else {
    return path.join(home, '.hytalesaves');
  }
}

const DEFAULT_APP_DIR = getAppDir();

function getResolvedAppDir(customPath) {
  if (customPath && customPath.trim()) {
    return path.join(customPath.trim(), 'HytaleF2P');
  }
  try {
    const configFile = path.join(DEFAULT_APP_DIR, 'config.json');
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (config.installPath && config.installPath.trim()) {
        return path.join(config.installPath.trim(), 'HytaleF2P');
      }
    }
  } catch (err) {
  }
  return DEFAULT_APP_DIR;
}

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (inputPath === '~') {
    return os.homedir();
  }
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

const APP_DIR = DEFAULT_APP_DIR;
const CACHE_DIR = path.join(APP_DIR, 'cache');
const TOOLS_DIR = path.join(APP_DIR, 'butler');

// Dynamic GAME_DIR and JRE_DIR based on version_branch from config
function getGameDir() {
  const branch = loadVersionBranch();
  return path.join(APP_DIR, branch, 'package', 'game', 'latest');
}

function getJreDir() {
  const branch = loadVersionBranch();
  return path.join(APP_DIR, branch, 'package', 'jre', 'latest');
}

const GAME_DIR = getGameDir();
const JRE_DIR = getJreDir();
const PLAYER_ID_FILE = path.join(APP_DIR, 'player_id.json');

function getClientCandidates(gameLatest) {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(path.join(gameLatest, 'Client', 'HytaleClient.exe'));
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(gameLatest, 'Client', 'Hytale.app', 'Contents', 'MacOS', 'HytaleClient'));
    candidates.push(path.join(gameLatest, 'Client', 'HytaleClient'));
  } else {
    candidates.push(path.join(gameLatest, 'Client', 'HytaleClient'));
  }
  return candidates;
}

function findClientPath(gameLatest) {
  const candidates = getClientCandidates(gameLatest);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findUserDataPath(gameLatest) {
  const candidates = [];

  candidates.push(path.join(gameLatest, 'Client', 'UserData'));

  candidates.push(path.join(gameLatest, 'Client', 'Hytale.app', 'Contents', 'UserData'));
  candidates.push(path.join(gameLatest, 'Hytale.app', 'Contents', 'UserData'));
  candidates.push(path.join(gameLatest, 'UserData'));

  candidates.push(path.join(gameLatest, 'Client', 'UserData'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  let defaultPath;
  if (process.platform === 'darwin') {
    defaultPath = path.join(gameLatest, 'Client', 'UserData');
  } else {
    defaultPath = path.join(gameLatest, 'Client', 'UserData');
  }

  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }

  return defaultPath;
}

function findUserDataRecursive(gameLatest) {
  function searchDirectory(dir) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          const fullPath = path.join(dir, item.name);

          if (item.name === 'UserData') {
            return fullPath;
          }

          const found = searchDirectory(fullPath);
          if (found) {
            return found;
          }
        }
      }
    } catch (error) {
    }

    return null;
  }

  if (!fs.existsSync(gameLatest)) {
    return null;
  }

  const found = searchDirectory(gameLatest);
  return found;
}

async function getModsPath(customInstallPath = null) {
  try {
    let installPath = customInstallPath;

    if (!installPath) {
      const configFile = path.join(DEFAULT_APP_DIR, 'config.json');
      if (fs.existsSync(configFile)) {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        installPath = config.installPath || '';
      }
    }

    if (!installPath) {
      // Use the standard app directory logic which handles platforms correctly
      installPath = getAppDir();
    }

    const branch = loadVersionBranch();
    const gameLatest = path.join(installPath, branch, 'package', 'game', 'latest');

    const userDataPath = findUserDataPath(gameLatest);

    const modsPath = path.join(userDataPath, 'Mods');
    const disabledModsPath = path.join(userDataPath, 'DisabledMods');
    const profilesPath = path.join(userDataPath, 'Profiles');

    if (!fs.existsSync(modsPath)) {
      // Check for broken symlink to avoid EEXIST/EPERM on mkdir
      let isBrokenLink = false;
      let pathExists = false;
      try {
          const stats = fs.lstatSync(modsPath);
          pathExists = true;
          if (stats.isSymbolicLink()) {
              // Check if target exists
              try {
                  fs.statSync(modsPath);
              } catch {
                  isBrokenLink = true;
              }
          }
      } catch (e) { /* path doesn't exist at all */ }

      if (isBrokenLink) {
        fs.unlinkSync(modsPath); // Remove broken symlink
      }
      if (!pathExists || isBrokenLink) {
        fs.mkdirSync(modsPath, { recursive: true });
      }
    }
    if (!fs.existsSync(disabledModsPath)) {
      fs.mkdirSync(disabledModsPath, { recursive: true });
    }
    if (!fs.existsSync(profilesPath)) {
      fs.mkdirSync(profilesPath, { recursive: true });
    }

    return modsPath;
  } catch (error) {
    console.error('Error getting mods path:', error);
    throw error;
  }
}

function getProfilesDir(customInstallPath = null) {
  try {
    // NEW 2.2.0: Use centralized UserData location
    const userDataPath = getHytaleSavesDir();
    const profilesDir = path.join(userDataPath, 'Profiles');
    
    if (!fs.existsSync(profilesDir)) {
        fs.mkdirSync(profilesDir, { recursive: true });
    }
    
    return profilesDir;
  } catch (err) {
      console.error('Error getting profiles dir:', err);
      return null;
  }
}

module.exports = {
  getAppDir,
  getHytaleSavesDir,
  getResolvedAppDir,
  expandHome,
  APP_DIR,
  CACHE_DIR,
  TOOLS_DIR,
  GAME_DIR,
  JRE_DIR,
  getGameDir,
  getJreDir,
  PLAYER_ID_FILE,
  getClientCandidates,
  findClientPath,
  findUserDataPath,
  findUserDataRecursive,
  getModsPath,
  getProfilesDir
};
