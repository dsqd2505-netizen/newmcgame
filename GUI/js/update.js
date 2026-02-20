
class ClientUpdateManager {
    constructor() {
        this.updatePopupVisible = false;
        this.init();
    }

    init() {
        console.log('🔧 ClientUpdateManager initializing...');

        // Listen for electron-updater events from main.js
        // This is the primary update trigger - main.js checks for updates on startup
        window.electronAPI.onUpdateAvailable((updateInfo) => {
            console.log('📥 update-available event received:', updateInfo);
            this.showUpdatePopup(updateInfo);
        });

        window.electronAPI.onUpdateDownloadProgress((progress) => {
            this.updateDownloadProgress(progress);
        });

        window.electronAPI.onUpdateDownloaded((updateInfo) => {
            console.log('📦 update-downloaded event received:', updateInfo);
            this.showUpdateDownloaded(updateInfo);
        });

        window.electronAPI.onUpdateError((errorInfo) => {
            console.log('❌ update-error event received:', errorInfo);
            this.handleUpdateError(errorInfo);
        });

        console.log('✅ ClientUpdateManager initialized');

        // Note: Don't call checkForUpdatesOnDemand() here - main.js already checks
        // for updates after 3 seconds and sends 'update-available' event.
        // Calling it here would cause duplicate popups.
    }

