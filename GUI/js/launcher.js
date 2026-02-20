let isDownloading = false;

let playBtn;
let playText;
let homePlayBtn;
let uninstallBtn;
let playerNameInput;
let javaPathInput;

export function setupLauncher() {
  playBtn = document.getElementById('playBtn');
  playText = document.getElementById('playText');
  homePlayBtn = document.getElementById('homePlayBtn');
  uninstallBtn = document.getElementById('uninstallBtn');
  playerNameInput = document.getElementById('playerName');
  javaPathInput = document.getElementById('javaPath');

  if (playerNameInput) {
    playerNameInput.addEventListener('change', savePlayerName);
  }

  if (javaPathInput) {
    javaPathInput.addEventListener('change', saveJavaPath);
  }

  if (window.electronAPI && window.electronAPI.onProgressUpdate) {
    window.electronAPI.onProgressUpdate((data) => {
      if (!isDownloading) return;
      if (window.LauncherUI) {
        window.LauncherUI.updateProgress(data);
      }
    });
  }

  // Initial Profile Load
  loadProfiles();

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const selector = document.getElementById('profileSelector');
    if (selector && !selector.contains(e.target)) {
      const dropdown = document.getElementById('profileDropdown');
      if (dropdown) dropdown.classList.remove('show');
    }
  });
}

// ==========================================
// PROFILE MANAGEMENT
// ==========================================

async function loadProfiles() {
  try {
    if (!window.electronAPI || !window.electronAPI.profile) return;

    const profiles = await window.electronAPI.profile.list();
    const activeProfile = await window.electronAPI.profile.getActive();

    renderProfileList(profiles, activeProfile);
    updateCurrentProfileUI(activeProfile);
  } catch (error) {
    console.error('Failed to load profiles:', error);
  }
}

