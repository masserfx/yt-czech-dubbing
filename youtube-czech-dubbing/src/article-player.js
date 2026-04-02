/**
 * ArticlePlayer — Floating player UI for article dubbing.
 * Shows progress, pause/resume, paragraph navigation, and highlighted text.
 */
class ArticlePlayer {
  constructor() {
    this._container = null;
    this._translator = null;
    this._tts = null;
    this._paragraphs = []; // [{text, type, element, translatedText}]
    this._currentIndex = -1;
    this._isPlaying = false;
    this._isPaused = false;
    this._cancelled = false;
    this._highlightClass = 'czech-dub-highlight';
    this._langConfig = null;
  }

  /**
   * Initialize the player with extracted article data.
   */
  async init(articleData, translator, tts, langConfig) {
    this._translator = translator;
    this._tts = tts;
    this._langConfig = langConfig;
    this._paragraphs = articleData.paragraphs.map(p => ({
      ...p,
      translatedText: null
    }));

    this._injectStyles();
    this._createUI();
    this._updateProgress();
  }

  /**
   * Start playing the article from the beginning or current position.
   */
  async play() {
    if (this._isPlaying) return;
    this._isPlaying = true;
    this._isPaused = false;
    this._cancelled = false;
    this._updatePlayButton();

    const startIdx = this._currentIndex < 0 ? 0 : this._currentIndex;

    for (let i = startIdx; i < this._paragraphs.length; i++) {
      if (this._cancelled) break;

      // Wait while paused
      while (this._isPaused && !this._cancelled) {
        await new Promise(r => setTimeout(r, 200));
      }
      if (this._cancelled) break;

      this._currentIndex = i;
      this._updateProgress();
      this._highlightParagraph(i);

      const para = this._paragraphs[i];

      // Translate if not yet done
      if (!para.translatedText) {
        this._setStatus(this._langConfig?.uiStrings?.translating || 'Překládám...');
        para.translatedText = await this._translator.translate(para.text);
      }

      // Show translated text in tooltip
      this._showTranslation(i, para.translatedText);

      // Speak
      this._setStatus(this._langConfig?.uiStrings?.active || 'Dabing aktivní ✓');
      await this._speakAndWait(para.translatedText);
    }

    this._isPlaying = false;
    this._updatePlayButton();
    if (!this._cancelled) {
      this._setStatus('Dokončeno');
      this._clearHighlight();
    }
  }

  /**
   * Pause playback.
   */
  pause() {
    this._isPaused = true;
    this._tts?.stop?.();
    this._updatePlayButton();
  }

  /**
   * Resume playback.
   */
  resume() {
    this._isPaused = false;
    if (!this._isPlaying) {
      this.play();
    }
    this._updatePlayButton();
  }

  /**
   * Stop playback entirely.
   */
  stop() {
    this._cancelled = true;
    this._isPaused = false;
    this._isPlaying = false;
    this._tts?.stop?.();
    this._clearHighlight();
    this._updatePlayButton();
    this._setStatus('Zastaveno');
  }

  /**
   * Jump to a specific paragraph index.
   */
  jumpTo(index) {
    if (index < 0 || index >= this._paragraphs.length) return;
    const wasPlaying = this._isPlaying;
    this.stop();
    this._currentIndex = index;
    this._updateProgress();
    if (wasPlaying) {
      setTimeout(() => this.play(), 100);
    }
  }

  /**
   * Remove the player UI from the page.
   */
  destroy() {
    this.stop();
    this._clearHighlight();
    this._container?.remove();
    this._container = null;
  }

  /**
   * Pre-translate all paragraphs for smoother playback.
   */
  async preTranslate(onProgress) {
    for (let i = 0; i < this._paragraphs.length; i++) {
      if (this._cancelled) break;
      const para = this._paragraphs[i];
      if (!para.translatedText) {
        para.translatedText = await this._translator.translate(para.text);
      }
      if (onProgress) onProgress(i + 1, this._paragraphs.length);
    }
  }

  // --- Private methods ---

  _speakAndWait(text) {
    return new Promise(resolve => {
      if (!text || this._cancelled) { resolve(); return; }

      // Use TTS engine's speak method with callback
      if (this._tts?.speak) {
        this._tts.speak(text, () => resolve());
      } else {
        // Fallback: Web Speech API directly
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = this._langConfig?.bcp47 || 'cs-CZ';
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        speechSynthesis.speak(utter);
      }
    });
  }

