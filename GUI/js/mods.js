
let API_KEY = "$2a$10$bqk254NMZOWVTzLVJCcxEOmhcyUujKxA5xk.kQCN9q0KNYFJd5b32";
const CURSEFORGE_API = 'https://api.curseforge.com/v1';
const HYTALE_GAME_ID = 70216;

let installedMods = [];
let browseMods = [];
let searchQuery = '';
let modsPage = 0;
let modsPageSize = 20;
let modsTotalPages = 1;

export async function initModsManager() {
  try {
    if (window.electronAPI && window.electronAPI.getEnvVar) {
      console.log('Loaded API Key:', API_KEY ? 'Yes' : 'No');
    }
  } catch (err) {
    console.error('Failed to load API Key:', err);
  }

  setupModsEventListeners();
  await loadInstalledMods();
  await loadBrowseMods();
}

function setupModsEventListeners() {
  const searchInput = document.getElementById('modsSearch');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        modsPage = 0;
        loadBrowseMods();
      }, 500);
    });
  }

  const myModsBtn = document.getElementById('myModsBtn');
  if (myModsBtn) {
    myModsBtn.addEventListener('click', openMyModsModal);
  }

  const closeModalBtn = document.getElementById('closeMyModsModal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeMyModsModal);
  }

  const modal = document.getElementById('myModsModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeMyModsModal();
      }
    });
  }

  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (modsPage > 0) {
        modsPage--;
        loadBrowseMods();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      if (modsPage < modsTotalPages - 1) {
        modsPage++;
        loadBrowseMods();
      }
    });
  }
}

function openMyModsModal() {
  const modal = document.getElementById('myModsModal');
  if (modal) {
    modal.classList.add('active');
    loadInstalledMods();
  }
}

function closeMyModsModal() {
  const modal = document.getElementById('myModsModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

async function loadInstalledMods() {
  try {
    const modsPath = await window.electronAPI?.getModsPath();
    if (!modsPath) {
      showInstalledModsError('Could not get mods directory');
      return;
    }

    const mods = await window.electronAPI?.loadInstalledMods(modsPath);
    installedMods = mods || [];

    displayInstalledMods(installedMods);
  } catch (error) {
    console.error('Error loading installed mods:', error);
    showInstalledModsError('Failed to load installed mods');
  }
}

function displayInstalledMods(mods) {
  const modsContainer = document.getElementById('installedModsList');
  if (!modsContainer) return;

  if (mods.length === 0) {
    modsContainer.innerHTML = `
      <div class=\"empty-installed-mods\">
        <i class=\"fas fa-box-open\"></i>
        <h4 data-i18n="mods.noModsInstalled">No Mods Installed</h4>
        <p data-i18n="mods.noModsInstalledDesc">Add mods from CurseForge or import local files</p>
      </div>
    `;
    if (window.i18n) {
      const container = modsContainer.querySelector('.empty-installed-mods');
      container.querySelector('h4').textContent = window.i18n.t('mods.noModsInstalled');
      container.querySelector('p').textContent = window.i18n.t('mods.noModsInstalledDesc');
    }
    return;
  }

  modsContainer.innerHTML = mods.map(mod => createInstalledModCard(mod)).join('');

  mods.forEach(mod => {
    const toggleBtn = document.getElementById(`toggle-installed-${mod.id}`);
    const deleteBtn = document.getElementById(`delete-installed-${mod.id}`);

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => toggleMod(mod.id));
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteMod(mod.id));
    }
  });
}

