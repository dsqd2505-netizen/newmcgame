const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PLAYER_ID_FILE, APP_DIR } = require('../core/paths');

/**
 * DEPRECATED: This file is kept for backward compatibility.
 *
 * The primary UUID system is now in config.js using userUuids.
 * This player_id.json system was a separate UUID storage that could
 * cause desync issues.
 *
 * New code should use config.js functions:
 * - getUuidForUser(username) - Get/create UUID for a username
 * - getCurrentUuid() - Get current user's UUID
 * - setUuidForUser(username, uuid) - Set UUID for a user
 *
 * This function is kept for migration purposes only.
 */

/**
 * Get or create a legacy player ID
 * NOTE: This is DEPRECATED - use config.js getUuidForUser() instead
 *
 * FIXED: No longer returns random UUID on error - throws instead
 */
function getOrCreatePlayerId() {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!fs.existsSync(APP_DIR)) {
        fs.mkdirSync(APP_DIR, { recursive: true });
      }

      if (fs.existsSync(PLAYER_ID_FILE)) {
        const data = fs.readFileSync(PLAYER_ID_FILE, 'utf8');
        if (data.trim()) {
          const parsed = JSON.parse(data);
          if (parsed.playerId) {
            return parsed.playerId;
          }
        }
      }

      // No existing ID - create new one atomically
      const newPlayerId = uuidv4();
      const tempFile = PLAYER_ID_FILE + '.tmp';
      const playerData = {
        playerId: newPlayerId,
        createdAt: new Date().toISOString(),
        note: 'DEPRECATED: This file is for legacy compatibility. UUID is now stored in config.json userUuids.'
      };

      // Write to temp file first
      fs.writeFileSync(tempFile, JSON.stringify(playerData, null, 2));

      // Atomic rename
      fs.renameSync(tempFile, PLAYER_ID_FILE);

      console.log(`[PlayerManager] Created new legacy player ID: ${newPlayerId}`);
      return newPlayerId;
    } catch (error) {
      lastError = error;
      console.error(`[PlayerManager] Attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (attempt < maxRetries) {
        // Small delay before retry
        const delay = attempt * 100;
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait
        }
      }
    }
  }

  // FIXED: Do NOT return random UUID - throw error instead
  // Returning random UUID was causing silent identity loss
  console.error('[PlayerManager] CRITICAL: Failed to get/create player ID after all retries');
  throw new Error(`Failed to manage player ID: ${lastError.message}`);
}

/**
 * Migrate legacy player_id.json to config.json userUuids
 * Call this during app startup
 */
function migrateLegacyPlayerId() {
  try {
    if (!fs.existsSync(PLAYER_ID_FILE)) {
      return null; // No legacy file to migrate
    }

    const data = JSON.parse(fs.readFileSync(PLAYER_ID_FILE, 'utf8'));
    if (!data.playerId) {
      return null;
    }

    console.log(`[PlayerManager] Found legacy player_id.json with ID: ${data.playerId}`);

    // Mark file as migrated by renaming
    const migratedFile = PLAYER_ID_FILE + '.migrated';
    if (!fs.existsSync(migratedFile)) {
      fs.renameSync(PLAYER_ID_FILE, migratedFile);
      console.log('[PlayerManager] Legacy player_id.json marked as migrated');
    }

    return data.playerId;
  } catch (error) {
    console.error('[PlayerManager] Error during legacy migration:', error.message);
    return null;
  }
}

module.exports = {
  getOrCreatePlayerId,
  migrateLegacyPlayerId
};
