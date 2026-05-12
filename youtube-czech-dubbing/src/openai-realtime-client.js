/**
 * OpenAIRealtimeClient
 *
 * BYOK client for OpenAI Realtime. The user's OpenAI API key stays in
 * chrome.storage and is used only by the extension background worker to mint
 * short-lived client secrets. Page/content contexts receive only ephemeral
 * realtime tokens.
 */
class OpenAIRealtimeClient {
  constructor() {
    this._apiKey = null;
    this._realtimeMode = false;
    this._translateModel = 'gpt-realtime-translate';
    this._transcriptionModel = 'gpt-realtime-whisper';
    this._lastError = '';
  }

  async loadConfig() {
    try {
      const { popupSettings, liveTranslatePrefs } = await chrome.storage.local.get(['popupSettings', 'liveTranslatePrefs']);
      const settings = popupSettings || {};
      this._apiKey = (liveTranslatePrefs?.openaiApiKey || settings.openaiApiKey || '').trim() || null;
      this._realtimeMode = !!settings.openaiRealtimeMode;
      this._translateModel = settings.openaiRealtimeTranslateModel || this._translateModel;
      this._transcriptionModel = settings.openaiRealtimeTranscriptionModel || this._transcriptionModel;
    } catch (_) {
      // chrome.storage may be unavailable in edge contexts.
    }
  }

  isEnabled() {
    return !!this._apiKey && /^sk-[A-Za-z0-9_-]{20,}$/.test(this._apiKey);
  }

  isRealtimePreferred() {
    return this.isEnabled() && this._realtimeMode;
  }

  lastError() {
    return this._lastError;
  }

  async createRealtimeClientSecret(targetLanguage) {
    if (!this.isEnabled()) return null;
    return this._createSecret({
      mode: 'translation',
      target_language: targetLanguage,
      model: this._translateModel,
    });
  }

  async createRealtimeTranscriptionClientSecret(sourceLanguage) {
    if (!this.isEnabled()) return null;
    return this._createSecret({
      mode: 'transcription',
      source_language: sourceLanguage,
      model: this._transcriptionModel,
    });
  }

  async _createSecret(payload) {
    this._lastError = '';
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'openai-realtime-client-secret',
        payload,
      });
      if (response?.success && response.data?.value) return response.data;
      if (response?.error) {
        this._lastError = response.error;
        console.warn('[OpenAI Realtime] secret error:', response.error);
      }
      return null;
    } catch (e) {
      if (!/Extension context invalidated/.test(e.message || '')) {
        this._lastError = e?.message || String(e);
        console.warn('[OpenAI Realtime] secret failed:', e);
      }
      return null;
    }
  }
}

if (typeof window !== 'undefined') window.OpenAIRealtimeClient = OpenAIRealtimeClient;
if (typeof globalThis !== 'undefined' && typeof module === 'undefined') {
  globalThis.OpenAIRealtimeClient = OpenAIRealtimeClient;
}
