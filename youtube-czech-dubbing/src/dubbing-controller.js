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
    this.serviceClient = new ServiceClient();
    this.cache = new DubbingCache();
    this._targetLang = DEFAULT_LANGUAGE;
    this._langConfig = getLanguageConfig(DEFAULT_LANGUAGE);
    this._cachedPlayback = false; // true when playing from cache

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

    // Sentence buffer for DOM caption mode — accumulates lines until sentence boundary
    this._sentenceBuffer = '';
    this._sentenceFlushTimer = null;
    this._translationQueue = Promise.resolve(); // ensures translations are queued in order

    this._settings = {
      ttsRate: 1.25,
      ttsMaxRate: 1.8,
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

    this._isStarting = true;
    this._setStatus('loading', 'Načítání...');

    try {
      // Verify extension context is still valid
      try {
        await chrome.runtime.sendMessage({ type: 'ping' });
      } catch (e) {
        if (e.message?.includes('Extension context invalidated')) {
          this.translator._contextInvalidated = true;
          this.translator._showReloadBanner();
          this._setStatus('error', 'Rozšíření bylo aktualizováno — reload stránky');
          return false;
        }
      }

      // Find video element
      this.videoElement = document.querySelector('video.html5-main-video') ||
                          document.querySelector('video');

      if (!this.videoElement) {
        this._setStatus('error', 'Video element nenalezen');
        return false;
      }

      // Load settings
      await this._loadSettings();
      await this.translator.loadSettings();
      await this.serviceClient.loadConfig();

      // Wire service client for B2B mode
      this.translator._serviceClient = this.serviceClient;
      this.tts._serviceClient = this.serviceClient;

      // Apply target language
      this._targetLang = this.translator._targetLang;
      this._langConfig = this.translator._langConfig;
      this.tts.setTargetLanguage(this._targetLang);

      // Wait for TTS voices
      await this.tts.waitForVoice();

      const voiceInfo = this.tts.getVoiceInfo();
      console.log(`[CzechDub] TTS Voice: ${voiceInfo.name || 'none'} (${voiceInfo.lang}), isCzech: ${voiceInfo.isCzech}`);

      // Apply TTS settings
      this.tts.setRate(this._settings.ttsRate);
      this.tts.setVolume(this._settings.ttsVolume);
      this.tts.setPitch(this._settings.ttsPitch);

      // Step 0: Check cache for previously translated segments
      const videoId = DubbingCache.getVideoId();
      if (videoId) {
        this._setStatus('loading', 'Hledám uložený překlad...');
        const cached = await this.cache.load(videoId, this._targetLang);
        if (cached && cached.segments && cached.segments.length > 0) {
          console.log(`[CzechDub] Cache hit: ${cached.segmentCount} segments (${cached.engine}, ${new Date(cached.savedAt).toLocaleDateString()})`);

          this.isActive = true;
          this.originalVolume = this.videoElement.volume;
          this._cachedPlayback = true;

          this._transcriptSegments = this._optimizeForTiming(cached.segments);
          this._transcriptMode = true;
          this._lastSpokenIndex = -1;

          this.videoElement.addEventListener('pause', this._onVideoPause);
          this.videoElement.addEventListener('play', this._onVideoPlay);
          this.videoElement.addEventListener('seeked', this._onVideoSeeked);

          this._startTranscriptPlayback();

          this._setStatus('playing', `Dabing z cache (${cached.segmentCount} segmentů)`);
          console.log('[CzechDub] Dubbing started - CACHED TRANSCRIPT mode');
          return true;
        }
      }

      // Step 1: Try to get YouTube auto-translated captions first
      this._setStatus('loading', 'Hledám české titulky...');
      const hasCaptions = await this.extractor.hasCaptions();
      if (hasCaptions) {
        // Request YouTube to auto-translate captions into target language
        await this.extractor.enableCaptions(this._targetLang);
        this._setStatus('loading', 'Čekám na přepis...');
        await this._sleep(3000);
      }

      let transcriptData = await this.extractor.fetchFullTranscript();

      // Step 2: If still no transcript, try without auto-translate
      if (!transcriptData) {
        this._setStatus('loading', 'Načítám přepis videa...');
        await this._sleep(2000);
        transcriptData = await this.extractor.fetchFullTranscript();
      }

      this.isActive = true;
      this.originalVolume = this.videoElement.volume;
      this._cachedPlayback = false;

      if (transcriptData && transcriptData.segments.length > 0) {
        let translated;
        let sourceLang = transcriptData.sourceLang;
        const isCzech = sourceLang === this._targetLang;
        console.log(`[CzechDub] Transcript sourceLang: ${sourceLang}, isCzech: ${isCzech}`);

        if (isCzech) {
          // Already in Czech (from YouTube auto-translate) — group into sentences, no re-translation
          console.log(`[CzechDub] Got ${transcriptData.segments.length} Czech segments, grouping into sentences...`);
          this._setStatus('translating', 'Přepis již v češtině, seskupuji do vět...');
          translated = this._groupSegmentsIntoSentences(transcriptData.segments);
          console.log(`[CzechDub] Grouped into ${translated.length} sentences`);
        } else {
          // Translate from source language to Czech
          console.log(`[CzechDub] Got ${transcriptData.segments.length} transcript segments, translating...`);
          this._setStatus('translating', `Překládám přepis (${transcriptData.segments.length} segmentů)...`);

          translated = await this.translator.translateCaptions(
            transcriptData.segments,
            sourceLang,
            (done, total) => {
              if (!this._isStarting) return; // cancelled during translation
              this._setStatus('translating', `Překládám: ${done}/${total}`);
            }
          );
        }

        // Check if stopped during translation
        if (!this._isStarting) {
          this.isActive = false;
          return false;
        }

        // Validate and optimize translations against time constraints
        this._transcriptSegments = this._optimizeForTiming(translated);
        this._transcriptMode = true;
        this._lastSpokenIndex = -1;

        // Save to cache for future playback
        if (videoId && translated.length > 0) {
          const engine = isCzech ? 'youtube-native' : (this.translator._lastEngine || 'unknown');
          this.cache.save(videoId, this._targetLang, translated, sourceLang, engine);
        }

        this.videoElement.addEventListener('pause', this._onVideoPause);
        this.videoElement.addEventListener('play', this._onVideoPlay);
        this.videoElement.addEventListener('seeked', this._onVideoSeeked);

        this._startTranscriptPlayback();

        this._setStatus('playing', 'Český dabing aktivní (přepis)');
        console.log('[CzechDub] Dubbing started - TRANSCRIPT mode');
        return true;
      }

      // Fallback: DOM-based caption mode
      console.log('[CzechDub] Transcript not available, using DOM caption mode');
      this._transcriptMode = false;

      // Enable captions if not already enabled
      const hasCaptions = await this.extractor.hasCaptions();
      if (!hasCaptions) {
        this._setStatus('error', 'Titulky nejsou k dispozici pro toto video');
        return false;
      }

      // Captions may already be enabled from step 2
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
   * Buffers lines and translates complete sentences for better quality.
   */
  _onCaptionAppeared(text) {
    if (!this.isActive) return;
    if (this.videoElement?.paused) return;
    if (!text || text.trim().length < 3) return;

    // Skip YouTube UI text
    if (text === 'Angličtina' || text === 'Čeština' || text.length < 5) return;

    // Add to sentence buffer with space
    if (this._sentenceBuffer) {
      this._sentenceBuffer += ' ' + text;
    } else {
      this._sentenceBuffer = text;
    }

    // Clear any pending flush timer
    if (this._sentenceFlushTimer) {
      clearTimeout(this._sentenceFlushTimer);
    }

    // Check if buffer ends with a sentence boundary
    const endsWithSentence = /[.!?][""]?\s*$/.test(this._sentenceBuffer);
    // Flush if buffer is getting long (over ~250 chars)
    const bufferLong = this._sentenceBuffer.length > 250;

    if (endsWithSentence || bufferLong) {
      this._flushSentenceBuffer();
    } else {
      // Wait for more text — captions arrive every ~3-4s
      // Use longer timeout to combine more fragments
      this._sentenceFlushTimer = setTimeout(() => {
        this._flushSentenceBuffer();
      }, 4000);
    }
  }

  /**
   * Flush the sentence buffer — translate the accumulated text and queue for TTS.
   * Uses a sequential promise chain to guarantee translation order.
   */
  _flushSentenceBuffer() {
    if (this._sentenceFlushTimer) {
      clearTimeout(this._sentenceFlushTimer);
      this._sentenceFlushTimer = null;
    }

    const fullText = this._sentenceBuffer.trim();
    this._sentenceBuffer = '';

    if (!fullText || fullText.length < 3) return;
    if (!this.isActive) return;

    // Chain translation to ensure ordering
    this._translationQueue = this._translationQueue.then(async () => {
      if (!this.isActive) return;

      const isCzech = this._langConfig.diacriticsRegex.test(fullText);

      let czechText = fullText;
      if (!isCzech) {
        try {
          const translated = await this.translator.translate(fullText, 'en');
          if (translated && translated.length > 2) {
            czechText = translated;
            console.log(`[CzechDub] Translated: "${fullText.substring(0, 80)}" → "${czechText.substring(0, 80)}"`);
          }
        } catch (e) {
          console.warn('[CzechDub] Translation failed, using original:', e.message);
        }
      }

      // Keep queue short — drop old items if backlogged
      while (this._speechQueue.length > 2) {
        this._speechQueue.shift();
      }

      this._speechQueue.push(czechText);
      this._processQueue();
    });
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
      // Always restore volume — even if stopped (isActive=false)
      if (this.videoElement) {
        this.videoElement.volume = this.originalVolume ?? 1.0;
      }
      this._isSpeaking = false;

      // Process next in queue
      if (this._speechQueue.length > 0) {
        this._processQueue();
      }
    }
  }

  /**
   * Optimize translated segments for TTS timing.
   * Ensures translations fit within their time window.
   * Group small ASR segments into natural sentences for smoother TTS playback.
   * Merges consecutive segments until a sentence boundary (. ! ?) or 200 chars.
   */
  _groupSegmentsIntoSentences(segments) {
    const groups = [];
    let buffer = '';
    let groupSegs = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.text || !seg.text.trim()) continue;

      groupSegs.push(seg);
      buffer += (buffer ? ' ' : '') + seg.text.trim();

      // End group on sentence boundary, long buffer, or last segment
      const isSentenceEnd = /[.!?]["»"]?\s*$/.test(buffer);
      const isLong = buffer.length > 200;
      const isLast = i === segments.length - 1;

      if (isSentenceEnd || isLong || isLast) {
        const firstSeg = groupSegs[0];
        const lastSeg = groupSegs[groupSegs.length - 1];
        groups.push({
          start: firstSeg.start,
          duration: (lastSeg.start + (lastSeg.duration || 2)) - firstSeg.start,
          originalText: buffer.trim(),
          text: buffer.trim()
        });
        buffer = '';
        groupSegs = [];
      }
    }

    return groups;
  }

  /**
   * Splits overly long translations, trims trailing filler.
   */
  _optimizeForTiming(segments) {
    const baseRate = this._settings.ttsRate || 1.25;
    const maxRate = this._settings.ttsMaxRate || 1.8;
    // Czech TTS: ~140 words/min at rate 1.0 (Czech words are longer than English)
    const baseWordsPerSec = 140 / 60;

    let speedAdjusted = 0;
    let trimmed = 0;
    for (const seg of segments) {
      if (!seg.text || !seg.duration) continue;

      const words = seg.text.split(/\s+/);
      const estimatedDuration = words.length / (baseWordsPerSec * baseRate);
      const availableTime = seg.duration * 1.2; // allow 20% overflow

      if (estimatedDuration > availableTime) {
        // Calculate required rate to fit text into available time
        const requiredRate = (words.length / baseWordsPerSec) / availableTime;
        // Cap at user-configured max rate to keep speech intelligible
        seg._ttsRate = Math.min(maxRate, requiredRate);
        speedAdjusted++;

        // Only trim if even at max rate it won't fit
        const maxRateDuration = words.length / (baseWordsPerSec * maxRate);
        if (maxRateDuration > availableTime && words.length > 5) {
          const maxWords = Math.max(5, Math.floor(words.length * (availableTime / maxRateDuration)));
          seg.text = words.slice(0, maxWords).join(' ');
          trimmed++;
        }
      }

      // Clean trailing incomplete phrases
      if (this._langConfig.trailingWords) {
        seg.text = seg.text.replace(this._langConfig.trailingWords, '');
      }
    }

    if (speedAdjusted > 0 || trimmed > 0) {
      console.log(`[CzechDub] Optimized timing: ${speedAdjusted} segments speed-adjusted, ${trimmed} trimmed`);
    }
    return segments;
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

      if (nextIndex !== -1) {
        this._lastSpokenIndex = nextIndex;
        this._speakSegment(this._transcriptSegments[nextIndex]);
      }
    }, 200);
  }

  /**
   * Find the next transcript segment to speak based on current video time.
   * Segments are now sentence-level groups with wider time ranges.
   */
  _findNextSegment(currentTime) {
    if (!this._transcriptSegments) return -1;

    for (let i = this._lastSpokenIndex + 1; i < this._transcriptSegments.length; i++) {
      const seg = this._transcriptSegments[i];
      const segEnd = seg.start + (seg.duration || 5);
      // Speak if current time is within the segment's time range
      if (currentTime >= seg.start - 0.5 && currentTime <= segEnd) {
        return i;
      }
      // Skip segments we've already passed
      if (seg.start > currentTime + 2) break;
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

      // Use per-segment rate if timing optimization calculated one, otherwise default
      const segRate = segment._ttsRate || this._settings.ttsRate || 1.1;
      if (segment._ttsRate) {
        this.tts.setRate(segRate);
      }

      console.log(`[CzechDub] TTS[${segment.start.toFixed(1)}s @${segRate.toFixed(1)}x]: "${czechText.substring(0, 100)}" (orig: "${(segment.originalText || '').substring(0, 80)}")`);
      await this.tts.speak(czechText);

      // Restore default rate if we changed it
      if (segment._ttsRate) {
        this.tts.setRate(this._settings.ttsRate || 1.1);
      }

    } catch (e) {
      console.warn('[CzechDub] TTS error:', e);
    } finally {
      // Always restore volume — even if stopped (isActive=false)
      if (this.videoElement) {
        this.videoElement.volume = this.originalVolume ?? 1.0;
      }
      this._isSpeaking = false;
    }
  }

  /**
   * Stop dubbing.
   */
  stop() {
    this.isActive = false;
    this._isStarting = false;
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

    // Clear sentence buffer
    this._sentenceBuffer = '';
    if (this._sentenceFlushTimer) {
      clearTimeout(this._sentenceFlushTimer);
      this._sentenceFlushTimer = null;
    }

    // Restore original volume
    if (this.videoElement) {
      this.videoElement.volume = this.originalVolume ?? 1.0;
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
      // Chrome's synth.pause() is unreliable — cancel speech instead
      this.tts.stop();
      this._isSpeaking = false;
      // Restore volume while paused
      if (this.videoElement) {
        this.videoElement.volume = this.originalVolume;
      }
    }
  };

  _onVideoPlay = () => {
    if (this.isActive) {
      // Speech was cancelled on pause — playback timer will pick up next segment
      this._isSpeaking = false;
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
        // Clear sentence buffer on seek
        this._sentenceBuffer = '';
        if (this._sentenceFlushTimer) {
          clearTimeout(this._sentenceFlushTimer);
          this._sentenceFlushTimer = null;
        }
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

    // Re-optimize per-segment rates when base rate or max rate changes
    if (('ttsRate' in settings || 'ttsMaxRate' in settings) && this._transcriptSegments) {
      this._optimizeForTiming(this._transcriptSegments);
    }

    // Apply original volume change immediately during playback
    if (('reducedOriginalVolume' in settings || 'muteOriginal' in settings) && this._isSpeaking && this.videoElement) {
      if (this._settings.muteOriginal) {
        this.videoElement.volume = 0;
      } else {
        this.videoElement.volume = this._settings.reducedOriginalVolume;
      }
    }

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

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        this.stop();
        // Show reload banner via translator (it has the method)
        if (this.translator?._showReloadBanner) {
          this.translator._showReloadBanner();
        }
      }
    }
  }

  getStatus() {
    return {
      status: this.status,
      message: this.statusMessage
    };
  }
}

window.DubbingController = DubbingController;
