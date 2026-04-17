import { json, error } from '../utils/response.js';
import { translateBatch } from '../providers/gemini.js';
import { synthesizeSSML } from '../providers/azure-tts.js';

const SUPPORTED_LANGS = ['cs', 'sk', 'pl', 'hu'];
const MAX_URL_MINUTES = 120;

/**
 * POST /v1/dub
 * Body: {
 *   source_url: string,             // YouTube/Vimeo/MP4 URL — stub mode akceptuje text
 *   source_text?: string,           // přímý text (dev / quick tests)
 *   target_language: 'cs'|'sk'|'pl'|'hu',
 *   voice_id?: string,              // z /v1/voices, default = první hlas cílového jazyka
 *   voice_mode?: 'single' | 'auto' // default 'single'
 *   webhook_url?: string,
 *   metadata?: object               // tenant-side job tracking
 * }
 */
export async function handleDub(request, env, ctx, { apiKey }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, 'invalid_json', 'Body must be JSON');
  }

  // Validace
  if (!body.source_url && !body.source_text) {
    return error(400, 'missing_source', 'Provide source_url OR source_text');
  }
  if (!SUPPORTED_LANGS.includes(body.target_language)) {
    return error(400, 'unsupported_language', `Supported: ${SUPPORTED_LANGS.join(', ')}`);
  }

  const jobId = crypto.randomUUID();

  // V produkci: zařadíme do queue a vrátíme 202. Zde provedeme synchronní PoC.
  const isQuick = !!body.source_text;

  if (!isQuick) {
    // Long-running path by šel přes DUB_QUEUE. Pro PoC odpovíme 202 s job ID.
    await saveJob(env, jobId, {
      status: 'pending',
      tenant_id: apiKey.tenant_id,
      source_url: body.source_url,
      target_language: body.target_language,
      created_at: new Date().toISOString(),
    });
    // ctx.waitUntil(enqueue(...)); — zde by šla queue
    return json({
      job_id: jobId,
      status: 'pending',
      message: 'Job accepted. Poll GET /v1/jobs/' + jobId + ' for status.',
      estimated_duration_seconds: 180,
    }, 202);
  }

  // QUICK path (source_text) — synchronní překlad + TTS, vrátí audio URL.
  try {
    const translated = await translateBatch(
      [body.source_text],
      body.target_language,
      { apiKey: env.GEMINI_API_KEY }
    );

    const voiceId = body.voice_id || defaultVoiceFor(body.target_language);
    const audioBuf = await synthesizeSSML(translated[0], voiceId, {
      key: env.AZURE_SPEECH_KEY,
      region: env.AZURE_SPEECH_REGION,
    });

    // Uložit do R2 (pokud binding existuje)
    let audioUrl = null;
    if (env.AUDIO_STORE) {
      const audioKey = `${apiKey.tenant_id}/${jobId}.mp3`;
      await env.AUDIO_STORE.put(audioKey, audioBuf, {
        httpMetadata: { contentType: 'audio/mpeg' },
      });
      audioUrl = `/v1/audio/${audioKey}`;
    }

    await saveJob(env, jobId, {
      status: 'completed',
      tenant_id: apiKey.tenant_id,
      source_text: body.source_text,
      translated_text: translated[0],
      target_language: body.target_language,
      voice_id: voiceId,
      audio_url: audioUrl,
      duration_seconds: estimateDurationSeconds(translated[0]),
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    return json({
      job_id: jobId,
      status: 'completed',
      source_text: body.source_text,
      translated_text: translated[0],
      audio_url: audioUrl,
      audio_base64: audioUrl ? undefined : arrayBufferToBase64(audioBuf),
      voice_id: voiceId,
      target_language: body.target_language,
      duration_seconds: estimateDurationSeconds(translated[0]),
    }, 200);
  } catch (e) {
    await saveJob(env, jobId, {
      status: 'failed',
      tenant_id: apiKey.tenant_id,
      error: e.message,
      created_at: new Date().toISOString(),
      failed_at: new Date().toISOString(),
    });
    return error(502, 'provider_error', e.message);
  }
}

function defaultVoiceFor(lang) {
  return { cs: 'cs-CZ-VlastaNeural', sk: 'sk-SK-ViktoriaNeural', pl: 'pl-PL-ZofiaNeural', hu: 'hu-HU-NoemiNeural' }[lang];
}

function estimateDurationSeconds(text) {
  // Cca 150 slov / minuta u neural TTS
  const words = text.trim().split(/\s+/).length;
  return Math.round((words / 150) * 60);
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function saveJob(env, jobId, data) {
  if (!env.JOBS_DB) return; // dev: no-op
  await env.JOBS_DB.prepare(
    `INSERT INTO jobs (id, tenant_id, status, payload, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status=excluded.status, payload=excluded.payload`
  ).bind(jobId, data.tenant_id, data.status, JSON.stringify(data), data.created_at).run();
}
