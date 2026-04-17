import { json } from '../utils/response.js';

export async function handleHealth(request, env) {
  return json({
    service: 'voicedub-api',
    version: '0.1.0',
    status: 'healthy',
    environment: env.ENVIRONMENT || 'unknown',
    timestamp: new Date().toISOString(),
    endpoints: {
      'POST /v1/dub': 'Zahájit překlad a dabing videa',
      'GET /v1/jobs/{id}': 'Status úlohy',
      'GET /v1/voices': 'Dostupné hlasy per jazyk',
      'GET /v1/health': 'Health check',
    },
  });
}
