import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrder } from './translator.js';

// resolveOrder — čistě logické testy bez fetch.

test('resolveOrder: jen Gemini key → [gemini]', () => {
  const order = resolveOrder({ GEMINI_API_KEY: 'x' });
  assert.deepEqual(order, ['gemini']);
});

test('resolveOrder: všechny 3 keys → [gemini, deepl, openai]', () => {
  const env = { GEMINI_API_KEY: 'a', DEEPL_API_KEY: 'b', OPENAI_API_KEY: 'c' };
  assert.deepEqual(resolveOrder(env), ['gemini', 'deepl', 'openai']);
});

test('resolveOrder: Enterprise tier → DeepL první', () => {
  const env = { GEMINI_API_KEY: 'a', DEEPL_API_KEY: 'b', OPENAI_API_KEY: 'c' };
  assert.deepEqual(resolveOrder(env, { tier: 'enterprise' }), ['deepl', 'gemini', 'openai']);
});

test('resolveOrder: force=openai → [openai]', () => {
  const env = { GEMINI_API_KEY: 'a', DEEPL_API_KEY: 'b', OPENAI_API_KEY: 'c' };
  assert.deepEqual(resolveOrder(env, { force: 'openai' }), ['openai']);
});

test('resolveOrder: force provider bez API key → throw', () => {
  const env = { GEMINI_API_KEY: 'a' };
  assert.throws(() => resolveOrder(env, { force: 'deepl' }), /no API key/i);
});

test('resolveOrder: žádný API key → []', () => {
  assert.deepEqual(resolveOrder({}), []);
});

// Integration logic: fallback chain s mock providery.

test('translate: primary fail → fallback na secondary', async () => {
  const { translate } = await import('./translator.js');

  // Monkey-patch global fetch aby Gemini vrátil 429, DeepL vrátil 200.
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (url.includes('generativelanguage.googleapis.com')) {
      return { ok: false, status: 429, text: async () => 'rate limit' };
    }
    if (url.includes('deepl.com')) {
      return {
        ok: true,
        json: async () => ({ translations: [{ text: 'Ahoj světe' }] }),
      };
    }
    return { ok: false, status: 500, text: async () => 'err' };
  };

  const env = { GEMINI_API_KEY: 'g', DEEPL_API_KEY: 'd' };
  const res = await translate(['Hello world'], 'cs', env);
  globalThis.fetch = origFetch;

  assert.equal(res.provider, 'deepl');
  assert.equal(res.text[0], 'Ahoj světe');
  assert.equal(res.attempts.length, 2);
  assert.equal(res.attempts[0].ok, false);
  assert.equal(res.attempts[1].ok, true);
});

test('translate: žádný provider nemá key → throw', async () => {
  const { translate } = await import('./translator.js');
  await assert.rejects(
    () => translate(['hi'], 'cs', {}),
    /No translator API key available/
  );
});

test('translate: unsupported language NEpadá na fallback', async () => {
  const { translate } = await import('./translator.js');
  const env = { GEMINI_API_KEY: 'g', DEEPL_API_KEY: 'd' };

  // Gemini vrátí unsupported synchronně (throw před fetchem).
  await assert.rejects(
    () => translate(['hi'], 'xx', env),
    /[Uu]nsupported/
  );
});
