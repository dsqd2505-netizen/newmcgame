let isDownloading = false;

let installPage;
let installBtn;
let installText;
let installPlayerName;
let installCustomCheck;
let installCustomOptions;
let installPathInput;

export function setupInstallation() {
  installPage = document.getElementById('install-page');
  installBtn = document.getElementById('installBtn');
  installText = document.getElementById('installText');
  installPlayerName = document.getElementById('installPlayerName');
  installCustomCheck = document.getElementById('installCustomCheck');
  installCustomOptions = document.getElementById('installCustomOptions');
  installPathInput = document.getElementById('installPath');
  
  if (installCustomCheck && installCustomOptions) {
    installCustomCheck.addEventListener('change', (e) => {
      if (e.target.checked) {
        installCustomOptions.classList.add('show');
      } else {
        installCustomOptions.classList.remove('show');
      }
    });
  }
  
  if (installPlayerName) {
    installPlayerName.addEventListener('change', savePlayerName);
  }

  if (window.electronAPI && window.electronAPI.onProgressUpdate) {
    window.electronAPI.onProgressUpdate((data) => {
      if (!isDownloading) return;
      if (window.LauncherUI) {
        window.LauncherUI.updateProgress(data);
      }
    });
  }

}

export async function installGame() {
  if (isDownloading || (installBtn && installBtn.disabled)) return;
  
  let playerName = (installPlayerName ? installPlayerName.value.trim() : '') || 'Player';
  const installPath = installPathInput ? installPathInput.value.trim() : '';
  
  // Limit player name to 16 characters
  if (playerName.length > 16) {
    playerName = playerName.substring(0, 16);
    if (installPlayerName) {
      installPlayerName.value = playerName;
    }
  }
  
  const selectedBranchRadio = document.querySelector('input[name="installBranch"]:checked');
  const selectedBranch = selectedBranchRadio ? selectedBranchRadio.value : 'release';
  
  console.log(`[Install] Installing game with branch: ${selectedBranch}`);
  
  if (window.LauncherUI) window.LauncherUI.showProgress();
  isDownloading = true;
  lockInstallForm();
  if (installBtn) {
    installBtn.disabled = true;
    installText.textContent = window.i18n ? window.i18n.t('install.installing') : 'INSTALLING...';
  }
  
  try {
    if (window.electronAPI && window.electronAPI.installGame) {
      const result = await window.electronAPI.installGame(playerName, '', installPath, selectedBranch);
      
      if (result.success) {
        const successMsg = window.i18n ? window.i18n.t('progress.installationComplete') : 'Installation completed successfully!';
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: successMsg });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
            window.LauncherUI.showLauncherOrInstall(true);
            // Sync player name to both launcher and settings inputs
            const playerNameInput = document.getElementById('playerName');
            if (playerNameInput) playerNameInput.value = playerName;
            const settingsPlayerName = document.getElementById('settingsPlayerName');
            if (settingsPlayerName) settingsPlayerName.value = playerName;
            resetInstallButton();
          }, 2000);
        }
      } else {
        throw new Error(result.error || 'Installation failed');
      }
    } else {
      simulateInstallation(playerName);
    }
  } catch (error) {
    const errorMsg = window.i18n ? window.i18n.t('progress.installationFailed').replace('{error}', error.message) : `Installation failed: ${error.message}`;
    
    // Reset button state and unlock form on error
    resetInstallButton();
    
    if (window.LauncherUI) {
      window.LauncherUI.updateProgress({ message: errorMsg });
      // Don't hide progress bar, just update the message
      // User can see the error and close it manually
    }
  }
}

function simulateInstallation(playerName) {
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 3;
    if (progress > 100) progress = 100;
    
    const installingMsg = window.i18n ? window.i18n.t('progress.installingGameFiles') : 'Installing game files...';
    const completeMsg = window.i18n ? window.i18n.t('progress.installComplete') : 'Installation complete!';
    
    if (window.LauncherUI) {
      window.LauncherUI.updateProgress({
        percent: progress,
        message: progress < 100 ? installingMsg : completeMsg,
        speed: 1024 * 1024 * (5 + Math.random() * 10),
        downloaded: progress * 1024 * 1024 * 20,
        total: 1024 * 1024 * 2000
      });
    }
    
    if (progress >= 100) {
      clearInterval(interval);
      const successMsg = window.i18n ? window.i18n.t('progress.installationComplete') : 'Installation completed successfully!';
      setTimeout(() => {
        if (window.LauncherUI) {
          window.LauncherUI.updateProgress({ message: successMsg });
          setTimeout(() => {
            window.LauncherUI.hideProgress();
            window.LauncherUI.showLauncherOrInstall(true);
            // Sync player name to both launcher and settings inputs
            const playerNameInput = document.getElementById('playerName');
            if (playerNameInput) playerNameInput.value = playerName;
            const settingsPlayerName = document.getElementById('settingsPlayerName');
            if (settingsPlayerName) settingsPlayerName.value = playerName;
            resetInstallButton();
          }, 2000);
        }
      }, 1000);
    }
  }, 200);
}