function createInstalledModCard(mod) {
  const statusClass = mod.enabled ? 'text-primary' : 'text-zinc-500';
  const statusText = mod.enabled ? (window.i18n ? window.i18n.t('mods.active') : 'ACTIVE') : (window.i18n ? window.i18n.t('mods.disabled') : 'DISABLED');
  const toggleBtnClass = mod.enabled ? 'btn-disable' : 'btn-enable';
  const toggleBtnText = mod.enabled ? (window.i18n ? window.i18n.t('mods.disable') : 'DISABLE') : (window.i18n ? window.i18n.t('mods.enable') : 'ENABLE');
  const toggleIcon = mod.enabled ? 'fa-pause' : 'fa-play';

  return `
    <div class="installed-mod-card" data-mod-id="${mod.id}">
      <div class="installed-mod-icon">
        <i class="fas fa-cube"></i>
      </div>
      
      <div class="installed-mod-info">
        <div class="installed-mod-header">
          <h4 class="installed-mod-name">${mod.name}</h4>
          <span class="installed-mod-version">v${mod.version}</span>
        </div>
        <p class="installed-mod-description">${mod.description || (window.i18n ? window.i18n.t('mods.noDescription') : 'No description available')}</p>
      </div>
      
      <div class="installed-mod-actions">
        <div class="installed-mod-status ${statusClass}">
          <i class="fas fa-circle"></i>
          ${statusText}
        </div>
        <div class="installed-mod-buttons">
          <button id="delete-installed-${mod.id}" class="installed-mod-btn-icon" title="${window.i18n ? window.i18n.t('mods.delete') : 'Delete mod'}">
            <i class="fas fa-trash"></i>
          </button>
          <button id="toggle-installed-${mod.id}" class="installed-mod-btn-toggle ${toggleBtnClass}">
            <i class="fas ${toggleIcon}"></i>
            ${toggleBtnText}
          </button>
        </div>
      </div>
    </div>
  `;
}

