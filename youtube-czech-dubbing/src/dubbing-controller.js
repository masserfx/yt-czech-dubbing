/**
 * DubbingController - Main orchestrator for the Czech dubbing feature.
 * Coordinates caption extraction, translation, and TTS playback
 * synchronized with the YouTube video player.
 *
 * Two modes:
 * 1. Caption-based: Uses YouTube captions + YouTube's built-in translation to Czech
 * 2. Live transcription: Uses Web Speech API to transcribe audio in real-time (fallback)
 */
class DubbingController {
  constructor() {
    this.extractor = new CaptionExtractor();
    this.translator = new Translator();
    this.tts = new TTSEngine();

    this.isActive = false;
    this.translatedCaptions = [];
    this.currentIndex = -1;
    this.videoElement = null;
    this.originalVolume = 1;
    this.syncInterval = null;
    this.status = 'idle'; // idle, loading, translating, ready, playing, error
    this.statusMessage = '';
    this.onStatusChange = null;
    this.muteOriginal = false;
    this.originalVolumeLevel = 0.15;

    // Live transcription mode
    this.liveMode = false;
    this.recognition = null;
    this.liveTranslationQueue = [];

    this._settings = {
      ttsRate: 1.1,
      ttsVolume: 0.95,
      ttsPitch: 1.0,
      reducedOriginalVolume: 0.15,
      muteOriginal: false
    };
  }

  /**
   * Initialize dubbing for the current video.
   */
  async start() {
    if (this.isActive) {
      this.stop();
    }

    this._setStatus('loading', 'Načítání titulků...');

    try {
      // Find the video element
      this.videoElement = document.querySelector('video.html5-main-video') ||
                          document.querySelector('video');

      if (!this.videoElement) {
        this._setStatus('error', 'Video element nenalezen');
        return false;
      }

      // Load settings
      await this._loadSettings();

      // Wait for TTS voices to load
      await this.tts.waitForVoice();

      // Log voice info
      const voiceInfo = this.tts.getVoiceInfo();
      console.log(`[CzechDub] TTS Voice: ${voiceInfo.name || 'none'} (${voiceInfo.lang}), isCzech: ${voiceInfo.isCzech}`);
      if (!voiceInfo.available || !voiceInfo.isCzech) {
        console.warn('[CzechDub] WARNING: No Czech TTS voice found! Audio will sound English.');
        console.warn('[CzechDub] On macOS: System Settings > Accessibility > Spoken Content > Manage Voices > Czech (Zuzana)');
      }

      // Apply TTS settings
      this.tts.setRate(this._settings.ttsRate);
      this.tts.setVolume(this._settings.ttsVolume);
      this.tts.setPitch(this._settings.ttsPitch);

      // Try caption-based mode first
      const captionData = await this.extractor.getBestCaptions();

      if (captionData && captionData.captions.length > 0) {
        return await this._startCaptionMode(captionData);
      }

      // Fallback: try live transcription via Web Speech API
      console.log('[CzechDub] No captions found, trying live transcription...');
      if (this._isSpeechRecognitionAvailable()) {
        return await this._startLiveMode();
      }

      this._setStatus('error', 'Titulky nejsou k dispozici a live přepis není podporován');
      return false;

    } catch (err) {
      console.error('[CzechDub] Start failed:', err);
      this._setStatus('error', `Chyba: ${err.message}`);
      return false;
    }
  }

