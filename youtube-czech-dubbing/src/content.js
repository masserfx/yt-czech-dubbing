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
    _injectInterval = setInterval(() => {
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

        const btn = document.createElement('button');
        btn.id = 'czech-dub-activate-btn';
        btn.className = 'czech-dub-btn';
        btn.innerHTML = `
          <span class="czech-dub-btn-icon">🇨🇿</span>
          <span class="czech-dub-btn-text">Český dabing</span>
        `;
        btn.title = 'Aktivovat český dabing pro toto video';

        // Gear button for settings
        const gear = document.createElement('button');
        gear.className = 'czech-dub-gear';
        gear.textContent = '\u2699';
        gear.title = 'Nastavení dabingu';

        // Settings panel (built with DOM methods)
        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'czech-dub-settings';

        const heading = document.createElement('h3');
        heading.textContent = '\u2699 Nastavení dabingu';
        settingsPanel.appendChild(heading);

        const engineLabel = document.createElement('label');
        engineLabel.textContent = 'Překladač';
        settingsPanel.appendChild(engineLabel);

        const engineSelect = document.createElement('select');
        engineSelect.id = 'czech-dub-engine';
        const optGoogle = document.createElement('option');
        optGoogle.value = 'google';
        optGoogle.textContent = 'Google Translate (zdarma)';
        const optClaude = document.createElement('option');
        optClaude.value = 'claude';
        optClaude.textContent = 'Claude Haiku 4.5 (API klíč)';
        engineSelect.appendChild(optGoogle);
        engineSelect.appendChild(optClaude);
        settingsPanel.appendChild(engineSelect);

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
          if (s.translatorEngine === 'claude') apiKeyGroup.classList.add('visible');

          engineSelect.addEventListener('change', () => {
            apiKeyGroup.classList.toggle('visible', engineSelect.value === 'claude');
          });
        });

        // Save button
        saveBtn.addEventListener('click', () => {
          const engine = engineSelect.value;
          const apiKey = apiKeyInput.value;
          chrome.storage.local.get('popupSettings', (result) => {
            const s = result.popupSettings || {};
            s.translatorEngine = engine;
            s.anthropicApiKey = apiKey;
            chrome.storage.local.set({ popupSettings: s }, () => {
              settingsPanel.classList.remove('open');
              console.log('[CzechDub] Settings saved: engine=' + engine + ', apiKey=' + (apiKey ? 'set' : 'none'));
            });
          });
        });

        btn.addEventListener('click', async () => {
          if (controller.isActive || controller._isStarting) {
            controller.stop();
            controller._isStarting = false;
            btn.classList.remove('active', 'loading');
            btn.querySelector('.czech-dub-btn-text').textContent = 'Český dabing';
          } else {
            controller._isStarting = true;
            btn.classList.add('loading');
            btn.querySelector('.czech-dub-btn-text').textContent = 'Načítání...';

            const success = await controller.start();
            controller._isStarting = false;

            btn.classList.remove('loading');
            if (success) {
              btn.classList.add('active');
              btn.querySelector('.czech-dub-btn-text').textContent = 'Dabing aktivní ✓';
            } else {
              btn.querySelector('.czech-dub-btn-text').textContent = 'Český dabing';
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
            textEl.textContent = 'Dabing aktivní ✓';
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
