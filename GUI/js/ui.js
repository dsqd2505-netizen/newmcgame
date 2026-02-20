
let progressOverlay;
let progressBar;
let progressBarFill;
let progressText;
let progressPercent;
let progressSpeed;
let progressSize;
let progressErrorContainer;
let progressErrorMessage;
let progressRetryInfo;
let progressRetryBtn;
let progressJRRetryBtn;
let progressPWRRetryBtn;

// Download retry state
let currentDownloadState = {
    isDownloading: false,
    canRetry: false,
    retryData: null,
    lastError: null,
    errorType: null,
    branch: null,
    fileName: null,
    cacheDir: null
};

function showPage(pageId) {
  const pages = document.querySelectorAll('.page');
  pages.forEach(page => {
    if (page.id === pageId) {
      page.classList.add('active');
      page.style.display = '';
      
      // Reload settings when settings page becomes visible
      if (pageId === 'settings-page') {
        console.log('[UI] Settings page activated, reloading branch...');
        // Dynamically import and call loadVersionBranch from settings
        if (window.SettingsAPI && window.SettingsAPI.reloadBranch) {
          window.SettingsAPI.reloadBranch();
        }
      }
    } else {
      page.classList.remove('active');
      page.style.display = 'none';
    }
  });
}

function setActiveNav(page) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-page') === page) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function handleNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.getAttribute('data-page');
      if (page) {
        showPage(`${page}-page`);
        setActiveNav(page);
      }
    });
  });
}

function setupWindowControls() {
  const minimizeBtn = document.querySelector('.window-controls .minimize');
  const closeBtn = document.querySelector('.window-controls .close');

  const windowControls = document.querySelector('.window-controls');
  const header = document.querySelector('.header');

  const profileSelector = document.querySelector('.profile-selector');

  if (profileSelector) {
    profileSelector.style.pointerEvents = 'auto';
    profileSelector.style.zIndex = '10000';
  }

  if (windowControls) {
    windowControls.style.pointerEvents = 'auto';
    windowControls.style.zIndex = '10000';
  }

  if (header) {
    header.style.webkitAppRegion = 'drag';
    if (windowControls) {
      windowControls.style.webkitAppRegion = 'no-drag';
    }
    if (profileSelector) {
      profileSelector.style.webkitAppRegion = 'no-drag';
    }
  }

  if (window.electronAPI) {
    if (minimizeBtn) {
      minimizeBtn.onclick = (e) => {
        e.stopPropagation();
        window.electronAPI.minimizeWindow();
      };
    }
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        window.electronAPI.closeWindow();
      };
    }
  }
}

function showLauncherOrInstall(isInstalled) {
  const launcher = document.getElementById('launcher-container');
  const install = document.getElementById('install-page');
  const sidebar = document.querySelector('.sidebar');
  const gameTitle = document.querySelector('.game-title-section');

  if (isInstalled) {
    if (launcher) launcher.style.display = '';
    if (install) install.style.display = 'none';
    if (sidebar) sidebar.style.pointerEvents = 'auto';
    if (gameTitle) gameTitle.style.display = '';
    showPage('play-page');
    setActiveNav('play');
  } else {
    if (launcher) launcher.style.display = 'none';
    if (install) {
      install.style.display = '';
      install.classList.add('active');
    }
    if (sidebar) sidebar.style.pointerEvents = 'none';
    if (gameTitle) gameTitle.style.display = 'none';
    const pages = document.querySelectorAll('#launcher-container .page');
    pages.forEach(page => page.classList.remove('active'));
  }
}

function setupSidebarLogo() {
  const logo = document.querySelector('.sidebar-logo img');
  if (logo) {
    logo.addEventListener('click', () => {
      showPage('play-page');
      setActiveNav('play');
    });
  }
}

function showProgress() {
  if (progressOverlay) {
    progressOverlay.style.display = 'block';
    setTimeout(() => {
      progressOverlay.style.opacity = '1';
      progressOverlay.style.transform = 'translateY(0)';
    }, 10);
  }
}

