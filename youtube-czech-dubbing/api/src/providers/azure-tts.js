/**
 * Azure Neural TTS — synthesis přes REST API.
 * Output: audio/mpeg (MP3 24kHz).
 *
 * Docs: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
 */
export async function synthesizeSSML(text, voiceId, { key, region }) {
  if (!key) throw new Error('AZURE_SPEECH_KEY missing');
  if (!region) throw new Error('AZURE_SPEECH_REGION missing');

  const locale = voiceId.split('-').slice(0, 2).join('-'); // cs-CZ
  const ssml = `<speak version="1.0" xml:lang="${locale}" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${voiceId}">
    <prosody rate="0%" pitch="0%">${escapeXml(text)}</prosody>
  </voice>
</speak>`;

  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'VoiceDub-API/0.1',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.arrayBuffer();
}

function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
