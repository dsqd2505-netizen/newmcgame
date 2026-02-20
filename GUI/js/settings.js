
let customJavaCheck;
let customJavaOptions;
let customJavaPath;
let browseJavaBtn;
let settingsPlayerName;
let discordRPCCheck;
let closeLauncherCheck;
let launcherHwAccelCheck;
let gpuPreferenceRadios;
let gameBranchRadios;


// UUID Management elements
let currentUuidDisplay;
let copyUuidBtn;
let regenerateUuidBtn;
let manageUuidsBtn;
let uuidModal;
let uuidModalClose;
let modalCurrentUuid;
let modalCopyUuidBtn;
let modalRegenerateUuidBtn;
let generateNewUuidBtn;
let uuidList;
let customUuidInput;
let setCustomUuidBtn;

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
    border: 1px solid rgba(147, 51, 234, 0.3);
    transform: scale(0.9);
    transition: transform 0.3s ease;
  `;

  dialog.innerHTML = `
    <div style="padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <div style="display: flex; align-items: center; gap: 12px; color: #9333ea;">
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
        background: linear-gradient(135deg, #9333ea, #3b82f6);
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


export async function initSettings() {
  setupSettingsElements();
  await loadAllSettings();
}

function setupSettingsElements() {
  customJavaCheck = document.getElementById('customJavaCheck');
  customJavaOptions = document.getElementById('customJavaOptions');
  customJavaPath = document.getElementById('customJavaPath');
  browseJavaBtn = document.getElementById('browseJavaBtn');
  settingsPlayerName = document.getElementById('settingsPlayerName');
  discordRPCCheck = document.getElementById('discordRPCCheck');
  closeLauncherCheck = document.getElementById('closeLauncherCheck');
  launcherHwAccelCheck = document.getElementById('launcherHwAccelCheck');
  gpuPreferenceRadios = document.querySelectorAll('input[name="gpuPreference"]');
  gameBranchRadios = document.querySelectorAll('input[name="gameBranch"]');

  console.log('[Settings] gameBranchRadios found:', gameBranchRadios.length);


  // UUID Management elements
  currentUuidDisplay = document.getElementById('currentUuid');
  copyUuidBtn = document.getElementById('copyUuidBtn');
  regenerateUuidBtn = document.getElementById('regenerateUuidBtn');
  manageUuidsBtn = document.getElementById('manageUuidsBtn');
  uuidModal = document.getElementById('uuidModal');
  uuidModalClose = document.getElementById('uuidModalClose');
  modalCurrentUuid = document.getElementById('modalCurrentUuid');
  modalCopyUuidBtn = document.getElementById('modalCopyUuidBtn');
  modalRegenerateUuidBtn = document.getElementById('modalRegenerateUuidBtn');
  generateNewUuidBtn = document.getElementById('generateNewUuidBtn');
  uuidList = document.getElementById('uuidList');
  customUuidInput = document.getElementById('customUuidInput');
  setCustomUuidBtn = document.getElementById('setCustomUuidBtn');

  if (customJavaCheck) {
    customJavaCheck.addEventListener('change', toggleCustomJava);
  }

  if (browseJavaBtn) {
    browseJavaBtn.addEventListener('click', browseJavaPath);
  }

  if (settingsPlayerName) {
    settingsPlayerName.addEventListener('change', savePlayerName);
  }

  if (discordRPCCheck) {
    discordRPCCheck.addEventListener('change', saveDiscordRPC);
  }

  if (closeLauncherCheck) {
    closeLauncherCheck.addEventListener('change', saveCloseLauncher);
  }

  if (launcherHwAccelCheck) {
    launcherHwAccelCheck.addEventListener('change', saveLauncherHwAccel);
  }


  // UUID event listeners
  if (copyUuidBtn) {
    copyUuidBtn.addEventListener('click', copyCurrentUuid);
  }

  if (regenerateUuidBtn) {
    regenerateUuidBtn.addEventListener('click', regenerateCurrentUuid);
  }

  if (manageUuidsBtn) {
    manageUuidsBtn.addEventListener('click', openUuidModal);
  }

  if (uuidModalClose) {
    uuidModalClose.addEventListener('click', closeUuidModal);
  }

  if (modalCopyUuidBtn) {
    modalCopyUuidBtn.addEventListener('click', copyCurrentUuid);
  }

  if (modalRegenerateUuidBtn) {
    modalRegenerateUuidBtn.addEventListener('click', regenerateCurrentUuid);
  }

  if (generateNewUuidBtn) {
    generateNewUuidBtn.addEventListener('click', generateNewUuid);
  }

  if (setCustomUuidBtn) {
    setCustomUuidBtn.addEventListener('click', setCustomUuid);
  }

  if (uuidModal) {
    uuidModal.addEventListener('click', (e) => {
      if (e.target === uuidModal) {
        closeUuidModal();
      }
    });
  }

  if (gpuPreferenceRadios) {
    gpuPreferenceRadios.forEach(radio => {
      radio.addEventListener('change', async () => {
        await saveGpuPreference();
        await updateGpuLabel();
      });
    });
  }

  if (gameBranchRadios) {
    gameBranchRadios.forEach(radio => {
      radio.addEventListener('change', handleBranchChange);
    });
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

async function saveDiscordRPC() {
  try {
    if (window.electronAPI && window.electronAPI.saveDiscordRPC && discordRPCCheck) {
      const enabled = discordRPCCheck.checked;
      console.log('Saving Discord RPC setting:', enabled);

      const result = await window.electronAPI.saveDiscordRPC(enabled);

      if (result && result.success) {
        console.log('Discord RPC setting saved successfully:', enabled);

        // Feedback visuel pour l'utilisateur
        if (enabled) {
          const msg = window.i18n ? window.i18n.t('notifications.discordEnabled') : 'Discord Rich Presence enabled';
          showNotification(msg, 'success');
        } else {
          const msg = window.i18n ? window.i18n.t('notifications.discordDisabled') : 'Discord Rich Presence disabled';
          showNotification(msg, 'success');
        }
      } else {
        throw new Error('Failed to save Discord RPC setting');
      }
    }
  } catch (error) {
    console.error('Error saving Discord RPC setting:', error);
    const msg = window.i18n ? window.i18n.t('notifications.discordSaveFailed') : 'Failed to save Discord setting';
    showNotification(msg, 'error');
  }
}

async function loadDiscordRPC() {
  try {
    if (window.electronAPI && window.electronAPI.loadDiscordRPC) {
      const enabled = await window.electronAPI.loadDiscordRPC();
      if (discordRPCCheck) {
        discordRPCCheck.checked = enabled;
      }
    }
  } catch (error) {
    console.error('Error loading Discord RPC setting:', error);
  }
}

async function saveCloseLauncher() {
  try {
    if (window.electronAPI && window.electronAPI.saveCloseLauncher && closeLauncherCheck) {
      const enabled = closeLauncherCheck.checked;
      await window.electronAPI.saveCloseLauncher(enabled);
    }
  } catch (error) {
    console.error('Error saving close launcher setting:', error);
  }
}

async function loadCloseLauncher() {
  try {
    if (window.electronAPI && window.electronAPI.loadCloseLauncher) {
      const enabled = await window.electronAPI.loadCloseLauncher();
      if (closeLauncherCheck) {
        closeLauncherCheck.checked = enabled;
      }
    }
  } catch (error) {
    console.error('Error loading close launcher setting:', error);
  }
}

async function saveLauncherHwAccel() {
  try {
    if (window.electronAPI && window.electronAPI.saveLauncherHardwareAcceleration && launcherHwAccelCheck) {
      const enabled = launcherHwAccelCheck.checked;
      await window.electronAPI.saveLauncherHardwareAcceleration(enabled);

      const msg = window.i18n ? window.i18n.t('notifications.hwAccelSaved') : 'Setting saved. Please restart the launcher to apply changes.';
      showNotification(msg, 'success');
    }
  } catch (error) {
    console.error('Error saving hardware acceleration setting:', error);
    const msg = window.i18n ? window.i18n.t('notifications.hwAccelSaveFailed') : 'Failed to save setting';
    showNotification(msg, 'error');
  }
}

async function loadLauncherHwAccel() {
  try {
    if (window.electronAPI && window.electronAPI.loadLauncherHardwareAcceleration) {
      const enabled = await window.electronAPI.loadLauncherHardwareAcceleration();
      if (launcherHwAccelCheck) {
        launcherHwAccelCheck.checked = enabled;
      }
    }
  } catch (error) {
    console.error('Error loading hardware acceleration setting:', error);
  }
}


async function savePlayerName() {
  try {
    if (!window.electronAPI || !settingsPlayerName) return;

    const playerName = settingsPlayerName.value.trim();

    if (!playerName) {
      const msg = window.i18n ? window.i18n.t('notifications.playerNameRequired') : 'Please enter a valid player name';
      showNotification(msg, 'error');
      return;
    }

    if (playerName.length > 16) {
      const msg = window.i18n ? window.i18n.t('notifications.playerNameTooLong') : 'Player name must be 16 characters or less';
      showNotification(msg, 'error');
      settingsPlayerName.value = playerName.substring(0, 16);
      return;
    }

    const result = await window.electronAPI.saveUsername(playerName);

    // Check if save was successful
    if (result && result.success === false) {
      console.error('[Settings] Failed to save username:', result.error);
      const errorMsg = window.i18n
        ? window.i18n.t('notifications.playerNameSaveFailed')
        : `Failed to save player name: ${result.error || 'Unknown error'}`;
      showNotification(errorMsg, 'error');
      return;
    }

    const successMsg = window.i18n ? window.i18n.t('notifications.playerNameSaved') : 'Player name saved successfully';
    showNotification(successMsg, 'success');

    // Refresh UUID display since it may have changed for the new username
    await loadCurrentUuid();

    // Also refresh the UUID list to update which entry is marked as current
    await loadAllUuids();

  } catch (error) {
    console.error('Error saving player name:', error);
    const errorMsg = window.i18n ? window.i18n.t('notifications.playerNameSaveFailed') : 'Failed to save player name';
    showNotification(errorMsg, 'error');
  }
}

async function loadPlayerName() {
  try {
    if (!window.electronAPI || !settingsPlayerName) return;

    const savedName = await window.electronAPI.loadUsername();
    if (savedName) {
      settingsPlayerName.value = savedName;
    }
  } catch (error) {
    console.error('Error loading player name:', error);
  }
}

async function saveGpuPreference() {
  try {
    if (window.electronAPI && window.electronAPI.saveGpuPreference && gpuPreferenceRadios) {
      const gpuPreference = Array.from(gpuPreferenceRadios).find(radio => radio.checked)?.value || 'auto';
      await window.electronAPI.saveGpuPreference(gpuPreference);
    }
  } catch (error) {
    console.error('Error saving GPU preference:', error);
  }
}

async function updateGpuLabel() {
  const detectionInfo = document.getElementById('gpu-detection-info');
  if (!detectionInfo) return;

  if (gpuPreferenceRadios) {
    const checked = Array.from(gpuPreferenceRadios).find(radio => radio.checked);
    if (checked) {
      try {
        if (window.electronAPI && window.electronAPI.getDetectedGpu) {
          const detected = await window.electronAPI.getDetectedGpu();
          if (checked.value === 'auto') {
            if (detected.dedicatedName) {
              detectionInfo.textContent = `dGPU detected, using ${detected.dedicatedName}`;
            } else {
              detectionInfo.textContent = `dGPU not detected, using iGPU (${detected.integratedName}) instead`;
            }
            detectionInfo.style.display = 'block';
          } else if (checked.value === 'integrated') {
            detectionInfo.textContent = `Detected: ${detected.integratedName}`;
            detectionInfo.style.display = 'block';
          } else if (checked.value === 'dedicated') {
            if (detected.dedicatedName) {
              detectionInfo.textContent = `Detected: ${detected.dedicatedName}`;
            } else {
              detectionInfo.textContent = `No dedicated GPU detected`;
            }
            detectionInfo.style.display = 'block';
          } else {
            detectionInfo.style.display = 'none';
          }
        }
      } catch (error) {
        console.error('Error getting detected GPU:', error);
        detectionInfo.style.display = 'none';
      }
    } else {
      detectionInfo.style.display = 'none';
    }
  } else {
    detectionInfo.style.display = 'none';
  }
}

async function loadGpuPreference() {
  try {
    if (window.electronAPI && window.electronAPI.loadGpuPreference && gpuPreferenceRadios) {
      const savedPreference = await window.electronAPI.loadGpuPreference();
      if (savedPreference) {
        for (const radio of gpuPreferenceRadios) {
          if (radio.value === savedPreference) {
            radio.checked = true;
            break;
          }
        }
        await updateGpuLabel();
      }
    }
  } catch (error) {
    console.error('Error loading GPU preference:', error);
  }
}

async function loadAllSettings() {
  await loadCustomJavaPath();
  await loadPlayerName();
  await loadCurrentUuid();
  await loadDiscordRPC();
  await loadCloseLauncher();
  await loadLauncherHwAccel();
  await loadGpuPreference();
  await loadVersionBranch();
}


async function openGameLocation() {
  try {
    if (window.electronAPI && window.electronAPI.openGameLocation) {
      await window.electronAPI.openGameLocation();
    }
  } catch (error) {
    console.error('Error opening game location:', error);
  }
}

export function getCurrentJavaPath() {
  if (customJavaCheck && customJavaCheck.checked && customJavaPath) {
    return customJavaPath.value.trim();
  }
  return '';
}


/**
 * Get current player name from UI input
 * Returns null if no name is set (caller must handle this)
 * NOTE: launcher.js now loads username directly from backend config
 * This function is used for display purposes only
 */
export function getCurrentPlayerName() {
  if (settingsPlayerName && settingsPlayerName.value.trim()) {
    return settingsPlayerName.value.trim();
  }
  // Return null instead of 'Player' - caller must handle missing username
  return null;
}

/**
 * Get current player name with fallback for display purposes only
 * DO NOT use this for launching game - use backend loadUsername() instead
 */
export function getCurrentPlayerNameForDisplay() {
  return getCurrentPlayerName() || 'Player';
}

window.openGameLocation = openGameLocation;

document.addEventListener('DOMContentLoaded', initSettings);

window.SettingsAPI = {
  getCurrentJavaPath,
  getCurrentPlayerName,
  getCurrentPlayerNameForDisplay,
  reloadBranch: loadVersionBranch
};

async function loadCurrentUuid() {
  try {
    if (window.electronAPI && window.electronAPI.getCurrentUuid) {
      const uuid = await window.electronAPI.getCurrentUuid();
      if (uuid) {
        if (currentUuidDisplay) currentUuidDisplay.value = uuid;
        if (modalCurrentUuid) modalCurrentUuid.value = uuid;
      }
    }
  } catch (error) {
    console.error('Error loading current UUID:', error);
  }
}

async function copyCurrentUuid() {
  try {
    const uuid = currentUuidDisplay ? currentUuidDisplay.value : modalCurrentUuid?.value;
    if (uuid && navigator.clipboard) {
      await navigator.clipboard.writeText(uuid);
      const msg = window.i18n ? window.i18n.t('notifications.uuidCopied') : 'UUID copied to clipboard!';
      showNotification(msg, 'success');
    }
  } catch (error) {
    console.error('Error copying UUID:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidCopyFailed') : 'Failed to copy UUID';
    showNotification(msg, 'error');
  }
}

async function regenerateCurrentUuid() {
  try {
    if (window.electronAPI && window.electronAPI.resetCurrentUserUuid) {
      const message = window.i18n ? window.i18n.t('confirm.regenerateUuidMessage') : 'Are you sure you want to generate a new UUID? This will change your player identity.';
      const title = window.i18n ? window.i18n.t('confirm.regenerateUuidTitle') : 'Generate New UUID';
      const confirmBtn = window.i18n ? window.i18n.t('confirm.regenerateUuidButton') : 'Generate';
      const cancelBtn = window.i18n ? window.i18n.t('common.cancel') : 'Cancel';

      showCustomConfirm(
        message,
        title,
        async () => {
          await performRegenerateUuid();
        },
        null,
        confirmBtn,
        cancelBtn
      );
    } else {
      console.error('electronAPI.resetCurrentUserUuid not available');
      const msg = window.i18n ? window.i18n.t('notifications.uuidRegenNotAvailable') : 'UUID regeneration not available';
      showNotification(msg, 'error');
    }
  } catch (error) {
    console.error('Error in regenerateCurrentUuid:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidRegenFailed') : 'Failed to regenerate UUID';
    showNotification(msg, 'error');
  }
}

async function performRegenerateUuid() {
  try {
    const result = await window.electronAPI.resetCurrentUserUuid();
    if (result.success && result.uuid) {
      if (currentUuidDisplay) currentUuidDisplay.value = result.uuid;
      if (modalCurrentUuid) modalCurrentUuid.value = result.uuid;
      const msg = window.i18n ? window.i18n.t('notifications.uuidGenerated') : 'New UUID generated successfully!';
      showNotification(msg, 'success');

      if (uuidModal && uuidModal.style.display !== 'none') {
        await loadAllUuids();
      }
    } else {
      throw new Error(result.error || 'Failed to generate new UUID');
    }
  } catch (error) {
    console.error('Error regenerating UUID:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidRegenFailed').replace('{error}', error.message) : `Failed to regenerate UUID: ${error.message}`;
    showNotification(msg, 'error');
  }
}

async function openUuidModal() {
  try {
    if (uuidModal) {
      uuidModal.style.display = 'flex';
      uuidModal.classList.add('active');
      await loadAllUuids();
    }
  } catch (error) {
    console.error('Error opening UUID modal:', error);
  }
}

function closeUuidModal() {
  if (uuidModal) {
    uuidModal.classList.remove('active');
    setTimeout(() => {
      uuidModal.style.display = 'none';
    }, 300);
  }
}

async function loadAllUuids() {
  try {
    if (!uuidList) return;

    uuidList.innerHTML = `
      <div class="uuid-loading">
        <i class="fas fa-spinner fa-spin"></i>
        Loading UUIDs...
      </div>
    `;

    if (window.electronAPI && window.electronAPI.getAllUuidMappings) {
      const mappings = await window.electronAPI.getAllUuidMappings();

      if (mappings.length === 0) {
        uuidList.innerHTML = `
          <div class="uuid-loading">
            <i class="fas fa-info-circle"></i>
            No UUIDs found
          </div>
        `;
        return;
      }

      uuidList.innerHTML = '';

      for (const mapping of mappings) {
        const item = document.createElement('div');
        item.className = `uuid-list-item${mapping.isCurrent ? ' current' : ''}`;

        item.innerHTML = `
          <div class="uuid-item-info">
            <div class="uuid-item-username">${escapeHtml(mapping.username)}</div>
            <div class="uuid-item-uuid">${mapping.uuid}</div>
          </div>
          <div class="uuid-item-actions">
            ${mapping.isCurrent ? '<div class="uuid-item-current-badge">Current</div>' : ''}
            ${!mapping.isCurrent ? `<button class="uuid-item-btn switch" onclick="switchToUsername('${escapeHtml(mapping.username)}')" title="Switch to this identity">
              <i class="fas fa-user-check"></i>
            </button>` : ''}
            <button class="uuid-item-btn copy" onclick="copyUuid('${mapping.uuid}')" title="Copy UUID">
              <i class="fas fa-copy"></i>
            </button>
            ${!mapping.isCurrent ? `<button class="uuid-item-btn delete" onclick="deleteUuid('${escapeHtml(mapping.username)}')" title="Delete UUID">
              <i class="fas fa-trash"></i>
            </button>` : ''}
          </div>
        `;

        uuidList.appendChild(item);
      }
    }
  } catch (error) {
    console.error('Error loading UUIDs:', error);
    if (uuidList) {
      uuidList.innerHTML = `
        <div class="uuid-loading">
          <i class="fas fa-exclamation-triangle"></i>
          Error loading UUIDs
        </div>
      `;
    }
  }
}

async function generateNewUuid() {
  try {
    if (window.electronAPI && window.electronAPI.generateNewUuid) {
      const newUuid = await window.electronAPI.generateNewUuid();
      if (newUuid) {
        if (customUuidInput) customUuidInput.value = newUuid;
        const msg = window.i18n ? window.i18n.t('notifications.uuidGeneratedShort') : 'New UUID generated!';
        showNotification(msg, 'success');
      }
    }
  } catch (error) {
    console.error('Error generating new UUID:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidGenerateFailed') : 'Failed to generate new UUID';
    showNotification(msg, 'error');
  }
}

async function setCustomUuid() {
  try {
    if (!customUuidInput || !customUuidInput.value.trim()) {
      const msg = window.i18n ? window.i18n.t('notifications.uuidRequired') : 'Please enter a UUID';
      showNotification(msg, 'error');
      return;
    }

    const uuid = customUuidInput.value.trim();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      const msg = window.i18n ? window.i18n.t('notifications.uuidInvalidFormat') : 'Invalid UUID format';
      showNotification(msg, 'error');
      return;
    }

    const message = window.i18n ? window.i18n.t('confirm.setCustomUuidMessage') : 'Are you sure you want to set this custom UUID? This will change your player identity.';
    const title = window.i18n ? window.i18n.t('confirm.setCustomUuidTitle') : 'Set Custom UUID';
    const confirmBtn = window.i18n ? window.i18n.t('confirm.setCustomUuidButton') : 'Set UUID';
    const cancelBtn = window.i18n ? window.i18n.t('common.cancel') : 'Cancel';

    showCustomConfirm(
      message,
      title,
      async () => {
        await performSetCustomUuid(uuid);
      },
      null,
      confirmBtn,
      cancelBtn
    );
  } catch (error) {
    console.error('Error in setCustomUuid:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidSetFailed') : 'Failed to set custom UUID';
    showNotification(msg, 'error');
  }
}

async function performSetCustomUuid(uuid) {
  try {
    if (window.electronAPI && window.electronAPI.setUuidForUser) {
      // IMPORTANT: Use saved username from config, not unsaved DOM input
      // This prevents setting UUID for wrong user if username field was edited but not saved
      let username = null;
      if (window.electronAPI.loadUsername) {
        username = await window.electronAPI.loadUsername();
      }
      if (!username) {
        const msg = window.i18n ? window.i18n.t('notifications.noUsername') : 'No username configured. Please save your username first.';
        showNotification(msg, 'error');
        return;
      }
      const result = await window.electronAPI.setUuidForUser(username, uuid);

      if (result.success) {
        if (currentUuidDisplay) currentUuidDisplay.value = uuid;
        if (modalCurrentUuid) modalCurrentUuid.value = uuid;
        if (customUuidInput) customUuidInput.value = '';

        const msg = window.i18n ? window.i18n.t('notifications.uuidSetSuccess') : 'Custom UUID set successfully!';
        showNotification(msg, 'success');

        await loadAllUuids();
      } else {
        throw new Error(result.error || 'Failed to set custom UUID');
      }
    }
  } catch (error) {
    console.error('Error setting custom UUID:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidSetFailed').replace('{error}', error.message) : `Failed to set custom UUID: ${error.message}`;
    showNotification(msg, 'error');
  }
}

window.copyUuid = async function (uuid) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(uuid);
      const msg = window.i18n ? window.i18n.t('notifications.uuidCopied') : 'UUID copied to clipboard!';
      showNotification(msg, 'success');
    }
  } catch (error) {
    console.error('Error copying UUID:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidCopyFailed') : 'Failed to copy UUID';
    showNotification(msg, 'error');
  }
};