function renderProfileList(profiles, activeProfile) {
  const list = document.getElementById('profileList');
  const managerList = document.getElementById('managerProfileList');

  if (!list) return;

  // Dropdown List
  list.innerHTML = profiles.map(p => `
        <div class="profile-item ${p.id === activeProfile.id ? 'active' : ''}" 
             onclick="switchProfile('${p.id}')">
            <span>${p.name}</span>
            ${p.id === activeProfile.id ? '<i class="fas fa-check ml-auto"></i>' : ''}
        </div>
    `).join('');

  // Manager Modal List
  if (managerList) {
    managerList.innerHTML = profiles.map(p => `
            <div class="profile-manager-item ${p.id === activeProfile.id ? 'active' : ''}">
                <div class="flex items-center gap-3">
                    <i class="fas fa-user-circle text-xl text-gray-400"></i>
                    <div>
                        <div class="font-bold">${p.name}</div>
                        <div class="text-xs text-gray-500">ID: ${p.id.substring(0, 8)}...</div>
                    </div>
                </div>
                ${p.id !== activeProfile.id ? `
                    <button class="profile-delete-btn" onclick="deleteProfile('${p.id}')" title="Delete Profile">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : '<span class="text-xs text-green-500 font-bold px-2">ACTIVE</span>'}
            </div>
        `).join('');
  }
}

function updateCurrentProfileUI(profile) {
  const nameEl = document.getElementById('currentProfileName');
  if (nameEl && profile) {
    nameEl.textContent = profile.name;
  }
}

window.toggleProfileDropdown = () => {
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) {
    dropdown.classList.toggle('show');
  }
};

window.openProfileManager = () => {
  const modal = document.getElementById('profileManagerModal');
  if (modal) {
    modal.style.display = 'flex';
    // Refresh list
    loadProfiles();
  }
  // Close dropdown
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) dropdown.classList.remove('show');
};

window.closeProfileManager = () => {
  const modal = document.getElementById('profileManagerModal');
  if (modal) modal.style.display = 'none';
};

window.createNewProfile = async () => {
  const input = document.getElementById('newProfileName');
  if (!input || !input.value.trim()) return;

  try {
    const name = input.value.trim();
    await window.electronAPI.profile.create(name);
    input.value = '';
    await loadProfiles();
  } catch (error) {
    console.error('Failed to create profile:', error);
    alert('Failed to create profile: ' + error.message);
  }
};

window.deleteProfile = async (id) => {
  if (!confirm('Are you sure you want to delete this profile? parameters and mods configuration will be lost.')) return;

  try {
    await window.electronAPI.profile.delete(id);
    await loadProfiles();
  } catch (error) {
    console.error('Failed to delete profile:', error);
    alert('Failed to delete profile: ' + error.message);
  }
};

window.switchProfile = async (id) => {
  try {
    if (window.LauncherUI) window.LauncherUI.showProgress();
    const switchingMsg = window.i18n ? window.i18n.t('progress.switchingProfile') : 'Switching Profile...';
    if (window.LauncherUI) window.LauncherUI.updateProgress({ message: switchingMsg });

    await window.electronAPI.profile.activate(id);

    // Refresh UI
    await loadProfiles();

    // Refresh Mods
    if (window.modsManager) {
      if (window.modsManager.loadInstalledMods) await window.modsManager.loadInstalledMods();
      if (window.modsManager.loadBrowseMods) await window.modsManager.loadBrowseMods();
    }

    // Close dropdown
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.remove('show');

    if (window.LauncherUI) {
      const switchedMsg = window.i18n ? window.i18n.t('progress.profileSwitched') : 'Profile Switched!';
      window.LauncherUI.updateProgress({ message: switchedMsg });
      setTimeout(() => window.LauncherUI.hideProgress(), 1000);
    }

  } catch (error) {
    console.error('Failed to switch profile:', error);
    alert('Failed to switch profile: ' + error.message);
    if (window.LauncherUI) window.LauncherUI.hideProgress();
  }
};

export async function launch() {
  if (isDownloading || (playBtn && playBtn.disabled)) return;

  // ==========================================================================
  // STEP 1: Check launch readiness from backend (single source of truth)
  // ==========================================================================
  let launchState = null;
  let playerName = null;

  try {
    if (window.electronAPI && window.electronAPI.checkLaunchReady) {
      launchState = await window.electronAPI.checkLaunchReady();
      playerName = launchState?.username;
    } else if (window.electronAPI && window.electronAPI.loadUsername) {
      // Fallback to loadUsername if checkLaunchReady not available
      playerName = await window.electronAPI.loadUsername();
      launchState = { ready: !!playerName, hasUsername: !!playerName, username: playerName, issues: [] };
    }
  } catch (error) {
    console.error('[Launcher] Error checking launch readiness:', error);
  }

  // Validate launch readiness
  if (!launchState?.ready || !playerName) {
    const issues = launchState?.issues || ['No username configured'];
    const errorMsg = window.i18n
      ? window.i18n.t('errors.noUsername')
      : 'Please set your username in Settings before playing.';

    console.error('[Launcher] Launch blocked:', issues.join(', '));

    // Show error to user
    if (window.LauncherUI && window.LauncherUI.showError) {
      window.LauncherUI.showError(errorMsg);
    } else {
      alert(errorMsg);
    }

    // Navigate to settings if possible
    if (window.LauncherUI && window.LauncherUI.showPage) {
      window.LauncherUI.showPage('settings-page');
      window.LauncherUI.setActiveNav('settings');
    }

    return;
  }

  // Warn if using default 'Player' name (shouldn't happen with new logic, but keep as safety)
  if (playerName === 'Player') {
    console.warn('[Launcher] Warning: Using default username "Player"');
  }

  console.log(`[Launcher] Launching game for: "${playerName}"`);

  // ==========================================================================
  // STEP 2: Load other settings from backend
  // ==========================================================================
  let javaPath = '';
  try {
    if (window.electronAPI && window.electronAPI.loadJavaPath) {
      javaPath = await window.electronAPI.loadJavaPath() || '';
    }
  } catch (error) {
    console.error('[Launcher] Error loading Java path:', error);
  }

  let gpuPreference = 'auto';
  try {
    if (window.electronAPI && window.electronAPI.loadGpuPreference) {
      gpuPreference = await window.electronAPI.loadGpuPreference();
    }
  } catch (error) {
    console.error('[Launcher] Error loading GPU preference:', error);
  }

  // ==========================================================================
  // STEP 3: Start launch process
  // ==========================================================================
  if (window.LauncherUI) window.LauncherUI.showProgress();
  isDownloading = true;
  if (playBtn) {
    playBtn.disabled = true;
    playText.textContent = 'LAUNCHING...';
  }

  try {
    const startingMsg = window.i18n ? window.i18n.t('progress.startingGame') : 'Starting game...';
    if (window.LauncherUI) window.LauncherUI.updateProgress({ message: startingMsg });

    if (window.electronAPI && window.electronAPI.launchGame) {
      // Pass playerName from config - backend will validate again
      const result = await window.electronAPI.launchGame(playerName, javaPath, '', gpuPreference);

      isDownloading = false;

      if (window.LauncherUI) {
        window.LauncherUI.hideProgress();
      }
      resetPlayButton();

      if (result.success) {
        if (window.electronAPI.minimizeWindow) {
          setTimeout(() => {
            window.electronAPI.minimizeWindow();
          }, 500);
        }
      } else {
        console.error('[Launcher] Launch failed:', result.error);

        // Handle specific error cases
        if (result.needsUsername) {
          const errorMsg = window.i18n
            ? window.i18n.t('errors.noUsername')
            : 'Please set your username in Settings before playing.';

          if (window.LauncherUI && window.LauncherUI.showError) {
            window.LauncherUI.showError(errorMsg);
          } else {
            alert(errorMsg);
          }

          // Navigate to settings
          if (window.LauncherUI && window.LauncherUI.showPage) {
            window.LauncherUI.showPage('settings-page');
            window.LauncherUI.setActiveNav('settings');
          }
        } else if (result.error) {
          // Show generic error
          const errorMsg = window.i18n
            ? window.i18n.t('errors.launchFailed').replace('{error}', result.error)
            : `Launch failed: ${result.error}`;

          if (window.LauncherUI && window.LauncherUI.showError) {
            window.LauncherUI.showError(errorMsg);
          }
        }
      }
    } else {
      isDownloading = false;

      if (window.LauncherUI) {
        window.LauncherUI.hideProgress();
      }
      resetPlayButton();
    }
  } catch (error) {
    isDownloading = false;

    if (window.LauncherUI) {
      window.LauncherUI.hideProgress();
    }
    resetPlayButton();
    console.error('[Launcher] Launch error:', error);

    // Show error to user
    const errorMsg = error.message || 'Unknown launch error';
    if (window.LauncherUI && window.LauncherUI.showError) {
      window.LauncherUI.showError(errorMsg);
    }
  }
}

function showCustomConfirm(message, title, onConfirm, onCancel = null, confirmText, cancelText) {
  // Apply defaults with i18n support
  title = title || (window.i18n ? window.i18n.t('confirm.defaultTitle') : 'Confirm Action');
  confirmText = confirmText || (window.i18n ? window.i18n.t('common.confirm') : 'Confirm');
  cancelText = cancelText || (window.i18n ? window.i18n.t('common.cancel') : 'Cancel');
  
  const existingModal = document.querySelector('.custom-confirm-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.className = 'custom-confirm-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

  const dialog = document.createElement('div');
  dialog.className = 'custom-confirm-dialog';
  dialog.style.cssText = `
    background: #1f2937;
    border-radius: 12px;
    padding: 0;
    min-width: 400px;
    max-width: 500px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(239, 68, 68, 0.3);
    transform: scale(0.9);
    transition: transform 0.3s ease;
  `;

  dialog.innerHTML = `
    <div style="padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <div style="display: flex; align-items: center; gap: 12px; color: #ef4444;">
        <i class="fas fa-exclamation-triangle" style="font-size: 24px;"></i>
        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600;">${title}</h3>
      </div>
    </div>
    <div style="padding: 24px; color: #e5e7eb;">
      <p style="margin: 0; line-height: 1.5; font-size: 1rem;">${message}</p>
    </div>
    <div style="padding: 20px 24px; display: flex; gap: 12px; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1);">
      <button class="custom-confirm-cancel" style="
        background: transparent;
        color: #9ca3af;
        border: 1px solid rgba(156, 163, 175, 0.3);
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      ">${cancelText}</button>
      <button class="custom-confirm-action" style="
        background: #ef4444;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      ">${confirmText}</button>
    </div>
  `;

  modal.appendChild(dialog);
  document.body.appendChild(modal);

  // Animate in
  setTimeout(() => {
    modal.style.opacity = '1';
    dialog.style.transform = 'scale(1)';
  }, 10);

  // Event handlers
  const cancelBtn = dialog.querySelector('.custom-confirm-cancel');
  const actionBtn = dialog.querySelector('.custom-confirm-action');

  const closeModal = () => {
    modal.style.opacity = '0';
    dialog.style.transform = 'scale(0.9)';
    setTimeout(() => {
      modal.remove();
    }, 300);
  };

  cancelBtn.onclick = () => {
    closeModal();
    if (onCancel) onCancel();
  };

  actionBtn.onclick = () => {
    closeModal();
    onConfirm();
  };

  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
      if (onCancel) onCancel();
    }
  };

  // Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      if (onCancel) onCancel();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

export async function uninstallGame() {
  const message = window.i18n ? window.i18n.t('confirm.uninstallGameMessage') : 'Are you sure you want to uninstall Hytale? All game files will be deleted.';
  const title = window.i18n ? window.i18n.t('confirm.uninstallGameTitle') : 'Uninstall Game';
  const confirmBtn = window.i18n ? window.i18n.t('confirm.uninstallGameButton') : 'Uninstall';
  const cancelBtn = window.i18n ? window.i18n.t('common.cancel') : 'Cancel';
  
  showCustomConfirm(
    message,
    title,
    async () => {
      await performUninstall();
    },
    null,
    confirmBtn,
    cancelBtn
  );
}

async function performUninstall() {

  if (window.LauncherUI) window.LauncherUI.showProgress();
  const uninstallingMsg = window.i18n ? window.i18n.t('progress.uninstallingGame') : 'Uninstalling game...';
  if (window.LauncherUI) window.LauncherUI.updateProgress({ message: uninstallingMsg });
  if (uninstallBtn) uninstallBtn.disabled = true;

  try {
    if (window.electronAPI && window.electronAPI.uninstallGame) {
      const result = await window.electronAPI.uninstallGame();

      if (result.success) {
        const successMsg = window.i18n ? window.i18n.t('progress.gameUninstalled') : 'Game uninstalled successfully!';
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: successMsg });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
            window.LauncherUI.showLauncherOrInstall(false);
          }, 2000);
        }
      } else {
        throw new Error(result.error || 'Uninstall failed');
      }
    } else {
      const successMsg = window.i18n ? window.i18n.t('progress.gameUninstalled') : 'Game uninstalled successfully!';
      setTimeout(() => {
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: successMsg });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
            window.LauncherUI.showLauncherOrInstall(false);
          }, 2000);
        }
      }, 2000);
    }
  } catch (error) {
    const errorMsg = window.i18n ? window.i18n.t('progress.uninstallFailed').replace('{error}', error.message) : `Uninstall failed: ${error.message}`;
    if (window.LauncherUI) {
      window.LauncherUI.updateProgress({ message: errorMsg });
      setTimeout(() => window.LauncherUI.hideProgress(), 3000);
    }
  } finally {
    if (uninstallBtn) uninstallBtn.disabled = false;
  }
}

export async function repairGame() {
  showCustomConfirm(
    'Are you sure you want to repair Hytale? This will reinstall the game files but keep your data (saves, screenshots, etc.).',
    'Repair Game',
    async () => {
      await performRepair();
    },
    null,
    'Repair',
    'Cancel'
  );
}

async function performRepair() {
  if (window.LauncherUI) window.LauncherUI.showProgress();
  if (window.LauncherUI) window.LauncherUI.updateProgress({ message: 'Repairing game...' });
  isDownloading = true;

  try {
    if (window.electronAPI && window.electronAPI.repairGame) {
      const result = await window.electronAPI.repairGame();

      if (result.success) {
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: 'Game repaired successfully!' });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
          }, 2000);
        }
      } else {
        throw new Error(result.error || 'Repair failed');
      }
    }
  } catch (error) {
    if (window.LauncherUI) {
      window.LauncherUI.updateProgress({ message: `Repair failed: ${error.message}` });
      setTimeout(() => window.LauncherUI.hideProgress(), 3000);
    }
  } finally {
    isDownloading = false;
  }
}

function resetPlayButton() {
  isDownloading = false;
  if (playBtn) {
    playBtn.disabled = false;
    playText.textContent = window.i18n ? window.i18n.t('play.play') : 'PLAY';
  }
}

async function savePlayerName() {
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      const playerName = (playerNameInput ? playerNameInput.value.trim() : '') || 'Player';
      await window.electronAPI.saveSettings({ playerName });
    }
  } catch (error) {
    console.error('Error saving player name:', error);
  }
}

async function saveJavaPath() {
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      const javaPath = (javaPathInput ? javaPathInput.value.trim() : '') || '';
      await window.electronAPI.saveSettings({ javaPath });
    }
  } catch (error) {
    console.error('Error saving Java path:', error);
  }
}

function toggleCustomJava() {
  if (!customJavaOptions) return;

  if (customJavaCheck && customJavaCheck.checked) {
    customJavaOptions.style.display = 'block';
  } else {
    customJavaOptions.style.display = 'none';
    if (customJavaPath) customJavaPath.value = '';
    saveCustomJavaPath('');
  }
}

async function browseJavaPath() {
  try {
    if (window.electronAPI && window.electronAPI.browseJavaPath) {
      const result = await window.electronAPI.browseJavaPath();
      if (result && result.filePaths && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        if (customJavaPath) {
          customJavaPath.value = selectedPath;
        }
        await saveCustomJavaPath(selectedPath);
      }
    }
  } catch (error) {
    console.error('Error browsing Java path:', error);
  }
}

async function saveCustomJavaPath(path) {
  try {
    if (window.electronAPI && window.electronAPI.saveJavaPath) {
      await window.electronAPI.saveJavaPath(path);
    }
  } catch (error) {
    console.error('Error saving custom Java path:', error);
  }
}

async function loadCustomJavaPath() {
  try {
    if (window.electronAPI && window.electronAPI.loadJavaPath) {
      const savedPath = await window.electronAPI.loadJavaPath();
      if (savedPath && savedPath.trim()) {
        if (customJavaPath) {
          customJavaPath.value = savedPath;
        }
        if (customJavaCheck) {
          customJavaCheck.checked = true;
        }
        if (customJavaOptions) {
          customJavaOptions.style.display = 'block';
        }
      }
    }
  } catch (error) {
    console.error('Error loading custom Java path:', error);
  }
}

window.launch = launch;
window.uninstallGame = uninstallGame;
window.repairGame = repairGame;

window.openLogs = async () => {
  if (window.LauncherUI) {
    window.LauncherUI.showPage('logs-page');
    window.LauncherUI.setActiveNav('logs');
  }
  await refreshLogs();
};

window.openLogsFolder = async () => {
  try {
    if (window.electronAPI && window.electronAPI.openLogsFolder) {
      await window.electronAPI.openLogsFolder();
    }
  } catch (error) {
    console.error('Failed to open logs folder:', error);
  }
};

window.refreshLogs = async () => {
  const terminal = document.getElementById('logsTerminal');
  if (!terminal) return;

  try {
    if (window.electronAPI && window.electronAPI.getRecentLogs) {
      // Fetch up to MAX_LOG_LINES lines
      const logs = await window.electronAPI.getRecentLogs(MAX_LOG_LINES);
      if (logs) {
        // Formatting for colors could be done here if needed
        terminal.textContent = logs;
        terminal.scrollTop = terminal.scrollHeight;
      } else {
        terminal.textContent = 'No logs available.';
      }
    }
  } catch (error) {
    terminal.textContent = 'Error loading logs: ' + error.message;
  }
};

window.copyLogs = () => {
  const terminal = document.getElementById('logsTerminal');
  if (terminal) {
    navigator.clipboard.writeText(terminal.textContent)
      .then(() => alert('Logs copied to clipboard!'))
      .catch(err => console.error('Failed to copy logs:', err));
  }
};

window.repairGame = repairGame;

// Constants
const MAX_LOG_LINES = 500;

document.addEventListener('DOMContentLoaded', setupLauncher);
