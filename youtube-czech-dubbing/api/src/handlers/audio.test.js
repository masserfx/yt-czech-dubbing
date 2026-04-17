import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAudio } from './audio.js';

// Mock R2 binding interface.
function mockR2(store = {}) {
  return {
    async get(key) {
      const data = store[key];
      if (!data) return null;
      return {
        body: new Blob([data]).stream(),
        size: data.byteLength || data.length,
      };
    },
  };
}

const ctx = {};
const fakeApiKey = { tenant_id: 'acme', tier: 'business' };

test('audio: vrátí 200 s audio/mpeg pro vlastní tenant', async () => {
  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
  const env = { AUDIO_STORE: mockR2({ 'acme/job123.mp3': mp3 }) };
  const req = new Request('http://x/v1/audio/acme/job123.mp3');

  const res = await handleAudio(req, env, ctx, {
    apiKey: fakeApiKey,
    params: ['acme', 'job123.mp3'],
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(res.headers.get('X-VoiceDub-Tenant'), 'acme');
});

test('audio: 403 při cross-tenant pokusu', async () => {
  const env = { AUDIO_STORE: mockR2({}) };
  const req = new Request('http://x/v1/audio/other/job.mp3');

  const res = await handleAudio(req, env, ctx, {
    apiKey: fakeApiKey,
    params: ['other', 'job.mp3'],
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error.code, 'forbidden');
});

test('audio: 404 když objekt neexistuje v R2', async () => {
  const env = { AUDIO_STORE: mockR2({}) };
  const req = new Request('http://x/v1/audio/acme/missing.mp3');

  const res = await handleAudio(req, env, ctx, {
    apiKey: fakeApiKey,
    params: ['acme', 'missing.mp3'],
  });

  assert.equal(res.status, 404);
});

test('audio: 400 pro invalidní filename (path traversal)', async () => {
  const env = { AUDIO_STORE: mockR2({}) };
  const req = new Request('http://x/v1/audio/acme/..evil.mp3');

  const res = await handleAudio(req, env, ctx, {
    apiKey: fakeApiKey,
    params: ['acme', '..evil.mp3'],
  });

  assert.equal(res.status, 400);
});

test('audio: 503 když R2 binding chybí', async () => {
  const env = {};
  const req = new Request('http://x/v1/audio/acme/job.mp3');

  const res = await handleAudio(req, env, ctx, {
    apiKey: fakeApiKey,
    params: ['acme', 'job.mp3'],
  });

  assert.equal(res.status, 503);
});
