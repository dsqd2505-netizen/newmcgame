const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AppUpdater {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.autoUpdateAvailable = true; // Track if auto-update is possible
    this.updateAvailable = false; // Track if an update was detected
    this.updateVersion = null; // Store the available update version
    this.setupAutoUpdater();
  }

  setupAutoUpdater() {

    // Configure logger for electron-updater
    // Create a compatible logger interface
    autoUpdater.logger = {
      info: (...args) => logger.info(...args),
      warn: (...args) => logger.warn(...args),
      error: (...args) => logger.error(...args),
      debug: (...args) => logger.log(...args)
    };

    // Auto download updates
    autoUpdater.autoDownload = true;
    // Auto install on quit (after download)
    autoUpdater.autoInstallOnAppQuit = true;

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-checking');
      }
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      const currentVersion = app.getVersion();
      const newVersion = info.version;
      
      // Only proceed if the new version is actually different from current
      if (newVersion === currentVersion) {
        console.log('Update version matches current version, ignoring update-available event');
        return;
      }
      
      this.updateAvailable = true;
      this.updateVersion = newVersion;
      this.autoUpdateAvailable = true; // Reset flag when new update is available
      
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-available', {
          version: newVersion,
          newVersion: newVersion,
          currentVersion: currentVersion,
          releaseName: info.releaseName,
          releaseNotes: info.releaseNotes
        });
        // Also send to the old popup handler for compatibility
        this.mainWindow.webContents.send('show-update-popup', {
          currentVersion: currentVersion,
          newVersion: newVersion,
          version: newVersion
        });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available. Current version is latest.');
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-not-available', {
          version: info.version
        });
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('Error in auto-updater:', err);
      
      // Check if this is a network error (not critical, don't show UI)
      const errorMessage = err.message?.toLowerCase() || '';
      const isNetworkError = errorMessage.includes('err_name_not_resolved') || 
                            errorMessage.includes('network') || 
                            errorMessage.includes('connection') ||
                            errorMessage.includes('timeout') ||
                            errorMessage.includes('enotfound');
      
      if (isNetworkError) {
        console.warn('Network error in auto-updater - will retry later. Not showing error UI.');
        return; // Don't show error UI for network issues
      }
      
      // Handle SHA512 checksum mismatch - this can happen during updates, just retry
      const isChecksumError = err.code === 'ERR_CHECKSUM_MISMATCH' ||
                              errorMessage.includes('sha512') || 
                              errorMessage.includes('checksum') ||
                              errorMessage.includes('mismatch');
      
      if (isChecksumError) {
        console.warn('SHA512 checksum mismatch detected - clearing cache and will retry automatically. This is normal during updates.');
        // Clear the update cache and let it re-download
        this.clearUpdateCache();
        
        // Don't show error UI - just log and let it retry automatically on next check
        return;
      }
      
      // Determine if this is a critical error that prevents auto-update
      const isCriticalError = this.isCriticalUpdateError(err);
      
      if (isCriticalError) {
        this.autoUpdateAvailable = false;
        console.warn('Auto-update failed. Manual download required.');
      }
      
      // Handle missing metadata files (platform-specific builds)
      if (err.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') {
        const platform = process.platform === 'darwin' ? 'macOS' : 
                        process.platform === 'win32' ? 'Windows' : 'Linux';
        const missingFile = process.platform === 'darwin' ? 'latest-mac.yml' :
                           process.platform === 'win32' ? 'latest.yml' : 'latest-linux.yml';
        console.warn(`${platform} update metadata file (${missingFile}) not found in release.`);
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('update-error', {
            message: `Update metadata file for ${platform} not found in release. Please download manually.`,
            code: err.code,
            requiresManualDownload: true,
            updateVersion: this.updateVersion,
            isMissingMetadata: true
          });
        }
        return;
      }
      
      // Linux-specific: Handle installation permission errors
      if (process.platform === 'linux') {
        const errorMessage = err.message?.toLowerCase() || '';
        const errorStack = err.stack?.toLowerCase() || '';
        const isInstallError = errorMessage.includes('pkexec') || 
                              errorMessage.includes('gksudo') ||
                              errorMessage.includes('kdesudo') ||
                              errorMessage.includes('setuid root') ||
                              errorMessage.includes('exited with code 127') ||
                              errorStack.includes('pacmanupdater') ||
                              errorStack.includes('doinstall') ||
                              errorMessage.includes('installation failed');
        
        if (isInstallError) {
          console.warn('Linux installation error: Package installation requires root privileges. Manual installation required.');
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('update-error', {
              message: 'Auto-installation requires root privileges. Please download and install the update manually.',
              code: err.code || 'ERR_LINUX_INSTALL_PERMISSION',
              isLinuxInstallError: true,
              requiresManualDownload: true,
              updateVersion: this.updateVersion
            });
          }
          return;
        }
      }
      
      // macOS-specific: Handle unsigned app errors gracefully
      if (process.platform === 'darwin' && err.code === 2) {
        console.warn('macOS update error: App may not be code-signed. Auto-update requires code signing.');
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('update-error', {
            message: 'Please download manually from GitHub.',
            code: err.code,
            isMacSigningError: true,
            requiresManualDownload: true,
            updateVersion: this.updateVersion
          });
        }
        return;
      }
      
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-error', {
          message: err.message,
          code: err.code,
          requiresManualDownload: isCriticalError,
          updateVersion: this.updateVersion
        });
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      console.log(message);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-download-progress', {
          percent: progressObj.percent,
          bytesPerSecond: progressObj.bytesPerSecond,
          transferred: progressObj.transferred,
          total: progressObj.total
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-downloaded', {
          version: info.version,
          releaseName: info.releaseName,
          releaseNotes: info.releaseNotes
        });
      }
    });
  }

  checkForUpdatesAndNotify() {
    // Check for updates and notify if available
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.error('Failed to check for updates:', err);
      
      // Network errors are not critical - just log and continue
      const errorMessage = err.message?.toLowerCase() || '';
      const isNetworkError = errorMessage.includes('err_name_not_resolved') || 
                            errorMessage.includes('network') || 
                            errorMessage.includes('connection') ||
                            errorMessage.includes('timeout') ||
                            errorMessage.includes('enotfound');
      
      if (isNetworkError) {
        console.warn('Network error checking for updates - will retry later. This is not critical.');
        return; // Don't show error UI for network issues
      }
      
      const isCritical = this.isCriticalUpdateError(err);
      if (this.mainWindow && !this.mainWindow.isDestroyed() && isCritical) {
        this.mainWindow.webContents.send('update-error', {
          message: err.message || 'Failed to check for updates',
          code: err.code,
          requiresManualDownload: true
        });
      }
    });
  }

  checkForUpdates() {
    // Manual check for updates (returns promise)
    return autoUpdater.checkForUpdates().catch(err => {
      console.error('Failed to check for updates:', err);
      
      // Network errors are not critical - just return no update available
      const errorMessage = err.message?.toLowerCase() || '';
      const isNetworkError = errorMessage.includes('err_name_not_resolved') || 
                            errorMessage.includes('network') || 
                            errorMessage.includes('connection') ||
                            errorMessage.includes('timeout') ||
                            errorMessage.includes('enotfound');
      
      if (isNetworkError) {
        console.warn('Network error - update check unavailable');
        return { updateInfo: null }; // Return empty result for network errors
      }
      
      const isCritical = this.isCriticalUpdateError(err);
      if (isCritical) {
        this.autoUpdateAvailable = false;
      }
      throw err;
    });
  }

  quitAndInstall() {
    // Quit and install the update
    autoUpdater.quitAndInstall(false, true);
  }

  getUpdateInfo() {
    return {
      currentVersion: app.getVersion(),
      updateAvailable: false
    };
  }

  clearUpdateCache() {
    try {
      // Get the cache directory based on platform
      const cacheDir = process.platform === 'darwin' 
        ? path.join(os.homedir(), 'Library', 'Caches', `${app.getName()}-updater`)
        : process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Local', `${app.getName()}-updater`)
        : path.join(os.homedir(), '.cache', `${app.getName()}-updater`);
      
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log('Update cache cleared successfully');
      } else {
        console.log('Update cache directory does not exist');
      }
    } catch (cacheError) {
      console.warn('Could not clear update cache:', cacheError.message);
    }
  }

  isCriticalUpdateError(err) {
    // Check for errors that prevent auto-update
    const errorMessage = err.message?.toLowerCase() || '';
    const errorCode = err.code;
    
    // Missing update metadata files (platform-specific)
    if (errorCode === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' || 
        errorMessage.includes('cannot find latest') ||
        errorMessage.includes('latest-linux.yml') ||
        errorMessage.includes('latest-mac.yml') ||
        errorMessage.includes('latest.yml')) {
      return true;
    }
    
    // macOS code signing errors
    if (process.platform === 'darwin' && (errorCode === 2 || errorMessage.includes('shipit'))) {
      return true;
    }
    
    // Download failures
    if (errorMessage.includes('download') && errorMessage.includes('fail')) {
      return true;
    }
    
    // Network errors that prevent download (but we handle these separately as non-critical)
    // Installation errors
    if (errorMessage.includes('install') && errorMessage.includes('fail')) {
      return true;
    }
    
    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('access denied')) {
      return true;
    }
    
    // Linux installation errors (pkexec, sudo issues)
    if (process.platform === 'linux' && (
        errorMessage.includes('pkexec') ||
        errorMessage.includes('setuid root') ||
        errorMessage.includes('exited with code 127') ||
        errorMessage.includes('gksudo') ||
        errorMessage.includes('kdesudo'))) {
      return true;
    }
    
    // File system errors (but not "not found" for metadata files - handled above)
    if (errorMessage.includes('enoent') || errorMessage.includes('cannot find')) {
      // Only if it's not about metadata files
      if (!errorMessage.includes('latest') && !errorMessage.includes('.yml')) {
        return true;
      }
    }
    
    // Generic critical error codes (but not checksum errors - those are handled separately)
    if (errorCode && (errorCode >= 100 || 
                      errorCode === 'ERR_UPDATER_INVALID_RELEASE_FEED' ||
                      errorCode === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND')) {
      // Don't treat checksum errors as critical - they're handled separately
      if (errorCode === 'ERR_CHECKSUM_MISMATCH') {
        return false;
      }
      return true;
    }
    
    return false;
  }
}

module.exports = AppUpdater;