function hideProgress() {
  if (progressOverlay) {
    progressOverlay.style.opacity = '0';
    progressOverlay.style.transform = 'translateY(20px)';
    setTimeout(() => {
      progressOverlay.style.display = 'none';
    }, 300);
  }
}

function updateProgress(data) {
  // Handle retry state
  if (data.retryState) {
    currentDownloadState.retryData = data.retryState;
    updateRetryState(data.retryState);
  }

  if (data.message && progressText) {
    progressText.textContent = data.message;
  }

  if (data.percent !== null && data.percent !== undefined) {
    const percent = Math.min(100, Math.max(0, Math.round(data.percent)));
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
  }

  if (data.speed && data.downloaded && data.total) {
    const speedMB = (data.speed / 1024 / 1024).toFixed(2);
    const downloadedMB = (data.downloaded / 1024 / 1024).toFixed(2);
    const totalMB = (data.total / 1024 / 1024).toFixed(2);
    if (progressSpeed) progressSpeed.textContent = `${speedMB} MB/s`;
    if (progressSize) progressSize.textContent = `${downloadedMB} / ${totalMB} MB`;
  }

  // Handle error states with enhanced categorization
  // Don't show error during automatic retries - let the retry message display instead
  if ((data.error || (data.message && data.message.includes('failed'))) && 
      !(data.retryState && data.retryState.isAutomaticRetry)) {
    const errorType = categorizeError(data.message);
    console.log('[UI] Showing download error:', { message: data.message, canRetry: data.canRetry, errorType });
    showDownloadError(data.message, data.canRetry, errorType, data);
  } else if (data.percent === 100) {
    hideDownloadError();
  } else if (data.retryState && data.retryState.isAutomaticRetry) {
    // Hide any existing error during automatic retries
    hideDownloadError();
  }
}

function updateRetryState(retryState) {
  if (!progressRetryInfo) return;

  if (retryState.isAutomaticRetry && retryState.automaticStallRetries > 0) {
    // Show automatic stall retry count
    progressRetryInfo.textContent = `Auto-retry ${retryState.automaticStallRetries}/3`;
    progressRetryInfo.style.display = 'block';
    progressRetryInfo.style.background = 'rgba(255, 193, 7, 0.2)'; // Light orange background for auto-retries
    progressRetryInfo.style.color = '#ff9800'; // Orange text for auto-retries
  } else if (retryState.attempts > 1) {
    // Show manual retry count
    progressRetryInfo.textContent = `Attempt ${retryState.attempts}/${retryState.maxRetries}`;
    progressRetryInfo.style.display = 'block';
    progressRetryInfo.style.background = ''; // Reset background
    progressRetryInfo.style.color = ''; // Reset color
  } else {
    progressRetryInfo.style.display = 'none';
    progressRetryInfo.style.background = ''; // Reset background
    progressRetryInfo.style.color = ''; // Reset color
  }
}

function showDownloadError(errorMessage, canRetry = true, errorType = 'general', data = null) {
  if (!progressErrorContainer || !progressErrorMessage) return;

  console.log('[UI] showDownloadError called with:', { errorMessage, canRetry, errorType, data });
  console.log('[UI] Data properties:', {
    hasData: !!data,
    hasRetryData: !!(data && data.retryData),
    dataErrorType: data && data.errorType,
    dataIsJREError: data && data.retryData && data.retryData.isJREError
  });
  
  currentDownloadState.lastError = errorMessage;
  currentDownloadState.canRetry = canRetry;
  currentDownloadState.errorType = errorType;
  
  // Update retry context if available
  if (data && data.retryData) {
    currentDownloadState.branch = data.retryData.branch;
    currentDownloadState.fileName = data.retryData.fileName;
    currentDownloadState.cacheDir = data.retryData.cacheDir;
    // Override errorType if specified in data
    if (data.errorType) {
      currentDownloadState.errorType = data.errorType;
    }
  }

  // Hide all retry buttons first
  if (progressRetryBtn) progressRetryBtn.style.display = 'none';
  if (progressJRRetryBtn) progressJRRetryBtn.style.display = 'none';
  if (progressPWRRetryBtn) progressPWRRetryBtn.style.display = 'none';

  // User-friendly error messages
  const userMessage = getErrorMessage(errorMessage, errorType);
  progressErrorMessage.textContent = userMessage;
  progressErrorContainer.style.display = 'block';

  // Show appropriate retry button based on error type
  if (canRetry) {
    if (errorType === 'jre') {
      if (progressJRRetryBtn) {
        console.log('[UI] Showing JRE retry button');
        progressJRRetryBtn.style.display = 'block';
      }
    } else {
      // All other errors use PWR retry button (game download, butler, etc.)
      if (progressPWRRetryBtn) {
        console.log('[UI] Showing PWR retry button');
        progressPWRRetryBtn.style.display = 'block';
      }
    }
  }

  // Add visual indicators based on error type
  progressErrorContainer.className = `progress-error-container error-${errorType}`;

  if (progressOverlay) {
    progressOverlay.classList.add('error-state');
  }
}

