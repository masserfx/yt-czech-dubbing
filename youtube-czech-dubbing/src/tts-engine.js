/**
 * TTSEngine - Text-to-Speech engine for YouTube dubbing.
 * Uses Web Speech API (SpeechSynthesis) built into Chrome.
 * Supports multiple languages with automatic voice selection.
 */
class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.selectedVoice = null;
    this.queue = [];
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.volume = 0.9;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onSpeakStart = null;
    this.onSpeakEnd = null;
    this.voiceReady = false;

    // Language config
    this._targetLang = DEFAULT_LANGUAGE;
    this._langConfig = getLanguageConfig(DEFAULT_LANGUAGE);

    // TTS engine settings
    this._ttsEngine = 'browser'; // 'browser', 'edge', or 'azure'
    this._edgeVoice = 'cs-CZ-AntoninNeural';
    this._azureKey = null;
    this._azureRegion = null;
    this._azureVoice = 'cs-CZ-VlastaNeural';
    this._currentAudio = null;

    // Service mode
    this._serviceClient = null;

    this._initVoice();
    this._loadTTSSettings();
  }

  async _loadTTSSettings() {
    try {
      const result = await chrome.storage.local.get('popupSettings');
      if (result.popupSettings) {
        this._ttsEngine = result.popupSettings.ttsEngine || 'browser';
        // Migrate old browser-deep to browser
        if (this._ttsEngine === 'browser-deep') this._ttsEngine = 'browser';
        this._edgeVoice = result.popupSettings.edgeTtsVoice || 'cs-CZ-AntoninNeural';
        console.log(`[Dub TTS] Settings loaded: engine=${this._ttsEngine}, edgeVoice=${this._edgeVoice}, azureVoice=${result.popupSettings.azureTtsVoice}`);
        this._azureKey = result.popupSettings.azureTtsKey || null;
        this._azureRegion = result.popupSettings.azureTtsRegion || 'westeurope';
        this._azureVoice = result.popupSettings.azureTtsVoice || this._langConfig.azureVoices[0]?.id || 'cs-CZ-VlastaNeural';
        if (result.popupSettings.targetLanguage) {
          this._targetLang = result.popupSettings.targetLanguage;
          this._langConfig = getLanguageConfig(this._targetLang);
        }
        // Restore saved browser voice preference
        if (result.popupSettings.browserVoiceName) {
          this.setVoice(result.popupSettings.browserVoiceName);
        }
      }
    } catch (e) {}
  }

  /**
   * Set target language and re-select voice.
   */
  setTargetLanguage(langCode) {
    this._targetLang = langCode;
    this._langConfig = getLanguageConfig(langCode);
    this.selectedVoice = null;
    this.voiceReady = false;
    // Only reset Azure voice if no matching voice for new language is already set
    if (!this._azureVoice || !this._azureVoice.startsWith(langCode)) {
      this._azureVoice = this._langConfig.azureVoices[0]?.id || this._azureVoice;
    }
    this._initVoice();
  }

  /**
   * Initialize and find the best voice for the configured language.
   */
  _initVoice() {
    const isPremiumVoice = (name) => {
      return /premium|prémiov|enhanced|vylepšen|profi|hq|\(.*kvalit/i.test(name);
    };

    const findBestVoice = () => {
      const voices = this.synth.getVoices();
      if (voices.length === 0) return;

      const langConfig = this._langConfig;
      const fallbackLangs = langConfig.voiceFallbackLangs;
      const priorityPatterns = langConfig.voicePriority;

      // Filter voices matching any of the fallback language prefixes
      const matchingVoices = voices.filter(v =>
        fallbackLangs.some(lang => v.lang === lang || v.lang.startsWith(lang.split('-')[0]))
      );

      console.log(`[Dub TTS] Total voices: ${voices.length}, ${langConfig.name} matching: ${matchingVoices.length}`);
      matchingVoices.forEach(v => {
        console.log(`[Dub TTS]   - "${v.name}" lang=${v.lang} local=${v.localService}`);
      });

      // Try priority patterns first (premium, specific names)
      let best = null;
      for (const pattern of priorityPatterns) {
        best = matchingVoices.find(v => pattern.test(v.name) && isPremiumVoice(v.name));
        if (best) break;
      }
      if (!best) {
        for (const pattern of priorityPatterns) {
          best = matchingVoices.find(v => pattern.test(v.name));
          if (best) break;
        }
      }
      // Fallback: any voice for primary language
      if (!best) best = matchingVoices.find(v => v.lang === langConfig.bcp47);
      if (!best) best = matchingVoices.find(v => v.lang.startsWith(langConfig.code));
      // Last resort: any matching voice
      if (!best && matchingVoices.length > 0) best = matchingVoices[0];

      if (best) {
        const bestIsPremium = isPremiumVoice(best.name);
        const currentIsPremium = this.selectedVoice && isPremiumVoice(this.selectedVoice.name);
        if (!this.selectedVoice || bestIsPremium || !currentIsPremium) {
          this.selectedVoice = best;
        }
        console.log(`[Dub TTS] Selected: "${this.selectedVoice.name}" (${this.selectedVoice.lang})`);
        this.voiceReady = true;
      } else {
        console.warn(`[Dub TTS] No voice found for ${langConfig.name}! Using lang="${langConfig.bcp47}" hint.`);
        this.voiceReady = true;
      }
    };

    const voices = this.synth.getVoices();
    if (voices.length > 0) findBestVoice();
    this.synth.onvoiceschanged = () => findBestVoice();
    setTimeout(() => findBestVoice(), 500);
    setTimeout(() => findBestVoice(), 1500);
    setTimeout(() => findBestVoice(), 3000);
  }

  async waitForVoice() {
    // Ensure TTS settings are loaded before proceeding
    await this._loadTTSSettings();

    // Azure TTS doesn't need browser voice selection
    if (this._ttsEngine === 'azure' || this._ttsEngine === 'edge') {
      this.voiceReady = true;
      return;
    }

    if (this.voiceReady && this.selectedVoice) return;
    return new Promise(resolve => {
      const check = () => {
        if (this.voiceReady && this.selectedVoice) { resolve(); return; }
        const voices = this.synth.getVoices();
        if (voices.length > 0) { this._initVoice(); resolve(); return; }
        setTimeout(check, 200);
      };
      check();
      setTimeout(() => { this.voiceReady = true; resolve(); }, 3000);
    });
  }

  /**
   * Get list of available voices for the configured language.
   */
  getAvailableVoices() {
    const fallbackLangs = this._langConfig.voiceFallbackLangs;
    return this.synth.getVoices().filter(v =>
      fallbackLangs.some(lang => v.lang === lang || v.lang.startsWith(lang.split('-')[0]))
    );
  }

  setVoice(voiceName) {
    const voices = this.synth.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    if (voice) this.selectedVoice = voice;
  }

  getVoiceInfo() {
    if (this._ttsEngine === 'edge') {
      const voiceLabel = this._edgeVoice.includes('Antonin') ? 'Antonín (muž)' : 'Vlasta (žena)';
      return {
        available: true,
        name: `Edge: ${voiceLabel}`,
        lang: this._edgeVoice.substring(0, 5),
        isTargetLang: this._edgeVoice.startsWith(this._targetLang)
      };
    }
    if (this._ttsEngine === 'azure') {
      return {
        available: true,
        name: `Azure: ${this._azureVoice}`,
        lang: this._azureVoice.substring(0, 5),
        isTargetLang: this._azureVoice.startsWith(this._targetLang)
      };
    }
    if (this.selectedVoice) {
      return {
        available: true,
        name: this.selectedVoice.name,
        lang: this.selectedVoice.lang,
        isTargetLang: this.selectedVoice.lang.startsWith(this._targetLang)
      };
    }
    return {
      available: false,
      name: null,
      lang: this._langConfig.bcp47,
      isTargetLang: false
    };
  }

  // Back-compat alias
  get czechVoice() { return this.selectedVoice; }

  speak(text, options = {}) {
    if (!text || text.replace(/[.\s!?,;:…]+/g, '').length === 0) return Promise.resolve();
    console.log(`[Dub TTS] speak() engine=${this._ttsEngine}, edgeVoice=${this._edgeVoice}`);

    // iOS Safari: speechSynthesis in content-script context is no-op.
    // Use Google Translate TTS URL via <audio> element instead — works after audio unlock.
    if (typeof window !== 'undefined' && window.__CZECHDUB_IOS__) {
      return this._speakIOSAudio(text, options);
    }

    // Service mode: use centralized TTS API
    if (this._serviceClient?.isServiceMode()) {
      return this._speakService(text, options);
    }

    if (this._ttsEngine === 'edge') {
      return this._speakEdge(text, options);
    }
    if (this._ttsEngine === 'azure' && this._azureKey) {
      return this._speakAzure(text, options);
    }
    return this._speakBrowser(text, options);
  }

  /**
   * iOS dispatcher: Safari iOS has two hard blockers:
   *   1. speechSynthesis.speak() is a no-op in WebExtension content-script
   *      context (engine says speaking=false, pending=false, onstart never fires).
   *   2. fetch/audio.src to translate.google.com/translate_tts is blocked by
   *      CORS + YouTube CSP (Access-Control-Allow-Origin: 404).
   *
   * Solution: route through background service worker (where WebSocket + fetch
   * with host_permissions work), get base64 MP3, play via data:audio/mpeg URL
   * (data: URLs are allowed by YouTube CSP media-src).
   *
   * Path:  background → Edge TTS WSS → MP3 → base64 → data: URL → <audio> play
   * Fallback: native speechSynthesis (only works on some iOS versions/pages)
   */
  async _speakIOSAudio(text, options) {
    if (this.onSpeakStart) this.onSpeakStart(text);
    this.isSpeaking = true;
    try {
      const lang = (this._langConfig?.bcp47 || 'cs-CZ').split('-')[0];
      // Edge TTS WSS has a ~4000-char SSML limit; split generously for live sync.
      const chunks = this._splitForTTS(text, 500);
      for (const chunk of chunks) {
        if (!chunk.trim()) continue;

        // Primary: ask background SW to fetch Google TTS MP3 (bypasses CORS).
        // Background is more reliable than content-script WSS on iOS Safari.
        let base64 = null;
        try {
          // Wake the service worker first — Safari iOS suspends it aggressively.
          try { await chrome.runtime.sendMessage({ type: 'ping' }); } catch (_) {}

          console.log('[Dub TTS iOS BG] synth request len=' + chunk.length + ' lang=' + lang);
          const t0 = Date.now();
          const response = await this._withTimeout(
            chrome.runtime.sendMessage({ type: 'ios-tts', text: chunk, lang }),
            20000,
            'BG sendMessage timeout 20s'
          );
          if (response?.success && response.audioBase64) {
            console.log('[Dub TTS iOS BG] ok ' + (Date.now() - t0) + 'ms, provider='
              + (response.provider || '?') + ', b64Len=' + response.audioBase64.length);
            base64 = response.audioBase64;
          } else {
            console.warn('[Dub TTS iOS BG] failed: ' + (response?.error || 'no audio (response=' + JSON.stringify(response) + ')'));
          }
        } catch (e) {
          if (/Extension context invalidated/.test(e?.message || '')) return;
          console.warn('[Dub TTS iOS BG] exception:', e?.message || String(e));
        }

        if (base64) {
          await this._playBase64DataUrl(
            base64,
            options.volume ?? this.volume ?? 0.95,
            options.rate ?? this.rate ?? 1
          );
        } else {
          // Last resort: native speechSynthesis (usually no-op on iOS content-script,
          // but at least won't block the queue).
          console.warn('[Dub TTS iOS] all TTS paths failed — trying native synth');
          await this._speakIOSNative(chunk, options);
        }
      }
    } finally {
      this.isSpeaking = false;
      if (this.onSpeakEnd) this.onSpeakEnd(text);
    }
  }

  /** Race a promise against a timeout. Rejects with tag message on timeout. */
  _withTimeout(promise, ms, tag) {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(tag)), ms);
      Promise.resolve(promise).then(
        (v) => { clearTimeout(to); resolve(v); },
        (e) => { clearTimeout(to); reject(e); }
      );
    });
  }

  /**
   * Native speechSynthesis on iOS Safari. Uses the system Czech voice (Zuzana).
   * Content-script context works as long as ios-shim.js primed the engine
   * with a silent utterance inside a touch handler.
   * iOS has a known bug where onend/onerror sometimes don't fire; we
   * guard with a duration-based hard timeout.
   */
  _speakIOSNative(text, options) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this._langConfig?.bcp47 || 'cs-CZ';
      if (this.selectedVoice) {
        u.voice = this.selectedVoice;
        u.lang = this.selectedVoice.lang;
      }
      u.volume = options.volume ?? this.volume ?? 0.95;
      u.rate = options.rate ?? this.rate ?? 1;
      u.pitch = options.pitch ?? this.pitch ?? 1;

      let settled = false;
      const done = (reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        console.log('[Dub TTS iOS native] done=' + reason);
        resolve();
      };
      u.onstart = () => console.log('[Dub TTS iOS native] onstart len=' + text.length);
      u.onend = () => done('end');
      u.onerror = (e) => {
        console.warn('[Dub TTS iOS native] onerror=' + (e?.error || 'unknown'));
        done('error');
      };

      // Duration-based safety timeout (iOS onend can silently no-op).
      const estimatedMs = Math.max(2000, Math.min(30000,
        (text.length / Math.max(0.8, u.rate)) * 85 + 1200));
      const hardTimeout = setTimeout(() => done('timeout'), estimatedMs);

      this.currentUtterance = u;
      this._keepAlive?.();
      try { if (this.synth.paused) this.synth.resume(); } catch (_) {}
      try {
        this.synth.speak(u);
      } catch (e) {
        console.warn('[Dub TTS iOS native] speak() threw:', e?.message || e);
        done('throw');
        return;
      }
      // Diagnostic: confirm synth actually picked it up.
      setTimeout(() => {
        if (!settled && !this.synth.speaking) {
          console.warn('[Dub TTS iOS native] after speak(): speaking=false, paused='
            + this.synth.paused + ', pending=' + this.synth.pending
            + ' — engine may be locked; waiting for timeout');
        }
      }, 300);
    });
  }

  /**
   * Legacy fallback: Google Translate TTS public endpoint. Often blocked by
   * CORS on iOS Safari (translate.google.com does not allow m.youtube.com
   * origin). Kept for completeness — will fail silently on most pages.
   */
  async _speakIOSGoogleURL(text, options) {
    const lang = (this._langConfig?.bcp47 || 'cs-CZ').split('-')[0];
    const rate = options.rate ?? this.rate ?? 1;
    const volume = options.volume ?? this.volume ?? 1;
    const chunks = this._splitForTTS(text, 180);
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      try {
        console.log('[Dub TTS iOS URL] play chunk len=' + chunk.length + ' lang=' + lang);
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=gtx`;
        await this._playAudioUrl(url, volume, rate);
      } catch (e) {
        console.warn('[Dub TTS iOS URL] error:', e?.message || String(e));
      }
    }
  }

  /**
   * iOS-only: fetch MP3 from Google Translate TTS public endpoint.
   * Safari blocks WebSocket handshake to Edge TTS, so we use HTTP
   * translate_tts with client=gtx. Limit ~200 chars.
   */
  async _synthGoogleTTSInline(text, lang) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=gtx`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Google TTS HTTP ' + resp.status);
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunkSz = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSz) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSz));
    }
    return btoa(bin);
  }

  /**
   * Deprecated: Edge TTS WebSocket path — Safari iOS blocks handshake.
   * Kept for reference / future Cloudflare Worker proxy wrapping.
   */
  async _synthEdgeTTSInline(text, lang) {
    const VOICES = {
      cs: 'cs-CZ-AntoninNeural',
      sk: 'sk-SK-LukasNeural',
      pl: 'pl-PL-MarekNeural',
      hu: 'hu-HU-TamasNeural',
      en: 'en-US-GuyNeural'
    };
    const voice = VOICES[lang] || VOICES.cs;
    const token = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
    const gecVersion = '1-143.0.3650.75';

    const WIN_EPOCH = 11644473600n;
    const S_TO_NS = 10000000n;
    const NS_PER_5MIN = 3000000000n;
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    let ticks = (nowSec + WIN_EPOCH) * S_TO_NS;
    ticks = ticks - (ticks % NS_PER_5MIN);
    const strToHash = `${ticks}${token}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(strToHash));
    const gec = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    const connectionId = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())).replace(/-/g, '');
    const wssUrl = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
      + '?TrustedClientToken=' + token
      + '&ConnectionId=' + connectionId
      + '&Sec-MS-GEC=' + gec
      + '&Sec-MS-GEC-Version=' + gecVersion;

    const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wssUrl);
      const audioChunks = [];
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; try { ws.close(); } catch (_) {} reject(new Error('Edge TTS timeout (15s)')); }
      }, 15000);
      const finish = async (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        try { ws.close(); } catch (_) {}
        if (err || audioChunks.length === 0) { reject(err || new Error('no audio chunks')); return; }
        const blob = new Blob(audioChunks, { type: 'audio/mpeg' });
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        const chunkSz = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSz) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSz));
        }
        resolve(btoa(bin));
      };

      ws.onopen = () => {
        const ts = new Date().toISOString();
        ws.send(
          `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
        );
        const xmlLang = voice.substring(0, 5) || 'cs-CZ';
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'><voice name='${voice}'><prosody rate='+0%' pitch='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
        ws.send(`X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`);
      };

      ws.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          if (event.data.includes('Path:turn.end')) finish(null);
        } else if (event.data instanceof Blob) {
          const buf = await event.data.arrayBuffer();
          const view = new DataView(buf);
          const headerLen = view.getUint16(0);
          if (buf.byteLength > 2 + headerLen) audioChunks.push(buf.slice(2 + headerLen));
        } else if (event.data instanceof ArrayBuffer) {
          const view = new DataView(event.data);
          const headerLen = view.getUint16(0);
          if (event.data.byteLength > 2 + headerLen) audioChunks.push(event.data.slice(2 + headerLen));
        }
      };

      ws.onerror = () => finish(new Error('Edge TTS WebSocket error'));
      ws.onclose = (ev) => {
        if (!resolved) {
          if (audioChunks.length > 0) finish(null);
          else finish(new Error('Edge TTS closed code=' + ev.code));
        }
      };
    });
  }

  _splitForTTS(text, maxLen) {
    if (text.length <= maxLen) return [text];
    const parts = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let buf = '';
    for (const s of sentences) {
      if ((buf + ' ' + s).length <= maxLen) {
        buf = buf ? buf + ' ' + s : s;
      } else {
        if (buf) parts.push(buf);
        if (s.length <= maxLen) {
          buf = s;
        } else {
          for (let i = 0; i < s.length; i += maxLen) parts.push(s.slice(i, i + maxLen));
          buf = '';
        }
      }
    }
    if (buf) parts.push(buf);
    return parts;
  }

  /**
   * Play audio from a direct URL using the pre-unlocked audio element.
   * HTMLAudioElement.src = url bypasses fetch CORS; Safari allows
   * playback from non-CORS sources as long as user-gesture unlocked element.
   */
  _playAudioUrl(url, volume, rate) {
    return new Promise((resolve) => {
      const audio = (typeof window !== 'undefined' && window.__czechdubUnlockedAudio)
        || new Audio();
      audio.crossOrigin = null;
      audio.src = url;
      audio.volume = volume;
      audio.playbackRate = rate;
      let settled = false;
      let safetyTimer = null;
      const done = (reason) => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        audio.onloadedmetadata = null;
        if (safetyTimer) clearTimeout(safetyTimer);
        console.log('[Dub TTS iOS] playback ' + reason);
        resolve();
      };
      audio.onended = () => done('ended');
      audio.onerror = () => {
        const err = audio.error;
        console.warn('[Dub TTS iOS] audio error code=' + (err?.code || '?') + ' msg=' + (err?.message || '?'));
        done('error');
      };
      // Once metadata loads, reset the safety timer to (duration/rate) + buffer.
      // Previously fixed 12s cut long sentences off and forced downstream "stale" drops.
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        if (Number.isFinite(d) && d > 0) {
          if (safetyTimer) clearTimeout(safetyTimer);
          const ms = Math.ceil((d / Math.max(0.5, rate)) * 1000) + 3000;
          safetyTimer = setTimeout(() => done('timeout-dur'), ms);
        }
      };
      this._currentAudio = audio;
      const p = audio.play();
      if (p && p.catch) {
        p.catch((e) => {
          console.warn('[Dub TTS iOS] play() rejected:', e?.message || String(e));
          done('play-reject');
        });
      }
      // Initial conservative timeout until metadata arrives
      safetyTimer = setTimeout(() => done('timeout-init'), 20000);
    });
  }

  /**
   * Play base64 MP3 on iOS Safari.
   *
   * iOS Safari rejects HTMLAudioElement.play() when src uses data: URL because
   * Safari classifies data: URLs as cross-origin even on same-origin pages,
   * and auto-play policy then blocks them outside an active user-gesture window.
   *
   * Solution: decode base64 → Blob → object URL (blob:), attach a fresh <audio>
   * element to the DOM, and play it. Blob URLs are same-origin so iOS allows
   * auto-play after the user-gesture unlock. We also re-use the pre-unlocked
   * element from ios-shim.js if present (it has lingering user-gesture grant).
   */
  _playBase64DataUrl(base64, volume, rate) {
    return new Promise((resolve) => {
      let blobUrl = null;
      try {
        // base64 → Uint8Array → Blob
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        blobUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.warn('[Dub TTS iOS] blob build failed:', e?.message || e);
        resolve();
        return;
      }

      // Prefer the pre-unlocked element (held user-gesture), else create one attached to DOM.
      let audio = (typeof window !== 'undefined' && window.__czechdubUnlockedAudio) || null;
      if (!audio) {
        audio = document.createElement('audio');
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        audio.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
        document.body.appendChild(audio);
        window.__czechdubUnlockedAudio = audio;
      }
      // Stop any ongoing playback on the shared element to avoid play() abort races.
      try { audio.pause(); audio.currentTime = 0; } catch (_) {}

      audio.src = blobUrl;
      // If a WebAudio gain chain is attached (iOS boost), force element volume
      // to 1.0 — actual loudness is governed by the GainNode (2.5x headroom).
      // Otherwise honor the requested volume.
      audio.volume = (typeof window !== 'undefined' && window.__czechdubGainNode) ? 1.0 : volume;
      audio.playbackRate = rate;
      audio.muted = false;
      // Resume the AudioContext if iOS Safari suspended it (keep-alive).
      try {
        const ctx = typeof window !== 'undefined' && window.__czechdubAudioCtx;
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch (_) {}

      let settled = false;
      const done = (reason) => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplaythrough = null;
        try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        console.log('[Dub TTS iOS] playback ' + reason);
        resolve();
      };
      audio.onended = () => done('end');
      audio.onerror = () => {
        const err = audio.error;
        console.warn('[Dub TTS iOS] audio error code=' + (err?.code || '?'));
        done('err');
      };
      this._currentAudio = audio;

      // load() forces the element to adopt the new src — prevents stale-src races.
      try { audio.load(); } catch (_) {}

      const tryPlay = () => {
        const p = audio.play();
        if (p && p.catch) {
          p.catch((e) => {
            const msg = e?.message || String(e);
            console.warn('[Dub TTS iOS] play() rejected:', msg);
            // One retry after 50ms — sometimes iOS rejects the very first play()
            // right after src change, then accepts it a tick later.
            setTimeout(() => {
              if (settled) return;
              const p2 = audio.play();
              if (p2 && p2.catch) {
                p2.catch((e2) => {
                  console.warn('[Dub TTS iOS] play() retry rejected:', e2?.message || e2);
                  done('reject');
                });
              }
            }, 50);
          });
        }
      };
      // Start playback once we have enough data — avoids "aborted" errors on slow connections.
      if (audio.readyState >= 3) {
        tryPlay();
      } else {
        audio.oncanplaythrough = tryPlay;
        // Belt & braces: try anyway after 300ms even if canplaythrough never fires
        setTimeout(() => { if (!settled) tryPlay(); }, 300);
      }

      // Safety timeout: ~800ms/1kB of base64 (rough MP3 duration)
      setTimeout(() => done('timeout'), Math.max(5000, base64.length / 1024 * 120 + 2000));
    });
  }

  /**
   * Speak with a specific speaker role (M/F/C/N).
   * Dynamically selects voice and adjusts pitch/rate based on role config.
   * Falls back to default speak() if role is null or engine is not edge.
   */
  speakAs(text, role, options = {}) {
    if (!role || this._ttsEngine !== 'edge') {
      return this.speak(text, options);
    }

    const roleConfig = this._langConfig.voiceRoles?.[role];
    if (!roleConfig) {
      return this.speak(text, options);
    }

    // Respect user's explicit voice choice — keep their voice, only borrow prosody
    // (pitch/rate) from role. Avoids forcing a male voice on a female-voice user.
    const roleOptions = {
      ...options,
      pitch: (options.pitch ?? this.pitch) * roleConfig.pitch,
      rate: (options.rate ?? this.rate) * roleConfig.rate
    };

    console.log(`[Dub TTS] speakAs(${role}) voice=${this._edgeVoice} (user pick), pitch=${roleOptions.pitch}, rate=${roleOptions.rate}`);
    return this._speakEdge(text, roleOptions);
  }

  async _speakService(text, options) {
    try {
      this.isSpeaking = true;
      if (this.onSpeakStart) this.onSpeakStart(text);

      const audioBase64 = await this._serviceClient.synthesize(text, this._targetLang, this._azureVoice);
      if (audioBase64) {
        await this._playBase64Audio(audioBase64, options);
        return;
      }
      // Fallback to browser TTS
      return this._speakBrowser(text, options);
    } catch (e) {
      console.warn('[Dub TTS] Service TTS failed, falling back:', e);
      return this._speakBrowser(text, options);
    } finally {
      this.isSpeaking = false;
      this._currentAudio = null;
      if (this.onSpeakEnd) this.onSpeakEnd(text);
    }
  }

  _speakBrowser(text, options) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this._langConfig.bcp47;

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
        utterance.lang = this.selectedVoice.lang;
      }

      utterance.volume = options.volume ?? this.volume;
      utterance.rate = options.rate ?? this.rate;
      utterance.pitch = options.pitch ?? this.pitch;

      let settled = false;
      const done = (reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        this.isSpeaking = false;
        this.currentUtterance = null;
        if (reason === 'end' && this.onSpeakEnd) this.onSpeakEnd(text);
        resolve();
      };

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (this.onSpeakStart) this.onSpeakStart(text);
      };
      utterance.onend = () => done('end');
      utterance.onerror = (event) => {
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          console.warn('[Dub TTS] Error:', event.error);
        }
        done('error');
      };

      // iOS Safari workaround: onend/onerror often don't fire in Web Extension
      // content-script context. Fall back to a duration-based timeout so the
      // speech queue can't deadlock on a promise that never resolves.
      const estimatedMs = Math.max(2000, Math.min(30000,
        (text.length / Math.max(0.8, utterance.rate || 1)) * 85 + 1200));
      const hardTimeout = setTimeout(() => {
        if (!settled) {
          console.log(`[Dub TTS] speak timeout after ${Math.round(estimatedMs)}ms (text=${text.length} chars), force-resolving`);
          try { this.synth.cancel(); } catch (_) {}
          done('timeout');
        }
      }, estimatedMs);

      this.currentUtterance = utterance;
      this._keepAlive();
      // iOS Safari sometimes leaves synth in a paused state — force-resume.
      try { if (this.synth.paused) this.synth.resume(); } catch (_) {}
      this.synth.speak(utterance);
      // Log immediate state — helps diagnose "speak() returned but no audio".
      setTimeout(() => {
        if (!settled && !this.synth.speaking) {
          console.warn(`[Dub TTS] after speak(): synth.speaking=false, paused=${this.synth.paused}, pending=${this.synth.pending}`);
        }
      }, 100);
    });
  }

  async _speakEdge(text, options) {
    let fallback = false;
    try {
      this.isSpeaking = true;
      if (this.onSpeakStart) this.onSpeakStart(text);

      const response = await chrome.runtime.sendMessage({
        type: 'synthesize-edge-tts',
        text,
        voice: options._edgeVoiceOverride || this._edgeVoice,
        rate: options.rate ?? this.rate,
        pitch: options.pitch ?? this.pitch
      });

      if (!response?.success) {
        console.error('[Dub TTS] Edge TTS FAILED:', response?.error, '→ fallback to Zuzana');
        fallback = true;
      } else {
        console.log(`[Dub TTS] Edge TTS OK: ${response.audioBase64?.length} chars`);
        await this._playBase64Audio(response.audioBase64, options);
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return;
      console.error('[Dub TTS] Edge TTS EXCEPTION → fallback to Zuzana:', e.message);
      fallback = true;
    } finally {
      if (!fallback) {
        this.isSpeaking = false;
        this._currentAudio = null;
        if (this.onSpeakEnd) this.onSpeakEnd(text);
      }
    }
    if (fallback) {
      return this._speakBrowser(text, options);
    }
  }

  async _speakAzure(text, options) {
    let fallback = false;
    try {
      this.isSpeaking = true;
      if (this.onSpeakStart) this.onSpeakStart(text);

      const response = await chrome.runtime.sendMessage({
        type: 'synthesize-azure-tts',
        text,
        apiKey: this._azureKey,
        region: this._azureRegion,
        voice: this._azureVoice,
        lang: this._langConfig.bcp47,
        rate: options.rate ?? this.rate,
        pitch: options.pitch ?? this.pitch
      });

      if (!response?.success) {
        console.warn('[Dub TTS] Azure error:', response?.error);
        fallback = true;
      } else {
        await this._playBase64Audio(response.audioBase64, options);
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return;
      console.warn('[Dub TTS] Azure TTS failed, falling back to browser:', e);
      fallback = true;
    } finally {
      if (!fallback) {
        this.isSpeaking = false;
        this._currentAudio = null;
        if (this.onSpeakEnd) this.onSpeakEnd(text);
      }
    }
    if (fallback) {
      return this._speakBrowser(text, options);
    }
  }

  async _playBase64Audio(audioBase64, options) {
    const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
    audio.volume = options.volume ?? this.volume;
    this._currentAudio = audio;

    await new Promise((resolve) => {
      audio.onended = resolve;
      audio.onerror = () => { console.warn('[Dub TTS] Audio playback error'); resolve(); };
      audio.play().catch(() => resolve());
    });
  }

  _keepAlive() {
    if (this._keepAliveInterval) return;
    this._keepAliveInterval = setInterval(() => {
      if (this.synth.speaking) {
        this.synth.pause();
        this.synth.resume();
      } else {
        clearInterval(this._keepAliveInterval);
        this._keepAliveInterval = null;
      }
    }, 10000);
  }

  stop() {
    this.synth.cancel();
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.queue = [];
    if (this._currentAudio) { this._currentAudio.pause(); this._currentAudio = null; }
    if (this._keepAliveInterval) { clearInterval(this._keepAliveInterval); this._keepAliveInterval = null; }
  }

  pause() { this.synth.pause(); }
  resume() { this.synth.resume(); }

  setVolume(vol) { this.volume = Math.max(0, Math.min(1, vol)); }
  setRate(rate) { this.rate = Math.max(0.5, Math.min(2, rate)); }
  setPitch(pitch) { this.pitch = Math.max(0.5, Math.min(2, pitch)); }

  isTargetLanguageSupported() {
    const fallbackLangs = this._langConfig.voiceFallbackLangs;
    return this.synth.getVoices().some(v =>
      fallbackLangs.some(lang => v.lang === lang || v.lang.startsWith(lang.split('-')[0]))
    );
  }

  estimateDuration(text) {
    const words = text.split(/\s+/).length;
    const wpm = (this._langConfig.wordsPerMinute || 140) * this.rate;
    return (words / wpm) * 60;
  }
}

window.TTSEngine = TTSEngine;