/**
 * Switch to a different username/UUID identity
 * This changes the active username to use that username's UUID
 */
window.switchToUsername = async function (username) {
  try {
    const message = window.i18n
      ? window.i18n.t('confirm.switchUsernameMessage').replace('{username}', username)
      : `Switch to username "${username}"? This will change your active player identity.`;
    const title = window.i18n ? window.i18n.t('confirm.switchUsernameTitle') : 'Switch Identity';
    const confirmBtn = window.i18n ? window.i18n.t('confirm.switchUsernameButton') : 'Switch';
    const cancelBtn = window.i18n ? window.i18n.t('common.cancel') : 'Cancel';

    showCustomConfirm(
      message,
      title,
      async () => {
        await performSwitchToUsername(username);
      },
      null,
      confirmBtn,
      cancelBtn
    );
  } catch (error) {
    console.error('Error in switchToUsername:', error);
    const msg = window.i18n ? window.i18n.t('notifications.switchUsernameFailed') : 'Failed to switch username';
    showNotification(msg, 'error');
  }
};

async function performSwitchToUsername(username) {
  try {
    if (!window.electronAPI || !window.electronAPI.saveUsername) {
      throw new Error('API not available');
    }

    const result = await window.electronAPI.saveUsername(username);

    if (result && result.success === false) {
      throw new Error(result.error || 'Failed to save username');
    }

    // Update the username input field
    if (settingsPlayerName) {
      settingsPlayerName.value = username;
    }

    // Refresh the current UUID display
    await loadCurrentUuid();

    // Refresh the UUID list to show new "Current" badge
    await loadAllUuids();

    const msg = window.i18n
      ? window.i18n.t('notifications.switchUsernameSuccess').replace('{username}', username)
      : `Switched to "${username}" successfully!`;
    showNotification(msg, 'success');

  } catch (error) {
    console.error('Error switching username:', error);
    const msg = window.i18n
      ? window.i18n.t('notifications.switchUsernameFailed')
      : `Failed to switch username: ${error.message}`;
    showNotification(msg, 'error');
  }
}