  /**
   * Start caption-based dubbing mode.
   * Captions are already translated to Czech by YouTube or are Czech originals.
   */
  async _startCaptionMode(captionData) {
    console.log(`[CzechDub] Caption mode: ${captionData.captions.length} captions, isCzech: ${captionData.isCzech}, lang: ${captionData.language}`);
    // Log first 3 captions for debugging
    captionData.captions.slice(0, 3).forEach((c, i) => {
      console.log(`[CzechDub] Sample caption ${i}: "${c.text}"`);
    });

    if (captionData.isCzech) {
      // Captions are already in Czech (either original or YouTube-translated)
      this.translatedCaptions = captionData.captions;
      this._setStatus('ready', `${captionData.captions.length} českých titulků připraveno`);
    } else {
      // Captions need translation via external API
      this._setStatus('translating', `Překládám z ${captionData.language} do češtiny... 0%`);

      this.translatedCaptions = await this.translator.translateCaptions(
        captionData.captions,
        captionData.language,
        (done, total) => {
          const pct = Math.round((done / total) * 100);
          this._setStatus('translating', `Překládám... ${pct}%`);
        }
      );
    }

    this.liveMode = false;
    this.isActive = true;
    this._startSync();

    // Listen for video events
    this.videoElement.addEventListener('pause', this._onVideoPause);
    this.videoElement.addEventListener('play', this._onVideoPlay);
    this.videoElement.addEventListener('seeked', this._onVideoSeeked);

    this._setStatus('playing', 'Český dabing aktivní');
    return true;
  }

  /**
   * Start live transcription mode using Web Speech API.
   * Transcribes audio in real-time, translates, and speaks in Czech.
   */
  async _startLiveMode() {
    this._setStatus('loading', 'Spouštím živý přepis audia...');

    this.liveMode = true;
    this.isActive = true;

    // Detect the video language - default to English
    const sourceLang = 'en-US';

    this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = sourceLang;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = async (event) => {
      if (!this.isActive) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim();
          if (transcript.length > 0) {
            console.log(`[CzechDub] Live transcript: "${transcript}"`);
            this._handleLiveTranscript(transcript);
          }
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('[CzechDub] Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        this._setStatus('error', 'Přístup k mikrofonu byl zamítnut. Povolte mikrofon pro živý přepis.');
        this.stop();
      } else if (event.error === 'no-speech') {
        // Restart after no speech detected
        if (this.isActive && this.liveMode) {
          try { this.recognition.start(); } catch (e) {}
        }
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if still active
      if (this.isActive && this.liveMode) {
        try { this.recognition.start(); } catch (e) {}
      }
    };

    try {
      this.recognition.start();
      this._setStatus('playing', 'Živý český dabing aktivní (mikrofon)');

      // Reduce video volume
      this.originalVolume = this.videoElement.volume;
      if (this._settings.muteOriginal) {
        this.videoElement.volume = 0;
      } else {
        this.videoElement.volume = this._settings.reducedOriginalVolume;
      }

      return true;
    } catch (err) {
      this._setStatus('error', `Nelze spustit přepis: ${err.message}`);
      return false;
    }
  }

  /**
   * Handle a live transcript chunk - translate and speak.
   */
  async _handleLiveTranscript(text) {
    try {
      // Translate to Czech
      const czechText = await this.translator.translate(text, 'en');
      if (!czechText || czechText === text) return;

      console.log(`[CzechDub] Translated: "${czechText}"`);

      // Show subtitle overlay
      this._showSubtitle(czechText, text);

      // Speak in Czech (reduce original volume while speaking)
      if (this._settings.muteOriginal) {
        this.videoElement.volume = 0;
      } else {
        this.videoElement.volume = this._settings.reducedOriginalVolume;
      }

      await this.tts.speak(czechText);

      // Restore volume
      if (this.isActive && this.videoElement) {
        this.videoElement.volume = this.originalVolume;
      }
    } catch (err) {
      console.warn('[CzechDub] Live translation error:', err);
    }
  }

  /**
   * Check if Web Speech API SpeechRecognition is available.
   */
  _isSpeechRecognitionAvailable() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Stop dubbing.
   */
  stop() {
    this.isActive = false;
    this.tts.stop();

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Stop live transcription
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }
    this.liveMode = false;

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

    this.translatedCaptions = [];
    this.currentIndex = -1;
    this._setStatus('idle', 'Dabing zastaven');
  }

  /**
   * Start the synchronization loop that matches TTS to video playback.
   */
  _startSync() {
    if (this.syncInterval) clearInterval(this.syncInterval);

    this.originalVolume = this.videoElement.volume;

    this.syncInterval = setInterval(() => {
      if (!this.isActive || !this.videoElement) return;
      if (this.videoElement.paused) return;

      const currentTime = this.videoElement.currentTime;
      this._processSync(currentTime);
    }, 150); // Check every 150ms
  }