function hideDownloadError() {
  if (!progressErrorContainer) return;

  // Hide all retry buttons
  if (progressRetryBtn) progressRetryBtn.style.display = 'none';
  if (progressJRRetryBtn) progressJRRetryBtn.style.display = 'none';
  if (progressPWRRetryBtn) progressPWRRetryBtn.style.display = 'none';

  progressErrorContainer.style.display = 'none';
  currentDownloadState.canRetry = false;
  currentDownloadState.lastError = null;
  currentDownloadState.errorType = null;

  if (progressOverlay) {
    progressOverlay.classList.remove('error-state');
  }
}

function setupAnimations() {
  document.body.style.opacity = '0';
  document.body.style.transform = 'translateY(20px)';

  setTimeout(() => {
    document.body.style.transition = 'all 0.6s ease';
    document.body.style.opacity = '1';
    document.body.style.transform = 'translateY(0)';
  }, 100);

  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}

function setupFirstLaunchHandlers() {
  console.log('Setting up first launch handlers...');

  window.electronAPI.onFirstLaunchUpdate((data) => {
    console.log('Received first launch update event:', data);
    showFirstLaunchUpdateDialog(data);
  });

  window.electronAPI.onFirstLaunchWelcome(() => {
  });

  window.electronAPI.onFirstLaunchProgress((data) => {
    showProgress();
    updateProgress(data);
  });

  let lockButtonTimeout = null;

  window.electronAPI.onLockPlayButton((locked) => {
    lockPlayButton(locked);

    if (locked) {
      if (lockButtonTimeout) {
        clearTimeout(lockButtonTimeout);
      }
      lockButtonTimeout = setTimeout(() => {
        console.warn('Play button has been locked for too long, forcing unlock');
        lockPlayButton(false);
        lockButtonTimeout = null;
      }, 20000);
    } else {
      if (lockButtonTimeout) {
        clearTimeout(lockButtonTimeout);
        lockButtonTimeout = null;
      }
    }
  });
}

