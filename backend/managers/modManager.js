const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { getOS } = require('../utils/platformUtils');
const { getModsPath, getProfilesDir, getHytaleSavesDir } = require('../core/paths');
const { saveModsToConfig, loadModsFromConfig } = require('../core/config');
const profileManager = require('./profileManager');

const API_KEY = "$2a$10$bqk254NMZOWVTzLVJCcxEOmhcyUujKxA5xk.kQCN9q0KNYFJd5b32";

/**
 * Get the physical mods path for a specific profile.
 * Each profile now has its own 'mods' folder.
 */
function getProfileModsPath(profileId) {
  const profilesDir = getProfilesDir();
  if (!profilesDir) return null;
  
  const profileDir = path.join(profilesDir, profileId);
  const modsDir = path.join(profileDir, 'mods');
  
  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
  }
  
  return modsDir;
}

function generateModId(filename) {
  return crypto.createHash('md5').update(filename).digest('hex').substring(0, 8);
}

function extractModName(filename) {
  let name = path.parse(filename).name;

  name = name.replace(/-v?\d+\.[\d\.]+.*$/i, '');
  name = name.replace(/-\d+\.[\d\.]+.*$/i, '');

  name = name.replace(/[-_]/g, ' ');
  name = name.replace(/\b\w/g, l => l.toUpperCase());

  return name || 'Unknown Mod';
}

function extractVersion(filename) {
  const versionMatch = filename.match(/v?(\d+\.[\d\.]+)/);
  return versionMatch ? versionMatch[1] : null;
}

// Helper to get mods from active profile
function getProfileMods() {
  const profile = profileManager.getActiveProfile();
  return profile ? (profile.mods || []) : [];
}

async function loadInstalledMods(modsPath) {
  try {
    // Sync first to ensure we detect any manually added mods and paths are correct
    await syncModsForCurrentProfile();

    const activeProfile = profileManager.getActiveProfile();
    if (!activeProfile) return [];

    const profileMods = activeProfile.mods || [];
    
    // Use profile-specific paths
    const profileModsPath = getProfileModsPath(activeProfile.id);
    const profileDisabledModsPath = path.join(path.dirname(profileModsPath), 'DisabledMods');
    
    if (!fs.existsSync(profileModsPath)) fs.mkdirSync(profileModsPath, { recursive: true });
    if (!fs.existsSync(profileDisabledModsPath)) fs.mkdirSync(profileDisabledModsPath, { recursive: true });

    const validMods = [];

    for (const modConfig of profileMods) {
      // Check if file exists in either location
      const inEnabled = fs.existsSync(path.join(profileModsPath, modConfig.fileName));
      const inDisabled = fs.existsSync(path.join(profileDisabledModsPath, modConfig.fileName));

      if (inEnabled || inDisabled) {
        validMods.push({
          ...modConfig,
          // Set filePath based on physical location
          filePath: inEnabled ? path.join(profileModsPath, modConfig.fileName) : path.join(profileDisabledModsPath, modConfig.fileName),
          enabled: modConfig.enabled !== false // Default true
        });
      } else {
        console.warn(`[ModManager] Mod ${modConfig.fileName} listed in profile but not found on disk.`);
        // Include it so user can see it's missing or remove it
        validMods.push({
          ...modConfig,
          filePath: null,
          missing: true,
          enabled: modConfig.enabled !== false
        });
      }
    }

    return validMods;
  } catch (error) {
    console.error('Error loading installed mods:', error);
    return [];
  }
}

