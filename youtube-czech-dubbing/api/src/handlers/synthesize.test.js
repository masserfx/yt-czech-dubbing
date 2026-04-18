import { test } from 'node:test';
import assert from 'node:assert/strict';

const API_KEY = { tenant_id: 't1', tier: 'business' };

function mockEnv({ r2 = null, ttsOk = true } = {}) {
  return {
    AZURE_SPEECH_KEY: 'fake',
    AZURE_SPEECH_REGION: 'westeurope',
    AUDIO_STORE: r2,
    _ttsOk: ttsOk,
  };
}

function mockCtx() {
  return { waitUntil: (_p) => {} };
}

function mockAzureFetch(ok = true) {
  globalThis.fetch = async () => ok
    ? new Response(new Uint8Array([0x49, 0x44, 0x33]).buffer, { status: 200, headers: { 'content-type': 'audio/mpeg' } })
    : new Response('azure down', { status: 500 });
}

test('validation: missing text returns 400', async () => {
  const req = new Request('http://x/v1/synthesize', {
    method: 'POST', body: JSON.stringify({ language: 'cs' }), headers: { 'content-type': 'application/json' },
  });
  const { handleSynthesize } = await import('./synthesize.js');
  const res = await handleSynthesize(req, mockEnv(), mockCtx(), { apiKey: API_KEY });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'missing_text');
});

test('validation: text too long returns 400', async () => {
  const req = new Request('http://x/v1/synthesize', {
    method: 'POST', body: JSON.stringify({ text: 'x'.repeat(2001) }), headers: { 'content-type': 'application/json' },
  });
  const { handleSynthesize } = await import('./synthesize.js');
  const res = await handleSynthesize(req, mockEnv(), mockCtx(), { apiKey: API_KEY });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'text_too_long');
});

test('synthesis returns audio_base64 when no cache', async () => {
  mockAzureFetch(true);
  const req = new Request('http://x/v1/synthesize', {
    method: 'POST', body: JSON.stringify({ text: 'Ahoj světe', language: 'cs', disable_watermark: true }),
    headers: { 'content-type': 'application/json' },
  });
  const { handleSynthesize } = await import('./synthesize.js');
  const res = await handleSynthesize(req, mockEnv(), mockCtx(), { apiKey: API_KEY });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.cached, false);
  assert.ok(data.audio_base64);
  assert.equal(data.voice_id, 'cs-CZ-VlastaNeural');
  assert.equal(data.characters, 'Ahoj světe'.length);
});

test('synthesis returns cached audio when R2 hit', async () => {
  const fakeBuf = new Uint8Array([0x49, 0x44, 0x33, 0xAA]).buffer;
  const r2 = {
    _hits: 0,
    async get(_key) { this._hits++; return { arrayBuffer: async () => fakeBuf }; },
    async put() {},
  };
  const req = new Request('http://x/v1/synthesize', {
    method: 'POST', body: JSON.stringify({ text: 'Cached text', language: 'cs' }),
    headers: { 'content-type': 'application/json' },
  });
  const { handleSynthesize } = await import('./synthesize.js');
  const res = await handleSynthesize(req, mockEnv({ r2 }), mockCtx(), { apiKey: API_KEY });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.cached, true);
  assert.equal(r2._hits, 1);
});
