const path = require('path');
const fs = require('fs');
const { markAsLaunched, loadConfig, saveVersionBranch, saveVersionClient, loadVersionBranch, loadVersionClient } = require('../core/config');
const { checkExistingGameInstallation, updateGameFiles } = require('../managers/gameManager');
const { getInstalledClientVersion, getLatestClientVersion } = require('./versionManager');

async function proposeGameUpdate(existingGame, progressCallback) {
  try {
    console.log('Proposing game update for existing installation...');
    
    if (progressCallback) {
      progressCallback('Checking for game updates...', 0, null, null, null);
    }
    
    const [installedVersion, latestVersion] = await Promise.all([
      getInstalledClientVersion(),
      getLatestClientVersion()
    ]);
    
    console.log(`Existing installation - Installed: ${installedVersion}, Latest: ${latestVersion}`);
    
    const customAppDir = path.join(existingGame.installPath, 'HytaleF2P');
    const customCacheDir = path.join(customAppDir, 'cache');
    const customToolsDir = path.join(customAppDir, 'butler');
    
    [customCacheDir, customToolsDir].forEach(dir => {
      const fs = require('fs');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    if (progressCallback) {
      progressCallback('Updating existing game installation...', 20, null, null, null);
    }
    
    await updateGameFiles(latestVersion, progressCallback, existingGame.gameDir, customToolsDir, customCacheDir);
    
    if (progressCallback) {
      progressCallback('Game update completed successfully', 100, null, null, null);
    }
    
    console.log('Existing game installation updated successfully');
    return { success: true, updated: true };
    
  } catch (error) {
    console.error('Error updating existing game:', error);
    if (progressCallback) {
      progressCallback(`Update failed: ${error.message}`, -1, null, null, null);
    }
    throw error;
  }
}

async function handleFirstLaunchCheck(progressCallback) {
  try {
    const config = loadConfig();
    
    // Initialize version_client if not set (but don't force version_branch)
    const currentVersion = loadVersionClient();
    
    if (currentVersion === undefined || currentVersion === null) {
      console.log('Initializing version_client to null (will trigger installation)');
      saveVersionClient(null);
    }
    
    if (config.hasLaunchedBefore === true) {
      return { isFirstLaunch: false, needsUpdate: false };
    }
    
    console.log('First launch detected, checking for existing game installation...');
    
    const existingGame = checkExistingGameInstallation();
    
    if (!existingGame) {
      console.log('No existing game installation found');
      
      const hasUserData = config.installPath || config.username || config.javaPath || 
                          config.chatUsername || config.userUuids || 
                          Object.keys(config).length > 0;
      
      if (hasUserData) {
        console.log('Detected existing user data but no game, marking as launched');
        markAsLaunched();
        return { isFirstLaunch: false, needsUpdate: false };
      } else {
        markAsLaunched();
        return { isFirstLaunch: true, needsUpdate: false, existingGame: null };
      }
    }
    
    console.log('Existing game installation found:', {
      gameDir: existingGame.gameDir,
      hasUserData: existingGame.hasUserData
    });
    
    return { 
      isFirstLaunch: true, 
      needsUpdate: true, 
      existingGame: existingGame 
    };
    
  } catch (error) {
    console.error('Error in first launch check:', error);
    markAsLaunched(); 
    return { isFirstLaunch: true, needsUpdate: false, error: error.message };
  }
}

module.exports = {
  proposeGameUpdate,
  handleFirstLaunchCheck
};
