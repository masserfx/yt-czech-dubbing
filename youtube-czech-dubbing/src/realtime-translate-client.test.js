import { test } from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = {};
await import('./realtime-translate-client.js');

test('RealtimeTranslateClient: handles OpenAI output audio transcript events', () => {
  const client = new globalThis.window.RealtimeTranslateClient({});
  const translated = [];

  assert.equal(client._handleTranslatedTranscriptEvent({
    type: 'response.output_audio_transcript.delta',
    response_id: 'resp_1',
    item_id: 'item_1',
    content_index: 0,
    delta: 'Ahoj ',
  }, (text, event) => translated.push({ text, event })), true);

  assert.equal(client._handleTranslatedTranscriptEvent({
    type: 'response.output_audio_transcript.delta',
    response_id: 'resp_1',
    item_id: 'item_1',
    content_index: 0,
    delta: 'světe',
  }, (text, event) => translated.push({ text, event })), true);

  assert.equal(client._handleTranslatedTranscriptEvent({
    type: 'response.output_audio_transcript.done',
    response_id: 'resp_1',
    item_id: 'item_1',
    content_index: 0,
    transcript: 'Ahoj světe',
  }, (text, event) => translated.push({ text, event })), true);

  assert.deepEqual(translated.map(x => x.text), ['Ahoj ', 'Ahoj světe', 'Ahoj světe']);
  assert.equal(translated.at(-1).event.final, true);
});

test('RealtimeTranslateClient: starts a fresh caption buffer per response', () => {
  const client = new globalThis.window.RealtimeTranslateClient({});
  const translated = [];
  const push = (text) => translated.push(text);

  client._handleTranslatedTranscriptEvent({
    type: 'response.output_audio_transcript.delta',
    response_id: 'resp_1',
    item_id: 'item_1',
    content_index: 0,
    delta: 'První',
  }, push);
  client._handleTranslatedTranscriptEvent({
    type: 'response.output_audio_transcript.done',
    response_id: 'resp_1',
    item_id: 'item_1',
    content_index: 0,
  }, push);
  client._handleTranslatedTranscriptEvent({
    type: 'response.output_audio_transcript.delta',
    response_id: 'resp_2',
    item_id: 'item_2',
    content_index: 0,
    delta: 'Druhá',
  }, push);

  assert.equal(translated.at(-1), 'Druhá');
});

test('RealtimeTranslateClient: ignores duplicate content_part transcript after final transcript', () => {
  const client = new globalThis.window.RealtimeTranslateClient({});
  const translated = [];
  const push = (text) => translated.push(text);

  client._handleTranslatedTranscriptEvent({
    type: 'response.output_audio_transcript.done',
    response_id: 'resp_1',
    item_id: 'item_1',
    content_index: 0,
    transcript: 'Hotovo',
  }, push);
  client._handleTranslatedTranscriptEvent({
    type: 'response.content_part.done',
    response_id: 'resp_1',
    item_id: 'item_1',
    content_index: 0,
    part: { type: 'audio', transcript: 'Hotovo' },
  }, push);

  assert.deepEqual(translated, ['Hotovo']);
});

test('RealtimeTranslateClient: keeps legacy transcript events working', () => {
  const client = new globalThis.window.RealtimeTranslateClient({});
  const translated = [];

  client._handleTranslatedTranscriptEvent({
    type: 'session.output_transcript.delta',
    delta: 'Starý ',
  }, (text) => translated.push(text));
  client._handleTranslatedTranscriptEvent({
    type: 'session.output_transcript.completed',
    transcript: 'Starý formát',
  }, (text, event) => translated.push(`${text}|${event.final}`));

  assert.deepEqual(translated, ['Starý ', 'Starý formát|true']);
});

test('RealtimeTranslateClient: handles OpenAI input transcription source events', () => {
  const client = new globalThis.window.RealtimeTranslateClient({});
  const source = [];

  client._handleSourceTranscriptEvent({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'input_1',
    content_index: 0,
    delta: 'hello ',
  }, (text) => source.push(text));
  client._handleSourceTranscriptEvent({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'input_1',
    content_index: 0,
    transcript: 'hello world',
  }, (text, event) => source.push(`${text}|${event.final}`));

  assert.deepEqual(source, ['hello ', 'hello world|true']);
});
