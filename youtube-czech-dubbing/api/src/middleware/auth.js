/**
 * API key autentizace.
 * Očekává: Authorization: Bearer vd_live_xxx
 *
 * API keys jsou uložené v KV (binding API_KEYS) jako:
 *   key = "vd_live_xxx"
 *   value = JSON { tenant_id, tier, created_at, quota_min }
 */
export async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(vd_(live|test)_[A-Za-z0-9]{20,})$/);
  if (!m) return { ok: false, status: 401, code: 'missing_api_key', message: 'Provide Authorization: Bearer vd_live_... header' };

  const key = m[1];

  if (!env.API_KEYS) {
    // Dev fallback: akceptuj jakýkoliv klíč tvaru vd_test_*
    if (key.startsWith('vd_test_')) {
      return { ok: true, apiKey: { key, tenant_id: 'dev', tier: 'business', quota_min: 1000 } };
    }
    return { ok: false, status: 503, code: 'kv_unavailable', message: 'API_KEYS KV binding not configured' };
  }

  const raw = await env.API_KEYS.get(key);
  if (!raw) return { ok: false, status: 401, code: 'invalid_api_key', message: 'Unknown API key' };

  try {
    const meta = JSON.parse(raw);
    return { ok: true, apiKey: { key, ...meta } };
  } catch {
    return { ok: false, status: 500, code: 'corrupt_key_metadata', message: 'Key metadata unreadable' };
  }
}
