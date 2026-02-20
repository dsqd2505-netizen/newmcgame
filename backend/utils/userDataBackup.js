const fs = require('fs-extra');
const path = require('path');

/**
 * Backup and restore UserData folder during game updates
 */
class UserDataBackup {
  /**
   * Backup UserData folder to a temporary location
   * @param {string} installPath - Base installation path (e.g., C:\Users\...\HytaleF2P)
   * @param {string} branch - Branch name (release or pre-release)
   * @param {boolean} hasVersionConfig - True if config.json has version_client and version_branch
   * @returns {Promise<string|null>} - Path to backup or null if no UserData found
   */
  async backupUserData(installPath, branch, hasVersionConfig = true) {
    let userDataPath;
    
    // Si on n'a pas de version_client/version_branch dans config.json, 
    // c'est une ancienne installation, on cherche dans installPath/HytaleF2P/release
    if (!hasVersionConfig) {
      const oldPath = path.join(installPath, 'HytaleF2P', 'release', 'package', 'game', 'latest', 'Client', 'UserData');
      console.log(`[UserDataBackup] No version_client/version_branch detected, searching old installation in: ${oldPath}`);
      
      if (fs.existsSync(oldPath)) {
        userDataPath = oldPath;
        console.log(`[UserDataBackup] ✓ Old installation found! UserData exists in old location`);
      } else {
        console.log(`[UserDataBackup] ✗ No old installation found in ${oldPath}`);
        userDataPath = path.join(installPath, branch, 'package', 'game', 'latest', 'Client', 'UserData');
      }
    } else {
      // Si on a version_client/version_branch, on cherche dans installPath/HytaleF2P/<branch>
      userDataPath = path.join(installPath, branch, 'package', 'game', 'latest', 'Client', 'UserData');
      console.log(`[UserDataBackup] Version configured, searching in: ${userDataPath}`);
    }
    
    if (!fs.existsSync(userDataPath)) {
      console.log(`[UserDataBackup] ✗ No UserData found at ${userDataPath}, backup skipped`);
      return null;
    }

    console.log(`[UserDataBackup] ✓ UserData found at ${userDataPath}`);
    const backupPath = path.join(installPath, `UserData_backup_${branch}_${Date.now()}`);
    
    try {
      console.log(`[UserDataBackup] Copying from ${userDataPath} to ${backupPath}...`);
      await fs.copy(userDataPath, backupPath, {
        overwrite: true,
        errorOnExist: false,
        dereference: true  // Follow symlinks to avoid EPERM errors on Windows
      });
      console.log('[UserDataBackup] ✓ Backup completed successfully');
      return backupPath;
    } catch (error) {
      console.error('[UserDataBackup] ✗ Erreur lors du backup:', error);
      throw new Error(`Failed to backup UserData: ${error.message}`);
    }
  }

  /**
   * Restore UserData folder from backup
   * @param {string} backupPath - Path to the backup folder
   * @param {string} installPath - Base installation path
   * @param {string} branch - Branch name (release or pre-release)
   * @returns {Promise<boolean>} - True if restored, false otherwise
   */
  async restoreUserData(backupPath, installPath, branch) {
    if (!backupPath || !fs.existsSync(backupPath)) {
      console.log('No backup to restore or backup path does not exist');
      return false;
    }

    const userDataPath = path.join(installPath, branch, 'package', 'game', 'latest', 'Client', 'UserData');
    
    try {
      console.log(`Restoring UserData from ${backupPath} to ${userDataPath}`);
      
      // Ensure parent directory exists
      const parentDir = path.dirname(userDataPath);
      if (!fs.existsSync(parentDir)) {
        await fs.ensureDir(parentDir);
      }

      await fs.copy(backupPath, userDataPath, {
        overwrite: true,
        errorOnExist: false,
        dereference: true  // Follow symlinks to avoid EPERM errors on Windows
      });
      
      console.log('UserData restore completed successfully');
      return true;
    } catch (error) {
      console.error('Error restoring UserData:', error);
      throw new Error(`Failed to restore UserData: ${error.message}`);
    }
  }

  /**
   * Clean up backup folder
   * @param {string} backupPath - Path to the backup folder to delete
   * @returns {Promise<boolean>} - True if deleted, false otherwise
   */
  async cleanupBackup(backupPath) {
    if (!backupPath || !fs.existsSync(backupPath)) {
      return false;
    }

    try {
      console.log(`Cleaning up backup at ${backupPath}`);
      await fs.remove(backupPath);
      console.log('Backup cleanup completed');
      return true;
    } catch (error) {
      console.error('Error cleaning up backup:', error);
      return false;
    }
  }

  /**
   * Check if UserData exists for a specific branch
   * @param {string} installPath - Base installation path
   * @param {string} branch - Branch name (release or pre-release)
   * @returns {boolean} - True if UserData exists
   */
  hasUserData(installPath, branch) {
    const userDataPath = path.join(installPath, branch, 'package', 'game', 'latest', 'Client', 'UserData');
    return fs.existsSync(userDataPath);
  }
}

module.exports = new UserDataBackup();
