import { test } from 'node:test';
import assert from 'node:assert/strict';

// Čistě logické testy bez wrangler/CF runtime — ověřují kontrakty handleru.
// Pro integration testy použij `wrangler dev` + reálné HTTP volání.

test('validation: missing source returns 400', async () => {
  const body = JSON.stringify({ target_language: 'cs' });
  const req = new Request('http://x/v1/dub', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
  const mod = await import('./dub.js');
  const res = await mod.handleDub(req, {}, {}, { apiKey: { tenant_id: 't', tier: 'business' } });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error.code, 'missing_source');
});

test('validation: bad language returns 400', async () => {
  const body = JSON.stringify({ source_text: 'hi', target_language: 'xx' });
  const req = new Request('http://x/v1/dub', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
  const mod = await import('./dub.js');
  const res = await mod.handleDub(req, {}, {}, { apiKey: { tenant_id: 't', tier: 'business' } });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error.code, 'unsupported_language');
});

test('URL path returns 202 pending', async () => {
  const body = JSON.stringify({ source_url: 'https://x/v.mp4', target_language: 'cs' });
  const req = new Request('http://x/v1/dub', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
  const mod = await import('./dub.js');
  const res = await mod.handleDub(req, {}, {}, { apiKey: { tenant_id: 't', tier: 'business' } });
  assert.equal(res.status, 202);
  const data = await res.json();
  assert.equal(data.status, 'pending');
  assert.ok(data.job_id);
});
