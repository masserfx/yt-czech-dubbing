/**
 * ServiceClient - B2B/SaaS mode abstraction.
 * When service mode is active, translation and TTS calls go through
 * a centralized backend API instead of direct API calls.
 * This enables: usage tracking, API key management, billing, white-label.
 */
class ServiceClient {
  constructor() {
    this._mode = 'direct'; // 'direct' or 'service'
    this._apiEndpoint = null;
    this._authToken = null;
    this._organizationId = null;
  }

  async loadConfig() {
    try {
      const result = await chrome.storage.local.get('popupSettings');
      if (result.popupSettings) {
        this._mode = result.popupSettings.serviceMode || 'direct';
        this._apiEndpoint = result.popupSettings.serviceApiEndpoint || null;
        this._authToken = result.popupSettings.serviceAuthToken || null;
        this._organizationId = result.popupSettings.serviceOrganizationId || null;
      }
    } catch (e) {}
  }

  isServiceMode() {
    return this._mode === 'service' && this._apiEndpoint && this._authToken;
  }

  /**
   * Translate text via service backend.
   * Returns translated text or null (caller falls back to direct mode).
   */
  async translate(text, sourceLang, targetLang, engine) {
    if (!this.isServiceMode()) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'service-translate',
        endpoint: this._apiEndpoint,
        authToken: this._authToken,
        organizationId: this._organizationId,
        text,
        sourceLang,
        targetLang,
        engine
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
      console.warn('[CzechDub Service] Translation failed:', response?.error);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return null;
      console.warn('[CzechDub Service] Translation error:', e);
    }
    return null;
  }

  /**
   * Synthesize speech via service backend.
   * Returns { audioBase64 } or null (caller falls back to direct mode).
   */
  async synthesize(text, targetLang, voice) {
    if (!this.isServiceMode()) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'service-synthesize',
        endpoint: this._apiEndpoint,
        authToken: this._authToken,
        organizationId: this._organizationId,
        text,
        targetLang,
        voice
      });
      if (response?.success && response.audioBase64) {
        return response.audioBase64;
      }
      console.warn('[CzechDub Service] Synthesis failed:', response?.error);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return null;
      console.warn('[CzechDub Service] Synthesis error:', e);
    }
    return null;
  }
}

window.ServiceClient = ServiceClient;