function showFirstLaunchUpdateDialog(data) {
  console.log('Creating first launch modal...');

  const existingModal = document.querySelector('.first-launch-modal-overlay');
  if (existingModal) {
    existingModal.remove();
  }

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'first-launch-modal-overlay';
  modalOverlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.95) !important;
    backdrop-filter: blur(10px) !important;
    z-index: 999999 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    pointer-events: all !important;
  `;

  const modalDialog = document.createElement('div');
  modalDialog.className = 'first-launch-modal-dialog';
  modalDialog.style.cssText = `
    background: #1a1a1a !important;
    border-radius: 12px !important;
    padding: 0 !important;
    width: 500px !important;
    max-width: 90vw !important;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8) !important;
    border: 1px solid rgba(147, 51, 234, 0.5) !important;
    overflow: hidden !important;
    animation: modalSlideIn 0.3s ease-out !important;
  `;

  modalDialog.innerHTML = `
    <div style="background: linear-gradient(135deg, rgba(147, 51, 234, 0.2), rgba(59, 130, 246, 0.2)); padding: 25px; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <h2 style="margin: 0; color: #fff; font-size: 1.5rem; font-weight: 600; text-align: center;">
        🔄 Game Update Required
      </h2>
    </div>
    <div style="padding: 30px; color: #e5e7eb; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 25px;">
        <p style="font-size: 1.1rem; margin-bottom: 15px;">
          An existing Hytale installation has been detected and must be updated to the latest version.
        </p>
        <p style="color: #10b981; font-weight: 500; margin-bottom: 20px;">
          ✅ Your game saves and settings will be preserved
        </p>
      </div>
      
      <div style="background: rgba(59, 130, 246, 0.1); padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0;">
        <p style="margin: 8px 0; font-family: 'Courier New', monospace; font-size: 0.9em;">
          <strong>📁 Location:</strong> ${data.existingGame.installPath}
        </p>
        <p style="margin: 8px 0; font-family: 'Courier New', monospace; font-size: 0.9em;">
          <strong>💾 UserData:</strong> ${data.existingGame.hasUserData ? '✅ Found (will be preserved)' : '❌ Not found'}
        </p>
      </div>
      
      <div style="background: rgba(234, 179, 8, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #eab308; margin: 20px 0;">
        <p style="margin: 0; color: #fbbf24; font-weight: 500; font-size: 0.95em;">
          ⚠️ This update is mandatory and cannot be skipped
        </p>
      </div>
    </div>
    <div style="padding: 25px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
      <button id="updateGameBtn" style="
        background: linear-gradient(135deg, #9333ea, #3b82f6) !important;
        color: white !important;
        border: none !important;
        padding: 15px 30px !important;
        border-radius: 8px !important;
        font-size: 1rem !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        min-width: 200px !important;
      " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        🚀 Update Game Now
      </button>
    </div>
  `;

  modalOverlay.appendChild(modalDialog);

  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  };

  document.addEventListener('keydown', function preventEscape(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });

  document.body.appendChild(modalOverlay);

  const updateBtn = document.getElementById('updateGameBtn');
  updateBtn.onclick = () => {
    acceptFirstLaunchUpdate();
  };

  window.firstLaunchExistingGame = data.existingGame;

  console.log('First launch modal created and displayed');
}

function lockPlayButton(locked) {
  const playButton = document.getElementById('homePlayBtn');

  if (!playButton) {
    console.warn('Play button not found');
    return;
  }

  if (locked) {
    playButton.style.opacity = '0.5';
    playButton.style.pointerEvents = 'none';
    playButton.style.cursor = 'not-allowed';
    playButton.setAttribute('data-locked', 'true');

    const spanElement = playButton.querySelector('span');
    if (spanElement) {
      if (!playButton.getAttribute('data-original-text')) {
        playButton.setAttribute('data-original-text', spanElement.textContent);
      }
      spanElement.textContent = window.i18n ? window.i18n.t('play.checking') : 'CHECKING...';
    }

    console.log('Play button locked');
  } else {
    playButton.style.opacity = '';
    playButton.style.pointerEvents = '';
    playButton.style.cursor = '';
    playButton.removeAttribute('data-locked');

    const spanElement = playButton.querySelector('span');
    if (spanElement) {
      // Use i18n to get the current translation instead of restoring saved text
      spanElement.textContent = window.i18n ? window.i18n.t('play.playButton') : 'PLAY HYTALE';
      playButton.removeAttribute('data-original-text');
    }

    console.log('Play button unlocked');
  }
}



async function acceptFirstLaunchUpdate() {
  const existingGame = window.firstLaunchExistingGame;

  if (!existingGame) {
    const errorMsg = window.i18n ? window.i18n.t('notifications.gameDataNotFound') : 'Error: Game data not found';
    showNotification(errorMsg, 'error');
    return;
  }

  const modal = document.querySelector('.first-launch-modal-overlay');
  if (modal) {
    modal.style.pointerEvents = 'none';
    const btn = document.getElementById('updateGameBtn');
    if (btn) {
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.textContent = '🔄 Updating...';
    }
  }

  try {
    showProgress();
    const updateMsg = window.i18n ? window.i18n.t('progress.startingUpdate') : 'Starting mandatory game update...';
    updateProgress({ message: updateMsg, percent: 0 });

    const result = await window.electronAPI.acceptFirstLaunchUpdate(existingGame);

    window.electronAPI.markAsLaunched && window.electronAPI.markAsLaunched();

    if (modal) {
      modal.remove();
    }

    lockPlayButton(false);

    if (result.success) {
      hideProgress();
      const successMsg = window.i18n ? window.i18n.t('notifications.gameUpdatedSuccess') : 'Game updated successfully! 🎉';
      showNotification(successMsg, 'success');
    } else {
      hideProgress();
      const errorMsg = window.i18n ? window.i18n.t('notifications.updateFailed').replace('{error}', result.error) : `Update failed: ${result.error}`;
      showNotification(errorMsg, 'error');
    }
  } catch (error) {
    if (modal) {
      modal.remove();
    }
    lockPlayButton(false);
    hideProgress();
    const errorMsg = window.i18n ? window.i18n.t('notifications.updateError').replace('{error}', error.message) : `Update error: ${error.message}`;
    showNotification(errorMsg, 'error');
  }
}

function dismissFirstLaunchDialog() {
  const modal = document.querySelector('.first-launch-modal-overlay');
  if (modal) {
    modal.remove();
  }

  lockPlayButton(false);
  window.electronAPI.markAsLaunched && window.electronAPI.markAsLaunched();
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 100);

  setTimeout(() => {
    notification.remove();
  }, 5000);
}

function setupUI() {
  progressOverlay = document.getElementById('progressOverlay');
  progressBar = document.getElementById('progressBar');
  progressBarFill = document.getElementById('progressBarFill');
  progressText = document.getElementById('progressText');
  progressPercent = document.getElementById('progressPercent');
  progressSpeed = document.getElementById('progressSpeed');
  progressSize = document.getElementById('progressSize');
  progressErrorContainer = document.getElementById('progressErrorContainer');
  progressErrorMessage = document.getElementById('progressErrorMessage');
  progressRetryInfo = document.getElementById('progressRetryInfo');
  progressRetryBtn = document.getElementById('progressRetryBtn');
  progressJRRetryBtn = document.getElementById('progressJRRetryBtn');
  progressPWRRetryBtn = document.getElementById('progressPWRRetryBtn');

  // Setup draggable progress bar
  setupProgressDrag();

  // Setup retry button
  setupRetryButton();

  lockPlayButton(true);

  setTimeout(() => {
    const playButton = document.getElementById('homePlayBtn');
    if (playButton && playButton.getAttribute('data-locked') === 'true') {
      const spanElement = playButton.querySelector('span');
      if (spanElement && spanElement.textContent === 'CHECKING...') {
        console.warn('Play button still locked after startup timeout, forcing unlock');
        lockPlayButton(false);
      }
    }
  }, 25000);

  handleNavigation();
  setupWindowControls();
  setupSidebarLogo();
  setupAnimations();
  setupFirstLaunchHandlers();
  loadLauncherVersion();
  checkGameInstallation().catch(err => {
    console.error('Critical error in checkGameInstallation:', err);
    lockPlayButton(false);
  });

  document.body.focus();
}

// Load launcher version from package.json
async function loadLauncherVersion() {
  try {
    if (window.electronAPI && window.electronAPI.getVersion) {
      const version = await window.electronAPI.getVersion();
      const versionElement = document.getElementById('launcherVersion');
      if (versionElement) {
        versionElement.textContent = `v${version}`;
      }
    }
  } catch (error) {
    console.error('Failed to load launcher version:', error);
  }
}

// Check game installation status on startup
async function checkGameInstallation() {
  try {
    console.log('Checking game installation status...');
    
    // Verify electronAPI is available
    if (!window.electronAPI || !window.electronAPI.isGameInstalled) {
      console.error('electronAPI not available, unlocking play button as fallback');
      lockPlayButton(false);
      return;
    }
    
    // Check if game is installed
    const isInstalled = await window.electronAPI.isGameInstalled();
    
    // Load version_client from config
    let versionClient = null;
    if (window.electronAPI.loadVersionClient) {
      versionClient = await window.electronAPI.loadVersionClient();
    }
    
    console.log(`Game installed: ${isInstalled}, version_client: ${versionClient}`);
    
    lockPlayButton(false);
    
    // If version_client is null and game is not installed, show install page
    if (versionClient === null && !isInstalled) {
      console.log('Game not installed and version_client is null, showing install page...');
      
      // Show installation page
      const installPage = document.getElementById('install-page');
      const launcher = document.getElementById('launcher-container');
      const sidebar = document.querySelector('.sidebar');
      
      if (installPage) {
        installPage.style.display = 'block';
        if (launcher) launcher.style.display = 'none';
        if (sidebar) sidebar.style.pointerEvents = 'none';
      }
    }
  } catch (error) {
    console.error('Error checking game installation:', error);
    // Unlock on error to prevent permanent lock
    lockPlayButton(false);
  }
}

window.LauncherUI = {
  showPage,
  setActiveNav,
  showLauncherOrInstall,
  showProgress,
  hideProgress,
  updateProgress
};

// Make installation effects globally available


// Draggable progress bar functionality
function setupProgressDrag() {
  if (!progressOverlay) return;

  let isDragging = false;
  let offsetX;
  let offsetY;

  progressOverlay.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  function dragStart(e) {
    // Only drag if clicking on the overlay itself, not on buttons or inputs
    if (e.target.closest('.progress-bar-fill')) return;
    
    if (e.target === progressOverlay || e.target.closest('.progress-content')) {
      isDragging = true;
      progressOverlay.classList.add('dragging');
      
      // Get the current position of the progress overlay
      const rect = progressOverlay.getBoundingClientRect();
      offsetX = e.clientX - rect.left - progressOverlay.offsetWidth / 2;
      offsetY = e.clientY - rect.top;
    }
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      
      // Calculate new position
      const newX = e.clientX - offsetX - progressOverlay.offsetWidth / 2;
      const newY = e.clientY - offsetY;

      // Get window bounds
      const maxX = window.innerWidth - progressOverlay.offsetWidth;
      const maxY = window.innerHeight - progressOverlay.offsetHeight;
      const minX = 0;
      const minY = 0;

      // Constrain to window bounds
      const constrainedX = Math.max(minX, Math.min(newX, maxX));
      const constrainedY = Math.max(minY, Math.min(newY, maxY));

      progressOverlay.style.left = constrainedX + 'px';
      progressOverlay.style.bottom = 'auto';
      progressOverlay.style.top = constrainedY + 'px';
      progressOverlay.style.transform = 'none';
    }
  }

  function dragEnd() {
    isDragging = false;
    progressOverlay.classList.remove('dragging');
  }
}

// Toggle maximize/restore window function
function toggleMaximize() {
  if (window.electronAPI && window.electronAPI.maximizeWindow) {
    window.electronAPI.maximizeWindow();
  }
}

// Error categorization and user-friendly messages
function categorizeError(message) {
  const msg = message.toLowerCase();
  
  if (msg.includes('network') || msg.includes('connection') || msg.includes('offline')) {
    return 'network';
  } else if (msg.includes('stalled') || msg.includes('timeout')) {
    return 'stall';
  } else if (msg.includes('file') || msg.includes('disk')) {
    return 'file';
  } else if (msg.includes('permission') || msg.includes('access')) {
    return 'permission';
  } else if (msg.includes('server') || msg.includes('5')) {
    return 'server';
  } else if (msg.includes('corrupted') || msg.includes('pwr file') || msg.includes('unexpected eof')) {
    return 'corruption';
  } else if (msg.includes('butler') || msg.includes('patch installation')) {
    return 'butler';
  } else if (msg.includes('space') || msg.includes('full') || msg.includes('device full')) {
    return 'space';
  } else if (msg.includes('conflict') || msg.includes('already exists')) {
    return 'conflict';
  } else if (msg.includes('jre') || msg.includes('java runtime')) {
    return 'jre';
  } else {
    return 'general';
  }
}

function getErrorMessage(technicalMessage, errorType) {
  // Technical errors go to console, user gets friendly messages
  console.error(`Download error [${errorType}]:`, technicalMessage);
  
  switch (errorType) {
    case 'network':
      return 'Network connection lost. Please check your internet connection and retry.';
    case 'stall':
      return 'Download stalled due to slow connection. Please retry.';
    case 'file':
      return 'Unable to save file. Check permissions. Please retry.';
    case 'permission':
      return 'Permission denied. Check if launcher has write access. Please retry.';
    case 'server':
      return 'Server error. Please wait a moment and retry.';
    case 'corruption':
      return 'Corrupted PWR file detected. File deleted and will retry.';
    case 'butler':
      return 'Patch installation failed. Please retry.';
    case 'space':
      return 'Insufficient disk space. Free up space and retry.';
    case 'conflict':
      return 'Installation directory conflict. Please retry.';
    case 'jre':
      return 'Java runtime download failed. Please retry.';
    default:
      return 'Download failed. Please retry.';
  }
}

// Connection quality indicator (simplified)
function updateConnectionQuality(quality) {
  if (!progressSize) return;
  
  const qualityColors = {
    'Good': '#10b981',
    'Fair': '#fbbf24', 
    'Poor': '#f87171'
  };
  
  const color = qualityColors[quality] || '#6b7280';
  progressSize.style.color = color;
  
  // Add subtle quality indicator
  if (progressSize.dataset.quality !== quality) {
    progressSize.dataset.quality = quality;
    progressSize.style.transition = 'color 0.5s ease';
  }
}

// Enhanced retry button setup
function setupRetryButton() {
  // Setup JRE retry button
  if (progressJRRetryBtn) {
    progressJRRetryBtn.addEventListener('click', async () => {
      if (!currentDownloadState.canRetry || currentDownloadState.isDownloading) {
        return;
      }
      progressJRRetryBtn.disabled = true;
      progressJRRetryBtn.textContent = 'Retrying...';
      progressJRRetryBtn.classList.add('retrying');
      currentDownloadState.isDownloading = true;

      try {
        hideDownloadError();
        
        if (progressRetryInfo) {
          progressRetryInfo.style.background = '';
          progressRetryInfo.style.color = '';
        }
        
        if (progressText) {
          progressText.textContent = 'Re-downloading Java runtime...';
        }

        if (!currentDownloadState.retryData || currentDownloadState.errorType !== 'jre') {
          currentDownloadState.retryData = {
            isJREError: true,
            jreUrl: '',
            fileName: 'jre.tar.gz',
            cacheDir: '',
            osName: 'linux',
            arch: 'amd64'
          };
          console.log('[UI] Created default JRE retry data:', currentDownloadState.retryData);
        }

        if (window.electronAPI && window.electronAPI.retryDownload) {
          const result = await window.electronAPI.retryDownload(currentDownloadState.retryData);
          if (!result.success) {
            throw new Error(result.error || 'JRE retry failed');
          }
        } else {
          console.warn('electronAPI.retryDownload not available, simulating JRE retry...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new Error('JRE retry API not available');
        }

      } catch (error) {
        console.error('JRE retry failed:', error);
        showDownloadError(`JRE retry failed: ${error.message}`, true, 'jre');
      } finally {
        if (progressJRRetryBtn) {
          progressJRRetryBtn.disabled = false;
          progressJRRetryBtn.textContent = 'Retry Java Download';
          progressJRRetryBtn.classList.remove('retrying');
        }
        currentDownloadState.isDownloading = false;
      }
    });
  }

  // Setup PWR retry button
  if (progressPWRRetryBtn) {
    progressPWRRetryBtn.addEventListener('click', async () => {
      if (!currentDownloadState.canRetry || currentDownloadState.isDownloading) {
        return;
      }
      progressPWRRetryBtn.disabled = true;
      progressPWRRetryBtn.textContent = 'Retrying...';
      progressPWRRetryBtn.classList.add('retrying');
      currentDownloadState.isDownloading = true;

      try {
        hideDownloadError();
        
        if (progressRetryInfo) {
          progressRetryInfo.style.background = '';
          progressRetryInfo.style.color = '';
        }
        
        if (progressText) {
          const contextMessage = getRetryContextMessage();
          progressText.textContent = contextMessage;
        }

        if (!currentDownloadState.retryData || currentDownloadState.errorType === 'jre') {
          currentDownloadState.retryData = {
            branch: 'release',
            fileName: '7.pwr'
          };
          console.log('[UI] Created default PWR retry data:', currentDownloadState.retryData);
        }

        if (window.electronAPI && window.electronAPI.retryDownload) {
          const result = await window.electronAPI.retryDownload(currentDownloadState.retryData);
          if (!result.success) {
            throw new Error(result.error || 'Game retry failed');
          }
        } else {
          console.warn('electronAPI.retryDownload not available, simulating PWR retry...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new Error('Game retry API not available');
        }

      } catch (error) {
        console.error('PWR retry failed:', error);
        const errorType = categorizeError(error.message);
        showDownloadError(`Game retry failed: ${error.message}`, true, errorType, error);
      } finally {
        if (progressPWRRetryBtn) {
          progressPWRRetryBtn.disabled = false;
          progressPWRRetryBtn.textContent = error && error.isJREError ? 'Retry Java Download' : 'Retry Game Download';
          progressPWRRetryBtn.classList.remove('retrying');
        }
        currentDownloadState.isDownloading = false;
      }
    });
  }

  // Setup generic retry button (fallback)
  if (progressRetryBtn) {
    progressRetryBtn.addEventListener('click', async () => {
      if (!currentDownloadState.canRetry || currentDownloadState.isDownloading) {
        return;
      }
      progressRetryBtn.disabled = true;
      progressRetryBtn.textContent = 'Retrying...';
      progressRetryBtn.classList.add('retrying');
      currentDownloadState.isDownloading = true;

      try {
        hideDownloadError();
        
        if (progressRetryInfo) {
          progressRetryInfo.style.background = '';
          progressRetryInfo.style.color = '';
        }
        
        if (progressText) {
          const contextMessage = getRetryContextMessage();
          progressText.textContent = contextMessage;
        }

        if (!currentDownloadState.retryData) {
          if (currentDownloadState.errorType === 'jre') {
            currentDownloadState.retryData = {
              isJREError: true,
              jreUrl: '',
              fileName: 'jre.tar.gz',
              cacheDir: '',
              osName: 'linux',
              arch: 'amd64'
            };
          } else {
            currentDownloadState.retryData = {
              branch: 'release',
              fileName: '7.pwr'
            };
          }
          console.log('[UI] Created default retry data:', currentDownloadState.retryData);
        }

        if (window.electronAPI && window.electronAPI.retryDownload) {
          const result = await window.electronAPI.retryDownload(currentDownloadState.retryData);
          if (!result.success) {
            throw new Error(result.error || 'Retry failed');
          }
        } else {
          console.warn('electronAPI.retryDownload not available, simulating retry...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new Error('Retry API not available');
        }

      } catch (error) {
        console.error('Retry failed:', error);
        const errorType = categorizeError(error.message);
        showDownloadError(`Retry failed: ${error.message}`, true, errorType);
      } finally {
        if (progressRetryBtn) {
          progressRetryBtn.disabled = false;
          progressRetryBtn.textContent = 'Retry Download';
          progressRetryBtn.classList.remove('retrying');
        }
        currentDownloadState.isDownloading = false;
      }
    });
  }
}

function getRetryContextMessage() {
  const errorType = currentDownloadState.errorType;
  
  switch (errorType) {
    case 'network':
      return 'Reconnecting and retrying download...';
    case 'stall':
      return 'Resuming stalled download...';
    case 'server':
      return 'Waiting for server and retrying...';
    case 'corruption':
      return 'Re-downloading corrupted PWR file...';
    case 'butler':
      return 'Re-attempting patch installation...';
    case 'space':
      return 'Retrying after clearing disk space...';
    case 'permission':
      return 'Retrying with corrected permissions...';
    case 'conflict':
      return 'Retrying after resolving conflicts...';
    case 'jre':
      return 'Re-downloading Java runtime...';
    default:
      return 'Initiating retry download...';
  }
}

window.openDiscordExternal = function() {
  window.electronAPI?.openExternal('https://discord.gg/hf2pdc');
};

window.toggleMaximize = toggleMaximize;

document.addEventListener('DOMContentLoaded', setupUI);
