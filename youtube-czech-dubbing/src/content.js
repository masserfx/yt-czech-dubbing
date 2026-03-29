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
  function injectActivationButton() {
    // Remove existing button if any
    const existing = document.getElementById('czech-dub-activate-btn');
    if (existing) existing.remove();

    // Wait for the player controls to be available
    const waitForPlayer = setInterval(() => {
      const infoArea = document.querySelector('#above-the-fold #title') ||
                       document.querySelector('#info-contents') ||
                       document.querySelector('#top-row');

      if (infoArea) {
        clearInterval(waitForPlayer);

        const btn = document.createElement('button');
        btn.id = 'czech-dub-activate-btn';
        btn.className = 'czech-dub-btn';
        btn.innerHTML = `
          <span class="czech-dub-btn-icon">🇨🇿</span>
          <span class="czech-dub-btn-text">Český dabing</span>
        `;
        btn.title = 'Aktivovat český dabing pro toto video';

        btn.addEventListener('click', async () => {
          if (controller.isActive) {
            controller.stop();
            btn.classList.remove('active');
            btn.querySelector('.czech-dub-btn-text').textContent = 'Český dabing';
          } else {
            btn.classList.add('loading');
            btn.querySelector('.czech-dub-btn-text').textContent = 'Načítání...';

            const success = await controller.start();

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

        infoArea.parentNode.insertBefore(btn, infoArea);
      }
    }, 1000);

    // Clean up interval after 30 seconds
    setTimeout(() => clearInterval(waitForPlayer), 30000);
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
   * Handle navigation to a new page.
   */
  function handleNavigation() {
    // Stop current dubbing
    if (controller && controller.isActive) {
      controller.stop();
    }

    // If new page is a video, inject button
    if (isVideoPage()) {
      setTimeout(injectActivationButton, 1500);
    } else {
      // Remove button on non-video pages
      const btn = document.getElementById('czech-dub-activate-btn');
      if (btn) btn.remove();
    }
  }

  /**
   * Listen for messages from popup or background script.
   */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
