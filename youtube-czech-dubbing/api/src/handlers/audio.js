import { error } from '../utils/response.js';

/**
 * GET /v1/audio/:tenant/:jobid.mp3
 *
 * Vrací MP3 z R2 AUDIO_STORE. Tenant guard: API klíč z Bearer tokenu musí
 * mít tenant_id shodné s path segmentem. Enterprise admin může volat cross-tenant
 * přes speciální scope `audio:read_all` (TODO v0.2).
 *
 * Cache-Control: private (per-tenant content) + 1h immutable (jobid je unikát).
 */
export async function handleAudio(request, env, ctx, { apiKey, params }) {
  const [tenant, filename] = params;
  if (!tenant || !filename) {
    return error(400, 'bad_request', 'Missing tenant or filename');
  }

  if (!/^[a-z0-9-]{1,64}\.mp3$/.test(filename)) {
    return error(400, 'bad_request', 'Invalid filename format');
  }

  // Tenant guard — nesmí stahovat audio jiného tenantu.
  if (tenant !== apiKey.tenant_id) {
    return error(403, 'forbidden', 'Cross-tenant audio access denied');
  }

  if (!env.AUDIO_STORE) {
    return error(503, 'storage_unavailable', 'R2 AUDIO_STORE binding not configured');
  }

  const key = `${tenant}/${filename}`;
  const obj = await env.AUDIO_STORE.get(key);
  if (!obj) return error(404, 'audio_not_found', `No audio at ${key}`);

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, max-age=3600, immutable',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-VoiceDub-Tenant': tenant,
    },
  });
}
