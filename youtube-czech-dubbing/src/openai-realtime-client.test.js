import { test } from 'node:test';
import assert from 'node:assert/strict';

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

test('OpenAIRealtimeClient: disabled without key', async () => {
  installChromeMock({ settings: { openaiRealtimeMode: true }, sendResponse: () => null });
  await import('./openai-realtime-client.js');
  const c = new globalThis.window.OpenAIRealtimeClient();
  await c.loadConfig();

  assert.equal(c.isEnabled(), false);
  assert.equal(c.isRealtimePreferred(), false);
});

test('OpenAIRealtimeClient: realtime preferred with OpenAI key and toggle', async () => {
  installChromeMock({
    settings: {
      openaiRealtimeMode: true,
      openaiApiKey: 'sk-proj-' + 'A'.repeat(40),
    },
    sendResponse: () => null,
  });
  await import('./openai-realtime-client.js');
  const c = new globalThis.window.OpenAIRealtimeClient();
  await c.loadConfig();

  assert.equal(c.isEnabled(), true);
  assert.equal(c.isRealtimePreferred(), true);
});

test('OpenAIRealtimeClient: translation secret message', async () => {
  let captured;
  installChromeMock({
    settings: {
      openaiRealtimeMode: true,
      openaiApiKey: 'sk-proj-' + 'B'.repeat(40),
    },
    sendResponse: (msg) => {
      captured = msg;
      return { success: true, data: { value: 'ek_translate', model: 'gpt-realtime-translate' } };
    },
  });
  await import('./openai-realtime-client.js');
  const c = new globalThis.window.OpenAIRealtimeClient();
  await c.loadConfig();
  const out = await c.createRealtimeClientSecret('cs');

  assert.equal(captured.type, 'openai-realtime-client-secret');
  assert.equal(captured.apiKey, undefined);
  assert.equal(captured.payload.mode, 'translation');
  assert.equal(captured.payload.target_language, 'cs');
  assert.equal(out.value, 'ek_translate');
});

test('OpenAIRealtimeClient: transcription secret message does not require realtime toggle', async () => {
  let captured;
  installChromeMock({
    settings: {
      openaiRealtimeMode: false,
      openaiApiKey: 'sk-proj-' + 'C'.repeat(40),
    },
    sendResponse: (msg) => {
      captured = msg;
      return { success: true, data: { value: 'ek_whisper', model: 'gpt-realtime-whisper' } };
    },
  });
  await import('./openai-realtime-client.js');
  const c = new globalThis.window.OpenAIRealtimeClient();
  await c.loadConfig();
  const out = await c.createRealtimeTranscriptionClientSecret('en-US');

  assert.equal(c.isEnabled(), true);
  assert.equal(c.isRealtimePreferred(), false);
  assert.equal(captured.type, 'openai-realtime-client-secret');
  assert.equal(captured.payload.mode, 'transcription');
  assert.equal(captured.payload.source_language, 'en-US');
  assert.equal(out.value, 'ek_whisper');
});
