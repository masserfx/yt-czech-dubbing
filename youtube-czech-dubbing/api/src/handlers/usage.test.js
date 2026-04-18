import { test } from 'node:test';
import assert from 'node:assert/strict';

const API_KEY = { tenant_id: 't1', tier: 'business', key: 'vd_test_xxxxxxxxxxxxxxxxxxxx' };

function mockCtx() { return { waitUntil: () => {} }; }

test('dev mode (no JOBS_DB) returns empty summary', async () => {
  const req = new Request('http://x/v1/usage?period=today');
  const { handleUsage } = await import('./usage.js');
  const res = await handleUsage(req, {}, mockCtx(), { apiKey: API_KEY });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.period, 'today');
  assert.equal(data.summary.requests_total, 0);
  assert.equal(data.summary.characters_synthesized, 0);
  assert.deepEqual(data.providers, {});
  assert.deepEqual(data.buckets, []);
  assert.equal(data.rate_limit.tier, 'business');
  assert.equal(data.rate_limit.limit_per_minute, 300);
});

test('D1 results aggregate per tenant', async () => {
  const env = {
    JOBS_DB: {
      prepare(sql) {
        return {
          _sql: sql, _binds: [],
          bind(...args) { this._binds = args; return this; },
          async first() {
            return {
              requests_total: 5, errors: 1,
              requests_dub: 3, requests_synthesize: 2, requests_translate: 0,
              characters_synthesized: 1234, audio_seconds: 87.5,
            };
          },
          async all() {
            if (this._sql.includes('translator_provider, COUNT')) {
              return { results: [{ translator_provider: 'gemini', cnt: 4 }, { translator_provider: 'deepl', cnt: 1 }] };
            }
            return { results: [{ ts: '2026-04-17T00:00:00Z', requests: 5, audio_seconds: 87.5 }] };
          },
        };
      },
    },
  };
  const req = new Request('http://x/v1/usage?period=week&group_by=day');
  const { handleUsage } = await import('./usage.js');
  const res = await handleUsage(req, env, mockCtx(), { apiKey: API_KEY });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.summary.requests_total, 5);
  assert.equal(data.providers.gemini, 4);
  assert.equal(data.providers.deepl, 1);
  assert.equal(data.buckets.length, 1);
});
