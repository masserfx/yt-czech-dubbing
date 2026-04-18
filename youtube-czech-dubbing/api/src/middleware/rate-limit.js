/**
 * Rate limiting per API key — sliding window 60s.
 * Používá KV counter, pro produkci doporučuji Durable Objects.
 * Dev fallback: žádný limit.
 */
export const LIMITS = { free: 10, starter: 60, business: 300, enterprise: 1200 };

export async function getRateLimitState(apiKey, env) {
  const tier = apiKey.tier || 'starter';
  const limit = LIMITS[tier] || LIMITS.starter;
  if (!env.API_KEYS) return { limit, current: 0, remaining: limit, tier };
  const bucket = Math.floor(Date.now() / 60_000);
  const current = parseInt(await env.API_KEYS.get(`rl:${apiKey.key}:${bucket}`) || '0', 10);
  return { limit, current, remaining: Math.max(0, limit - current), tier };
}

export async function rateLimit(apiKey, env) {
  if (!env.API_KEYS) return { ok: true }; // dev
  const tier = apiKey.tier || 'starter';
  const limit = LIMITS[tier] || LIMITS.starter;

  const bucket = Math.floor(Date.now() / 60_000);
  const counterKey = `rl:${apiKey.key}:${bucket}`;

  const current = parseInt(await env.API_KEYS.get(counterKey) || '0', 10);
  if (current >= limit) {
    return { ok: false, limit, retryAfter: 60 - (Math.floor(Date.now() / 1000) % 60) };
  }
  // Atomický increment není v KV; akceptujeme drift cca ±5 %.
  await env.API_KEYS.put(counterKey, String(current + 1), { expirationTtl: 120 });
  return { ok: true, limit, remaining: limit - current - 1 };
}
