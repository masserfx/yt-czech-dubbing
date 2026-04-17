import { handleDub } from './handlers/dub.js';
import { handleVoices } from './handlers/voices.js';
import { handleJob } from './handlers/job.js';
import { handleHealth } from './handlers/health.js';
import { handleAudio } from './handlers/audio.js';
import { authenticate } from './middleware/auth.js';
import { cors } from './middleware/cors.js';
import { rateLimit } from './middleware/rate-limit.js';
import { json, error } from './utils/response.js';

const ROUTES = [
  { method: 'GET',  pattern: /^\/$/,                    handler: handleHealth, auth: false },
  { method: 'GET',  pattern: /^\/v1\/health$/,          handler: handleHealth, auth: false },
  { method: 'GET',  pattern: /^\/v1\/voices$/,          handler: handleVoices, auth: true  },
  { method: 'POST', pattern: /^\/v1\/dub$/,             handler: handleDub,    auth: true  },
  { method: 'GET',  pattern: /^\/v1\/jobs\/([a-z0-9-]+)$/, handler: handleJob, auth: true  },
  { method: 'GET',  pattern: /^\/v1\/audio\/([a-z0-9-]{1,64})\/([a-z0-9-]{1,64}\.mp3)$/, handler: handleAudio, auth: true },
];

export default {
  async fetch(request, env, ctx) {
    const corsRes = cors(request);
    if (corsRes) return corsRes;

    const url = new URL(request.url);
    const route = ROUTES.find(r => r.method === request.method && r.pattern.test(url.pathname));
    if (!route) return error(404, 'not_found', `No route for ${request.method} ${url.pathname}`);

    try {
      let apiKey = null;
      if (route.auth) {
        const auth = await authenticate(request, env);
        if (!auth.ok) return error(auth.status, auth.code, auth.message);
        apiKey = auth.apiKey;

        const rl = await rateLimit(apiKey, env);
        if (!rl.ok) return error(429, 'rate_limited', `Rate limit: ${rl.limit}/min. Retry in ${rl.retryAfter}s.`);
      }

      const match = url.pathname.match(route.pattern);
      const params = match.slice(1);
      return await route.handler(request, env, ctx, { apiKey, params });
    } catch (e) {
      console.error('Handler error:', e);
      return error(500, 'internal_error', env.ENVIRONMENT === 'development' ? e.stack : 'Internal error');
    }
  },
};
