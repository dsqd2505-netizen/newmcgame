const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const { launchGame, launchGameWithVersionCheck, installGame, saveUsername, loadUsername, saveJavaPath, loadJavaPath, saveInstallPath, loadInstallPath, saveDiscordRPC, loadDiscordRPC, saveLanguage, loadLanguage, saveCloseLauncherOnStart, loadCloseLauncherOnStart, saveLauncherHardwareAcceleration, loadLauncherHardwareAcceleration, isGameInstalled, uninstallGame, repairGame, getHytaleNews, handleFirstLaunchCheck, proposeGameUpdate, markAsLaunched, loadConfig, saveConfig, checkLaunchReady } = require('./backend/launcher');
const { retryPWRDownload } = require('./backend/managers/gameManager');
const { migrateUserDataToCentralized } = require('./backend/utils/userDataMigration');

// Handle Hardware Acceleration
try {
  const hwEnabled = loadLauncherHardwareAcceleration();
  if (!hwEnabled) {
    console.log('Hardware acceleration disabled by user setting');
    app.disableHardwareAcceleration();
  }
} catch (error) {
  console.error('Failed to load hardware acceleration setting:', error);
}

const logger = require('./backend/logger');
const profileManager = require('./backend/managers/profileManager');

logger.interceptConsole();

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;
let discordRPC = null;

// Discord Rich Presence setup
const DISCORD_CLIENT_ID = "1462244937868513373";

function initDiscordRPC() {
  try {
    // Check if Discord RPC is enabled in settings
    const rpcEnabled = loadDiscordRPC();
    if (!rpcEnabled) {
      console.log('Discord RPC disabled in settings');
      return;
    }

    const { Client } = require('discord-rpc');
    discordRPC = new Client({ transport: 'ipc' });

    discordRPC.on('ready', () => {
      console.log('Discord RPC connected');
      setDiscordActivity();
    });

    discordRPC.on('disconnected', () => {
      console.log('Discord RPC disconnected');
    });

    discordRPC.login({ clientId: DISCORD_CLIENT_ID }).catch(err => {
      console.log('Failed to connect to Discord:', err.message);
    });
  } catch (error) {
    console.log('Discord RPC module not available:', error.message);
  }
}

function setDiscordActivity() {
  if (!discordRPC) return;

  try {
    discordRPC.setActivity({
      details: 'Using HytaleF2P',
      startTimestamp: Date.now(),
      largeImageKey: 'hytale_logo',
      largeImageText: 'Hytale F2P Launcher',
      buttons: [
        {
          label: 'GitHub',
          url: 'https://github.com/amiayweb/Hytale-F2P'
        },
        {
          label: 'Discord',
          url: 'https://discord.gg/hf2pdc'
        }
      ]
    });
  } catch (error) {
    console.error('Failed to set Discord activity:', error.message);
  }
}

async function toggleDiscordRPC(enabled) {
  console.log('Toggling Discord RPC:', enabled);

  if (enabled && !discordRPC) {
    console.log('Initializing Discord RPC...');
    initDiscordRPC();
  } else if (!enabled && discordRPC) {
    try {
      console.log('Disconnecting Discord RPC...');
      
      // Check if Discord RPC is still connected before trying to use it
      if (discordRPC && discordRPC.transport && discordRPC.transport.socket) {
        // Add timeout to prevent hanging
        const clearActivityPromise = discordRPC.clearActivity();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Discord RPC clearActivity timeout')), 1000)
        );
        
        try {
          await Promise.race([clearActivityPromise, timeoutPromise]);
          await new Promise(r => setTimeout(r, 100));
        } catch (timeoutErr) {
          console.log('Discord RPC clearActivity timed out:', timeoutErr.message);
        }
      } else {
        console.log('Discord RPC already disconnected');
      }
      
      // Destroy - wrap in try-catch to handle library errors
      if (discordRPC) {
        try {
          if (typeof discordRPC.destroy === 'function') {
            const destroyPromise = discordRPC.destroy();
            if (destroyPromise && typeof destroyPromise.catch === 'function') {
              destroyPromise.catch(err => {
                console.log('Discord RPC destroy error (ignored):', err.message);
              });
            }
          }
        } catch (destroyErr) {
          console.log('Error destroying Discord RPC (ignored):', destroyErr.message);
        }
      }
      
      console.log('Discord RPC disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting Discord RPC:', error.message);
    } finally {
      discordRPC = null;
    }
  }
}

