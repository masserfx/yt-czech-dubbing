/**
 * DubbingController - Main orchestrator for the Czech dubbing feature.
 *
 * Strategy: Read English transcript segments from YouTube's Transcript panel,
 * translate them to Czech via Google Translate, and speak them via TTS
 * synchronized with video playback. This avoids all caption rollup
 * duplication issues.
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

    this._isSpeaking = false;
    this._speechQueue = [];

    // Transcript-based mode
    this._transcriptSegments = null; // translated segments with timestamps
    this._transcriptMode = false;
    this._lastSpokenIndex = -1;
    this._transcriptTimer = null;

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

      // Try transcript-based mode first (better quality)
      this._setStatus('loading', 'Načítám přepis videa...');
      const transcriptData = await this.extractor.fetchFullTranscript();

      if (transcriptData && transcriptData.segments.length > 0) {
        // Transcript mode — translate all segments, then play synchronized
        console.log(`[CzechDub] Got ${transcriptData.segments.length} transcript segments, translating...`);
        this._setStatus('translating', `Překládám přepis (${transcriptData.segments.length} segmentů)...`);

        this.isActive = true;
        this.originalVolume = this.videoElement.volume;

        const translated = await this.translator.translateCaptions(
          transcriptData.segments,
          transcriptData.sourceLang,
          (done, total) => {
            this._setStatus('translating', `Překládám: ${done}/${total}`);
          }
        );

        this._transcriptSegments = translated;
        this._transcriptMode = true;
        this._lastSpokenIndex = -1;

        // Listen for video events
        this.videoElement.addEventListener('pause', this._onVideoPause);
        this.videoElement.addEventListener('play', this._onVideoPlay);
        this.videoElement.addEventListener('seeked', this._onVideoSeeked);

        // Start transcript playback timer
        this._startTranscriptPlayback();

        this._setStatus('playing', 'Český dabing aktivní (přepis)');
        console.log('[CzechDub] Dubbing started - TRANSCRIPT mode');
        return true;
      }

      // Fallback: DOM-based caption mode
      console.log('[CzechDub] Transcript not available, falling back to caption DOM mode');
      this._setStatus('loading', 'Hledám titulky...');
      const hasCaptions = await this.extractor.hasCaptions();

      if (!hasCaptions) {
        this._setStatus('error', 'Titulky nejsou k dispozici pro toto video');
        return false;
      }

      this._setStatus('loading', 'Zapínám české titulky...');
      await this.extractor.enableCzechCaptions();

      this.isActive = true;
      this.originalVolume = this.videoElement.volume;
      this._transcriptMode = false;

      this.extractor.startObserving((text) => {
        this._onCaptionAppeared(text);
      });

      this.videoElement.addEventListener('pause', this._onVideoPause);
      this.videoElement.addEventListener('play', this._onVideoPlay);
      this.videoElement.addEventListener('seeked', this._onVideoSeeked);

      this._setStatus('playing', 'Český dabing aktivní');
      console.log('[CzechDub] Dubbing started - DOM caption mode (fallback)');
      return true;

    } catch (err) {
      console.error('[CzechDub] Start failed:', err);
      this._setStatus('error', `Chyba: ${err.message}`);
      return false;
    }
  }

  /**
   * Called when a caption line disappears from the DOM (complete line).
   * Translates to Czech if needed, then queues for TTS.
   */
  async _onCaptionAppeared(text) {
    if (!this.isActive) return;
    if (this.videoElement?.paused) return;
    if (!text || text.trim().length < 3) return;

    // Skip YouTube UI text
    if (text === 'Angličtina' || text === 'Čeština' || text.length < 5) return;

    // Check if text is already in Czech (contains Czech-specific chars)
    const isCzech = /[ěščřžýáíéúůďťň]/i.test(text);

    let czechText = text;
    if (!isCzech) {
      // Translate English to Czech via Google Translate
      try {
        const translated = await this.translator.translate(text, 'en');
        if (translated && translated.length > 2) {
          czechText = translated;
          console.log(`[CzechDub] Translated: "${text.substring(0, 40)}" → "${czechText.substring(0, 40)}"`);
        }
      } catch (e) {
        console.warn('[CzechDub] Translation failed, using original:', e.message);
      }
    }

    // Keep queue short — drop old items if backlogged
    while (this._speechQueue.length > 1) {
      this._speechQueue.shift();
    }

    this._speechQueue.push(czechText);
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
      console.log(`[CzechDub] TTS: "${text.substring(0, 60)}", voice=${this.tts.czechVoice?.name}`);
      await this.tts.speak(text);

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
   * Start transcript-based playback — check video time periodically
   * and speak the appropriate segment.
   */
  _startTranscriptPlayback() {
    if (this._transcriptTimer) clearInterval(this._transcriptTimer);

    this._transcriptTimer = setInterval(() => {
      if (!this.isActive || !this._transcriptMode) return;
      if (!this.videoElement || this.videoElement.paused) return;
      if (this._isSpeaking) return;

      const currentTime = this.videoElement.currentTime;
      const nextIndex = this._findNextSegment(currentTime);

      if (nextIndex !== -1 && nextIndex !== this._lastSpokenIndex) {
        const segment = this._transcriptSegments[nextIndex];
        // Only speak if we're within 0.5s of segment start
        if (Math.abs(currentTime - segment.start) < 1.5) {
          this._lastSpokenIndex = nextIndex;
          this._speakSegment(segment);
        }
      }
    }, 200);
  }

  /**
   * Find the next transcript segment to speak based on current video time.
   */
  _findNextSegment(currentTime) {
    if (!this._transcriptSegments) return -1;

    for (let i = 0; i < this._transcriptSegments.length; i++) {
      const seg = this._transcriptSegments[i];
      // Find first segment that starts at or after currentTime and hasn't been spoken
      if (seg.start >= currentTime - 0.5 && seg.start <= currentTime + 1.5) {
        if (i > this._lastSpokenIndex) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * Speak a single transcript segment with volume management.
   */
  async _speakSegment(segment) {
    if (!this.isActive) return;

    this._isSpeaking = true;
    const czechText = segment.text;

    try {
      // Reduce video volume
      if (this.videoElement) {
        if (this._settings.muteOriginal) {
          this.videoElement.volume = 0;
        } else {
          this.videoElement.volume = this._settings.reducedOriginalVolume;
        }
      }

      this._showSubtitle(czechText);

      console.log(`[CzechDub] TTS[${segment.start.toFixed(1)}s]: "${czechText.substring(0, 60)}"`);
      await this.tts.speak(czechText);

    } catch (e) {
      console.warn('[CzechDub] TTS error:', e);
    } finally {
      if (this.isActive && this.videoElement) {
        this.videoElement.volume = this.originalVolume;
      }
      this._isSpeaking = false;
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
    this._isSpeaking = false;

    // Clear transcript mode state
    this._transcriptMode = false;
    this._transcriptSegments = null;
    this._lastSpokenIndex = -1;
    if (this._transcriptTimer) {
      clearInterval(this._transcriptTimer);
      this._transcriptTimer = null;
    }

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
      this._isSpeaking = false;

      if (this._transcriptMode) {
        // Reset to find the right segment for new position
        const currentTime = this.videoElement?.currentTime || 0;
        // Find the segment just before current time
        this._lastSpokenIndex = -1;
        if (this._transcriptSegments) {
          for (let i = this._transcriptSegments.length - 1; i >= 0; i--) {
            if (this._transcriptSegments[i].start < currentTime - 1) {
              this._lastSpokenIndex = i;
              break;
            }
          }
        }
        console.log(`[CzechDub] Seeked to ${currentTime.toFixed(1)}s, resuming from segment ${this._lastSpokenIndex + 1}`);
      } else {
        this.extractor.onSeek();
      }
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
