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
    this._allParagraphs = []; // full article paragraphs (kept for mode switch)
    this._summaryParagraphs = []; // summary-only paragraphs
    this._currentIndex = -1;
    this._isPlaying = false;
    this._isPaused = false;
    this._cancelled = false;
    this._highlightClass = 'czech-dub-highlight';
    this._langConfig = null;
    this._mode = 'full'; // 'summary' or 'full'
    this._articleData = null;
  }

  /**
   * Initialize the player with extracted article data.
   */
  async init(articleData, translator, tts, langConfig) {
    this._translator = translator;
    this._tts = tts;
    this._langConfig = langConfig;
    this._articleData = articleData;

    // Build full article paragraphs
    this._allParagraphs = articleData.paragraphs.map(p => ({
      ...p,
      translatedText: null
    }));

    // Build summary paragraphs from detected summaries + meta
    this._summaryParagraphs = this._buildSummaryParagraphs(articleData);

    // Choose initial mode: if summary is available, start with summary
    const hasSummary = this._summaryParagraphs.length > 0;
    this._mode = hasSummary ? 'summary' : 'full';
    this._paragraphs = hasSummary ? this._summaryParagraphs : this._allParagraphs;

    console.log(`[CzechDub] Article mode: ${this._mode} (${this._summaryParagraphs.length} summary items, ${this._allParagraphs.length} full paragraphs)`);

    this._injectStyles();
    this._createUI();
    this._updateProgress();
    this._updateModeButtons();
  }

  /**
   * Build summary paragraphs from extracted summary data + page meta.
   */
  _buildSummaryParagraphs(articleData) {
    const items = [];
    const summary = articleData.summary;
    const meta = articleData.meta;

    // Add meta description as intro if available
    if (meta?.description && meta.description.length > 30) {
      items.push({
        text: meta.description,
        type: 'summary-intro',
        element: null,
        translatedText: null,
        source: 'meta'
      });
    }

    // Add detected summary sections
    if (summary?.sections) {
      for (const section of summary.sections) {
        // Skip empty NotebookLM markers
        if (section.source === 'notebooklm' && !section.text) continue;

        // Add section title as heading
        if (section.title && section.items?.length > 1) {
          items.push({
            text: section.title,
            type: 'heading',
            element: section.element,
            translatedText: null,
            source: section.source
          });
        }

        // Add individual items or full text
        if (section.items?.length > 1) {
          for (const itemText of section.items) {
            items.push({
              text: itemText,
              type: 'summary-point',
              element: section.element,
              translatedText: null,
              source: section.source
            });
          }
        } else if (section.text) {
          items.push({
            text: section.text,
            type: 'summary-text',
            element: section.element,
            translatedText: null,
            source: section.source
          });
        }
      }
    }

    return items;
  }

  /**
   * Switch between summary and full article mode.
   */
  switchMode(mode) {
    const wasPlaying = this._isPlaying;
    if (wasPlaying) this.stop();

    this._mode = mode;
    this._currentIndex = -1;
    this._paragraphs = mode === 'summary' ? this._summaryParagraphs : this._allParagraphs;
    this._updateProgress();
    this._updateModeButtons();
    this._clearHighlight();

    console.log(`[CzechDub] Switched to ${mode} mode (${this._paragraphs.length} items)`);
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
      console.log(`[CzechDub] Article: playing ${i + 1}/${this._paragraphs.length} (${para.type}): "${para.text.substring(0, 60)}..."`);

      // Handle media breaks — short pause, scroll to element, optionally read caption
      if (para.type === 'break') {
        this._highlightParagraph(i);
        if (para.text) {
          // Translate and speak image caption/alt text
          const translatedCaption = await this._translator.translate(para.text);
          this._setStatus(`${i + 1}/${this._paragraphs.length} — ${para.mediaType || 'media'}`);
          await this._speakAndWait(translatedCaption);
        } else {
          // Just a pause for visual content
          await new Promise(r => setTimeout(r, 800));
        }
        console.log(`[CzechDub] Article: passed media break ${i + 1}`);
        continue;
      }

      // Handle figcaptions — read as brief note
      if (para.type === 'caption') {
        this._highlightParagraph(i);
        const translatedCaption = await this._translator.translate(para.text);
        this._showTranslation(i, translatedCaption);
        this._setStatus(`${i + 1}/${this._paragraphs.length} — popisek`);
        await this._speakAndWait(translatedCaption);
        console.log(`[CzechDub] Article: done caption ${i + 1}`);
        continue;
      }

      // Translate if not yet done
      if (!para.translatedText) {
        this._setStatus(`${this._langConfig?.uiStrings?.translating || 'Překládám'} ${i + 1}/${this._paragraphs.length}...`);
        para.translatedText = await this._translator.translate(para.text);
      }

      // Show translated text in tooltip
      this._showTranslation(i, para.translatedText);

      // Speak
      this._setStatus(`${i + 1}/${this._paragraphs.length} — ${this._langConfig?.uiStrings?.active || 'Dabing aktivní'}`);
      await this._speakAndWait(para.translatedText);
      console.log(`[CzechDub] Article: done speaking ${i + 1}/${this._paragraphs.length}`);
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
      // Skip breaks without text, translate everything else
      if (!para.text || para.type === 'break' && !para.text) continue;
      if (!para.translatedText) {
        para.translatedText = await this._translator.translate(para.text);
      }
      if (onProgress) onProgress(i + 1, this._paragraphs.length);
    }
  }

  // --- Private methods ---

  async _speakAndWait(text) {
    if (!text || this._cancelled) return;

    // TTS engine.speak() returns a Promise that resolves when speech ends
    if (this._tts?.speak) {
      // Race: speak vs timeout (safety net for Chrome onend bug)
      const estimatedMs = Math.max(3000, (text.length / 5) * 400); // ~5 chars/s
      const timeout = new Promise(r => setTimeout(r, estimatedMs));
      await Promise.race([this._tts.speak(text), timeout]);
      // Ensure speech is done before moving on
      if (this._tts.isSpeaking) {
        await new Promise(r => {
          const check = setInterval(() => {
            if (!this._tts.isSpeaking || this._cancelled) {
              clearInterval(check);
              r();
            }
          }, 200);
          // Hard timeout: 30s max per paragraph
          setTimeout(() => { clearInterval(check); r(); }, 30000);
        });
      }
      return;
    }

    // Fallback: Web Speech API directly (with keepalive workaround)
    await new Promise(resolve => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = this._langConfig?.bcp47 || 'cs-CZ';

      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };

      utter.onend = done;
      utter.onerror = done;

      // Safety timeout: Chrome sometimes doesn't fire onend
      const estimatedMs = Math.max(3000, (text.length / 5) * 400);
      setTimeout(() => {
        if (!resolved && !speechSynthesis.speaking) done();
      }, estimatedMs);

      // Chrome keepalive: pause/resume to prevent 15s cutoff
      const keepAlive = setInterval(() => {
        if (speechSynthesis.speaking) {
          speechSynthesis.pause();
          speechSynthesis.resume();
        } else {
          clearInterval(keepAlive);
          done();
        }
      }, 10000);

      speechSynthesis.speak(utter);
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
      .czech-dub-player-mode {
        display: flex;
        gap: 6px;
        margin-top: 10px;
        justify-content: center;
      }
      .czech-dub-mode-btn {
        background: #16213e;
        border: 1px solid #0f3460;
        color: #aaa;
        padding: 4px 14px;
        border-radius: 14px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .czech-dub-mode-btn:hover { color: #e0e0e0; border-color: #3498db; }
      .czech-dub-mode-btn.active {
        background: #11457e;
        color: white;
        border-color: #3498db;
      }
      .czech-dub-player-audio-info {
        font-size: 10px;
        color: #888;
        text-align: center;
        margin-top: 6px;
        padding: 3px 8px;
        background: rgba(52,152,219,0.1);
        border-radius: 8px;
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

    // Mode switcher (Summary / Full Article)
    const modeRow = document.createElement('div');
    modeRow.className = 'czech-dub-player-mode';

    this._summaryBtn = document.createElement('button');
    this._summaryBtn.className = 'czech-dub-mode-btn';
    this._summaryBtn.textContent = 'Shrnut\u00ED';
    this._summaryBtn.title = 'P\u0159e\u010D\u00EDst pouze shrnut\u00ED';
    this._summaryBtn.addEventListener('click', () => this.switchMode('summary'));

    this._fullBtn = document.createElement('button');
    this._fullBtn.className = 'czech-dub-mode-btn';
    this._fullBtn.textContent = 'Cel\u00FD \u010Dl\u00E1nek';
    this._fullBtn.title = 'P\u0159e\u010D\u00EDst cel\u00FD \u010Dl\u00E1nek';
    this._fullBtn.addEventListener('click', () => this.switchMode('full'));

    modeRow.appendChild(this._summaryBtn);
    modeRow.appendChild(this._fullBtn);

    // Hide mode switcher if no summary available
    if (this._summaryParagraphs.length === 0) {
      modeRow.style.display = 'none';
    }

    body.appendChild(modeRow);

    // Audio elements indicator
    if (this._articleData?.audioElements?.length > 0) {
      const audioInfo = document.createElement('div');
      audioInfo.className = 'czech-dub-player-audio-info';
      const audioCount = this._articleData.audioElements.length;
      audioInfo.textContent = `\uD83C\uDFA7 ${audioCount} audio element${audioCount > 1 ? '\u016F' : ''} na str\u00E1nce`;
      body.appendChild(audioInfo);
    }

    // Summary info
    if (this._articleData?.summary?.hasAISummary) {
      const aiInfo = document.createElement('div');
      aiInfo.className = 'czech-dub-player-audio-info';
      aiInfo.textContent = '\u2728 Detekována AI sumarizace na str\u00E1nce';
      body.appendChild(aiInfo);
    }

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

  _updateModeButtons() {
    if (!this._summaryBtn || !this._fullBtn) return;
    this._summaryBtn.classList.toggle('active', this._mode === 'summary');
    this._fullBtn.classList.toggle('active', this._mode === 'full');
  }

  _updateProgress() {
    if (!this._progressBar || !this._counterEl) return;
    const total = this._paragraphs.length;
    const current = Math.max(0, this._currentIndex + 1);
    const pct = total > 0 ? (current / total) * 100 : 0;
    this._progressBar.style.width = pct + '%';
    const modeLabel = this._mode === 'summary' ? 'shrnut\u00ED' : 'odstavc\u016F';
    this._counterEl.textContent = `${current} / ${total} ${modeLabel}`;
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