  _highlightParagraph(index) {
    this._clearHighlight();
    const para = this._paragraphs[index];
    if (para?.element) {
      para.element.classList.add(this._highlightClass);
      para.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  _clearHighlight() {
    document.querySelectorAll('.' + this._highlightClass).forEach(el => {
      el.classList.remove(this._highlightClass);
    });
    // Remove translation tooltips
    document.querySelectorAll('.czech-dub-tooltip').forEach(el => el.remove());
  }

  _showTranslation(index, translatedText) {
    const para = this._paragraphs[index];
    if (!para?.element) return;

    // Remove existing tooltip on this element
    const existing = para.element.querySelector('.czech-dub-tooltip');
    if (existing) existing.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'czech-dub-tooltip';
    tooltip.textContent = translatedText;
    para.element.style.position = 'relative';
    para.element.appendChild(tooltip);
  }

  _injectStyles() {
    if (document.getElementById('czech-dub-article-styles')) return;
    const style = document.createElement('style');
    style.id = 'czech-dub-article-styles';
    style.textContent = `
      .czech-dub-highlight {
        background: rgba(52, 152, 219, 0.15) !important;
        border-left: 3px solid #3498db !important;
        padding-left: 8px !important;
        transition: background 0.3s, border-left 0.3s;
      }
      .czech-dub-tooltip {
        background: #1a1a2e;
        color: #e0e0e0;
        font-size: 13px;
        line-height: 1.5;
        padding: 8px 12px;
        border-radius: 6px;
        margin-top: 6px;
        border: 1px solid #3498db;
        font-style: italic;
      }
      .czech-dub-player {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: #1a1a2e;
        border: 1px solid #0f3460;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.4);
        z-index: 999990;
        font-family: 'Segoe UI', Roboto, Arial, sans-serif;
        color: #e0e0e0;
        overflow: hidden;
      }
      .czech-dub-player-header {
        background: linear-gradient(135deg, #11457e 0%, #d7141a 100%);
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
      }
      .czech-dub-player-title {
        font-size: 13px;
        font-weight: 600;
        color: white;
      }
      .czech-dub-player-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.8);
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
      }
      .czech-dub-player-close:hover { color: white; }
      .czech-dub-player-body {
        padding: 12px 14px;
      }
      .czech-dub-player-status {
        font-size: 11px;
        color: #aaa;
        margin-bottom: 8px;
      }
      .czech-dub-player-progress {
        width: 100%;
        height: 4px;
        background: #0f3460;
        border-radius: 2px;
        margin-bottom: 10px;
        overflow: hidden;
      }
      .czech-dub-player-progress-bar {
        height: 100%;
        background: #3498db;
        border-radius: 2px;
        transition: width 0.3s;
      }
      .czech-dub-player-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }
      .czech-dub-player-btn {
        background: #16213e;
        border: 1px solid #0f3460;
        color: #e0e0e0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      .czech-dub-player-btn:hover { background: #1a3a6e; }
      .czech-dub-player-btn.primary {
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, #11457e, #1a6bc4);
        border: none;
        font-size: 18px;
        color: white;
      }
      .czech-dub-player-btn.primary:hover { filter: brightness(1.15); }
      .czech-dub-player-counter {
        font-size: 11px;
        color: #888;
        text-align: center;
        margin-top: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  _createUI() {
    if (this._container) this._container.remove();

    this._container = document.createElement('div');
    this._container.className = 'czech-dub-player';
    this._container.id = 'czech-dub-article-player';

    const flag = this._langConfig?.flag || '🌍';

    // Header
    const header = document.createElement('div');
    header.className = 'czech-dub-player-header';
    const title = document.createElement('span');
    title.className = 'czech-dub-player-title';
    title.textContent = `${flag} Article Dubbing`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'czech-dub-player-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => this.destroy());
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'czech-dub-player-body';

    // Status
    this._statusEl = document.createElement('div');
    this._statusEl.className = 'czech-dub-player-status';
    this._statusEl.textContent = 'Připraveno';
    body.appendChild(this._statusEl);

    // Progress bar
    const progressWrap = document.createElement('div');
    progressWrap.className = 'czech-dub-player-progress';
    this._progressBar = document.createElement('div');
    this._progressBar.className = 'czech-dub-player-progress-bar';
    this._progressBar.style.width = '0%';
    progressWrap.appendChild(this._progressBar);
    body.appendChild(progressWrap);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'czech-dub-player-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'czech-dub-player-btn';
    prevBtn.textContent = '\u23EE';
    prevBtn.title = 'Previous paragraph';
    prevBtn.addEventListener('click', () => this.jumpTo(this._currentIndex - 1));

    this._playBtn = document.createElement('button');
    this._playBtn.className = 'czech-dub-player-btn primary';
    this._playBtn.textContent = '\u25B6';
    this._playBtn.addEventListener('click', () => {
      if (this._isPlaying && !this._isPaused) {
        this.pause();
      } else if (this._isPaused) {
        this.resume();
      } else {
        this.play();
      }
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'czech-dub-player-btn';
    nextBtn.textContent = '\u23ED';
    nextBtn.title = 'Next paragraph';
    nextBtn.addEventListener('click', () => this.jumpTo(this._currentIndex + 1));

    const stopBtn = document.createElement('button');
    stopBtn.className = 'czech-dub-player-btn';
    stopBtn.textContent = '\u25A0';
    stopBtn.title = 'Stop';
    stopBtn.addEventListener('click', () => this.stop());

    controls.appendChild(prevBtn);
    controls.appendChild(this._playBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(stopBtn);
    body.appendChild(controls);

    // Counter
    this._counterEl = document.createElement('div');
    this._counterEl.className = 'czech-dub-player-counter';
    body.appendChild(this._counterEl);

    this._container.appendChild(header);
    this._container.appendChild(body);
    document.body.appendChild(this._container);

    // Make draggable
    this._makeDraggable(header);
  }

  _updatePlayButton() {
    if (!this._playBtn) return;
    if (this._isPlaying && !this._isPaused) {
      this._playBtn.textContent = '\u23F8'; // pause icon
    } else {
      this._playBtn.textContent = '\u25B6'; // play icon
    }
  }

  _updateProgress() {
    if (!this._progressBar || !this._counterEl) return;
    const total = this._paragraphs.length;
    const current = Math.max(0, this._currentIndex + 1);
    const pct = total > 0 ? (current / total) * 100 : 0;
    this._progressBar.style.width = pct + '%';
    this._counterEl.textContent = `${current} / ${total} paragraphs`;
  }

  _setStatus(text) {
    if (this._statusEl) this._statusEl.textContent = text;
  }

  _makeDraggable(handle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = this._container.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this._container.style.left = (startLeft + dx) + 'px';
      this._container.style.top = (startTop + dy) + 'px';
      this._container.style.right = 'auto';
      this._container.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => { isDragging = false; });
  }
}

window.ArticlePlayer = ArticlePlayer;