function createSplashScreen() {
  const splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile('GUI/splash.html');
  splashWindow.center();

  // close splash after 2.5s , need to implement a files check or whatever. just mock for now 
  setTimeout(() => {
    splashWindow.close();
    createWindow();
  }, 2500);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    resizable: true,
    alwaysOnTop: false,
    backgroundColor: '#090909',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false,
      webSecurity: true
    }
  });

  mainWindow.loadFile('GUI/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Cleanup Discord RPC when window is closed
  mainWindow.on('closed', () => {
    console.log('Main window closed, cleaning up Discord RPC...');
    cleanupDiscordRPC();
  });

  // Initialize Discord Rich Presence
  initDiscordRPC();

  // Configure and initialize electron-updater
  // Enable auto-download so updates start immediately when available
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for launcher updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        currentVersion: app.getVersion(),
        newVersion: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Launcher is up to date:', info.version);
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);

    // Handle macOS code signing errors - requires manual download
    if (mainWindow && !mainWindow.isDestroyed()) {
      const isMacSigningError = process.platform === 'darwin' &&
        (err.code === 'ERR_UPDATER_INVALID_SIGNATURE' ||
         err.message.includes('signature') ||
         err.message.includes('code sign'));

      mainWindow.webContents.send('update-error', {
        message: err.message,
        isMacSigningError: isMacSigningError,
        requiresManualDownload: isMacSigningError || process.platform === 'darwin'
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        platform: process.platform,
        // macOS auto-install often fails on unsigned apps
        autoInstallSupported: process.platform !== 'darwin'
      });
    }
  });

  // Check for updates after 3 seconds
  /*
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('Failed to check for updates:', err.message);
    });
  }, 3000);
  */

  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Allow standard copy/paste/cut/select-all shortcuts
    const isMac = process.platform === 'darwin';
    const modKey = isMac ? input.meta : input.control;
    const key = input.key.toLowerCase();

    // Allow Ctrl/Cmd + V (paste), C (copy), X (cut), A (select all)
    if (modKey && !input.shift && ['v', 'c', 'x', 'a'].includes(key)) {
      return; // Don't block these
    }

    // Block devtools shortcuts
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
    }
    if (input.control && input.shift && input.key.toLowerCase() === 'j') {
      event.preventDefault();
    }
    if (input.control && input.shift && input.key.toLowerCase() === 'c') {
      event.preventDefault();
    }
    if (input.key === 'F12') {
      event.preventDefault();
    }
    if (input.key === 'F5') {
      event.preventDefault();
    }

    // Close application shortcuts
    const quitShortcut = (isMac && input.meta && input.key.toLowerCase() === 'q') ||
      (!isMac && input.control && input.key.toLowerCase() === 'q') ||
      (!isMac && input.alt && input.key === 'F4');

    if (quitShortcut) {
      app.quit();
    }
  });



  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });

  // Note: Not using setIgnoreMenuShortcuts to allow copy/paste to work
}