async function downloadMod(modInfo) {
  try {
    const activeProfile = profileManager.getActiveProfile();
    if (!activeProfile) throw new Error('No active profile to save mod to');

    const modsPath = getProfileModsPath(activeProfile.id);
    if (!modsPath) throw new Error('Could not determine profile mods path');

    if (!modInfo.downloadUrl && !modInfo.fileId) {
      throw new Error('No download URL or file ID provided');
    }

    let downloadUrl = modInfo.downloadUrl;

    if (!downloadUrl && modInfo.fileId && modInfo.modId) {
      const response = await axios.get(`https://api.curseforge.com/v1/mods/${modInfo.modId || modInfo.curseForgeId}/files/${modInfo.fileId || modInfo.curseForgeFileId}`, {
        headers: {
          'x-api-key': modInfo.apiKey || API_KEY,
          'Accept': 'application/json'
        }
      });

      downloadUrl = response.data.data.downloadUrl;
    }

    if (!downloadUrl) {
      throw new Error('Could not determine download URL');
    }

    const fileName = modInfo.fileName || `mod-${modInfo.modId}.jar`;
    const filePath = path.join(modsPath, fileName);

    const response = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        // Update Active Profile
        const newMod = {
          id: modInfo.id || generateModId(fileName),
          name: modInfo.name || extractModName(fileName),
          version: modInfo.version || '1.0.0',
          description: modInfo.summary || modInfo.description || 'Downloaded from CurseForge',
          author: modInfo.author || 'Unknown',
          enabled: true,
          fileName: fileName,
          fileSize: fs.statSync(filePath).size,
          dateInstalled: new Date().toISOString(),
          curseForgeId: modInfo.modId,
          curseForgeFileId: modInfo.fileId
        };

        const updatedMods = [...(activeProfile.mods || []), newMod];
        profileManager.updateProfile(activeProfile.id, { mods: updatedMods });

        resolve({
          success: true,
          filePath: filePath,
          fileName: fileName,
          modInfo: newMod
        });
      });
      writer.on('error', reject);
    });

  } catch (error) {
    console.error('Error downloading mod:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function uninstallMod(modId, modsPath) {
  try {
    const activeProfile = profileManager.getActiveProfile();
    if (!activeProfile) throw new Error('No active profile');

    const profileMods = activeProfile.mods || [];
    const mod = profileMods.find(m => m.id === modId);

    if (!mod) {
      throw new Error('Mod not found in profile');
    }

    // Use profile paths
    const profileModsPath = getProfileModsPath(activeProfile.id);
    const disabledModsPath = path.join(path.dirname(profileModsPath), 'DisabledMods');
    
    const enabledPath = path.join(profileModsPath, mod.fileName);
    const disabledPath = path.join(disabledModsPath, mod.fileName);

    let fileRemoved = false;
    // Try to remove file from both locations to be safe
    if (fs.existsSync(enabledPath)) {
      fs.unlinkSync(enabledPath);
      fileRemoved = true;
    }
    if (fs.existsSync(disabledPath)) {
      try { fs.unlinkSync(disabledPath); fileRemoved = true; } catch (e) { }
    }

    if (!fileRemoved) {
      console.warn('Mod file not found on filesystem, removing from profile anyway');
    }

    const updatedMods = profileMods.filter(m => m.id !== modId);
    profileManager.updateProfile(activeProfile.id, { mods: updatedMods });

    console.log('Mod removed from profile');

    return { success: true };
  } catch (error) {
    console.error('Error uninstalling mod:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function toggleMod(modId, modsPath) {
  try {
    const activeProfile = profileManager.getActiveProfile();
    if (!activeProfile) throw new Error('No active profile');

    const profileMods = activeProfile.mods || [];
    const modIndex = profileMods.findIndex(m => m.id === modId);

    if (modIndex === -1) {
      throw new Error('Mod not found in profile');
    }

    const mod = profileMods[modIndex];
    const newEnabled = !mod.enabled; // Toggle

    // Update Profile First
    const updatedMods = [...profileMods];
    updatedMods[modIndex] = { ...mod, enabled: newEnabled };
    profileManager.updateProfile(activeProfile.id, { mods: updatedMods });

    // Move file between Profile/Mods and Profile/DisabledMods
    const profileModsPath = getProfileModsPath(activeProfile.id);
    const disabledModsPath = path.join(path.dirname(profileModsPath), 'DisabledMods');
    
    if (!fs.existsSync(disabledModsPath)) fs.mkdirSync(disabledModsPath, { recursive: true });

    const currentPath = mod.enabled ? path.join(profileModsPath, mod.fileName) : path.join(disabledModsPath, mod.fileName);
    const targetDir = newEnabled ? profileModsPath : disabledModsPath;
    const targetPath = path.join(targetDir, mod.fileName);

    if (fs.existsSync(currentPath)) {
      fs.renameSync(currentPath, targetPath);
    } else {
      // Fallback: check if it's already in target?
      if (fs.existsSync(targetPath)) {
        console.log(`[ModManager] Mod ${mod.fileName} is already in the correct state`);
      } else {
        // Try finding it
        const altPath = mod.enabled ? path.join(disabledModsPath, mod.fileName) : path.join(profileModsPath, mod.fileName);
        if (fs.existsSync(altPath)) fs.renameSync(altPath, targetPath);
      }
    }

    return { success: true, enabled: newEnabled };
  } catch (error) {
    console.error('Error toggling mod:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function syncModsForCurrentProfile() {
  try {
    const activeProfile = profileManager.getActiveProfile();
    if (!activeProfile) {
      console.warn('No active profile found during mod sync');
      return;
    }

    console.log(`[ModManager] Syncing mods for profile: ${activeProfile.name} (${activeProfile.id})`);

    // 1. Resolve Paths
    // centralModsPath is HytaleSaves\Mods (centralized location for active mods)
    const hytaleSavesDir = getHytaleSavesDir();
    const centralModsPath = path.join(hytaleSavesDir, 'Mods');
    // profileModsPath is the real storage for this profile
    const profileModsPath = getProfileModsPath(activeProfile.id);
    const profileDisabledModsPath = path.join(path.dirname(profileModsPath), 'DisabledMods');

    if (!fs.existsSync(profileDisabledModsPath)) {
      fs.mkdirSync(profileDisabledModsPath, { recursive: true });
    }

    // 2. Copy-based Mod Sync (No symlinks - avoids permission issues)
    // Ensure HytaleSaves\Mods directory exists
    if (!fs.existsSync(centralModsPath)) {
      fs.mkdirSync(centralModsPath, { recursive: true });
      console.log(`[ModManager] Created centralized mods directory: ${centralModsPath}`);
    }

    // Check for old symlink and convert to real directory if needed (one-time migration)
    try {
      const centralStats = fs.lstatSync(centralModsPath);
      if (centralStats.isSymbolicLink()) {
        console.log('[ModManager] Removing old symlink, converting to copy-based system...');
        fs.unlinkSync(centralModsPath);
        fs.mkdirSync(centralModsPath, { recursive: true });
      }
    } catch (e) {
      // Path doesn't exist, will be created above
    }

    // Copy enabled mods from profile to HytaleSaves\Mods (for game to use)
    console.log(`[ModManager] Copying enabled mods from ${profileModsPath} to ${centralModsPath}`);
    
    // First, clear central mods folder
    const existingCentralMods = fs.existsSync(centralModsPath) ? fs.readdirSync(centralModsPath) : [];
    for (const file of existingCentralMods) {
      const filePath = path.join(centralModsPath, file);
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.warn(`Failed to remove ${file} from central mods:`, e.message);
      }
    }
    
    // Copy enabled mods to HytaleSaves\Mods
    const enabledModFiles = fs.existsSync(profileModsPath) ? fs.readdirSync(profileModsPath).filter(f => f.endsWith('.jar') || f.endsWith('.zip')) : [];
    for (const file of enabledModFiles) {
      const src = path.join(profileModsPath, file);
      const dest = path.join(centralModsPath, file);
      try {
        fs.copyFileSync(src, dest);
        console.log(`[ModManager] Copied ${file} to HytaleSaves\\Mods`);
      } catch (e) {
        console.error(`Failed to copy ${file}:`, e.message);
      }
    }

    // 3. Auto-Repair (Download missing mods)
    const profileModsSnapshot = activeProfile.mods || [];
    for (const mod of profileModsSnapshot) {
      if (mod.enabled && !mod.manual) {
        const inEnabled = fs.existsSync(path.join(profileModsPath, mod.fileName));
        const inDisabled = fs.existsSync(path.join(profileDisabledModsPath, mod.fileName));

        if (!inEnabled && !inDisabled) {
          if (mod.curseForgeId && (mod.curseForgeFileId || mod.fileId)) {
            console.log(`[ModManager] Auto-repair: Re-downloading missing mod "${mod.name}"...`);
            try {
              await downloadMod({
                ...mod,
                modId: mod.curseForgeId,
                fileId: mod.curseForgeFileId || mod.fileId,
                apiKey: API_KEY
              });
            } catch (err) {
              console.error(`[ModManager] Auto-repair failed for "${mod.name}": ${err.message}`);
            }
          }
        }
      }
    }

    // 4. Auto-Import (Detect manual drops in the profile folder)
    const enabledFiles = fs.existsSync(profileModsPath) ? fs.readdirSync(profileModsPath).filter(f => f.endsWith('.jar') || f.endsWith('.zip')) : [];
    
    let profileMods = activeProfile.mods || [];
    let profileUpdated = false;


    // Anything in this folder belongs to this profile.

    for (const file of enabledFiles) {
      const isKnown = profileMods.some(m => m.fileName === file);

      if (!isKnown) {
        console.log(`[ModManager] Auto-importing manual mod: ${file}`);
        const newMod = {
          id: generateModId(file),
          name: extractModName(file),
          version: 'Unknown',
          description: 'Manually installed',
          author: 'Local',
          enabled: true,
          fileName: file,
          fileSize: 0,
          dateInstalled: new Date().toISOString(),
          manual: true
        };
        profileMods.push(newMod);
        profileUpdated = true;
      }
    }

    if (profileUpdated) {
      profileManager.updateProfile(activeProfile.id, { mods: profileMods });
      const updatedProfile = profileManager.getActiveProfile();
      profileMods = updatedProfile ? (updatedProfile.mods || []) : profileMods;
    }

    // 5. Enforce Enabled/Disabled State (Move files between Profile/Mods and Profile/DisabledMods)
    // Note: Enabled mods are copied to HytaleSaves\Mods, disabled mods stay in Profile/DisabledMods
    
    const disabledFiles = fs.existsSync(profileDisabledModsPath) ? fs.readdirSync(profileDisabledModsPath).filter(f => f.endsWith('.jar') || f.endsWith('.zip')) : [];
    const allFiles = new Set([...enabledFiles, ...disabledFiles]);

    for (const fileName of allFiles) {
      const modConfig = profileMods.find(m => m.fileName === fileName);
      const shouldBeEnabled = modConfig && modConfig.enabled !== false; 

      const currentPath = enabledFiles.includes(fileName) ? path.join(profileModsPath, fileName) : path.join(profileDisabledModsPath, fileName);
      const targetDir = shouldBeEnabled ? profileModsPath : profileDisabledModsPath;
      const targetPath = path.join(targetDir, fileName);

      if (path.dirname(currentPath) !== targetDir) {
        console.log(`[Mod Sync] Moving ${fileName} to ${shouldBeEnabled ? 'Enabled' : 'Disabled'}`);
        try {
          fs.renameSync(currentPath, targetPath);
        } catch (err) {
          console.error(`Failed to move ${fileName}: ${err.message}`);
        }
      }
    }

    return { success: true };

  } catch (error) {
    console.error('[ModManager] Error syncing mods:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  loadInstalledMods,
  downloadMod,
  uninstallMod,
  toggleMod,
  syncModsForCurrentProfile,
  generateModId,
  extractModName,
  extractVersion
};