    showUpdatePopup(updateInfo) {
        console.log('🔔 showUpdatePopup called, updatePopupVisible:', this.updatePopupVisible);

        // Check if popup already exists in DOM (extra safety)
        if (this.updatePopupVisible || document.getElementById('update-popup-overlay')) {
            console.log('⚠️ Update popup already visible, skipping');
            return;
        }

        this.updatePopupVisible = true;
        
        const popupHTML = `
            <div id="update-popup-overlay">
                <div class="update-popup-container update-popup-pulse">
                    <div class="update-popup-header">
                        <div class="update-popup-icon">
                            <i class="fas fa-download"></i>
                        </div>
                        <h2 class="update-popup-title">
                            NEW UPDATE AVAILABLE
                        </h2>
                    </div>

                    <div class="update-popup-versions">
                        <div class="version-row">
                            <span class="version-label">Current Version:</span>
                            <span class="version-current">${updateInfo.currentVersion || updateInfo.version || 'Unknown'}</span>
                        </div>
                        <div class="version-row">
                            <span class="version-label">New Version:</span>
                            <span class="version-new">${updateInfo.newVersion || updateInfo.version || 'Unknown'}</span>
                        </div>
                    </div>

                    <div class="update-popup-message">
                        A new version of Hytale F2P Launcher is available.<br>
                        <span id="update-status-text">Downloading update automatically...</span>
                        <div id="update-error-message" style="display: none; margin-top: 0.75rem; padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 0.5rem; color: #fca5a5; font-size: 0.875rem;">
                            <i class="fas fa-exclamation-triangle" style="margin-right: 0.5rem;"></i>
                            <span id="update-error-text"></span>
                        </div>
                    </div>

                    <div id="update-progress-container" style="display: none; margin-bottom: 1rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.75rem; color: #9ca3af;">
                            <span id="update-progress-percent">0%</span>
                            <span id="update-progress-speed">0 KB/s</span>
                        </div>
                        <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden;">
                            <div id="update-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #9333ea); transition: width 0.3s ease;"></div>
                        </div>
                        <div style="margin-top: 0.5rem; font-size: 0.75rem; color: #9ca3af; text-align: center;">
                            <span id="update-progress-size">0 MB / 0 MB</span>
                        </div>
                    </div>

                    <div id="update-buttons-container" style="display: none;">
                        <button id="update-install-btn" class="update-download-btn">
                            <i class="fas fa-check" style="margin-right: 0.5rem;"></i>
                            Install & Restart
                        </button>
                        <button id="update-download-btn" class="update-download-btn update-download-btn-secondary" style="margin-top: 0.75rem;">
                            <i class="fas fa-external-link-alt" style="margin-right: 0.5rem;"></i>
                            Manually Download
                        </button>
                    </div>

                    <div class="update-popup-footer">
                        <span id="update-footer-text">Downloading update...</span>
                        <button id="update-skip-btn" class="update-skip-btn" style="display: none; margin-top: 0.5rem; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #9ca3af; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;">
                            Skip for now (not recommended)
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', popupHTML);

        this.blockInterface();

        // Show progress container immediately (auto-download is enabled)
        const progressContainer = document.getElementById('update-progress-container');
        if (progressContainer) {
            progressContainer.style.display = 'block';
        }

        const installBtn = document.getElementById('update-install-btn');
        if (installBtn) {
            installBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                installBtn.disabled = true;
                installBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 0.5rem;"></i>Installing...';

                try {
                    await window.electronAPI.quitAndInstallUpdate();

                    // If we're still here after 5 seconds, the install probably failed
                    setTimeout(() => {
                        console.log('⚠️ Install may have failed - showing skip option');
                        installBtn.disabled = false;
                        installBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 0.5rem;"></i>Try Again';

                        // Show skip button
                        const skipBtn = document.getElementById('update-skip-btn');
                        const footerText = document.getElementById('update-footer-text');
                        if (skipBtn) {
                            skipBtn.style.display = 'inline-block';
                            if (footerText) {
                                footerText.textContent = 'Install not working? Skip for now:';
                            }
                        }
                    }, 5000);
                } catch (error) {
                    console.error('❌ Error installing update:', error);
                    installBtn.disabled = false;
                    installBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 0.5rem;"></i>Install & Restart';

                    // Show skip button on error
                    const skipBtn = document.getElementById('update-skip-btn');
                    const footerText = document.getElementById('update-footer-text');
                    if (skipBtn) {
                        skipBtn.style.display = 'inline-block';
                        if (footerText) {
                            footerText.textContent = 'Install failed. Skip for now:';
                        }
                    }
                }
            });
        }

        const downloadBtn = document.getElementById('update-download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                downloadBtn.disabled = true;
                downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 0.5rem;"></i>Opening GitHub...';
                
                try {
                    await window.electronAPI.openDownloadPage();
                    console.log('✅ Download page opened');

                    downloadBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 0.5rem;"></i>Opened in browser';

                    // Close the popup after opening download page
                    setTimeout(() => {
                        this.closeUpdatePopup();
                    }, 1500);

                } catch (error) {
                    console.error('❌ Error opening download page:', error);
                    downloadBtn.disabled = false;
                    downloadBtn.innerHTML = '<i class="fas fa-external-link-alt" style="margin-right: 0.5rem;"></i>Manually Download';
                }
            });
        }

        const overlay = document.getElementById('update-popup-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            });
        }

        // Show skip button after 30 seconds as fallback (in case update is stuck)
        setTimeout(() => {
            const skipBtn = document.getElementById('update-skip-btn');
            const footerText = document.getElementById('update-footer-text');
            if (skipBtn) {
                skipBtn.style.display = 'inline-block';
                if (footerText) {
                    footerText.textContent = 'Update taking too long?';
                }
            }
        }, 30000);

        const skipBtn = document.getElementById('update-skip-btn');
        if (skipBtn) {
            skipBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeUpdatePopup();
            });
        }

        console.log('🔔 Update popup displayed with new style');
    }

    closeUpdatePopup() {
        const overlay = document.getElementById('update-popup-overlay');
        if (overlay) {
            overlay.remove();
        }
        this.updatePopupVisible = false;
        this.unblockInterface();
    }

    updateDownloadProgress(progress) {
        const progressBar = document.getElementById('update-progress-bar');
        const progressPercent = document.getElementById('update-progress-percent');
        const progressSpeed = document.getElementById('update-progress-speed');
        const progressSize = document.getElementById('update-progress-size');

        if (progressBar && progress) {
            const percent = Math.round(progress.percent || 0);
            progressBar.style.width = `${percent}%`;
            
            if (progressPercent) {
                progressPercent.textContent = `${percent}%`;
            }

            if (progressSpeed && progress.bytesPerSecond) {
                const speedMBps = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
                progressSpeed.textContent = `${speedMBps} MB/s`;
            }

            if (progressSize && progress.transferred && progress.total) {
                const transferredMB = (progress.transferred / 1024 / 1024).toFixed(2);
                const totalMB = (progress.total / 1024 / 1024).toFixed(2);
                progressSize.textContent = `${transferredMB} MB / ${totalMB} MB`;
            }

            // Don't update status text here - it's already set and the progress bar shows the percentage
        }
    }

    showUpdateDownloaded(updateInfo) {
        const statusText = document.getElementById('update-status-text');
        const progressContainer = document.getElementById('update-progress-container');
        const buttonsContainer = document.getElementById('update-buttons-container');
        const installBtn = document.getElementById('update-install-btn');
        const downloadBtn = document.getElementById('update-download-btn');
        const skipBtn = document.getElementById('update-skip-btn');
        const footerText = document.getElementById('update-footer-text');
        const popupContainer = document.querySelector('.update-popup-container');

        // Remove breathing/pulse animation when download is complete
        if (popupContainer) {
            popupContainer.classList.remove('update-popup-pulse');
        }

        if (progressContainer) {
            progressContainer.style.display = 'none';
        }

        // Use platform info from main process if available, fallback to browser detection
        const autoInstallSupported = updateInfo.autoInstallSupported !== undefined
            ? updateInfo.autoInstallSupported
            : navigator.platform.toUpperCase().indexOf('MAC') < 0;

        if (!autoInstallSupported) {
            // macOS: Show manual download as primary since auto-update doesn't work
            if (statusText) {
                statusText.textContent = 'Update downloaded but auto-install may not work on macOS.';
            }

            if (installBtn) {
                // Still show install button but as secondary option
                installBtn.classList.add('update-download-btn-secondary');
                installBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 0.5rem;"></i>Try Install & Restart';
            }

            if (downloadBtn) {
                // Make manual download primary
                downloadBtn.classList.remove('update-download-btn-secondary');
                downloadBtn.innerHTML = '<i class="fas fa-external-link-alt" style="margin-right: 0.5rem;"></i>Download Manually (Recommended)';
            }

            if (footerText) {
                footerText.textContent = 'Auto-install often fails on macOS:';
            }
        } else {
            // Windows/Linux: Auto-install should work
            if (statusText) {
                statusText.textContent = 'Update downloaded! Ready to install.';
            }

            if (footerText) {
                footerText.textContent = 'Click to install the update:';
            }
        }

        if (buttonsContainer) {
            buttonsContainer.style.display = 'block';
        }

        // Always show skip button in downloaded state
        if (skipBtn) {
            skipBtn.style.display = 'inline-block';
            console.log('✅ Skip button made visible');
        } else {
            console.error('❌ Skip button not found in DOM!');
        }

        console.log('✅ Update downloaded, ready to install. autoInstallSupported:', autoInstallSupported);
    }

    handleUpdateError(errorInfo) {
        console.error('Update error:', errorInfo);

        // Show skip button immediately on any error
        const skipBtn = document.getElementById('update-skip-btn');
        const footerText = document.getElementById('update-footer-text');
        if (skipBtn) {
            skipBtn.style.display = 'inline-block';
            if (footerText) {
                footerText.textContent = 'Update failed. You can skip for now.';
            }
        }

        // If manual download is required, update the UI (this will handle status text)
        if (errorInfo.requiresManualDownload) {
            this.showManualDownloadRequired(errorInfo);
            return; // Don't do anything else, showManualDownloadRequired handles everything
        }

        // For non-critical errors, just show error message without changing status
        const errorMessage = document.getElementById('update-error-message');
        const errorText = document.getElementById('update-error-text');

        if (errorMessage && errorText) {
            let message = errorInfo.message || 'An error occurred during the update process.';
            if (errorInfo.isMacSigningError) {
                message = 'Auto-update requires code signing. Please download manually.';
            }
            errorText.textContent = message;
            errorMessage.style.display = 'block';
        }
    }

    showManualDownloadRequired(errorInfo) {
        const statusText = document.getElementById('update-status-text');
        const progressContainer = document.getElementById('update-progress-container');
        const buttonsContainer = document.getElementById('update-buttons-container');
        const installBtn = document.getElementById('update-install-btn');
        const downloadBtn = document.getElementById('update-download-btn');
        const errorMessage = document.getElementById('update-error-message');
        const errorText = document.getElementById('update-error-text');

        // Hide progress and install button
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }

        if (installBtn) {
            installBtn.style.display = 'none';
        }

        // Update status message (only once, don't change it again)
        if (statusText && !statusText.dataset.manualMode) {
            statusText.textContent = 'Please download and install the update manually.';
            statusText.dataset.manualMode = 'true'; // Mark that we've set manual mode
        }

        // Show error message with details
        if (errorMessage && errorText) {
            let message = 'Auto-update is not available. ';
            if (errorInfo.isMacSigningError) {
                message = 'This app requires code signing for automatic updates.';
            } else if (errorInfo.isLinuxInstallError) {
                message = 'Auto-installation requires root privileges. Please download and install the update manually using your package manager.';
            } else if (errorInfo.message) {
                message = errorInfo.message;
            } else {
                message = 'An error occurred during the update process.';
            }
            errorText.textContent = message;
            errorMessage.style.display = 'block';
        }

        // Show and enable the manual download button (make it primary since it's the only option)
        if (downloadBtn) {
            downloadBtn.style.display = 'block';
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('update-download-btn-secondary');
            downloadBtn.innerHTML = '<i class="fas fa-external-link-alt" style="margin-right: 0.5rem;"></i>Download Update Manually';
        }

        // Show buttons container if not already visible
        if (buttonsContainer) {
            buttonsContainer.style.display = 'block';
        }

        // Show skip button for manual download errors
        const skipBtn = document.getElementById('update-skip-btn');
        const footerText = document.getElementById('update-footer-text');
        if (skipBtn) {
            skipBtn.style.display = 'inline-block';
            if (footerText) {
                footerText.textContent = 'Or continue without updating:';
            }
        }

        console.log('⚠️ Manual download required due to update error');
    }

    blockInterface() {
        const mainContent = document.querySelector('.flex.w-full.h-screen');
        if (mainContent) {
            mainContent.classList.add('interface-blocked');
        }

        document.body.classList.add('no-select');

        // Store bound functions so we can remove them later
        this._boundBlockKeyEvents = this.blockKeyEvents.bind(this);
        this._boundBlockContextMenu = this.blockContextMenu.bind(this);

        document.addEventListener('keydown', this._boundBlockKeyEvents, true);
        document.addEventListener('contextmenu', this._boundBlockContextMenu, true);

        console.log('🚫 Interface blocked for update');
    }

    unblockInterface() {
        const mainContent = document.querySelector('.flex.w-full.h-screen');
        if (mainContent) {
            mainContent.classList.remove('interface-blocked');
        }

        document.body.classList.remove('no-select');

        // Remove event listeners
        if (this._boundBlockKeyEvents) {
            document.removeEventListener('keydown', this._boundBlockKeyEvents, true);
        }
        if (this._boundBlockContextMenu) {
            document.removeEventListener('contextmenu', this._boundBlockContextMenu, true);
        }

        console.log('✅ Interface unblocked');
    }

    blockKeyEvents(event) {
        if (event.target.closest('#update-popup-overlay')) {
            if ((event.key === 'Enter' || event.key === ' ') && 
                event.target.id === 'update-download-btn') {
                return;
            }
            if (event.key !== 'Tab') {
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
    }

    blockContextMenu(event) {
        if (!event.target.closest('#update-popup-overlay')) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }

    async checkForUpdatesOnDemand() {
        try {
            const updateInfo = await window.electronAPI.checkForUpdates();
            
            // Double-check that versions are actually different before showing popup
            if (updateInfo.updateAvailable && 
                updateInfo.newVersion && 
                updateInfo.currentVersion &&
                updateInfo.newVersion !== updateInfo.currentVersion) {
                this.showUpdatePopup(updateInfo);
            }
            return updateInfo;
        } catch (error) {
            console.error('Error checking for updates:', error);
            return { updateAvailable: false, error: error.message };
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.updateManager = new ClientUpdateManager();
});

window.ClientUpdateManager = ClientUpdateManager;