app.whenReady().then(async () => {
  const packageJson = require('./package.json');
  console.log('=== HYTALE F2P LAUNCHER STARTED ===');
  console.log('Launcher version:', packageJson.version);
  console.log('Platform:', process.platform);
  console.log('Architecture:', process.arch);
  console.log('Electron version:', process.versions.electron);
  console.log('Node.js version:', process.versions.node);
  console.log('Log directory:', logger.getLogDirectory());

  try {
    const { loadGpuPreference, detectGpu } = require('./backend/launcher');
    const savedPreference = loadGpuPreference();
    if (savedPreference === 'auto') {
      global.detectedGpu = detectGpu(); // if 'auto' selected = preload GPU detection
      console.log('GPU auto-detection completed on startup:', global.detectedGpu);
    } else {
      console.log('GPU preference is manual, skipping auto-detection');
    }
  } catch (error) {
    console.warn('Failed to preload GPU detection:', error.message);
    global.detectedGpu = { mode: 'integrated', vendor: 'intel' };
  }


  // Initialize Profile Manager (runs migration if needed)
  profileManager.init();

  // Migrate UserData to centralized location (v2.1.2+)
  console.log('[Startup] Checking UserData migration...');
  try {
    await migrateUserDataToCentralized();
  } catch (error) {
    console.error('[Startup] UserData migration failed:', error);
  }

  createSplashScreen();

  setTimeout(async () => {
    let timeoutReached = false;

    const unlockPlayButton = () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lock-play-button', false);
      }
    };

    const timeoutId = setTimeout(() => {
      timeoutReached = true;
      console.warn('First launch check timeout reached, unlocking play button');
      unlockPlayButton();
    }, 15000);

    try {
      console.log('Starting first launch check...');

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lock-play-button', true);
      }

      const progressCallback = (message, percent, speed, downloaded, total, retryState) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('first-launch-progress', { message, percent, speed, downloaded, total, retryState });
        }
      };

      const firstLaunchResult = await Promise.race([
        handleFirstLaunchCheck(progressCallback),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('First launch check timeout')), 12000);
        })
      ]);

      clearTimeout(timeoutId);

      if (timeoutReached) {
        console.log('Timeout already reached, skipping result processing');
        return;
      }

      console.log('First launch check result:', firstLaunchResult);

      if (mainWindow && !mainWindow.isDestroyed()) {
        if (firstLaunchResult.needsUpdate && firstLaunchResult.existingGame) {
          console.log('Sending show-first-launch-update event...');

          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('show-first-launch-update', {
                existingGame: firstLaunchResult.existingGame,
                isFirstLaunch: firstLaunchResult.isFirstLaunch
              });
            }
          }, 1000);

        } else if (firstLaunchResult.isFirstLaunch && !firstLaunchResult.existingGame) {
          console.log('Sending show-first-launch-welcome event...');

          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('show-first-launch-welcome');
            }
          }, 1000);
        } else {
          unlockPlayButton();
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error during first launch check:', error);
      if (!timeoutReached) {
        unlockPlayButton();
      }
    }
  }, 3000);
});

async function cleanupDiscordRPC() {
  if (!discordRPC) return;
  try {
    console.log('Cleaning up Discord RPC...');
    
    // Check if Discord RPC is still connected before trying to use it
    if (discordRPC && discordRPC.transport && discordRPC.transport.socket) {
      // Add timeout to prevent hanging if Discord is unresponsive
      const clearActivityPromise = discordRPC.clearActivity();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Discord RPC clearActivity timeout')), 1000)
      );
      
      try {
        await Promise.race([clearActivityPromise, timeoutPromise]);
        await new Promise(r => setTimeout(r, 100));
      } catch (timeoutErr) {
        console.log('Discord RPC clearActivity timed out, proceeding with cleanup:', timeoutErr.message);
      }
    } else {
      console.log('Discord RPC already disconnected, skipping clearActivity');
    }
    
    // Destroy and cleanup - wrap in try-catch to handle library errors
    if (discordRPC) {
      try {
        if (typeof discordRPC.destroy === 'function') {
          // destroy() may return a promise that rejects, so handle it
          const destroyPromise = discordRPC.destroy();
          if (destroyPromise && typeof destroyPromise.catch === 'function') {
            // If it's a promise, catch any rejections silently
            destroyPromise.catch(err => {
              console.log('Discord RPC destroy error (ignored):', err.message);
            });
          }
        }
      } catch (destroyErr) {
        console.log('Error destroying Discord RPC client (ignored):', destroyErr.message);
      }
    }
    
    console.log('Discord RPC cleaned up successfully');
  } catch (error) {
    console.log('Error cleaning up Discord RPC:', error.message);
  } finally {
    discordRPC = null;
  }
}

app.on('before-quit', () => {
  console.log('=== LAUNCHER BEFORE QUIT ===');
  cleanupDiscordRPC();
});

app.on('window-all-closed', () => {
  console.log('=== LAUNCHER CLOSING ===');
  app.quit();
});