window.deleteUuid = async function (username) {
  try {
    const message = window.i18n ? window.i18n.t('confirm.deleteUuidMessage').replace('{username}', username) : `Are you sure you want to delete the UUID for "${username}"? This action cannot be undone.`;
    const title = window.i18n ? window.i18n.t('confirm.deleteUuidTitle') : 'Delete UUID';
    const confirmBtn = window.i18n ? window.i18n.t('confirm.deleteUuidButton') : 'Delete';
    const cancelBtn = window.i18n ? window.i18n.t('common.cancel') : 'Cancel';

    showCustomConfirm(
      message,
      title,
      async () => {
        await performDeleteUuid(username);
      },
      null,
      confirmBtn,
      cancelBtn
    );
  } catch (error) {
    console.error('Error in deleteUuid:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidDeleteFailed') : 'Failed to delete UUID';
    showNotification(msg, 'error');
  }
};

async function performDeleteUuid(username) {
  try {
    if (window.electronAPI && window.electronAPI.deleteUuidForUser) {
      const result = await window.electronAPI.deleteUuidForUser(username);

      if (result.success) {
        const msg = window.i18n ? window.i18n.t('notifications.uuidDeleteSuccess') : 'UUID deleted successfully!';
        showNotification(msg, 'success');
        await loadAllUuids();
      } else {
        throw new Error(result.error || 'Failed to delete UUID');
      }
    }
  } catch (error) {
    console.error('Error deleting UUID:', error);
    const msg = window.i18n ? window.i18n.t('notifications.uuidDeleteFailed').replace('{error}', error.message) : `Failed to delete UUID: ${error.message}`;
    showNotification(msg, 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    z-index: 10000;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
  `;

  if (type === 'success') {
    notification.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
  } else if (type === 'error') {
    notification.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
  } else {
    notification.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
  }

  notification.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
    ${message}
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 100);

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}// Append this to settings.js for branch management

// === Game Branch Management ===
async function handleBranchChange(event) {
  const newBranch = event.target.value;
  const currentBranch = await loadVersionBranch();

  if (newBranch === currentBranch) {
    return; // No change
  }

  // Confirm branch change
  const branchName = window.i18n ?
    window.i18n.t(`settings.branch${newBranch === 'pre-release' ? 'PreRelease' : 'Release'}`) :
    newBranch;

  const message = window.i18n ?
    window.i18n.t('settings.branchWarning') :
    'Changing branch will download and install a different game version';

  showCustomConfirm(
    message,
    window.i18n ? window.i18n.t('settings.gameBranch') : 'Game Branch',
    async () => {
      await switchBranch(newBranch);
    },
    () => {
      // Cancel: revert radio selection
      loadVersionBranch().then(branch => {
        const radioToCheck = document.querySelector(`input[name="gameBranch"][value="${branch}"]`);
        if (radioToCheck) {
          radioToCheck.checked = true;
        }
      });
    }
  );
}

async function switchBranch(newBranch) {
  try {
    const switchingMsg = window.i18n ?
      window.i18n.t('settings.branchSwitching').replace('{branch}', newBranch) :
      `Switching to ${newBranch}...`;

    showNotification(switchingMsg, 'info');

    // Lock play button
    const playButton = document.getElementById('playButton');
    if (playButton) {
      playButton.disabled = true;
      playButton.classList.add('disabled');
    }

    // DON'T save branch yet - wait for installation confirmation

    // Suggest reinstalling
    setTimeout(() => {
      const branchLabel = newBranch === 'release' ?
        (window.i18n ? window.i18n.t('install.releaseVersion') : 'Release') :
        (window.i18n ? window.i18n.t('install.preReleaseVersion') : 'Pre-Release');

      const confirmMsg = window.i18n ?
        window.i18n.t('settings.branchInstallConfirm').replace('{branch}', branchLabel) :
        `The game will be installed for the ${branchLabel} branch. Continue?`;

      showCustomConfirm(
        confirmMsg,
        window.i18n ? window.i18n.t('settings.installRequired') : 'Installation Required',
        async () => {
          // Show progress and trigger game installation
          if (window.LauncherUI) {
            window.LauncherUI.showProgress();
          }

          try {
            const playerName = await window.electronAPI.loadUsername();
            const result = await window.electronAPI.installGame(playerName || 'Player', '', '', newBranch);

            if (result.success) {
              // Save branch ONLY after successful installation
              await window.electronAPI.saveVersionBranch(newBranch);

              const switchedMsg = window.i18n ?
                window.i18n.t('settings.branchSwitched').replace('{branch}', newBranch) :
                `Switched to ${newBranch} successfully!`;

              const successMsg = window.i18n ?
                window.i18n.t('progress.installationComplete') :
                'Installation completed successfully!';

              showNotification(switchedMsg, 'success');
              showNotification(successMsg, 'success');

              // Refresh radio buttons to reflect the new branch
              await loadVersionBranch();
              console.log('[Settings] Radio buttons updated after branch switch');

              setTimeout(() => {
                if (window.LauncherUI) {
                  window.LauncherUI.hideProgress();
                }

                // Unlock play button
                const playButton = document.getElementById('playButton');
                if (playButton) {
                  playButton.disabled = false;
                  playButton.classList.remove('disabled');
                }
              }, 2000);
            } else {
              throw new Error(result.error || 'Installation failed');
            }
          } catch (error) {
            console.error('Installation error:', error);
            const errorMsg = window.i18n ?
              window.i18n.t('progress.installationFailed').replace('{error}', error.message) :
              `Installation failed: ${error.message}`;

            showNotification(errorMsg, 'error');

            if (window.LauncherUI) {
              window.LauncherUI.hideProgress();
            }

            // Revert radio selection to old branch
            loadVersionBranch().then(oldBranch => {
              const radioToCheck = document.querySelector(`input[name="gameBranch"][value="${oldBranch}"]`);
              if (radioToCheck) {
                radioToCheck.checked = true;
              }
            });

            // Unlock play button
            const playButton = document.getElementById('playButton');
            if (playButton) {
              playButton.disabled = false;
              playButton.classList.remove('disabled');
            }
          }
        },
        () => {
          // Cancel - unlock play button
          const playButton = document.getElementById('playButton');
          if (playButton) {
            playButton.disabled = false;
            playButton.classList.remove('disabled');
          }
        },
        window.i18n ? window.i18n.t('common.install') : 'Install',
        window.i18n ? window.i18n.t('common.cancel') : 'Cancel'
      );
    }, 500);

  } catch (error) {
    console.error('Error switching branch:', error);
    showNotification(`Failed to switch branch: ${error.message}`, 'error');

    // Revert radio selection
    loadVersionBranch().then(branch => {
      const radioToCheck = document.querySelector(`input[name="gameBranch"][value="${branch}"]`);
      if (radioToCheck) {
        radioToCheck.checked = true;
      }
    });
  }
}

async function loadVersionBranch() {
  try {
    if (window.electronAPI && window.electronAPI.loadVersionBranch) {
      const branch = await window.electronAPI.loadVersionBranch();
      console.log('[Settings] Loaded version_branch from config:', branch);

      // Use default if branch is null/undefined
      const selectedBranch = branch || 'release';
      console.log('[Settings] Selected branch:', selectedBranch);

      // Update radio buttons
      if (gameBranchRadios && gameBranchRadios.length > 0) {
        gameBranchRadios.forEach(radio => {
          radio.checked = radio.value === selectedBranch;
          console.log(`[Settings] Radio ${radio.value}: ${radio.checked ? 'checked' : 'unchecked'}`);
        });
      } else {
        console.warn('[Settings] gameBranchRadios not found or empty');
      }

      return selectedBranch;
    }
    return 'release'; // Default
  } catch (error) {
    console.error('Error loading version branch:', error);
    return 'release';
  }
}