async function loadBrowseMods() {
  const browseContainer = document.getElementById('browseModsList');
  if (!browseContainer) return;

  browseContainer.innerHTML = `<div class="loading-mods"><div class="loading-spinner"></div><span>${window.i18n ? window.i18n.t('mods.loadingMods') : 'Loading mods from CurseForge...'}</span></div>`;

  try {
    if (!API_KEY || API_KEY.length < 10) {
      browseContainer.innerHTML = `
        <div class=\"empty-browse-mods\">
          <i class=\"fas fa-key\"></i>
          <h4 data-i18n="mods.apiKeyRequired">API Key Required</h4>
          <p data-i18n="mods.apiKeyRequiredDesc">CurseForge API key is needed to browse mods</p>
        </div>
      `;
      if (window.i18n) {
        const container = modsContainer.querySelector('.empty-browse-mods');
        container.querySelector('h4').textContent = window.i18n.t('mods.apiKeyRequired');
        container.querySelector('p').textContent = window.i18n.t('mods.apiKeyRequiredDesc');
      }
      return;
    }

    const offset = modsPage * modsPageSize;
    let url = `${CURSEFORGE_API}/mods/search?gameId=${HYTALE_GAME_ID}&pageSize=${modsPageSize}&sortOrder=desc&sortField=6&index=${offset}`;

    if (searchQuery && searchQuery.length > 0) {
      url += `&searchFilter=${encodeURIComponent(searchQuery)}`;
    }

    console.log('Fetching mods from page', modsPage + 1, 'offset:', offset, 'search:', searchQuery || 'none', 'URL:', url);

    const response = await fetch(url, {
      headers: {
        'x-api-key': API_KEY,
        'Accept': 'application/json'
      }
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`CurseForge API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API Response data:', data);
    console.log('Total mods found:', data.data?.length || 0);

    browseMods = (data.data || []).map(mod => ({
      id: mod.id.toString(),
      name: mod.name,
      slug: mod.slug,
      summary: mod.summary || 'No description available',
      downloadCount: mod.downloadCount || 0,
      author: mod.authors?.[0]?.name || 'Unknown',
      version: mod.latestFiles?.[0]?.displayName || 'Unknown',
      thumbnailUrl: mod.logo?.thumbnailUrl || null,
      websiteUrl: mod.links?.websiteUrl || null,
      modId: mod.id,
      fileId: mod.latestFiles?.[0]?.id,
      fileName: mod.latestFiles?.[0]?.fileName,
      downloadUrl: mod.latestFiles?.[0]?.downloadUrl
    }));

    console.log('Processed mods:', browseMods.length);

    modsTotalPages = Math.ceil((data.pagination?.totalCount || 1) / modsPageSize);
    displayBrowseMods(browseMods);
    updatePagination();
  } catch (error) {
    console.error('Error loading browse mods:', error);
    browseContainer.innerHTML = `
      <div class=\"empty-browse-mods error\">
        <i class=\"fas fa-exclamation-triangle\"></i>
        <h4>API Error</h4>
        <p>Failed to load mods from CurseForge</p>
        <small>${error.message}</small>
      </div>
    `;
  }
}

function displayBrowseMods(mods) {
  const browseContainer = document.getElementById('browseModsList');
  if (!browseContainer) return;

  if (mods.length === 0) {
    browseContainer.innerHTML = `
      <div class=\"empty-browse-mods\">
        <i class=\"fas fa-search\"></i>
        <h4 data-i18n="mods.noModsFound">No Mods Found</h4>
        <p data-i18n="mods.noModsFoundDesc">Try adjusting your search</p>
      </div>
    `;
    if (window.i18n) {
      const container = browseContainer.querySelector('.empty-browse-mods');
      container.querySelector('h4').textContent = window.i18n.t('mods.noModsFound');
      container.querySelector('p').textContent = window.i18n.t('mods.noModsFoundDesc');
    }
    return;
  }

  browseContainer.innerHTML = mods.map(mod => createBrowseModCard(mod)).join('');

  mods.forEach(mod => {
    const installBtn = document.getElementById(`install-${mod.id}`);
    if (installBtn) {
      installBtn.addEventListener('click', () => downloadAndInstallMod(mod));
    }
  });
}

function createBrowseModCard(mod) {
  const isInstalled = installedMods.some(installed => {
    // Check by CurseForge ID (most reliable)
    if (installed.curseForgeId && installed.curseForgeId.toString() === mod.id.toString()) {
      return true;
    }
    // Check by exact name match for manually installed mods
    if (installed.name.toLowerCase() === mod.name.toLowerCase()) {
      return true;
    }
    return false;
  });

  return `
    <div class=\"mod-card ${isInstalled ? 'installed' : ''}\" data-mod-id=\"${mod.id}\">
      <div class=\"mod-image\">
        ${mod.thumbnailUrl ?
      `<img src=\"${mod.thumbnailUrl}\" alt=\"${mod.name}\" onerror=\"this.parentElement.innerHTML='<i class=\\\"fas fa-puzzle-piece\\\"></i>'\">` :
      `<i class=\"fas fa-puzzle-piece\"></i>`
    }
      </div>
      
      <div class=\"mod-info\">
        <div class=\"mod-header\">
          <h3 class=\"mod-name\">${mod.name}</h3>
          <span class=\"mod-version\">${mod.version}</span>
        </div>
        <p class=\"mod-description\">${mod.summary}</p>
        <div class=\"mod-meta\">
          <span class=\"mod-meta-item\">
            <i class=\"fas fa-user\"></i>
            ${mod.author}
          </span>
          <span class=\"mod-meta-item\">
            <i class=\"fas fa-download\"></i>
            ${formatNumber(mod.downloadCount)}
          </span>
        </div>
      </div>
      
      <div class=\"mod-actions\">
        <button id=\"view-${mod.id}\" class=\"mod-btn-toggle bg-blue-600 text-white hover:bg-blue-700\" onclick=\"window.modsManager.viewModPage(${mod.id})\">
          <i class=\"fas fa-external-link-alt\"></i>
          ${window.i18n ? window.i18n.t('mods.view') : 'VIEW'}
        </button>
        ${!isInstalled ?
      `<button id="install-${mod.id}" class="mod-btn-toggle bg-primary text-black hover:bg-primary/80">
            <i class="fas fa-download"></i>
            ${window.i18n ? window.i18n.t('mods.install') : 'INSTALL'}
          </button>` :
      `<button class="mod-btn-toggle bg-white/10 text-white" disabled>
            <i class="fas fa-check"></i>
            ${window.i18n ? window.i18n.t('mods.installed') : 'INSTALLED'}
          </button>`
    }
      </div>
    </div>
  `;
}

async function downloadAndInstallMod(modInfo) {
  try {
    const downloadMsg = window.i18n ? window.i18n.t('notifications.modsDownloading').replace('{name}', modInfo.name) : `Downloading ${modInfo.name}...`;
    window.LauncherUI?.showProgress(downloadMsg);

    const result = await window.electronAPI?.downloadMod(modInfo);

    if (result?.success) {
      const newMod = {
        id: result.modInfo.id,
        name: modInfo.name,
        version: modInfo.version,
        description: modInfo.summary,
        author: modInfo.author,
        enabled: true,
        fileName: result.fileName,
        fileSize: result.modInfo.fileSize,
        dateInstalled: new Date().toISOString(),
        curseForgeId: modInfo.modId,
        curseForgeFileId: modInfo.fileId
      };

      installedMods.push(newMod);

      await loadInstalledMods();
      await loadBrowseMods();
      window.LauncherUI?.hideProgress();
      const successMsg = window.i18n ? window.i18n.t('notifications.modsInstalledSuccess').replace('{name}', modInfo.name) : `${modInfo.name} installed successfully! 🎉`;
      showNotification(successMsg, 'success');
    } else {
      throw new Error(result?.error || 'Failed to download mod');
    }
  } catch (error) {
    console.error('Error downloading mod:', error);
    window.LauncherUI?.hideProgress();
    const errorMsg = window.i18n ? window.i18n.t('notifications.modsDownloadFailed').replace('{error}', error.message) : 'Failed to download mod: ' + error.message;
    showNotification(errorMsg, 'error');
  }
}

async function toggleMod(modId) {
  try {
    const toggleMsg = window.i18n ? window.i18n.t('notifications.modsTogglingMod') : 'Toggling mod...';
    window.LauncherUI?.showProgress(toggleMsg);

    const modsPath = await window.electronAPI?.getModsPath();
    const result = await window.electronAPI?.toggleMod(modId, modsPath);

    if (result?.success) {
      await loadInstalledMods();
      window.LauncherUI?.hideProgress();
    } else {
      throw new Error(result?.error || 'Failed to toggle mod');
    }
  } catch (error) {
    console.error('Error toggling mod:', error);
    window.LauncherUI?.hideProgress();
    const errorMsg = window.i18n ? window.i18n.t('notifications.modsToggleFailed').replace('{error}', error.message) : 'Failed to toggle mod: ' + error.message;
    showNotification(errorMsg, 'error');
  }
}

async function deleteMod(modId) {
  const mod = installedMods.find(m => m.id === modId);
  if (!mod) return;

  const confirmMsg = window.i18n ?
    window.i18n.t('mods.confirmDelete').replace('{name}', mod.name) + ' ' + window.i18n.t('mods.confirmDeleteDesc') :
    `Are you sure you want to delete "${mod.name}"? This action cannot be undone.`;

  showConfirmModal(
    confirmMsg,
    async () => {
      try {
        const deleteMsg = window.i18n ? window.i18n.t('notifications.modsDeletingMod') : 'Deleting mod...';
        window.LauncherUI?.showProgress(deleteMsg);

        const modsPath = await window.electronAPI?.getModsPath();
        const result = await window.electronAPI?.uninstallMod(modId, modsPath);

        if (result?.success) {
          await loadInstalledMods();
          await loadBrowseMods();
          window.LauncherUI?.hideProgress();
          const successMsg = window.i18n ? window.i18n.t('notifications.modsDeletedSuccess').replace('{name}', mod.name) : `"${mod.name}" deleted successfully`;
          showNotification(successMsg, 'success');
        } else {
          throw new Error(result?.error || 'Failed to delete mod');
        }
      } catch (error) {
        console.error('Error deleting mod:', error);
        window.LauncherUI?.hideProgress();
        const errorMsg = window.i18n ? window.i18n.t('notifications.modsDeleteFailed').replace('{error}', error.message) : 'Failed to delete mod: ' + error.message;
        showNotification(errorMsg, 'error');
      }
    }
  );
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function showNotification(message, type = 'info', duration = 4000) {
  const existing = document.querySelector(`.mod-notification.${type}`);
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.className = `mod-notification ${type}`;

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle'
  };

  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6',
    warning: '#f59e0b'
  };

  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas ${icons[type]}"></i>
      <span>${message}</span>
    </div>
    <button class="notification-close" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type]};
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    min-width: 300px;
    max-width: 400px;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    font-weight: 500;
  `;

  const contentStyle = `
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  `;

  const closeStyle = `
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    opacity: 0.8;
    transition: opacity 0.2s;
    margin-left: 10px;
  `;

  notification.querySelector('.notification-content').style.cssText = contentStyle;
  notification.querySelector('.notification-close').style.cssText = closeStyle;

  document.body.appendChild(notification);

  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 10);

  // Auto remove
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }
  }, duration);
}