ipcMain.handle('launch-game', async (event, playerName, javaPath, installPath, gpuPreference) => {
  try {
    const progressCallback = (message, percent, speed, downloaded, total, retryState) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const data = {
          message: message || null,
          percent: percent !== null && percent !== undefined ? Math.min(100, Math.max(0, percent)) : null,
          speed: speed !== null && speed !== undefined ? speed : null,
          downloaded: downloaded !== null && downloaded !== undefined ? downloaded : null,
          total: total !== null && total !== undefined ? total : null,
          retryState: retryState || null
        };
        mainWindow.webContents.send('progress-update', data);
      }
    };

    const result = await launchGameWithVersionCheck(playerName, progressCallback, javaPath, installPath, gpuPreference);

    if (result.success && result.launched) {
      const closeOnStart = loadCloseLauncherOnStart();
      if (closeOnStart) {
        console.log('Close Launcher on start enabled, quitting application...');
        setTimeout(() => {
          app.quit();
        }, 1000);
      }
    }

    return result;

  } catch (error) {
    console.error('Launch error:', error);
    const errorMessage = error.message || error.toString();

    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        mainWindow.webContents.send('progress-complete');
      }, 2000);
    }

    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('install-game', async (event, playerName, javaPath, installPath, branch) => {
  try {
    console.log(`[IPC] install-game called with parameters:`);
    console.log(`  - playerName: ${playerName}`);
    console.log(`  - javaPath: ${javaPath}`);
    console.log(`  - installPath: ${installPath}`);
    console.log(`  - branch: ${branch}`);
    console.log(`[IPC] branch type: ${typeof branch}, value: ${JSON.stringify(branch)}`);

    // Signal installation start
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('installation-start');
    }

    const progressCallback = (message, percent, speed, downloaded, total, retryState) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const data = {
          message: message || null,
          percent: percent !== null && percent !== undefined ? Math.min(100, Math.max(0, percent)) : null,
          speed: speed !== null && speed !== undefined ? speed : null,
          downloaded: downloaded !== null && downloaded !== undefined ? downloaded : null,
          total: total !== null && total !== undefined ? total : null,
          retryState: retryState || null
        };
        mainWindow.webContents.send('progress-update', data);
      }
    };

    const result = await installGame(playerName, progressCallback, javaPath, installPath, branch);

    // Signal installation end
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('installation-end');
    }

    // Ensure we always return a result for the IPC handler
    const successResponse = result || { success: true };
    console.log('[Main] Returning success response for install-game:', successResponse);
    return successResponse;
  } catch (error) {
    // console.error('Install error:', error);
    const errorMessage = error.message || error.toString();

    // Enhanced error data extraction for both download and Butler errors
    let errorData = {
      message: errorMessage,
      error: true,
      canRetry: true, // Default to true, will be overridden by specific error props
      retryData: null
    };

    // Prioritize JRE errors first
    if (error.isJREError) {
      console.log('[Main] Processing JRE download error with retry context');
      errorData.retryData = {
        isJREError: true,
        jreUrl: error.jreUrl,
        fileName: error.fileName,
        cacheDir: error.cacheDir,
        osName: error.osName,
        arch: error.arch
      };
      // For JRE errors, allow manual retry unless explicitly disabled
      errorData.canRetry = error.canRetry !== false;
      errorData.errorType = 'jre';
    }
    // Handle Butler-specific errors
    else if (error.butlerError) {
      console.log('[Main] Processing Butler error with retry context');
      errorData.retryData = {
        branch: error.branch || 'release',
        fileName: error.fileName || 'v8',
        cacheDir: error.cacheDir
      };
      errorData.canRetry = error.canRetry !== false;
    }
    // Handle PWR download errors
    else if (error.branch && error.fileName) {
      console.log('[Main] Processing PWR download error with retry context');
      errorData.retryData = {
        branch: error.branch,
        fileName: error.fileName,
        cacheDir: error.cacheDir
      };
      errorData.canRetry = error.canRetry !== false;
    }
    // Default fallback for other errors
    else {
      console.log('[Main] Processing generic error, creating default retry data');
      errorData.retryData = {
        branch: 'release',
        fileName: 'v8'
      };
      // For generic errors, assume it's retryable unless specified
      errorData.canRetry = error.canRetry !== false;
    }

    // Send enhanced error info for retry UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Main] Sending error data to renderer:', errorData);
      mainWindow.webContents.send('progress-update', errorData);
    }

    // Signal installation end on error too
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('installation-end');
    }

    // Always return a proper response to prevent timeout
    const errorResponse = { success: false, error: errorMessage };
    console.log('[Main] Returning error response for install-game:', errorResponse);
    return errorResponse;
  }
});

