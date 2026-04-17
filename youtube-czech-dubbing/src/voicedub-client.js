/**
 * VoiceDubClient — B2B integrace s VoiceDub API (api.voicedub.ai).
 *
 * Zatímco `service-mode.js` volá legacy /translate + /synthesize split,
 * tento klient používá unified /v1/dub endpoint (1 round-trip místo 2).
 *
 * Aktivace: popupSettings.voicedubMode = true + voicedubApiKey = 'vd_live_...'.
 * Content scripts volají přes chrome.runtime.sendMessage({ type: 'voicedub-dub' }).
 */
class VoiceDubClient {
  constructor() {
    this._enabled = false;
    this._endpoint = 'https://api.voicedub.ai';
    this._apiKey = null;
    this._tier = 'business';
  }

  async loadConfig() {
    try {
      const { popupSettings } = await chrome.storage.local.get('popupSettings');
      if (!popupSettings) return;
      this._enabled = !!popupSettings.voicedubMode;
      if (popupSettings.voicedubEndpoint) this._endpoint = popupSettings.voicedubEndpoint;
      this._apiKey = popupSettings.voicedubApiKey || null;
      this._tier = popupSettings.voicedubTier || 'business';
    } catch (e) {
      // chrome.storage může být nedostupný v edge kontextech — tichý fallback.
    }
  }

  isEnabled() {
    return this._enabled && /^vd_(live|test)_[A-Za-z0-9]{20,}$/.test(this._apiKey || '');
  }

  /**
   * Unifikovaný překlad + syntéza v jednom API volání.
   * Vrací { translated, audioBase64, provider, voiceId } nebo null při error.
   * Caller spadne na direct-mode translator + TTS.
   */
  async dub(text, targetLang, { voiceId, glossary } = {}) {
    if (!this.isEnabled()) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'voicedub-dub',
        endpoint: this._endpoint,
        apiKey: this._apiKey,
        payload: {
          source_text: text,
          target_language: targetLang,
          voice_id: voiceId,
          glossary: glossary || undefined,
        },
      });
      if (response?.success && response.data) return response.data;
      if (response?.error) console.warn('[VoiceDub] API error:', response.error);
      return null;
    } catch (e) {
      if (!/Extension context invalidated/.test(e.message || '')) {
        console.warn('[VoiceDub] Dub call failed:', e);
      }
      return null;
    }
  }

  /**
   * Vrátí dostupné hlasy pro daný jazyk z /v1/voices endpointu.
   * Cachováno do chrome.storage.local po první invokaci.
   */
  async voices(lang) {
    if (!this.isEnabled()) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'voicedub-voices',
        endpoint: this._endpoint,
        apiKey: this._apiKey,
        lang,
      });
      return response?.success ? response.voices : null;
    } catch (e) {
      return null;
    }
  }
}

// Export pro content scripts + sidepanel.
if (typeof window !== 'undefined') {
  window.VoiceDubClient = VoiceDubClient;
}
// Pro ES module kontexty (future-proof).
if (typeof globalThis !== 'undefined' && typeof module === 'undefined') {
  globalThis.VoiceDubClient = VoiceDubClient;
}
