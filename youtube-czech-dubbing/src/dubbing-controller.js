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
    this.voicedubClient = new VoiceDubClient();
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
      await this.voicedubClient.loadConfig();

      // Wire service client for B2B mode
      this.translator._serviceClient = this.serviceClient;
      this.tts._serviceClient = this.serviceClient;

      if (this.voicedubClient.isEnabled()) {
        console.log('[CzechDub] VoiceDub B2B API enabled — primary path');
        this._showAIDisclosure();
      }

      // Apply target language
      this._targetLang = this.translator._targetLang;
      this._langConfig = this.translator._langConfig;
      this.tts.setTargetLanguage(this._targetLang);

      // Wait for TTS voices
      await this.tts.waitForVoice();

      const voiceInfo = this.tts.getVoiceInfo();
      console.log(`[CzechDub] TTS Voice: ${voiceInfo.name || 'none'} (${voiceInfo.lang}), isTargetLang: ${voiceInfo.isTargetLang}`);

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

        // Detect speaker roles (LLM + heuristics)
        if (translated.length > 0 && this.translator._geminiApiKey) {
          this._setStatus('translating', 'Detekuji mluvčí...');
          await SpeakerDetector.detectViaLLM(translated, this.translator._geminiApiKey);
        }
        SpeakerDetector.detectHeuristics(translated);

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

      // Check captions availability (may already be enabled from step 1)
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
      // 1500ms — combines 2-3 caption fragments into coherent sentences;
      // still short enough to keep DOM caption mode responsive.
      this._sentenceFlushTimer = setTimeout(() => {
        this._flushSentenceBuffer();
      }, 1500);
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
      let speaker = null;
      let audioBase64 = null;

      // Primary path: VoiceDub B2B API (translation + TTS in 1 call)
      if (!isCzech && this.voicedubClient.isEnabled()) {
        try {
          const dub = await this.voicedubClient.dub(fullText, this._targetLang);
          if (dub && dub.translated) {
            const parsed = SpeakerDetector.parseTag(dub.translated);
            czechText = parsed.text;
            speaker = parsed.speaker || SpeakerDetector.detectFromText(fullText);
            audioBase64 = dub.audioBase64;
            console.log(`[CzechDub] VoiceDub dubbed: "${fullText.substring(0, 60)}" → "${czechText.substring(0, 60)}"${audioBase64 ? ' [audio]' : ''}`);
          }
        } catch (e) {
          console.warn('[CzechDub] VoiceDub failed, fallback to translator+TTS:', e.message);
        }
      }

      // Fallback: legacy translator → TTS
      if (!isCzech && !audioBase64 && czechText === fullText) {
        try {
          const translated = await this.translator.translate(fullText, 'en');
          if (translated && translated.length > 2) {
            const parsed = SpeakerDetector.parseTag(translated);
            czechText = parsed.text;
            speaker = parsed.speaker || SpeakerDetector.detectFromText(fullText);
            console.log(`[CzechDub] Translated: "${fullText.substring(0, 80)}" → "${czechText.substring(0, 80)}"${speaker ? ` [${speaker}]` : ''}`);
          }
        } catch (e) {
          console.warn('[CzechDub] Translation failed, using original:', e.message);
        }
      }

      // Aggressive drop — keep only newest item to avoid desync in DOM caption mode
      while (this._speechQueue.length > 0) {
        this._speechQueue.shift();
      }

      this._speechQueue.push({ text: czechText, speaker, audioBase64, createdAt: Date.now() });
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
    const item = this._speechQueue.shift();

    // Skip stale items (>8s old) to prevent playing content that's too far behind video
    if (typeof item === 'object' && item.createdAt && Date.now() - item.createdAt > 8000) {
      console.log(`[CzechDub] Skipping stale audio (${Math.round((Date.now() - item.createdAt) / 1000)}s old): "${(item.text || '').substring(0, 50)}"`);
      this._isSpeaking = false;
      this._processQueue();
      return;
    }

    const text = typeof item === 'string' ? item : item.text;
    const speaker = typeof item === 'string' ? null : item.speaker;
    const audioBase64 = typeof item === 'string' ? null : item.audioBase64;

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

      if (audioBase64) {
        console.log(`[CzechDub] VoiceDub audio: "${text.substring(0, 60)}"`);
        await this._playAudioBase64(audioBase64);
      } else {
        const speakerTag = speaker ? `[${speaker}]` : '';
        console.log(`[CzechDub] TTS${speakerTag}: "${text.substring(0, 60)}"${speaker ? '' : `, voice=${this.tts.czechVoice?.name}`}`);
        await this.tts.speakAs(text, speaker);
      }

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

      const speakerTag = segment.speaker ? `[${segment.speaker}]` : '';
      console.log(`[CzechDub] TTS[${segment.start.toFixed(1)}s @${segRate.toFixed(1)}x]${speakerTag}: "${czechText.substring(0, 100)}" (orig: "${(segment.originalText || '').substring(0, 80)}")`);

      let played = false;
      if (this.voicedubClient.isEnabled()) {
        // SSML rate maps from TTS rate multiplier: 1.0 → 0%, 1.25 → +25%, 1.8 → +80%
        const ssmlSpeed = Math.round((segRate - 1) * 100);
        const result = await this.voicedubClient.synthesize(czechText, {
          language: this._targetLang,
          speed: ssmlSpeed,
        });
        if (result?.audioBase64) {
          console.log(`[CzechDub] VoiceDub TTS (cached=${result.cached}): "${czechText.substring(0, 60)}"`);
          await this._playAudioBase64(result.audioBase64);
          played = true;
        }
      }

      if (!played) {
        await this.tts.speakAs(czechText, segment.speaker);
      }

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
    if (this._stopping) return;
    this._stopping = true;
    this.isActive = false;
    this._isStarting = false;
    this.tts.stop();
    this.extractor.stopObserving();

    if (this._currentAudio) {
      try { this._currentAudio.pause(); } catch (e) {}
      this._currentAudio = null;
    }

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
    this._stopping = false;
  }

  /**
   * AI Act čl. 50 — session-level disclosure. Shown once at dubbing start (~4s).
   * Replaces per-segment audio watermark from backend (which is now disabled per-request).
   */
  _showAIDisclosure() {
    const banner = document.createElement('div');
    banner.id = 'czech-dub-ai-disclosure';
    banner.textContent = '🤖 Dabing vygenerovaný umělou inteligencí (VoiceDub)';
    Object.assign(banner.style, {
      position: 'fixed', top: '70px', right: '16px', zIndex: '2147483647',
      background: 'rgba(0,0,0,0.82)', color: '#fff', padding: '10px 14px',
      borderRadius: '6px', fontSize: '13px', fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transition: 'opacity 0.4s',
    });
    document.body.appendChild(banner);
    setTimeout(() => { banner.style.opacity = '0'; }, 4000);
    setTimeout(() => { banner.remove(); }, 4500);
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
      if (this._currentAudio) {
        try { this._currentAudio.pause(); } catch (e) {}
      }
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
      if (this._currentAudio) {
        try { this._currentAudio.pause(); } catch (e) {}
        this._currentAudio = null;
      }
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

    // Apply TTS engine and voice changes
    if ('ttsEngine' in settings || 'azureTtsVoice' in settings || 'edgeTtsVoice' in settings) {
      this.tts._loadTTSSettings();
    }

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

  /**
   * Play audio from base64-encoded MP3 (VoiceDub response).
   * Content script runs in DOM context, so URL.createObjectURL + Audio work here.
   */
  _playAudioBase64(b64) {
    return new Promise((resolve) => {
      let url;
      try {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = this._settings.ttsVolume ?? 1.0;
        audio.playbackRate = 1.25;
        const cleanup = () => {
          if (url) URL.revokeObjectURL(url);
          resolve();
        };
        audio.onended = cleanup;
        audio.onerror = () => {
          console.warn('[CzechDub] VoiceDub audio playback error');
          cleanup();
        };
        this._currentAudio = audio;
        audio.play().catch((e) => {
          console.warn('[CzechDub] audio.play() rejected:', e.message);
          cleanup();
        });
      } catch (e) {
        console.warn('[CzechDub] _playAudioBase64 failed:', e.message);
        if (url) URL.revokeObjectURL(url);
        resolve();
      }
    });
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
      if (e.message?.includes('Extension context invalidated') && !this._stopping) {
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
