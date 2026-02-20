import './ui.js';
import './install.js';
import './launcher.js';
import './news.js';
import './mods.js';
import './players.js';
import './settings.js';
import './logs.js';

let i18nInitialized = false;
(async () => {
  const savedLang = await window.electronAPI?.loadLanguage();
  await i18n.init(savedLang);
  i18nInitialized = true;
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    updateLanguageSelector();
  }
})();

async function checkDiscordPopup() {
  try {
    const config = await window.electronAPI?.loadConfig();
    if (!config || config.discordPopup === undefined || config.discordPopup === false) {
      const modal = document.getElementById('discordPopupModal');
      if (modal) {
        const buttons = modal.querySelectorAll('.discord-popup-btn');
        buttons.forEach(btn => btn.disabled = true);
        
        setTimeout(() => {
          modal.style.display = 'flex';
          modal.classList.add('active');
          
          setTimeout(() => {
            buttons.forEach(btn => btn.disabled = false);
          }, 2000);
        }, 1000);
      }
    }
  } catch (error) {
    console.error('Failed to check Discord popup:', error);
  }
}

window.closeDiscordPopup = function() {
  const modal = document.getElementById('discordPopupModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
};

window.joinDiscord = async function() {
  await window.electronAPI?.openExternal('https://discord.gg/hf2pdc');
  
  try {
    await window.electronAPI?.saveConfig({ discordPopup: true });
  } catch (error) {
    console.error('Failed to save Discord popup state:', error);
  }
  
  closeDiscordPopup();
};

function updateLanguageSelector() {
  const langSelect = document.getElementById('languageSelect');
  if (langSelect) {
    // Clear existing options
    langSelect.innerHTML = '';
    
    const languages = i18n.getAvailableLanguages();
    const currentLang = i18n.getCurrentLanguage();
    
    languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      if (lang.code === currentLang) {
        option.selected = true;
      }
      langSelect.appendChild(option);
    });
    
    // Handle language change (add listener only once)
    if (!langSelect.hasAttribute('data-listener-added')) {
      langSelect.addEventListener('change', async (e) => {
        await i18n.setLanguage(e.target.value);
      });
      langSelect.setAttribute('data-listener-added', 'true');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (i18nInitialized) {
    updateLanguageSelector();
  }
  
  checkDiscordPopup();
});