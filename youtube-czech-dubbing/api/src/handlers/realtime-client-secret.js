import { json, error } from '../utils/response.js';

const DEFAULT_TRANSLATE_MODEL = 'gpt-realtime-translate';
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper';
const OPENAI_REALTIME_TRANSLATIONS_URL = 'https://api.openai.com/v1/realtime/translations/client_secrets';
const OPENAI_REALTIME_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

export async function handleRealtimeClientSecret(request, env, _ctx, { apiKey }) {
  if (!env.OPENAI_API_KEY) {
    return error(503, 'provider_unavailable', 'OPENAI_API_KEY not configured');
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const mode = normalizeMode(body.mode || body.type || body.session_type || body.sessionType);
  if (mode === 'transcription') {
    return handleRealtimeTranscriptionClientSecret(body, env, apiKey);
  }
  if (mode !== 'translation') {
    return error(400, 'invalid_realtime_mode', 'Use mode "translation" or "transcription"');
  }

  const targetLanguage = normalizeLanguage(body.target_language || body.targetLanguage || 'cs');
  if (!targetLanguage) {
    return error(400, 'invalid_target_language', 'Provide target_language like "cs" or "zh-TW"');
  }

  const session = {
    model: env.OPENAI_REALTIME_TRANSLATE_MODEL || DEFAULT_TRANSLATE_MODEL,
    audio: {
      output: {
        language: targetLanguage,
      },
    },
  };

  const safetySource = `${apiKey.tenant_id}:${body.user_id || 'anonymous'}`;
  const safetyId = await sha256Hex(safetySource);

  let resp;
  try {
    resp = await fetch(OPENAI_REALTIME_TRANSLATIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyId,
      },
      body: JSON.stringify({ session }),
    });
  } catch (e) {
    return error(502, 'provider_error', `OpenAI realtime session failed: ${e.message}`);
  }

  const text = await resp.text();
  if (!resp.ok) {
    return error(502, 'provider_error', `OpenAI realtime session failed: ${text.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return error(502, 'provider_error', 'OpenAI realtime session returned invalid JSON');
  }
  const clientSecret = data.value || data.client_secret?.value;
  if (!clientSecret) {
    return error(502, 'provider_error', 'OpenAI realtime session did not return a client secret');
  }

  return json({
    value: clientSecret,
    expires_at: data.expires_at || data.client_secret?.expires_at || null,
    mode: 'translation',
    target_language: targetLanguage,
    model: data.session?.model || session.model,
  });
}

async function handleRealtimeTranscriptionClientSecret(body, env, apiKey) {
  const sourceLanguage = normalizeIso639(body.source_language || body.sourceLanguage || body.language || 'en');
  if (!sourceLanguage) {
    return error(400, 'invalid_source_language', 'Provide source_language like "en", "cs", or "de-DE"');
  }

  const delay = normalizeDelay(body.delay || env.OPENAI_REALTIME_TRANSCRIPTION_DELAY || 'low');
  const transcription = {
    model: env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL,
    language: sourceLanguage,
  };
  if (delay) transcription.delay = delay;

  const session = {
    type: 'transcription',
    audio: {
      input: {
        format: {
          type: 'audio/pcm',
          rate: 24000,
        },
        transcription,
        noise_reduction: {
          type: 'near_field',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    },
  };

  const safetySource = `${apiKey.tenant_id}:${body.user_id || 'anonymous'}:transcription`;
  const safetyId = await sha256Hex(safetySource);

  let resp;
  try {
    resp = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyId,
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session,
      }),
    });
  } catch (e) {
    return error(502, 'provider_error', `OpenAI realtime transcription session failed: ${e.message}`);
  }

  const text = await resp.text();
  if (!resp.ok) {
    return error(502, 'provider_error', `OpenAI realtime transcription session failed: ${text.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return error(502, 'provider_error', 'OpenAI realtime transcription session returned invalid JSON');
  }
  const clientSecret = data.value || data.client_secret?.value;
  if (!clientSecret) {
    return error(502, 'provider_error', 'OpenAI realtime transcription session did not return a client secret');
  }

  return json({
    value: clientSecret,
    expires_at: data.expires_at || data.client_secret?.expires_at || null,
    mode: 'transcription',
    source_language: sourceLanguage,
    model: data.session?.audio?.input?.transcription?.model || transcription.model,
  });
}

function normalizeMode(value) {
  const mode = String(value || 'translation').trim().toLowerCase();
  if (mode === 'translate') return 'translation';
  if (mode === 'transcribe') return 'transcription';
  if (mode === 'translation' || mode === 'transcription') return mode;
  return null;
}

function normalizeLanguage(value) {
  const lang = String(value || '').trim();
  if (!lang) return null;
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(lang)) return null;
  return lang;
}

function normalizeIso639(value) {
  const lang = normalizeLanguage(value);
  if (!lang) return null;
  return lang.split('-')[0].toLowerCase();
}

function normalizeDelay(value) {
  const delay = String(value || '').trim().toLowerCase();
  return ['minimal', 'low', 'medium', 'high', 'xhigh'].includes(delay) ? delay : null;
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