function showConfirmModal(message, onConfirm, onCancel = null) {
  const existingModal = document.querySelector('.mod-confirm-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.className = 'mod-confirm-modal';
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
  dialog.className = 'mod-confirm-dialog';
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
        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600;">${window.i18n ? window.i18n.t('mods.confirmDeletion') : 'Confirm Deletion'}</h3>
      </div>
    </div>
    <div style="padding: 24px; color: #e5e7eb;">
      <p style="margin: 0; line-height: 1.5; font-size: 1rem;">${message}</p>
    </div>
    <div style="padding: 20px 24px; display: flex; gap: 12px; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1);">
      <button class="mod-confirm-cancel" style="
        background: transparent;
        color: #9ca3af;
        border: 1px solid rgba(156, 163, 175, 0.3);
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      ">${window.i18n ? window.i18n.t('common.cancel') : 'Cancel'}</button>
      <button class="mod-confirm-delete" style="
        background: #ef4444;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      ">${window.i18n ? window.i18n.t('common.delete') : 'Delete'}</button>
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
  const cancelBtn = dialog.querySelector('.mod-confirm-cancel');
  const deleteBtn = dialog.querySelector('.mod-confirm-delete');

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

  deleteBtn.onclick = () => {
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

function updatePagination() {
  const currentPageEl = document.getElementById('currentPage');
  const totalPagesEl = document.getElementById('totalPages');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');

  if (currentPageEl) currentPageEl.textContent = modsPage + 1;
  if (totalPagesEl) totalPagesEl.textContent = modsTotalPages;

  if (prevBtn) {
    prevBtn.disabled = modsPage === 0;
    prevBtn.style.opacity = modsPage === 0 ? '0.5' : '1';
    prevBtn.style.cursor = modsPage === 0 ? 'not-allowed' : 'pointer';
  }

  if (nextBtn) {
    nextBtn.disabled = modsPage >= modsTotalPages - 1;
    nextBtn.style.opacity = modsPage >= modsTotalPages - 1 ? '0.5' : '1';
    nextBtn.style.cursor = modsPage >= modsTotalPages - 1 ? 'not-allowed' : 'pointer';
  }
}

function showInstalledModsError(message) {
  const modsContainer = document.getElementById('installedModsList');
  if (!modsContainer) return;

  modsContainer.innerHTML = `
    <div class=\"empty-installed-mods error\">
      <i class=\"fas fa-exclamation-triangle\"></i>
      <h4>Error</h4>
      <p>${message}</p>
    </div>
  `;
}

function viewModPage(modId) {
  console.log('Looking for mod with ID:', modId, 'Type:', typeof modId);
  console.log('Available mods:', browseMods.map(m => ({ id: m.id, name: m.name, type: typeof m.id })));

  const mod = browseMods.find(m => m.id.toString() === modId.toString());
  if (mod) {
    console.log('Found mod:', mod.name);
    let modUrl;
    if (mod.websiteUrl && mod.websiteUrl.includes('curseforge.com')) {
      modUrl = mod.websiteUrl;
    } else if (mod.slug) {
      modUrl = `https://www.curseforge.com/hytale/mods/${mod.slug}`;
    } else {
      const nameSlug = mod.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      modUrl = `https://www.curseforge.com/hytale/mods/${nameSlug}`;
    }

    console.log('Opening URL:', modUrl);

    if (window.electronAPI && window.electronAPI.openExternalLink) {
      window.electronAPI.openExternalLink(modUrl);
    } else {
      if (window.electronAPI && window.electronAPI.shell) {
        window.electronAPI.shell.openExternal(modUrl);
      } else {
        window.open(modUrl, '_blank');
      }
    }
  } else {
    console.error('Mod not found with ID:', modId);
    const errorMsg = window.i18n ? window.i18n.t('notifications.modsModNotFound') : 'Mod information not found';
    showNotification(errorMsg, 'error');
  }
}

window.modsManager = {
  toggleMod,
  deleteMod,
  openMyModsModal,
  closeMyModsModal,
  viewModPage,
  loadInstalledMods,
  loadBrowseMods
};

document.addEventListener('DOMContentLoaded', initModsManager);
