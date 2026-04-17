import { json } from '../utils/response.js';

// Azure Neural TTS — kurátorsky vybrané hlasy s nejvyšší kvalitou pro CEE.
const VOICES = {
  cs: [
    { id: 'cs-CZ-VlastaNeural',  name: 'Vlasta',  gender: 'female', style: 'neutral' },
    { id: 'cs-CZ-AntoninNeural', name: 'Antonín', gender: 'male',   style: 'neutral' },
  ],
  sk: [
    { id: 'sk-SK-ViktoriaNeural', name: 'Viktória', gender: 'female', style: 'neutral' },
    { id: 'sk-SK-LukasNeural',    name: 'Lukáš',    gender: 'male',   style: 'neutral' },
  ],
  pl: [
    { id: 'pl-PL-ZofiaNeural',  name: 'Zofia',  gender: 'female', style: 'neutral' },
    { id: 'pl-PL-MarekNeural',  name: 'Marek',  gender: 'male',   style: 'neutral' },
    { id: 'pl-PL-AgnieszkaNeural', name: 'Agnieszka', gender: 'female', style: 'warm' },
  ],
  hu: [
    { id: 'hu-HU-NoemiNeural', name: 'Noémi', gender: 'female', style: 'neutral' },
    { id: 'hu-HU-TamasNeural', name: 'Tamás', gender: 'male',   style: 'neutral' },
  ],
};

export async function handleVoices(request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang');
  if (lang && !VOICES[lang]) {
    return json({ error: { code: 'unsupported_language', message: `Supported: ${Object.keys(VOICES).join(', ')}` } }, 400);
  }
  const data = lang ? { [lang]: VOICES[lang] } : VOICES;
  return json({ voices: data, default_engine: 'azure-neural-tts' });
}
