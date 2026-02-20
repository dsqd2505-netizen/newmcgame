// Main launcher module - orchestrates all launcher functionality
// This file serves as the main entry point and re-exports all necessary functions

// Core modules
const {
  saveUsername,
  loadUsername,
  loadUsernameWithDefault,
  hasUsername,
  saveJavaPath,
  loadJavaPath,
  saveInstallPath,
  loadInstallPath,
  saveDiscordRPC,
  loadDiscordRPC,
  saveLanguage,
  loadLanguage,
  saveCloseLauncherOnStart,
  loadCloseLauncherOnStart,

  saveLauncherHardwareAcceleration,
  loadLauncherHardwareAcceleration,

  loadConfig,
  saveConfig,

  saveModsToConfig,
  loadModsFromConfig,
  getUuidForUser,
  isFirstLaunch,
  markAsLaunched,
  checkLaunchReady,
  // UUID Management
  getCurrentUuid,
  getAllUuidMappings,
  getAllUuidMappingsArray,
  setUuidForUser,
  generateNewUuid,
  deleteUuidForUser,
  resetCurrentUserUuid,
  // GPU Preference
  saveGpuPreference,
  loadGpuPreference,
  // Version Management
  saveVersionClient,
  loadVersionClient,
  saveVersionBranch,
  loadVersionBranch
} = require('./core/config');

const { getResolvedAppDir, getModsPath } = require('./core/paths');

// Managers
const {
  isGameInstalled,
  installGame,
  uninstallGame,
  updateGameFiles,
  checkExistingGameInstallation,
  repairGame
} = require('./managers/gameManager');

const {
  launchGame,
  launchGameWithVersionCheck
} = require('./managers/gameLauncher');

const { getJavaDetection } = require('./managers/javaManager');

const {
  downloadAndReplaceHomePageUI,
  findHomePageUIPath,
  downloadAndReplaceLogo,
  findLogoPath
} = require('./managers/uiFileManager');

const {
  loadInstalledMods,
  downloadMod,
  uninstallMod,
  toggleMod
} = require('./managers/modManager');

// Services
const {
  getLatestClientVersion
} = require('./services/versionManager');

const { getHytaleNews } = require('./services/newsManager');

const { getOrCreatePlayerId } = require('./services/playerManager');

const {
  proposeGameUpdate,
  handleFirstLaunchCheck
} = require('./services/firstLaunch');

// Utils
const { detectGpu } = require('./utils/platformUtils');

// Re-export all functions to maintain backward compatibility
module.exports = {
  // Game launch functions
  launchGame,
  launchGameWithVersionCheck,

  // Game installation functions
  installGame,
  isGameInstalled,
  uninstallGame,
  updateGameFiles,
  repairGame,

  // User configuration functions
  saveUsername,
  loadUsername,
  loadUsernameWithDefault,
  hasUsername,
  getUuidForUser,
  checkLaunchReady,

  // Java configuration functions
  saveJavaPath,
  loadJavaPath,
  getJavaDetection,

  // Installation path functions
  saveInstallPath,
  loadInstallPath,

  // Discord RPC functions
  saveDiscordRPC,
  loadDiscordRPC,

  // Language functions
  saveLanguage,
  loadLanguage,

  // Close Launcher functions
  saveCloseLauncherOnStart,
  loadCloseLauncherOnStart,

  // Hardware Acceleration functions
  saveLauncherHardwareAcceleration,
  loadLauncherHardwareAcceleration,

  // Config functions
  loadConfig,
  saveConfig,

  // GPU Preference functions
  saveGpuPreference,
  loadGpuPreference,
  detectGpu,

  // Version functions
  getLatestClientVersion,
  saveVersionClient,
  loadVersionClient,
  saveVersionBranch,
  loadVersionBranch,

  // News functions
  getHytaleNews,

  // Player ID functions
  getOrCreatePlayerId,

  // UUID Management functions
  getCurrentUuid,
  getAllUuidMappings,
  getAllUuidMappingsArray,
  setUuidForUser,
  generateNewUuid,
  deleteUuidForUser,
  resetCurrentUserUuid,

  // Mod management functions
  getModsPath,
  loadInstalledMods,
  downloadMod,
  uninstallMod,
  toggleMod,
  saveModsToConfig,
  loadModsFromConfig,

  // UI file management functions
  downloadAndReplaceHomePageUI,
  findHomePageUIPath,
  downloadAndReplaceLogo,
  findLogoPath,

  // First launch functions
  isFirstLaunch,
  markAsLaunched,
  checkExistingGameInstallation,
  proposeGameUpdate,
  handleFirstLaunchCheck,

  // Path functions
  getResolvedAppDir
};