ipcMain.handle('save-username', (event, username) => {
  try {
    saveUsername(username);
    return { success: true };
  } catch (error) {
    console.error('[Main] Failed to save username:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-username', () => {
  // Returns null if no username configured (no silent 'Player' fallback)
  return loadUsername();
});

ipcMain.handle('check-launch-ready', () => {
  // Returns launch readiness state with detailed info
  // { ready: boolean, hasUsername: boolean, username: string|null, issues: string[] }
  return checkLaunchReady();
});

ipcMain.handle('save-java-path', (event, javaPath) => {
  saveJavaPath(javaPath);
  return { success: true };
});

ipcMain.handle('load-java-path', () => {
  return loadJavaPath();
});

ipcMain.handle('save-install-path', (event, installPath) => {
  saveInstallPath(installPath);
  logger.updateInstallPath();
  return { success: true };
});

ipcMain.handle('load-install-path', () => {
  return loadInstallPath();
});

ipcMain.handle('save-discord-rpc', (event, enabled) => {
  saveDiscordRPC(enabled);
  toggleDiscordRPC(enabled);
  return { success: true };
});

ipcMain.handle('load-discord-rpc', () => {
  return loadDiscordRPC();
});

ipcMain.handle('save-language', (event, language) => {
  saveLanguage(language);
  return { success: true };
});

ipcMain.handle('load-language', () => {
  return loadLanguage();
});

ipcMain.handle('save-close-launcher', (event, enabled) => {
  saveCloseLauncherOnStart(enabled);
  return { success: true };
});

ipcMain.handle('load-close-launcher', () => {
  return loadCloseLauncherOnStart();
});

ipcMain.handle('save-launcher-hw-accel', (event, enabled) => {
  saveLauncherHardwareAcceleration(enabled);
  return { success: true };
});

ipcMain.handle('load-launcher-hw-accel', () => {
  return loadLauncherHardwareAcceleration();
});

ipcMain.handle('load-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, configUpdate) => {
  saveConfig(configUpdate);
  return { success: true };
});

ipcMain.handle('select-install-path', async () => {

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Installation Folder'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('accept-first-launch-update', async (event, existingGame) => {
  try {
    const progressCallback = (message, percent, speed, downloaded, total, retryState) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const data = {
          message: message || null,
          percent: percent !== null && percent !== undefined ? Math.min(100, Math.max(0, percent)) : null,
          speed: speed !== null && speed !== undefined ? speed : null,
          downloaded: downloaded !== null && downloaded !== undefined ? downloaded : null,
          total: total !== null && total !== undefined ? total : null,
          retryState: retryState || null
        };
        mainWindow.webContents.send('first-launch-progress', data);
      }
    };

    const result = await proposeGameUpdate(existingGame, progressCallback);

    return result;
  } catch (error) {
    console.error('First launch update error:', error);
    const errorMessage = error.message || error.toString();
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('mark-as-launched', async () => {
  try {
    markAsLaunched();
    return { success: true };
  } catch (error) {
    console.error('Mark as launched error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('is-game-installed', async () => {
  try {
    return await Promise.race([
      Promise.resolve(isGameInstalled()),
      new Promise((resolve) => setTimeout(() => resolve(false), 5000))
    ]);
  } catch (error) {
    console.error('Error checking game installation:', error);
    return false;
  }
});

ipcMain.handle('uninstall-game', async () => {
  try {
    await uninstallGame();
  } catch (error) {
    // console.error('Uninstall error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('repair-game', async () => {
  try {
    const progressCallback = (message, percent, speed, downloaded, total, retryState) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const data = {
          message: message || null,
          percent: percent !== null && percent !== undefined ? Math.min(100, Math.max(0, percent)) : null,
          speed: speed !== null && speed !== undefined ? speed : null,
          downloaded: downloaded !== null && downloaded !== undefined ? downloaded : null,
          total: total !== null && total !== undefined ? total : null,
          retryState: retryState || null
        };
        mainWindow.webContents.send('progress-update', data);
      }
    };

    const result = await repairGame(progressCallback);
    return result;
  } catch (error) {
    console.error('Repair error:', error);
    const errorMessage = error.message || error.toString();
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('retry-download', async (event, retryData) => {
  try {
    console.log('[IPC] retry-download called with data:', retryData);

    const progressCallback = (message, percent, speed, downloaded, total, retryState) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const data = {
          message: message || null,
          percent: percent !== null && percent !== undefined ? Math.min(100, Math.max(0, percent)) : null,
          speed: speed !== null && speed !== undefined ? speed : null,
          downloaded: downloaded !== null && downloaded !== undefined ? downloaded : null,
          total: total !== null && total !== undefined ? total : null,
          retryState: retryState || null
        };
        mainWindow.webContents.send('progress-update', data);
      }
    };

    // Handle JRE download retries
    if (retryData && retryData.isJREError) {
      console.log(`[IPC] Retrying JRE download: jreUrl=${retryData.jreUrl}, fileName=${retryData.fileName}`);
      console.log('[IPC] Full JRE retry data:', JSON.stringify(retryData, null, 2));

      const { retryJREDownload } = require('./backend/managers/javaManager');
      const jreCacheFile = path.join(retryData.cacheDir, retryData.fileName);
      await retryJREDownload(retryData.jreUrl, jreCacheFile, progressCallback);

      return { success: true };
    }

    // Handle PWR download retries (default)
    if (!retryData || !retryData.branch || !retryData.fileName) {
      console.log('[IPC] Invalid retry data, using PWR defaults');
      retryData = {
        branch: 'release',
        fileName: 'v8'
      };
    }

    // Extract PWR download info from retryData
    const branch = retryData.branch;
    const fileName = retryData.fileName;
    const cacheDir = retryData.cacheDir;

    console.log(`[IPC] Retrying PWR download: branch=${branch}, fileName=${fileName}`);
    console.log('[IPC] Full PWR retry data:', JSON.stringify(retryData, null, 2));

    // Perform retry with enhanced context
    await retryPWRDownload(branch, fileName, progressCallback, cacheDir);

    return { success: true };
  } catch (error) {
    console.error('Retry download error:', error);
    const errorMessage = error.message || error.toString();

    // Send error update to frontend with context
    if (mainWindow && !mainWindow.isDestroyed()) {
      const isJreError = retryData?.isJREError;
      const errorRetryData = isJreError ?
        {
          isJREError: true,
          jreUrl: retryData?.jreUrl,
          fileName: retryData?.fileName,
          cacheDir: retryData?.cacheDir,
          osName: retryData?.osName,
          arch: retryData?.arch
        } :
        {
          branch: retryData?.branch || 'release',
          fileName: retryData?.fileName || 'v8',
          cacheDir: retryData?.cacheDir
        };

      const data = {
        message: errorMessage,
        error: true,
        canRetry: error.canRetry !== false, // Respect canRetry from the thrown error
        retryData: errorRetryData,
        errorType: isJreError ? 'jre' : 'general' // Add errorType for the UI
      };
      mainWindow.webContents.send('progress-update', data);
    }

    // Always return a proper response to prevent timeout
    const errorResponse = { success: false, error: errorMessage };
    console.log('[Main] Returning error response for retry-download:', errorResponse);
    return errorResponse;
  }
});

ipcMain.handle('get-hytale-news', async () => {
  try {
    const news = await getHytaleNews();
    return news;
  } catch (error) {
    console.error('News fetch error:', error);
    return [];
  }
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external URL:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-download-page', async () => {
  try {
    // Open GitHub releases page for manual download
    await shell.openExternal('https://github.com/amiayweb/Hytale-F2P/releases/latest');
    return { success: true };
  } catch (error) {
    console.error('Failed to open download page:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-game-location', async () => {
  try {
    const { getResolvedAppDir, loadVersionBranch } = require('./backend/launcher');
    const branch = loadVersionBranch();
    const gameDir = path.join(getResolvedAppDir(), branch, 'package', 'game');

    if (fs.existsSync(gameDir)) {
      await shell.openPath(gameDir);
      return { success: true };
    } else {
      throw new Error('Game directory not found');
    }
  } catch (error) {
    console.error('Failed to open game location:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browse-java-path', async () => {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  let dialogOptions;

  if (isWindows) {
    dialogOptions = {
      properties: ['openFile'],
      title: 'Select Java Executable',
      filters: [
        { name: 'Java Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    };
  } else if (isMac) {
    dialogOptions = {
      properties: ['openFile'],
      title: 'Select Java Executable',
      message: 'Select java executable (usually in /Library/Java/JavaVirtualMachines/*/Contents/Home/bin/java)',
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    };
  } else {
    dialogOptions = {
      properties: ['openFile'],
      title: 'Select Java Executable',
      message: 'Select java executable (usually /usr/bin/java or similar)',
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    };
  }

  const result = await dialog.showOpenDialog(mainWindow, dialogOptions);

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    if (settings.playerName) saveUsername(settings.playerName);
    if (settings.javaPath !== undefined) saveJavaPath(settings.javaPath);
    if (settings.installPath !== undefined) {
      saveInstallPath(settings.installPath);
      logger.updateInstallPath();
    }
    return { success: true };
  } catch (error) {
    console.error('Save settings error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-settings', async () => {
  try {
    return {
      playerName: loadUsername() || 'Player',
      javaPath: loadJavaPath() || '',
      installPath: loadInstallPath() || '',
      customInstall: false
    };
  } catch (error) {
    console.error('Load settings error:', error);
    return {
      playerName: 'Player',
      javaPath: '',
      installPath: '',
      customInstall: false
    };
  }
});

const { getModsPath, loadInstalledMods, downloadMod, uninstallMod, toggleMod, getCurrentUuid, getAllUuidMappings, setUuidForUser, generateNewUuid, deleteUuidForUser, resetCurrentUserUuid } = require('./backend/launcher');
const os = require('os');

ipcMain.handle('get-local-app-data', async () => {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
});

ipcMain.handle('get-env-var', async (event, key) => {
  return process.env[key];
});

ipcMain.handle('get-user-id', async () => {
  try {
    const { getOrCreatePlayerId } = require('./backend/launcher');
    return await getOrCreatePlayerId();
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
});

ipcMain.handle('load-installed-mods', async (event, modsPath) => {
  try {
    return await loadInstalledMods(modsPath);
  } catch (error) {
    console.error('Error loading installed mods:', error);
    return [];
  }
});

ipcMain.handle('openExternalLink', async (event, url) => {
  try {
    console.log('Opening external URL:', url);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external link:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-mod', async (event, modInfo) => {
  try {
    return await downloadMod(modInfo);
  } catch (error) {
    console.error('Error downloading mod:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('uninstall-mod', async (event, modId, modsPath) => {
  try {
    return await uninstallMod(modId, modsPath);
  } catch (error) {
    console.error('Error uninstalling mod:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('toggle-mod', async (event, modId, modsPath) => {
  try {
    return await toggleMod(modId, modsPath);
  } catch (error) {
    console.error('Error toggling mod:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-mods-path', async () => {
  try {
    return await getModsPath();
  } catch (error) {
    console.error('Error getting mods path:', error);
    return null;
  }
});

ipcMain.handle('select-mod-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Select Mod Files',
    filters: [
      { name: 'Mod Files', extensions: ['jar', 'zip'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return null;
});

ipcMain.handle('copy-mod-file', async (event, sourcePath, modsPath) => {
  try {
    const fileName = path.basename(sourcePath);
    const destPath = path.join(modsPath, fileName);

    fs.copyFileSync(sourcePath, destPath);

    return { success: true, fileName };
  } catch (error) {
    console.error('Error copying mod file:', error);
    return { success: false, error: error.message };
  }
});

// Electron-updater IPC handlers
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      updateAvailable: result && result.updateInfo,
      currentVersion: app.getVersion(),
      updateInfo: result ? result.updateInfo : null
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { updateAvailable: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    console.error('Error downloading update:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  console.log('[AutoUpdater] Installing update...');

  // On macOS, quitAndInstall often fails silently
  // Use a more aggressive approach
  if (process.platform === 'darwin') {
    console.log('[AutoUpdater] macOS detected, using force quit approach');
    // Give user feedback that something is happening
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-installing');
    }

    // Small delay to show the "Installing..." state
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      console.error('[AutoUpdater] quitAndInstall failed:', err);
      // Force quit the app - the update should install on next launch
      app.exit(0);
    }

    // If quitAndInstall didn't work, force exit after a delay
    setTimeout(() => {
      console.log('[AutoUpdater] Force exiting app...');
      app.exit(0);
    }, 2000);
  } else {
    autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.handle('get-launcher-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-gpu-info', () => {
  try {
    return app.getGPUInfo('complete');
  } catch (error) {
    console.error('Error getting GPU info:', error);
    return {};
  }
});

ipcMain.handle('save-gpu-preference', (event, gpuPreference) => {
  const { saveGpuPreference } = require('./backend/launcher');
  saveGpuPreference(gpuPreference);
  return { success: true };
});

ipcMain.handle('load-gpu-preference', () => {
  const { loadGpuPreference } = require('./backend/launcher');
  return loadGpuPreference();
});

ipcMain.handle('get-detected-gpu', () => {
  if (global.detectedGpu) {
    return global.detectedGpu;
  }
  const { detectGpu } = require('./backend/launcher');
  global.detectedGpu = detectGpu();
  return global.detectedGpu;
});

ipcMain.handle('save-version-branch', (event, branch) => {
  const { saveVersionBranch } = require('./backend/launcher');
  saveVersionBranch(branch);
  return { success: true };
});

ipcMain.handle('load-version-branch', () => {
  const { loadVersionBranch } = require('./backend/launcher');
  return loadVersionBranch();
});

ipcMain.handle('load-version-client', () => {
  const { loadVersionClient } = require('./backend/launcher');
  return loadVersionClient();
});

ipcMain.handle('window-close', () => {
  app.quit();
});


ipcMain.handle('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('get-version', () => {
  const packageJson = require('./package.json');
  return packageJson.version;
});

ipcMain.handle('get-log-directory', () => {
  return logger.getLogDirectory();
});

ipcMain.handle('get-current-uuid', async () => {
  try {
    return getCurrentUuid();
  } catch (error) {
    console.error('Error getting current UUID:', error);
    return null;
  }
});

ipcMain.handle('get-all-uuid-mappings', async () => {
  try {
    // Use getAllUuidMappingsArray which correctly normalizes username for comparison
    const { getAllUuidMappingsArray } = require('./backend/launcher');
    return getAllUuidMappingsArray();
  } catch (error) {
    console.error('Error getting UUID mappings:', error);
    return [];
  }
});

ipcMain.handle('set-uuid-for-user', async (event, username, uuid) => {
  try {
    await setUuidForUser(username, uuid);
    return { success: true };
  } catch (error) {
    console.error('Error setting UUID for user:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-new-uuid', async () => {
  try {
    return generateNewUuid();
  } catch (error) {
    console.error('Error generating new UUID:', error);
    return null;
  }
});

ipcMain.handle('delete-uuid-for-user', async (event, username) => {
  try {
    const result = deleteUuidForUser(username);
    return { success: result };
  } catch (error) {
    console.error('Error deleting UUID for user:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reset-current-user-uuid', async () => {
  try {
    const newUuid = resetCurrentUserUuid();
    return { success: true, uuid: newUuid };
  } catch (error) {
    console.error('Error resetting current user UUID:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-recent-logs', async (event, maxLines = 100) => {
  try {
    const logDir = logger.getLogDirectory();
    if (!logDir) return null;

    const files = fs.readdirSync(logDir)
      .filter(file => file.startsWith('launcher-') && file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: path.join(logDir, file),
        mtime: fs.statSync(path.join(logDir, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return null;

    const latestLogFile = files[0].path;
    const content = fs.readFileSync(latestLogFile, 'utf8');
    const lines = content.split('\n');

    let result = lines.slice(-maxLines).join('\n');

    if (lines.length > maxLines) {
      const truncatedMsg = `\n--- ⚠️ LOG TRUNCATED: Showing last ${maxLines} lines of ${lines.length}. Open Logs Folder for full history ---\n\n`;
      return result + truncatedMsg;
    }

    return result;
  } catch (error) {
    console.error('Error reading logs:', error);
    return null;
  }
});



ipcMain.handle('open-logs-folder', async () => {
  try {
    const logDir = logger.getLogDirectory();
    if (logDir && fs.existsSync(logDir)) {
      await shell.openPath(logDir);
      return { success: true };
    }
    return { success: false, error: 'Logs directory not found' };
  } catch (error) {
    console.error('Error opening logs folder:', error);
    return { success: false, error: error.message };
  }
});

// Profile Management IPC
ipcMain.handle('profile-create', async (event, name) => {
  try {
    return profileManager.createProfile(name);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('profile-list', async () => {
  return profileManager.getProfiles();
});

ipcMain.handle('profile-get-active', async () => {
  return profileManager.getActiveProfile();
});

ipcMain.handle('profile-activate', async (event, id) => {
  try {
    return await profileManager.activateProfile(id);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('profile-delete', async (event, id) => {
  try {
    return profileManager.deleteProfile(id);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('profile-update', async (event, id, updates) => {
  try {
    return profileManager.updateProfile(id, updates);
  } catch (error) {
    return { error: error.message };
  }
});

