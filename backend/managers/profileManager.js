const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { 
  loadConfig, 
  saveConfig, 
  getModsPath 
} = require('../core/config');

// Lazy-load modManager to avoid circular deps, or keep imports structured.
// For now, access mod paths directly or use helper helpers.

class ProfileManager {
  constructor() {
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    const config = loadConfig();
    
    // Migration: specific check to see if we have profiles yet
    if (!config.profiles || Object.keys(config.profiles).length === 0) {
      this.migrateLegacyConfig(config);
    }
    
    this.initialized = true;
    console.log('[ProfileManager] Initialized');
  }

  migrateLegacyConfig(config) {
    console.log('[ProfileManager] Migrating legacy config to profile system...');
    
    // Create a default profile with current settings
    const defaultProfileId = 'default';
    const defaultProfile = {
      id: defaultProfileId,
      name: 'Default',
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      
      // settings specific to this profile
      // If global settings existed, we copy them here
      mods: config.installedMods || [], // Legacy mods are now part of default profile
      javaPath: config.javaPath || '',
      gameOptions: {
        minMemory: '1G',
        maxMemory: '4G',
        args: []
      }
    };

    const updates = {
      profiles: {
        [defaultProfileId]: defaultProfile
      },
      activeProfileId: defaultProfileId,
      // Mods are currently treated as files on disk.
      // The profile's `mods` array is the source of truth for enabled/known mods per profile.

    };

    saveConfig(updates);
    console.log('[ProfileManager] Migration complete. Created Default profile.');
  }

  createProfile(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid profile name');
    }

    const config = loadConfig();
    const id = uuidv4();
    
    const newProfile = {
      id,
      name: name.trim(),
      created: new Date().toISOString(),
      lastUsed: null,
      mods: [], // Start with no mods enabled
      javaPath: '', 
      gameOptions: {
        minMemory: '1G',
        maxMemory: '4G',
        args: []
      }
    };

    const profiles = config.profiles || {};
    profiles[id] = newProfile;

    saveConfig({ profiles });
    
    console.log(`[ProfileManager] Created new profile: "${name}" (${id})`);
    return newProfile;
  }

  getProfiles() {
    const config = loadConfig();
    return Object.values(config.profiles || {});
  }

  getProfile(id) {
    const config = loadConfig();
    return (config.profiles && config.profiles[id]) || null;
  }

  getActiveProfile() {
    const config = loadConfig();
    const activeId = config.activeProfileId;
    if (!activeId || !config.profiles || !config.profiles[activeId]) {
      // Fallback if something is corrupted
      return this.getProfiles()[0] || null; 
    }
    return config.profiles[activeId];
  }

  async activateProfile(id) {
    const config = loadConfig();
    if (!config.profiles || !config.profiles[id]) {
        throw new Error(`Profile not found: ${id}`);
    }

    if (config.activeProfileId === id) {
        console.log(`[ProfileManager] Profile ${id} is already active.`);
        return config.profiles[id];
    }

    console.log(`[ProfileManager] Switching to profile: ${config.profiles[id].name} (${id})`);
    
    // 1. Update config first
    config.profiles[id].lastUsed = new Date().toISOString();
    saveConfig({ 
        activeProfileId: id,
        profiles: config.profiles 
    });

    // 2. Trigger Mod Sync
    // We need to require this here to ensure it uses the *newly saved* active profile ID
    const { syncModsForCurrentProfile } = require('./modManager');
    await syncModsForCurrentProfile();

    return config.profiles[id];
  }

  deleteProfile(id) {
    const config = loadConfig();
    const profiles = config.profiles || {};
    
    if (!profiles[id]) {
      throw new Error('Profile not found');
    }

    if (config.activeProfileId === id) {
       throw new Error('Cannot delete the active profile');
    }

    // Don't allow deleting the last profile
    if (Object.keys(profiles).length <= 1) {
        throw new Error('Cannot delete the only remaining profile');
    }

    delete profiles[id];
    saveConfig({ profiles });
    console.log(`[ProfileManager] Deleted profile: ${id}`);
    
    return true;
  }

  updateProfile(id, updates) {
    const config = loadConfig();
    const profiles = config.profiles || {};
    
    if (!profiles[id]) {
        throw new Error('Profile not found');
    }

    // Safety checks on updates
    const allowedFields = ['name', 'javaPath', 'gameOptions', 'mods'];
    const sanitizedUpdates = {};
    
    Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
            sanitizedUpdates[key] = updates[key];
        }
    });

    profiles[id] = { ...profiles[id], ...sanitizedUpdates };
    
    saveConfig({ profiles });
    console.log(`[ProfileManager] Updated profile: ${id}`);
    
    // If we updated mods for the *active* profile, we might need to sync immediately
    if (config.activeProfileId === id && updates.mods) {
         // Optionally trigger sync? 
         // Sync is usually triggered when toggling a single mod.
        // For bulk updates, the caller should decide when to sync.

    }

    return profiles[id];
  }
}

module.exports = new ProfileManager();
