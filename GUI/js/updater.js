// Launcher Update Manager UI

let updateModal = null;
let downloadProgressBar = null;

function initUpdater() {
  // Listen for update events from main process
  if (window.electronAPI && window.electronAPI.onUpdateAvailable) {
    window.electronAPI.onUpdateAvailable((updateInfo) => {
      showUpdateModal(updateInfo);
    });
  }

  if (window.electronAPI && window.electronAPI.onUpdateDownloadProgress) {
    window.electronAPI.onUpdateDownloadProgress((progress) => {
      updateDownloadProgress(progress);
    });
  }

  if (window.electronAPI && window.electronAPI.onUpdateDownloaded) {
    window.electronAPI.onUpdateDownloaded((info) => {
      showInstallUpdatePrompt(info);
    });
  }
}

function showUpdateModal(updateInfo) {
  if (updateModal) {
    updateModal.remove();
  }

  updateModal = document.createElement('div');
  updateModal.className = 'update-modal-overlay';
  updateModal.innerHTML = `
    <div class="update-modal">
      <div class="update-header">
        <i class="fas fa-download"></i>
        <h2>Launcher Update Available</h2>
      </div>
      <div class="update-content">
        <p class="update-version">Version ${updateInfo.newVersion} is available!</p>
        <p class="current-version">Current version: ${updateInfo.currentVersion}</p>
        ${updateInfo.releaseNotes ? `<div class="release-notes">${updateInfo.releaseNotes}</div>` : ''}
      </div>
      <div class="update-progress" style="display: none;">
        <div class="progress-bar-container">
          <div class="progress-bar" id="updateProgressBar"></div>
        </div>
        <p class="progress-text" id="updateProgressText">Downloading...</p>
      </div>
      <div class="update-actions">
        <button class="btn-primary" onclick="downloadUpdate()">
          <i class="fas fa-download"></i> Download Update
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(updateModal);
}

async function downloadUpdate() {
  const downloadBtn = updateModal.querySelector('.btn-primary');
  const progressDiv = updateModal.querySelector('.update-progress');
  
  // Disable button and show progress
  downloadBtn.disabled = true;
  progressDiv.style.display = 'block';

  try {
    await window.electronAPI.downloadUpdate();
  } catch (error) {
    console.error('Failed to download update:', error);
    alert('Failed to download update. Please try again later.');
    dismissUpdateModal();
  }
}

function updateDownloadProgress(progress) {
  if (!updateModal) return;

  const progressBar = document.getElementById('updateProgressBar');
  const progressText = document.getElementById('updateProgressText');

  if (progressBar) {
    progressBar.style.width = `${progress.percent}%`;
  }

  if (progressText) {
    const mbTransferred = (progress.transferred / 1024 / 1024).toFixed(2);
    const mbTotal = (progress.total / 1024 / 1024).toFixed(2);
    const speed = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
    progressText.textContent = `Downloading... ${mbTransferred}MB / ${mbTotal}MB (${speed} MB/s)`;
  }
}

function showInstallUpdatePrompt(info) {
  if (updateModal) {
    updateModal.remove();
  }

  updateModal = document.createElement('div');
  updateModal.className = 'update-modal-overlay';
  updateModal.innerHTML = `
    <div class="update-modal">
      <div class="update-header">
        <i class="fas fa-check-circle"></i>
        <h2>Update Downloaded</h2>
      </div>
      <div class="update-content">
        <p>Version ${info.version} has been downloaded and is ready to install.</p>
        <p class="update-note">The launcher will restart to complete the installation.</p>
      </div>
      <div class="update-actions">
        <button class="btn-primary" onclick="installUpdate()">
          <i class="fas fa-sync-alt"></i> Restart & Install
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(updateModal);
}

async function installUpdate() {
  try {
    await window.electronAPI.installUpdate();
  } catch (error) {
    console.error('Failed to install update:', error);
  }
}

function dismissUpdateModal() {
  if (updateModal) {
    updateModal.remove();
    updateModal = null;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initUpdater);

// Export functions
window.UpdaterUI = {
  showUpdateModal,
  dismissUpdateModal,
  downloadUpdate,
  installUpdate
};
