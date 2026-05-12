import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock chrome.storage + chrome.runtime API (Node nemá Chrome runtime).
function installChromeMock({ settings, sendResponse }) {
  globalThis.chrome = {
    storage: {
      local: {
        get: async (_key) => ({ popupSettings: settings || null }),
      },
    },
    runtime: {
      sendMessage: async (msg) => sendResponse(msg),
    },
  };
  if (typeof globalThis.window === 'undefined') globalThis.window = {};
}

test('VoiceDubClient: isEnabled false bez apiKey', async () => {
  installChromeMock({ settings: { voicedubMode: true }, sendResponse: () => null });
  // Require-style načtení — soubor přiřadí do window.VoiceDubClient.
  await import('./voicedub-client.js');
  const c = new globalThis.window.VoiceDubClient();
  await c.loadConfig();
  assert.equal(c.isEnabled(), false);
});

test('VoiceDubClient: isEnabled true s platným vd_live_ klíčem', async () => {
  installChromeMock({
    settings: { voicedubMode: true, voicedubApiKey: 'vd_live_' + 'A'.repeat(22) },
    sendResponse: () => null,
  });
  await import('./voicedub-client.js');
  const c = new globalThis.window.VoiceDubClient();
  await c.loadConfig();
  assert.equal(c.isEnabled(), true);
});

test('VoiceDubClient: dub() posílá správnou message do background', async () => {
  let captured;
  installChromeMock({
    settings: {
      voicedubMode: true,
      voicedubApiKey: 'vd_test_' + 'B'.repeat(22),
      voicedubEndpoint: 'https://api.example.com',
    },
    sendResponse: (msg) => {
      captured = msg;
      return {
        success: true,
        data: { translated: 'Ahoj', audioBase64: 'AAA', provider: 'gemini' },
      };
    },
  });
  await import('./voicedub-client.js');
  const c = new globalThis.window.VoiceDubClient();
  await c.loadConfig();
  const out = await c.dub('Hello', 'cs', { voiceId: 'cs-CZ-VlastaNeural' });

  assert.equal(captured.type, 'voicedub-dub');
  assert.equal(captured.endpoint, 'https://api.example.com');
  assert.equal(captured.payload.source_text, 'Hello');
  assert.equal(captured.payload.target_language, 'cs');
  assert.equal(captured.payload.voice_id, 'cs-CZ-VlastaNeural');
  assert.equal(out.translated, 'Ahoj');
  assert.equal(out.provider, 'gemini');
});

test('VoiceDubClient: dub() při disabled vrací null', async () => {
  installChromeMock({ settings: { voicedubMode: false }, sendResponse: () => null });
  await import('./voicedub-client.js');
  const c = new globalThis.window.VoiceDubClient();
  await c.loadConfig();
  const out = await c.dub('Hello', 'cs');
  assert.equal(out, null);
});

test('VoiceDubClient: dub() při API error vrací null', async () => {
  installChromeMock({
    settings: { voicedubMode: true, voicedubApiKey: 'vd_live_' + 'C'.repeat(22) },
    sendResponse: () => ({ success: false, error: 'rate_limited' }),
  });
  await import('./voicedub-client.js');
  const c = new globalThis.window.VoiceDubClient();
  await c.loadConfig();
  // Potlačíme console.warn pro čistý output.
  const origWarn = console.warn;
  console.warn = () => {};
  const out = await c.dub('Hello', 'cs');
  console.warn = origWarn;
  assert.equal(out, null);
});

test('VoiceDubClient: createRealtimeClientSecret() posílá správnou message', async () => {
  let captured;
  installChromeMock({
    settings: {
      voicedubMode: true,
      voicedubRealtimeMode: true,
      voicedubApiKey: 'vd_live_' + 'D'.repeat(22),
      voicedubEndpoint: 'https://api.example.com',
    },
    sendResponse: (msg) => {
      captured = msg;
      return {
        success: true,
        data: { value: 'rt_secret', expires_at: 1770000000, model: 'gpt-realtime-translate' },
      };
    },
  });
  await import('./voicedub-client.js');
  const c = new globalThis.window.VoiceDubClient();
  await c.loadConfig();
  const out = await c.createRealtimeClientSecret('cs');

  assert.equal(c.isRealtimePreferred(), true);
  assert.equal(captured.type, 'voicedub-realtime-client-secret');
  assert.equal(captured.endpoint, 'https://api.example.com');
  assert.equal(captured.payload.target_language, 'cs');
  assert.equal(out.value, 'rt_secret');
});

test('VoiceDubClient: createRealtimeTranscriptionClientSecret() posílá správnou message', async () => {
  let captured;
  installChromeMock({
    settings: {
      voicedubMode: true,
      voicedubApiKey: 'vd_live_' + 'E'.repeat(22),
      voicedubEndpoint: 'https://api.example.com',
    },
    sendResponse: (msg) => {
      captured = msg;
      return {
        success: true,
        data: { value: 'rt_whisper_secret', expires_at: 1770000000, model: 'gpt-realtime-whisper' },
      };
    },
  });
  await import('./voicedub-client.js');
  const c = new globalThis.window.VoiceDubClient();
  await c.loadConfig();
  const out = await c.createRealtimeTranscriptionClientSecret('en-US');

  assert.equal(captured.type, 'voicedub-realtime-client-secret');
  assert.equal(captured.endpoint, 'https://api.example.com');
  assert.equal(captured.payload.mode, 'transcription');
  assert.equal(captured.payload.source_language, 'en-US');
  assert.equal(out.value, 'rt_whisper_secret');
});
