import { json, error } from '../utils/response.js';
import { synthesizeSSML } from '../providers/azure-tts.js';

const VOICE_LANG_MAP = {
  cs: 'cs-CZ-VlastaNeural',
  sk: 'sk-SK-ViktoriaNeural',
  pl: 'pl-PL-ZofiaNeural',
  hu: 'hu-HU-NoemiNeural',
  en: 'en-US-JennyNeural',
};

const MAX_TEXT_LEN = 2000;

/**
 * POST /v1/synthesize
 * Body: {
 *   text: string,                    // required, max 2000 chars
 *   voice_id?: string,               // Azure voice name, default per language
 *   language?: 'cs'|'sk'|'pl'|'hu'|'en',
 *   disable_watermark?: boolean,     // per-segment live mode bypass (session banner on client)
 *   speed?: number,                  // -50..+50 (percent), default 0
 *   pitch?: number,                  // -50..+50 (percent), default 0
 * }
 *
 * Response: {
 *   audio_base64: string,
 *   voice_id: string,
 *   cached: boolean,
 *   duration_seconds: number,
 *   characters: number,
 * }
 *
 * R2 cache: tts-cache/<tenant>/<sha256(voice|speed|pitch|wm|text)>.mp3
 */
export async function handleSynthesize(request, env, ctx, { apiKey }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'invalid_json', 'Body must be JSON');
  }

  const text = (body.text || '').trim();
  if (!text) return error(400, 'missing_text', 'Field `text` is required');
  if (text.length > MAX_TEXT_LEN) {
    return error(400, 'text_too_long', `Max ${MAX_TEXT_LEN} characters per request`);
  }

  const language = body.language || 'cs';
  const voiceId = body.voice_id || VOICE_LANG_MAP[language] || VOICE_LANG_MAP.cs;
  const speed = clamp(Number(body.speed) || 0, -50, 50);
  const pitch = clamp(Number(body.pitch) || 0, -50, 50);
  const disableWatermark = body.disable_watermark === true;

  const cacheKey = await buildCacheKey({
    tenant: apiKey.tenant_id,
    voice: voiceId,
    speed,
    pitch,
    wm: disableWatermark ? 0 : 1,
    text,
  });

  // Check cache first
  if (env.AUDIO_STORE) {
    try {
      const cached = await env.AUDIO_STORE.get(cacheKey);
      if (cached) {
        const buf = await cached.arrayBuffer();
        return json({
          audio_base64: arrayBufferToBase64(buf),
          voice_id: voiceId,
          cached: true,
          duration_seconds: estimateDurationSeconds(text),
          characters: text.length,
        }, 200);
      }
    } catch (e) {
      console.warn('R2 cache read failed:', e.message);
    }
  }

  // Synthesize fresh
  try {
    const audioBuf = await synthesizeSSML(text, voiceId, {
      key: env.AZURE_SPEECH_KEY,
      region: env.AZURE_SPEECH_REGION,
      disableWatermark,
      speed,
      pitch,
    });

    // Write-through cache (waitUntil keeps it async-safe for response latency)
    if (env.AUDIO_STORE) {
      ctx.waitUntil(
        env.AUDIO_STORE.put(cacheKey, audioBuf, {
          httpMetadata: { contentType: 'audio/mpeg' },
        }).catch((e) => console.warn('R2 cache write failed:', e.message))
      );
    }

    return json({
      audio_base64: arrayBufferToBase64(audioBuf),
      voice_id: voiceId,
      cached: false,
      duration_seconds: estimateDurationSeconds(text),
      characters: text.length,
    }, 200);
  } catch (e) {
    return error(502, 'tts_error', e.message);
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function estimateDurationSeconds(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.round((words / 150) * 60);
}

async function buildCacheKey({ tenant, voice, speed, pitch, wm, text }) {
  const payload = `${voice}|${speed}|${pitch}|${wm}|${text}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `tts-cache/${tenant}/${hex}.mp3`;
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
