/**
 * Article Content Script — Entry point for article dubbing on non-YouTube pages.
 * Injected programmatically by background.js when user activates on an article page.
 * Dependencies: language-config.js, translator.js, tts-engine.js,
 *               article-extractor.js, article-player.js
 */
(function () {
  'use strict';

  // Prevent double initialization
  if (window._czechDubArticleInit) return;
  window._czechDubArticleInit = true;

  let extractor = null;
  let player = null;
  let translator = null;
  let tts = null;

  /**
   * Initialize article dubbing.
   */
  async function init() {
    extractor = new ArticleExtractor();

    if (!extractor.isArticlePage()) {
      console.log('[CzechDub] Not an article page, skipping');
      notifyPopup('error', 'Tato stránka neobsahuje článek');
      return;
    }

    // Extract article content
    const article = extractor.extract();
    if (article.paragraphs.length === 0) {
      console.log('[CzechDub] No paragraphs found');
      notifyPopup('error', 'Nepodařilo se extrahovat text článku');
      return;
    }

    console.log(`[CzechDub] Article: "${article.title}" — ${article.paragraphs.length} paragraphs, ${article.audioElements.length} audio elements`);

    // Initialize translator
    translator = new Translator();
    await translator.loadSettings();

    // Initialize TTS
    tts = new TTSEngine();
    await tts.loadSettings?.();

    const langConfig = getLanguageConfig(translator._targetLang);

    // Create and show player
    player = new ArticlePlayer();
    await player.init(article, translator, tts, langConfig);

    notifyPopup('ready', `Článek připraven (${article.paragraphs.length} odstavců)`);

    // Auto-start pre-translation in background
    player.preTranslate((done, total) => {
      notifyPopup('translating', `Překládám ${done}/${total}`);
    }).then(() => {
      notifyPopup('ready', 'Překlad dokončen — stiskněte Play');
    });
  }

  /**
   * Send status to popup.
   */
  function notifyPopup(status, message) {
    try {
      chrome.runtime.sendMessage({ type: 'status-update', status, message });
    } catch (e) {
      // Extension context may be invalidated
    }
  }

  /**
   * Listen for messages from popup/background.
   */
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      switch (msg.type) {
        case 'article-get-status':
          sendResponse({
            status: player ? (player._isPlaying ? 'playing' : 'ready') : 'idle',
            message: player ? `${player._paragraphs.length} odstavců` : '',
            isArticle: true
          });
          break;

        case 'article-play':
          if (player) player.play();
          sendResponse({ success: true });
          break;

        case 'article-pause':
          if (player) player.pause();
          sendResponse({ success: true });
          break;

        case 'article-stop':
          if (player) player.stop();
          sendResponse({ success: true });
          break;

        case 'article-destroy':
          if (player) {
            player.destroy();
            player = null;
          }
          window._czechDubArticleInit = false;
          sendResponse({ success: true });
          break;

        case 'update-settings':
          if (translator && msg.settings) {
            if (msg.settings.translatorEngine) translator._engine = msg.settings.translatorEngine;
            if (msg.settings.targetLanguage) {
              translator._targetLang = msg.settings.targetLanguage;
              translator._langConfig = getLanguageConfig(msg.settings.targetLanguage);
            }
          }
          sendResponse({ success: true });
          break;
      }
    });
  } catch (e) {
    // Extension context invalidated
  }

  // Start
  init();
})();
