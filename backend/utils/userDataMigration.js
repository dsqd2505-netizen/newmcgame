const fs = require('fs-extra');
const path = require('path');
const { getHytaleSavesDir, getResolvedAppDir } = require('../core/paths');
const { loadConfig, saveConfig } = require('../core/config');

/**
 * NEW SYSTEM (2.2.0+): UserData Migration to Centralized Location
 * 
 * UserData is now stored in a centralized location instead of inside game installation:
 * - Windows: %LOCALAPPDATA%\HytaleSaves\
 * - macOS: ~/Library/Application Support/HytaleSaves/
 * - Linux: ~/.hytalesaves/
 * 
 * This eliminates the need for backup/restore during updates.
 */

/**
 * Check if migration to centralized UserData has been completed
 */
function isMigrationCompleted() {
  const config = loadConfig();
  return config.userDataMigrated === true;
}

/**
 * Mark migration as completed
 */
function markMigrationCompleted() {
  saveConfig({ userDataMigrated: true });
  console.log('[UserDataMigration] Migration marked as completed in config');
}

/**
 * Find old UserData location (pre-2.2.0)
 * Searches in: installPath/branch/package/game/latest/Client/UserData
 */
function findOldUserDataPath() {
  try {
    const config = loadConfig();
    const installPath = getResolvedAppDir();
    const branch = config.version_branch || 'release';
    
    console.log(`[UserDataMigration] Looking for old UserData...`);
    console.log(`[UserDataMigration]   Install path: ${installPath}`);
    console.log(`[UserDataMigration]   Branch: ${branch}`);
    
    // Old location
    const oldPath = path.join(installPath, branch, 'package', 'game', 'latest', 'Client', 'UserData');
    console.log(`[UserDataMigration]   Checking: ${oldPath}`);
    console.log(`[UserDataMigration]   Checking: ${oldPath}`);
    
    if (fs.existsSync(oldPath)) {
      console.log(`[UserDataMigration] ✓ Found old UserData at: ${oldPath}`);
      return oldPath;
    }
    
    console.log(`[UserDataMigration] ✗ Not found at current branch location`);
    
    // Try other branch if current doesn't exist
    const otherBranch = branch === 'release' ? 'pre-release' : 'release';
    const otherPath = path.join(installPath, otherBranch, 'package', 'game', 'latest', 'Client', 'UserData');
    console.log(`[UserDataMigration]   Checking other branch: ${otherPath}`);
    console.log(`[UserDataMigration]   Checking other branch: ${otherPath}`);
    
    if (fs.existsSync(otherPath)) {
      console.log(`[UserDataMigration] ✓ Found old UserData in other branch at: ${otherPath}`);
      return otherPath;
    }
    
    console.log('[UserDataMigration] ✗ No old UserData found in any branch');
    return null;
  } catch (error) {
    console.error('[UserDataMigration] Error finding old UserData:', error);
    return null;
  }
}

/**
 * Migrate UserData from old location to new centralized location
 * One-time operation when upgrading to 2.2.0
 */
async function migrateUserDataToCentralized() {
  // Check if already migrated
  if (isMigrationCompleted()) {
    console.log('[UserDataMigration] Migration already completed, skipping');
    return { success: true, alreadyMigrated: true };
  }
  
  console.log('[UserDataMigration] === Starting UserData Migration to Centralized Location ===');
  
  const newUserDataPath = getHytaleSavesDir();
  console.log(`[UserDataMigration] Target location: ${newUserDataPath}`);
  
  // Ensure new directory exists
  if (!fs.existsSync(newUserDataPath)) {
    fs.mkdirSync(newUserDataPath, { recursive: true });
    console.log('[UserDataMigration] Created new HytaleSaves directory');
  }
  
  // Find old UserData
  const oldUserDataPath = findOldUserDataPath();
  
  if (!oldUserDataPath) {
    console.log('[UserDataMigration] No old UserData found - fresh install or already migrated');
    // Don't mark as migrated - let it check again next time in case game gets installed later
    return { success: true, freshInstall: true };
  }
  
  // Check if new location already has data (shouldn't happen, but safety check)
  const existingFiles = fs.readdirSync(newUserDataPath);
  if (existingFiles.length > 0) {
    console.warn('[UserDataMigration] New location already contains files, marking as migrated to avoid re-attempts');
    markMigrationCompleted();
    return { success: true, skipped: true, reason: 'target_not_empty' };
  }
  
  try {
    console.log(`[UserDataMigration] Copying from ${oldUserDataPath} to ${newUserDataPath}...`);
    
    // Copy all UserData to new location
    await fs.copy(oldUserDataPath, newUserDataPath, {
      overwrite: false,
      errorOnExist: false,
      dereference: true  // Follow symlinks to avoid EPERM errors on Windows
    });
    
    console.log('[UserDataMigration] ✓ UserData copied successfully');
    
    // Mark migration as completed
    markMigrationCompleted();
    
    console.log('[UserDataMigration] === Migration Completed Successfully ===');
    return { 
      success: true, 
      migrated: true,
      from: oldUserDataPath,
      to: newUserDataPath
    };
    
  } catch (error) {
    console.error('[UserDataMigration] ✗ Migration failed:', error);
    return { 
      success: false, 
      error: error.message,
      from: oldUserDataPath,
      to: newUserDataPath
    };
  }
}

/**
 * Get the centralized UserData path (always use this in 2.2.0+)
 * Ensures directory exists
 */
function getUserDataPath() {
  const userDataPath = getHytaleSavesDir();
  
  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
    console.log(`[UserDataMigration] Created UserData directory: ${userDataPath}`);
  }
  
  return userDataPath;
}

module.exports = {
  migrateUserDataToCentralized,
  getUserDataPath,
  isMigrationCompleted,
  findOldUserDataPath
};
