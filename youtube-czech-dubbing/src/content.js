/**
 * Content Script - Entry point that runs on YouTube pages.
 * Initializes the dubbing controller and sets up communication with the popup.
 */
(function () {
  'use strict';

  let controller = null;

  /**
   * Initialize the dubbing controller.
   */
  function init() {
    if (controller) return;

    controller = new DubbingController();

    // Show activation button on video pages
    if (isVideoPage()) {
      injectActivationButton();
    }

    // Listen for navigation changes (YouTube is an SPA)
    observeNavigation();

    console.log('[CzechDub] Extension loaded and ready');
  }

  /**
   * Check if current page is a YouTube video page.
   */
  function isVideoPage() {
    return window.location.pathname === '/watch';
  }

  /**
   * Inject the "Czech Dubbing" activation button below the video player.
   */
  let _injectInterval = null;

  function injectActivationButton() {
    // Cancel any pending injection from previous call
    if (_injectInterval) {
      clearInterval(_injectInterval);
      _injectInterval = null;
    }

    // Remove existing button/container if any
    const existingContainer = document.getElementById('czech-dub-container');
    if (existingContainer) existingContainer.remove();
    const existing = document.getElementById('czech-dub-activate-btn');
    if (existing) existing.remove();

    // Wait for the player controls to be available
    _injectInterval = setInterval(async () => {
      // Guard: if button was already injected by a concurrent call, stop
      if (document.getElementById('czech-dub-container')) {
        clearInterval(_injectInterval);
        _injectInterval = null;
        return;
      }

      const infoArea = document.querySelector('#above-the-fold #title') ||
                       document.querySelector('#info-contents') ||
                       document.querySelector('#top-row');

      if (infoArea) {
        clearInterval(_injectInterval);
        _injectInterval = null;

        // Read saved language to set initial button text
        const savedLang = await new Promise(resolve => {
          chrome.storage.local.get('popupSettings', r => {
            resolve(r.popupSettings?.targetLanguage || DEFAULT_LANGUAGE);
          });
        });
        const initLangCfg = getLanguageConfig(savedLang);

        const btn = document.createElement('button');
        btn.id = 'czech-dub-activate-btn';
        btn.className = 'czech-dub-btn';
        const btnIcon = document.createElement('span');
        btnIcon.className = 'czech-dub-btn-icon';
        btnIcon.textContent = initLangCfg.flag;
        const btnText = document.createElement('span');
        btnText.className = 'czech-dub-btn-text';
        btnText.textContent = initLangCfg.uiStrings.activate;
        btn.appendChild(btnIcon);
        btn.appendChild(btnText);
        btn.title = initLangCfg.uiStrings.activate;

        // Gear button for settings
        const gear = document.createElement('button');
        gear.className = 'czech-dub-gear';
        gear.textContent = '\u2699';
        gear.title = initLangCfg.uiStrings.settings;

        // Settings panel (built with DOM methods)
        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'czech-dub-settings';

        const heading = document.createElement('h3');
        heading.textContent = '\u2699 ' + initLangCfg.uiStrings.settings;
        settingsPanel.appendChild(heading);

        // Language picker
        const langLabel = document.createElement('label');
        langLabel.textContent = 'Language / Jazyk';
        settingsPanel.appendChild(langLabel);

        const langSelect = document.createElement('select');
        langSelect.id = 'czech-dub-lang';
        Object.values(LANGUAGES).forEach(lang => {
          const opt = document.createElement('option');
          opt.value = lang.code;
          opt.textContent = `${lang.flag} ${lang.name}`;
          langSelect.appendChild(opt);
        });
        langSelect.value = savedLang;
        settingsPanel.appendChild(langSelect);

        const engineLabel = document.createElement('label');
        engineLabel.textContent = 'Překladač';
        settingsPanel.appendChild(engineLabel);

        const engineSelect = document.createElement('select');
        engineSelect.id = 'czech-dub-engine';
        const engines = [
          { value: 'google', label: 'Google Translate (zdarma)' },
          { value: 'deepl', label: 'DeepL (500k zn./měs. zdarma)' },
          { value: 'claude', label: 'Claude Haiku 4.5 (API klíč)' }
        ];
        engines.forEach(e => {
          const opt = document.createElement('option');
          opt.value = e.value;
          opt.textContent = e.label;
          engineSelect.appendChild(opt);
        });
        settingsPanel.appendChild(engineSelect);

        // DeepL API key group
        const deeplKeyGroup = document.createElement('div');
        deeplKeyGroup.className = 'api-key-group';
        const deeplLabel = document.createElement('label');
        deeplLabel.textContent = 'DeepL API klíč';
        deeplKeyGroup.appendChild(deeplLabel);
        const deeplKeyInput = document.createElement('input');
        deeplKeyInput.type = 'password';
        deeplKeyInput.id = 'czech-dub-deeplkey';
        deeplKeyInput.placeholder = 'xxxxxxxx-xxxx:fx';
        deeplKeyGroup.appendChild(deeplKeyInput);
        const deeplHint = document.createElement('div');
        deeplHint.className = 'hint';
        deeplHint.textContent = 'Free: 500k zn./měs. \u2022 deepl.com/your-account';
        deeplKeyGroup.appendChild(deeplHint);
        settingsPanel.appendChild(deeplKeyGroup);

        // Anthropic API key group
        const apiKeyGroup = document.createElement('div');
        apiKeyGroup.className = 'api-key-group';
        const apiLabel = document.createElement('label');
        apiLabel.textContent = 'Anthropic API klíč';
        apiKeyGroup.appendChild(apiLabel);
        const apiKeyInput = document.createElement('input');
        apiKeyInput.type = 'password';
        apiKeyInput.id = 'czech-dub-apikey';
        apiKeyInput.placeholder = 'sk-ant-...';
        apiKeyGroup.appendChild(apiKeyInput);
        const apiHint = document.createElement('div');
        apiHint.className = 'hint';
        apiHint.textContent = '~$0.003 za 30min video \u2022 console.anthropic.com';
        apiKeyGroup.appendChild(apiHint);
        settingsPanel.appendChild(apiKeyGroup);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-btn';
        saveBtn.textContent = 'Uložit nastavení';
        settingsPanel.appendChild(saveBtn);

        gear.addEventListener('click', (e) => {
          e.stopPropagation();
          settingsPanel.classList.toggle('open');
        });

        // Load saved settings into panel
        chrome.storage.local.get('popupSettings', (result) => {
          const s = result.popupSettings || {};
          if (s.translatorEngine) engineSelect.value = s.translatorEngine;
          if (s.anthropicApiKey) apiKeyInput.value = s.anthropicApiKey;
          if (s.deeplApiKey) deeplKeyInput.value = s.deeplApiKey;
          if (s.translatorEngine === 'claude') apiKeyGroup.classList.add('visible');
          if (s.translatorEngine === 'deepl') deeplKeyGroup.classList.add('visible');

          engineSelect.addEventListener('change', () => {
            apiKeyGroup.classList.toggle('visible', engineSelect.value === 'claude');
            deeplKeyGroup.classList.toggle('visible', engineSelect.value === 'deepl');
          });
        });

        // Language change updates button text
        langSelect.addEventListener('change', () => {
          const cfg = getLanguageConfig(langSelect.value);
          btn.querySelector('.czech-dub-btn-icon').textContent = cfg.flag;
          btn.querySelector('.czech-dub-btn-text').textContent = cfg.uiStrings.activate;
          btn.title = cfg.uiStrings.activate;
        });

        // Save button
        saveBtn.addEventListener('click', () => {
          const engine = engineSelect.value;
          const apiKey = apiKeyInput.value;
          const deeplKey = deeplKeyInput.value;
          const targetLang = langSelect.value;
          chrome.storage.local.get('popupSettings', (result) => {
            const s = result.popupSettings || {};
            s.translatorEngine = engine;
            s.anthropicApiKey = apiKey;
            s.deeplApiKey = deeplKey;
            s.targetLanguage = targetLang;
            chrome.storage.local.set({ popupSettings: s }, () => {
              settingsPanel.classList.remove('open');
              console.log('[CzechDub] Settings saved: lang=' + targetLang + ', engine=' + engine);
            });
          });
        });

        btn.addEventListener('click', async () => {
          const curLangCfg = getLanguageConfig(langSelect.value);
          if (controller.isActive || controller._isStarting) {
            controller.stop();
            controller._isStarting = false;
            btn.classList.remove('active', 'loading');
            btn.querySelector('.czech-dub-btn-text').textContent = curLangCfg.uiStrings.activate;
          } else {
            controller._isStarting = true;
            btn.classList.add('loading');
            btn.querySelector('.czech-dub-btn-text').textContent = curLangCfg.uiStrings.loading;

            const success = await controller.start();
            controller._isStarting = false;

            btn.classList.remove('loading');
            if (success) {
              btn.classList.add('active');
              btn.querySelector('.czech-dub-btn-text').textContent = curLangCfg.uiStrings.active;
            } else {
              btn.querySelector('.czech-dub-btn-text').textContent = curLangCfg.uiStrings.activate;
            }
          }
        });

        // Update button text based on controller status
        controller.onStatusChange = (status, message) => {
          const textEl = btn.querySelector('.czech-dub-btn-text');
          if (status === 'loading' || status === 'translating') {
            btn.classList.add('loading');
            textEl.textContent = message;
          } else if (status === 'playing') {
            btn.classList.remove('loading');
            btn.classList.add('active');
            textEl.textContent = getLanguageConfig(langSelect.value).uiStrings.active;
          } else if (status === 'error') {
            btn.classList.remove('loading', 'active');
            textEl.textContent = message;
          }
        };

        // Container for button + gear + settings
        const container = document.createElement('div');
        container.id = 'czech-dub-container';
        container.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:0;';
        container.appendChild(btn);
        container.appendChild(gear);
        container.appendChild(settingsPanel);
        infoArea.parentNode.insertBefore(container, infoArea);
      }
    }, 1000);

    // Clean up interval after 30 seconds
    setTimeout(() => { if (_injectInterval) { clearInterval(_injectInterval); _injectInterval = null; } }, 30000);
  }

  /**
   * Observe URL changes for YouTube SPA navigation.
   */
  function observeNavigation() {
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleNavigation();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also listen for popstate
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('yt-navigate-finish', handleNavigation);
  }

  /**
   * Handle navigation to a new page (debounced — MutationObserver + yt-navigate-finish fire together).
   */
  let _navTimeout = null;
  function handleNavigation() {
    if (_navTimeout) clearTimeout(_navTimeout);
    _navTimeout = setTimeout(() => {
      _navTimeout = null;

      // Stop current dubbing
      if (controller && controller.isActive) {
        controller.stop();
      }

      // If new page is a video, inject button
      if (isVideoPage()) {
        injectActivationButton();
      } else {
        // Remove button and settings on non-video pages
        const container = document.getElementById('czech-dub-container');
        if (container) container.remove();
      }
    }, 500);
  }

  /**
   * Listen for messages from popup or background script.
   */
  try { chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'get-status':
        sendResponse(controller ? controller.getStatus() : { status: 'idle', message: '' });
        break;

      case 'start-dubbing':
        if (controller) {
          controller.start().then(success => {
            sendResponse({ success });
          });
          return true; // Async response
        }
        sendResponse({ success: false });
        break;

      case 'stop-dubbing':
        if (controller) {
          controller.stop();
          sendResponse({ success: true });
        }
        break;

      case 'update-settings':
        if (controller) {
          controller.updateSettings(msg.settings);
          sendResponse({ success: true });
        }
        break;

      case 'get-voices':
        if (controller && controller.tts) {
          const voices = controller.tts.getAvailableVoices();
          sendResponse({
            voices: voices.map(v => ({ name: v.name, lang: v.lang })),
            current: controller.tts.czechVoice?.name || null
          });
        }
        break;

      case 'set-voice':
        if (controller && controller.tts) {
          controller.tts.setVoice(msg.voiceName);
          sendResponse({ success: true });
        }
        break;
    }
  }); } catch (e) {
    if (e.message?.includes('Extension context invalidated')) {
      console.warn('[CzechDub] Extension context invalidated — reload page');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
