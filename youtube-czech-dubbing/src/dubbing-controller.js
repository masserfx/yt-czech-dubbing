/**
 * DubbingController - Main orchestrator for the Czech dubbing feature.
 *
 * Strategy: Enable YouTube's built-in captions (with Czech translation),
 * read caption text from the DOM as it appears, and speak it via TTS.
 * This bypasses all network-level blocking (uBlock Origin etc.).
 */
class DubbingController {
  constructor() {
    this.extractor = new CaptionExtractor();
    this.translator = new Translator();
    this.tts = new TTSEngine();

    this.isActive = false;
    this.videoElement = null;
    this.originalVolume = 1;
    this.status = 'idle';
    this.statusMessage = '';
    this.onStatusChange = null;

    // Track what we've already spoken to avoid repeats
    this._spokenTexts = new Set();
    this._isSpeaking = false;
    this._speechQueue = [];
    this._captionsAreCzech = false;

    this._settings = {
      ttsRate: 1.1,
      ttsVolume: 0.95,
      ttsPitch: 1.0,
      reducedOriginalVolume: 0.15,
      muteOriginal: false
    };
  }

  /**
   * Start Czech dubbing for the current video.
   */
  async start() {
    if (this.isActive) {
      this.stop();
    }

    this._setStatus('loading', 'Načítání...');

    try {
      // Find video element
      this.videoElement = document.querySelector('video.html5-main-video') ||
                          document.querySelector('video');

      if (!this.videoElement) {
        this._setStatus('error', 'Video element nenalezen');
        return false;
      }

      // Load settings
      await this._loadSettings();

      // Wait for TTS voices
      await this.tts.waitForVoice();

      const voiceInfo = this.tts.getVoiceInfo();
      console.log(`[CzechDub] TTS Voice: ${voiceInfo.name || 'none'} (${voiceInfo.lang}), isCzech: ${voiceInfo.isCzech}`);

      // Apply TTS settings
      this.tts.setRate(this._settings.ttsRate);
      this.tts.setVolume(this._settings.ttsVolume);
      this.tts.setPitch(this._settings.ttsPitch);

      // Check if captions are available
      this._setStatus('loading', 'Hledám titulky...');
      const hasCaptions = await this.extractor.hasCaptions();

      if (!hasCaptions) {
        this._setStatus('error', 'Titulky nejsou k dispozici pro toto video');
        return false;
      }

      // Enable Czech captions via YouTube player API
      this._setStatus('loading', 'Zapínám české titulky...');
      const enabled = await this.extractor.enableCzechCaptions();
      console.log(`[CzechDub] Captions enabled: ${enabled}`);

      // Even if enableCzechCaptions reports failure, the CC button method
      // might have worked, so we proceed anyway

      // Start DOM observation
      this.isActive = true;
      this._spokenTexts.clear();
      this._captionsAreCzech = true; // Assume Czech since we requested it

      this.extractor.startObserving((text) => {
        this._onCaptionAppeared(text);
      });

      // Reduce original volume
      this.originalVolume = this.videoElement.volume;

      // Listen for video events
      this.videoElement.addEventListener('pause', this._onVideoPause);
      this.videoElement.addEventListener('play', this._onVideoPlay);
      this.videoElement.addEventListener('seeked', this._onVideoSeeked);

      this._setStatus('playing', 'Český dabing aktivní');
      console.log('[CzechDub] Dubbing started - reading captions from DOM');
      return true;

    } catch (err) {
      console.error('[CzechDub] Start failed:', err);
      this._setStatus('error', `Chyba: ${err.message}`);
      return false;
    }
  }

  /**
   * Called when a new caption text appears in the DOM.
   */
  async _onCaptionAppeared(text) {
    if (!this.isActive) return;
    if (this.videoElement?.paused) return;
    if (!text || text.trim().length < 3) return;

    console.log(`[CzechDub] Caption: "${text.substring(0, 80)}"`);

    // Keep queue short — if more than 2 items queued, drop oldest
    // This prevents backlog when captions come faster than TTS can speak
    while (this._speechQueue.length > 1) {
      const dropped = this._speechQueue.shift();
      console.log(`[CzechDub] Dropped queued: "${dropped.substring(0, 40)}"`);
    }

    this._speechQueue.push(text);
    this._processQueue();
  }

