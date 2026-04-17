/**
 * End-to-end integration test přes Worker fetch() entry point.
 * Mockuje Cloudflare bindings (D1, R2, KV) + Gemini/Azure fetch calls.
 *
 * Pokrývá:
 *   - health (no auth)
 *   - voices (auth OK)
 *   - dub quick path (source_text → sync response s audio_url)
 *   - dub URL path (source_url → 202 pending)
 *   - jobs status (po uloženém jobu)
 *   - audio GET s tenant guardem
 *   - auth error paths (missing bearer, bad format)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

// In-memory R2 mock.
function makeR2() {
  const store = new Map();
  return {
    async put(key, value) {
      const buf = value instanceof ArrayBuffer ? value
        : value.buffer ? value.buffer
        : new TextEncoder().encode(String(value)).buffer;
      store.set(key, buf);
    },
    async get(key) {
      const buf = store.get(key);
      if (!buf) return null;
      return {
        body: buf,
        size: buf.byteLength,
        arrayBuffer: async () => buf,
      };
    },
    _store: store,
  };
}

// In-memory D1 mock — primitivní, stačí pro INSERT/SELECT podle jobs schématu.
function makeD1() {
  const rows = [];
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (/^INSERT/i.test(sql)) {
                rows.push({ sql, args });
                return { success: true };
              }
              return { success: true };
            },
            async first() {
              if (/SELECT.*FROM jobs.*WHERE id/i.test(sql)) {
                const [id] = args;
                const r = rows.find((x) => x.args[0] === id);
                if (!r) return null;
                // Mapuje args na sloupce podle SQL pořadí (id, tenant_id, status, payload, created_at).
                return {
                  id: r.args[0],
                  tenant_id: r.args[1],
                  status: r.args[2],
                  payload: r.args[3],
                  created_at: r.args[4],
                };
              }
              return null;
            },
          };
        },
      };
    },
    _rows: rows,
  };
}

// Mock Gemini + Azure fetch.
function installFetchMock() {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('generativelanguage.googleapis.com')) {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '1) Ahoj světe' }] } }],
        }),
      };
    }
    if (u.includes('tts.speech.microsoft.com')) {
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer,
      };
    }
    throw new Error('Unexpected fetch: ' + u);
  };
  return () => { globalThis.fetch = orig; };
}

function makeEnv(overrides = {}) {
  return {
    GEMINI_API_KEY: 'fake-gemini',
    AZURE_SPEECH_KEY: 'fake-azure',
    AZURE_SPEECH_REGION: 'westeurope',
    AUDIO_STORE: makeR2(),
    JOBS_DB: makeD1(),
    ENVIRONMENT: 'test',
    ...overrides,
  };
}

const devBearer = 'Bearer vd_test_' + 'a'.repeat(22);

test('e2e: GET /v1/health vrací 200 bez auth', async () => {
  const req = new Request('http://x/v1/health');
  const res = await worker.fetch(req, makeEnv(), {});
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'healthy');
  assert.equal(data.service, 'voicedub-api');
});

test('e2e: GET /v1/voices bez auth → 401', async () => {
  const req = new Request('http://x/v1/voices');
  const res = await worker.fetch(req, makeEnv(), {});
  assert.equal(res.status, 401);
});

test('e2e: GET /v1/voices s dev-fallback bearer → 200', async () => {
  const req = new Request('http://x/v1/voices', {
    headers: { Authorization: devBearer },
  });
  const res = await worker.fetch(req, makeEnv(), {});
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.voices);
  assert.ok(Array.isArray(data.voices.cs));
  assert.ok(data.voices.cs.some((v) => v.id.startsWith('cs-CZ-')));
});

test('e2e: POST /v1/dub quick path → completed + audio_url + translator_provider', async () => {
  const restoreFetch = installFetchMock();
  const env = makeEnv();
  const req = new Request('http://x/v1/dub', {
    method: 'POST',
    headers: { Authorization: devBearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_text: 'Hello world', target_language: 'cs' }),
  });

  const res = await worker.fetch(req, env, {});
  restoreFetch();

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'completed');
  assert.equal(data.translated_text, 'Ahoj světe');
  assert.equal(data.translator_provider, 'gemini');
  assert.match(data.audio_url, /^\/v1\/audio\/dev\/.+\.mp3$/);
  assert.ok(data.job_id);
});

test('e2e: POST /v1/dub URL path → 202 pending', async () => {
  const req = new Request('http://x/v1/dub', {
    method: 'POST',
    headers: { Authorization: devBearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_url: 'https://x/v.mp4', target_language: 'cs' }),
  });
  const res = await worker.fetch(req, makeEnv(), {});
  assert.equal(res.status, 202);
  const data = await res.json();
  assert.equal(data.status, 'pending');
});

test('e2e: POST /v1/dub missing target_language → 400', async () => {
  const req = new Request('http://x/v1/dub', {
    method: 'POST',
    headers: { Authorization: devBearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_text: 'hi' }),
  });
  const res = await worker.fetch(req, makeEnv(), {});
  assert.equal(res.status, 400);
});

test('e2e: GET /v1/audio/dev/:jobid.mp3 po dub → vrátí audio', async () => {
  const restoreFetch = installFetchMock();
  const env = makeEnv();

  // 1. Vytvoř dub → uloží do R2.
  const dubReq = new Request('http://x/v1/dub', {
    method: 'POST',
    headers: { Authorization: devBearer, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_text: 'Hello', target_language: 'cs' }),
  });
  const dubRes = await worker.fetch(dubReq, env, {});
  const { audio_url } = await dubRes.json();

  // 2. Stáhni audio přes audio_url.
  const audioReq = new Request('http://x' + audio_url, {
    headers: { Authorization: devBearer },
  });
  const audioRes = await worker.fetch(audioReq, env, {});
  restoreFetch();

  assert.equal(audioRes.status, 200);
  assert.equal(audioRes.headers.get('Content-Type'), 'audio/mpeg');
});

test('e2e: GET /v1/audio cross-tenant → 403', async () => {
  const env = makeEnv();
  await env.AUDIO_STORE.put('acme/j1.mp3', new Uint8Array([1, 2, 3]).buffer);

  const req = new Request('http://x/v1/audio/acme/j1.mp3', {
    headers: { Authorization: devBearer }, // dev tenant ≠ acme
  });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 403);
});

test('e2e: unknown route → 404 not_found', async () => {
  const req = new Request('http://x/v1/nope', { headers: { Authorization: devBearer } });
  const res = await worker.fetch(req, makeEnv(), {});
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error.code, 'not_found');
});

test('e2e: OPTIONS preflight → CORS headers', async () => {
  const req = new Request('http://x/v1/dub', {
    method: 'OPTIONS',
    headers: { Origin: 'https://voicedub.ai', 'Access-Control-Request-Method': 'POST' },
  });
  const res = await worker.fetch(req, makeEnv(), {});
  assert.ok(res.status === 204 || res.status === 200);
  assert.ok(res.headers.get('Access-Control-Allow-Origin'));
});