function resetInstallButton() {
  isDownloading = false;
  if (installBtn) {
    installBtn.disabled = false;
    installText.textContent = 'INSTALL HYTALE';
  }
  unlockInstallForm();
}

function lockInstallForm() {
  const playerNameInput = document.getElementById('installPlayerName');
  const installPathInput = document.getElementById('installPath');
  const customCheckbox = document.getElementById('installCustomCheck');
  const branchRadios = document.querySelectorAll('input[name="installBranch"]');
  const browseBtn = document.querySelector('.browse-btn');
  
  if (playerNameInput) playerNameInput.disabled = true;
  if (installPathInput) installPathInput.disabled = true;
  if (customCheckbox) customCheckbox.disabled = true;
  if (browseBtn) browseBtn.disabled = true;
  branchRadios.forEach(radio => radio.disabled = true);
}

function unlockInstallForm() {
  const playerNameInput = document.getElementById('installPlayerName');
  const installPathInput = document.getElementById('installPath');
  const customCheckbox = document.getElementById('installCustomCheck');
  const branchRadios = document.querySelectorAll('input[name="installBranch"]');
  const browseBtn = document.querySelector('.browse-btn');
  
  if (playerNameInput) playerNameInput.disabled = false;
  if (installPathInput) installPathInput.disabled = false;
  if (customCheckbox) customCheckbox.disabled = false;
  if (browseBtn) browseBtn.disabled = false;
  branchRadios.forEach(radio => radio.disabled = false);
}

export async function browseInstallPath() {
  try {
    if (window.electronAPI && window.electronAPI.selectInstallPath) {
      const result = await window.electronAPI.selectInstallPath();
      if (result && installPathInput) {
        installPathInput.value = result;
      }
    }
  } catch (error) {
    console.error('Error browsing install path:', error);
  }
}

async function savePlayerName() {
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      let playerName = (installPlayerName ? installPlayerName.value.trim() : '') || 'Player';
      
      // Limit player name to 16 characters
      if (playerName.length > 16) {
        playerName = playerName.substring(0, 16);
        if (installPlayerName) {
          installPlayerName.value = playerName;
        }
      }
      
      await window.electronAPI.saveSettings({ playerName });
    }
  } catch (error) {
    console.error('Error saving player name:', error);
  }
}

export async function checkGameStatusAndShowInterface() {
  try {
    if (window.electronAPI && window.electronAPI.isGameInstalled) {
      const installed = await window.electronAPI.isGameInstalled();
      if (window.LauncherUI) {
        window.LauncherUI.showLauncherOrInstall(installed);
      }
      if (installed) {
        await loadPlayerSettings();
      }
    } else {
      if (window.LauncherUI) {
        window.LauncherUI.showLauncherOrInstall(false);
      }
    }
  } catch (error) {
    console.error('Error checking game status:', error);
    if (window.LauncherUI) {
      window.LauncherUI.showLauncherOrInstall(false);
    }
  }
}

async function loadPlayerSettings() {
  try {
    if (window.electronAPI && window.electronAPI.loadSettings) {
      const settings = await window.electronAPI.loadSettings();
      if (settings) {
        const playerNameInput = document.getElementById('playerName');
        const javaPathInput = document.getElementById('javaPath');
        if (settings.playerName && playerNameInput) {
          playerNameInput.value = settings.playerName;
        }
        if (settings.javaPath && javaPathInput) {
          javaPathInput.value = settings.javaPath;
        }
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

window.installGame = installGame;
window.browseInstallPath = browseInstallPath;

document.addEventListener('DOMContentLoaded', async () => {
  setupInstallation();
  await checkGameStatusAndShowInterface();
});