  /**
   * Process the speech queue — speak one at a time.
   */
  async _processQueue() {
    if (this._isSpeaking) return;
    if (this._speechQueue.length === 0) return;
    if (!this.isActive) return;

    this._isSpeaking = true;
    const text = this._speechQueue.shift();

    try {
      // Reduce video volume while speaking
      if (this.videoElement) {
        if (this._settings.muteOriginal) {
          this.videoElement.volume = 0;
        } else {
          this.videoElement.volume = this._settings.reducedOriginalVolume;
        }
      }

      // Show subtitle overlay
      this._showSubtitle(text);

      // Speak
      console.log(`[CzechDub] TTS speaking: "${text.substring(0, 50)}", voice=${this.tts.czechVoice?.name}`);
      await this.tts.speak(text);
      console.log(`[CzechDub] TTS done speaking`);

    } catch (e) {
      console.warn('[CzechDub] TTS error:', e);
    } finally {
      // Restore volume
      if (this.isActive && this.videoElement) {
        this.videoElement.volume = this.originalVolume;
      }
      this._isSpeaking = false;

      // Process next in queue
      if (this._speechQueue.length > 0) {
        this._processQueue();
      }
    }
  }

  /**
   * Stop dubbing.
   */
  stop() {
    this.isActive = false;
    this.tts.stop();
    this.extractor.stopObserving();

    this._speechQueue = [];
    this._spokenTexts.clear();
    this._isSpeaking = false;

    // Restore original volume
    if (this.videoElement) {
      this.videoElement.volume = this.originalVolume;
      this.videoElement.removeEventListener('pause', this._onVideoPause);
      this.videoElement.removeEventListener('play', this._onVideoPlay);
      this.videoElement.removeEventListener('seeked', this._onVideoSeeked);
    }

    // Remove subtitle overlay
    const overlay = document.getElementById('czech-dub-subtitle');
    if (overlay) overlay.style.display = 'none';

    this._setStatus('idle', 'Dabing zastaven');
  }

  /**
   * Show a subtitle overlay on the video.
   */
  _showSubtitle(czechText) {
    let overlay = document.getElementById('czech-dub-subtitle');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'czech-dub-subtitle';
      const playerContainer = document.querySelector('#movie_player') ||
                              document.querySelector('.html5-video-player');
      if (playerContainer) {
        playerContainer.style.position = 'relative';
        playerContainer.appendChild(overlay);
      } else {
        document.body.appendChild(overlay);
      }
    }

    // Safe text rendering — no raw HTML
    const mainDiv = document.createElement('div');
    mainDiv.className = 'czech-dub-text-main';
    mainDiv.textContent = czechText;

    overlay.textContent = '';
    overlay.appendChild(mainDiv);
    overlay.style.display = 'block';
    overlay.classList.add('czech-dub-visible');

    clearTimeout(this._subtitleTimeout);
    this._subtitleTimeout = setTimeout(() => {
      overlay.classList.remove('czech-dub-visible');
    }, 5000);
  }

  /**
   * Video event handlers
   */
  _onVideoPause = () => {
    if (this.isActive) {
      this.tts.pause();
    }
  };

  _onVideoPlay = () => {
    if (this.isActive) {
      this.tts.resume();
    }
  };

  _onVideoSeeked = () => {
    if (this.isActive) {
      this.tts.stop();
      this._speechQueue = [];
      this._spokenTexts.clear();
      this._isSpeaking = false;
    }
  };

  /**
   * Update settings.
   */
  updateSettings(settings) {
    Object.assign(this._settings, settings);
    this.tts.setRate(this._settings.ttsRate);
    this.tts.setVolume(this._settings.ttsVolume);
    this.tts.setPitch(this._settings.ttsPitch);
    this._saveSettings();
  }

  async _loadSettings() {
    try {
      const result = await chrome.storage.local.get('czechDubSettings');
      if (result.czechDubSettings) {
        Object.assign(this._settings, result.czechDubSettings);
      }
    } catch (e) {}
  }

  async _saveSettings() {
    try {
      await chrome.storage.local.set({ czechDubSettings: this._settings });
    } catch (e) {}
  }

  _setStatus(status, message) {
    this.status = status;
    this.statusMessage = message;
    console.log(`[CzechDub] ${status}: ${message}`);
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
    try {
      chrome.runtime.sendMessage({ type: 'status-update', status, message });
    } catch (e) {}
  }

  getStatus() {
    return {
      status: this.status,
      message: this.statusMessage
    };
  }
}

window.DubbingController = DubbingController;
