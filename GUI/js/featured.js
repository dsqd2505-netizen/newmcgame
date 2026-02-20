// Featured Servers Management
const FEATURED_SERVERS_API = 'https://assets.authbp.xyz/featured.json';

/**
 * Safely escape HTML while preserving UTF-8 characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Load and display featured servers
 */
async function loadFeaturedServers() {
  const featuredContainer = document.getElementById('featuredServersList');
  
  try {
    console.log('[FeaturedServers] Fetching from', FEATURED_SERVERS_API);
    
    // Fetch featured servers from API (no cache)
    const response = await fetch(FEATURED_SERVERS_API, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept-Charset': 'utf-8'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    const data = JSON.parse(text);
    const featuredServers = data.featuredServers || [];
    
    console.log('[FeaturedServers] Loaded', featuredServers.length, 'featured servers');
    
    // Render featured servers
    if (featuredServers.length === 0) {
      featuredContainer.innerHTML = `
        <div class="loading-spinner">
          <i class="fas fa-info-circle fa-2x"></i>
          <p>No featured servers</p>
        </div>
      `;
    } else {
      const featuredHTML = featuredServers.map((server, index) => {
        console.log(`[FeaturedServers] Building featured card ${index + 1}:`, server.Name);
        
        const escapedName = escapeHtml(server.Name || 'Unknown Server');
        const escapedAddress = escapeHtml(server.Address || '');
        const bannerUrl = server.img_Banner || 'https://via.placeholder.com/400x240/1e293b/ffffff?text=Server+Banner';
        const discordUrl = server.discord || '';
        
        // Build Discord button HTML if discord link exists
        const discordButton = discordUrl ? `
          <button class="server-discord-btn" onclick="openServerDiscord('${discordUrl}')">
            <i class="fab fa-discord"></i>
            <span>Discord</span>
          </button>
        ` : '';
        
        return `
          <div class="featured-server-card">
            <img 
              src="${bannerUrl}" 
              alt="${escapedName}" 
              class="featured-server-banner"
              onerror="this.src='https://via.placeholder.com/400x240/1e293b/ffffff?text=Server'"
            />
            <div class="featured-server-content">
              <h3 class="featured-server-name">${escapedName}</h3>
              <div class="featured-server-address">
                <span class="server-address-text">${escapedAddress}</span>
                <div class="server-action-buttons">
                  <button class="copy-address-btn" onclick="copyServerAddress('${escapedAddress}', this)">
                    <i class="fas fa-copy"></i>
                    <span>Copy</span>
                  </button>
                  ${discordButton}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      featuredContainer.innerHTML = featuredHTML;
    }
    
  } catch (error) {
    console.error('[FeaturedServers] Error loading servers:', error);
    featuredContainer.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-exclamation-triangle fa-2x" style="color: #ef4444;"></i>
        <p>Failed to load servers</p>
        <p style="font-size: 0.9rem; color: #64748b;">${error.message}</p>
      </div>
    `;
  }
}

/**
 * Copy server address to clipboard
 */
async function copyServerAddress(address, button) {
  try {
    await navigator.clipboard.writeText(address);
    
    // Visual feedback
    const originalHTML = button.innerHTML;
    button.classList.add('copied');
    button.innerHTML = '<i class="fas fa-check"></i><span>Copied!</span>';
    
    setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = originalHTML;
    }, 2000);
    
    console.log('[FeaturedServers] Copied address:', address);
  } catch (error) {
    console.error('[FeaturedServers] Failed to copy address:', error);
    
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = address;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
      const originalHTML = button.innerHTML;
      button.classList.add('copied');
      button.innerHTML = '<i class="fas fa-check"></i><span>Copied!</span>';
      
      setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = originalHTML;
      }, 2000);
    } catch (err) {
      console.error('[FeaturedServers] Fallback copy also failed:', err);
    }
    
    document.body.removeChild(textArea);
  }
}

/**
 * Open server Discord in external browser
 */
function openServerDiscord(discordUrl) {
  try {
    console.log('[FeaturedServers] Opening Discord:', discordUrl);
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(discordUrl);
    } else {
      window.open(discordUrl, '_blank');
    }
  } catch (error) {
    console.error('[FeaturedServers] Failed to open Discord link:', error);
  }
}

// Load featured servers when the featured page becomes visible
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const featuredPage = document.getElementById('featured-page');
        if (featuredPage && featuredPage.classList.contains('active')) {
          loadFeaturedServers();
        }
      }
    });
  });
  
  const featuredPage = document.getElementById('featured-page');
  if (featuredPage) {
    observer.observe(featuredPage, { attributes: true });
    
    // Load immediately if already visible
    if (featuredPage.classList.contains('active')) {
      loadFeaturedServers();
    }
  }
});
