// Minimal i18n system - optimized async loading
const i18n = (() => {
  let currentLang = 'en';
  let translations = {};
  const availableLanguages = [
    { code: 'en', name: 'English' },
    { code: 'de-DE', name: 'German (Germany)' },
    { code: 'es-ES', name: 'Spanish (Spain)' },
    { code: 'fr-FR', name: 'French (France)' },
    { code: 'pl-PL', name: 'Polish (Poland)' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    { code: 'ru-RU', name: 'Russian (Russia)' },
    { code: 'sv-SE', name: 'Swedish (Sweden)' },
    { code: 'tr-TR', name: 'Turkish (Turkey)' },
    { code: 'id-ID', name: 'Indonesian (Indonesia)' }
  ];

  // Load single language file
  async function loadLanguage(lang) {
    if (translations[lang]) return true;
    
    try {
      const response = await fetch(`locales/${lang}.json`);
      if (response.ok) {
        translations[lang] = await response.json();
        return true;
      }
    } catch (e) {
      console.warn(`Failed to load language: ${lang}`);
    }
    return false;
  }

  // Get translation by key
  function t(key) {
    const keys = key.split('.');
    let value = translations[currentLang];
    
    for (const k of keys) {
      if (value && value[k] !== undefined) {
        value = value[k];
      } else {
        return key;
      }
    }
    
    return value;
  }

  // Set language
  async function setLanguage(lang) {
    await loadLanguage(lang);
    if (translations[lang]) {
      currentLang = lang;
      updateDOM();
      window.electronAPI?.saveLanguage(lang);
    }
  }

  // Update all elements with data-i18n attribute
  function updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = t(key);
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = t(key);
    });
  }

  // Initialize - load saved language only
  async function init(savedLang) {
    const lang = savedLang || 'en';
    await loadLanguage(lang);
    currentLang = lang;
    updateDOM();
  }

  return {
    init,
    t,
    setLanguage,
    getAvailableLanguages: () => availableLanguages,
    getCurrentLanguage: () => currentLang
  };
})();

// Make i18n globally available
window.i18n = i18n;