  /**
   * Process sync - find and speak the caption for the current time.
   */
  _processSync(currentTime) {
    // Find the caption that should be playing now
    const captionIndex = this.translatedCaptions.findIndex(cap =>
      currentTime >= cap.start &&
      currentTime < cap.start + cap.duration + 0.5 // Small buffer
    );

    if (captionIndex === -1 || captionIndex === this.currentIndex) return;

    // New caption to speak
    this.currentIndex = captionIndex;
    const caption = this.translatedCaptions[captionIndex];

    // Stop any current speech
    this.tts.stop();

    // Reduce original audio volume
    if (this._settings.muteOriginal) {
      this.videoElement.volume = 0;
    } else {
      this.videoElement.volume = this._settings.reducedOriginalVolume;
    }

    // Calculate appropriate speech rate based on caption duration
    const estimatedDuration = this.tts.estimateDuration(caption.text);
    let adjustedRate = this._settings.ttsRate;
    if (estimatedDuration > caption.duration * 1.5) {
      // Speed up if text is too long for the time slot
      adjustedRate = Math.min(2.0, this._settings.ttsRate * (estimatedDuration / caption.duration));
    }

    // Speak the translated text
    this.tts.speak(caption.text, { rate: adjustedRate }).then(() => {
      // Restore volume after speaking
      if (this.isActive && this.videoElement) {
        this.videoElement.volume = this.originalVolume;
      }
    });

    // Show subtitle overlay
    this._showSubtitle(caption.text, caption.originalText);
  }

  /**
   * Show a subtitle overlay on the video.
   */
  _showSubtitle(czechText, originalText) {
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

    overlay.innerHTML = `
      <div class="czech-dub-text-main">${this._escapeHtml(czechText)}</div>
      ${originalText ? `<div class="czech-dub-text-original">${this._escapeHtml(originalText)}</div>` : ''}
    `;
    overlay.style.display = 'block';
    overlay.classList.add('czech-dub-visible');

    // Auto-hide after caption duration
    clearTimeout(this._subtitleTimeout);
    this._subtitleTimeout = setTimeout(() => {
      overlay.classList.remove('czech-dub-visible');
    }, 5000);
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Video event handlers
   */
  _onVideoPause = () => {
    if (this.isActive) {
      this.tts.pause();
      if (this.recognition && this.liveMode) {
        try { this.recognition.stop(); } catch (e) {}
      }
    }
  };

  _onVideoPlay = () => {
    if (this.isActive) {
      this.tts.resume();
      if (this.recognition && this.liveMode) {
        try { this.recognition.start(); } catch (e) {}
      }
    }
  };

  _onVideoSeeked = () => {
    if (this.isActive) {
      this.tts.stop();
      this.currentIndex = -1;
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

  /**
   * Load settings from Chrome storage.
   */
  async _loadSettings() {
    try {
      const result = await chrome.storage.local.get('czechDubSettings');
      if (result.czechDubSettings) {
        Object.assign(this._settings, result.czechDubSettings);
      }
    } catch (e) {
      // Storage may not be available
    }
  }

  /**
   * Save settings to Chrome storage.
   */
  async _saveSettings() {
    try {
      await chrome.storage.local.set({ czechDubSettings: this._settings });
    } catch (e) {
      // Storage may not be available
    }
  }

  _setStatus(status, message) {
    this.status = status;
    this.statusMessage = message;
    console.log(`[CzechDub] ${status}: ${message}`);
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
    // Notify popup
    try {
      chrome.runtime.sendMessage({
        type: 'status-update',
        status,
        message
      });
    } catch (e) {
      // Popup may not be open
    }
  }

  /**
   * Get current status.
   */
  getStatus() {
    return {
      status: this.status,
      message: this.statusMessage,
      liveMode: this.liveMode
    };
  }
}

window.DubbingController = DubbingController;
