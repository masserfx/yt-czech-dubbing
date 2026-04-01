/**
 * Language configuration for YouTube Dubbing extension.
 * Central source of truth for all language-related mappings.
 */
const LANGUAGES = {
  cs: {
    code: 'cs',
    name: 'Čeština',
    flag: '🇨🇿',
    bcp47: 'cs-CZ',
    translationCodes: { google: 'cs', deepl: 'CS', mymemory: 'cs', libre: 'cs' },
    voicePriority: [/zuzana.*pr[eé]mi/i, /zuzana/i, /google.*cs/i],
    voiceFallbackLangs: ['cs-CZ', 'cs', 'sk-SK', 'sk'],
    azureVoices: [
      { id: 'cs-CZ-VlastaNeural', label: 'Vlasta (žena)', gender: 'female' },
      { id: 'cs-CZ-AntoninNeural', label: 'Antonín (muž)', gender: 'male' }
    ],
    claudePrompt: 'Přelož následující text do češtiny. Zachovej význam a přirozený český jazyk. Vrať POUZE překlad, nic jiného.',
    wordsPerMinute: 140,
    diacriticsRegex: /[ěščřžýáíéúůďťň]/i,
    trailingWords: /\s+(a|i|nebo|že|který|která|které|pro|na|v|s|z|k|do)\s*$/i,
    uiStrings: {
      activate: 'Český dabing',
      loading: 'Načítání...',
      active: 'Dabing aktivní ✓',
      settings: 'Nastavení dabingu',
      translating: 'Překládám',
      noSubtitles: 'Titulky nejsou k dispozici'
    }
  },
  sk: {
    code: 'sk',
    name: 'Slovenčina',
    flag: '🇸🇰',
    bcp47: 'sk-SK',
    translationCodes: { google: 'sk', deepl: 'SK', mymemory: 'sk', libre: 'sk' },
    voicePriority: [/laura.*pr[eé]mi/i, /laura/i, /google.*sk/i],
    voiceFallbackLangs: ['sk-SK', 'sk', 'cs-CZ', 'cs'],
    azureVoices: [
      { id: 'sk-SK-ViktoriaNeural', label: 'Viktória (žena)', gender: 'female' },
      { id: 'sk-SK-LukasNeural', label: 'Lukáš (muž)', gender: 'male' }
    ],
    claudePrompt: 'Prelož nasledujúci text do slovenčiny. Zachovaj význam a prirodzený slovenský jazyk. Vráť IBA preklad, nič iné.',
    wordsPerMinute: 140,
    diacriticsRegex: /[ľščťžýáíéúôďňŕĺ]/i,
    trailingWords: /\s+(a|i|alebo|že|ktorý|ktorá|ktoré|pre|na|v|s|z|k|do)\s*$/i,
    uiStrings: {
      activate: 'Slovenský dabing',
      loading: 'Načítavam...',
      active: 'Dabing aktívny ✓',
      settings: 'Nastavenia dabingu',
      translating: 'Prekladám',
      noSubtitles: 'Titulky nie sú k dispozícii'
    }
  },
  pl: {
    code: 'pl',
    name: 'Polski',
    flag: '🇵🇱',
    bcp47: 'pl-PL',
    translationCodes: { google: 'pl', deepl: 'PL', mymemory: 'pl', libre: 'pl' },
    voicePriority: [/zosia.*pr[eé]mi/i, /zosia/i, /google.*pl/i],
    voiceFallbackLangs: ['pl-PL', 'pl'],
    azureVoices: [
      { id: 'pl-PL-AgnieszkaNeural', label: 'Agnieszka (kobieta)', gender: 'female' },
      { id: 'pl-PL-MarekNeural', label: 'Marek (mężczyzna)', gender: 'male' }
    ],
    claudePrompt: 'Przetłumacz poniższy tekst na język polski. Zachowaj znaczenie i naturalny język polski. Zwróć TYLKO tłumaczenie, nic więcej.',
    wordsPerMinute: 130,
    diacriticsRegex: /[ąćęłńóśźż]/i,
    trailingWords: /\s+(i|a|lub|że|który|która|które|dla|na|w|z|do|od)\s*$/i,
    uiStrings: {
      activate: 'Polski dubbing',
      loading: 'Ładowanie...',
      active: 'Dubbing aktywny ✓',
      settings: 'Ustawienia dubbingu',
      translating: 'Tłumaczę',
      noSubtitles: 'Napisy niedostępne'
    }
  },
  hu: {
    code: 'hu',
    name: 'Magyar',
    flag: '🇭🇺',
    bcp47: 'hu-HU',
    translationCodes: { google: 'hu', deepl: 'HU', mymemory: 'hu', libre: 'hu' },
    voicePriority: [/mariska.*pr[eé]mi/i, /mariska/i, /google.*hu/i],
    voiceFallbackLangs: ['hu-HU', 'hu'],
    azureVoices: [
      { id: 'hu-HU-NoemiNeural', label: 'Noémi (nő)', gender: 'female' },
      { id: 'hu-HU-TamasNeural', label: 'Tamás (férfi)', gender: 'male' }
    ],
    claudePrompt: 'Fordítsd le a következő szöveget magyarra. Őrizd meg az értelmet és a természetes magyar nyelvet. CSAK a fordítást add vissza, semmi mást.',
    wordsPerMinute: 120,
    diacriticsRegex: /[áéíóöőúüű]/i,
    trailingWords: /\s+(és|vagy|hogy|aki|ami|amely|egy|az|a|nem|is)\s*$/i,
    uiStrings: {
      activate: 'Magyar szinkron',
      loading: 'Betöltés...',
      active: 'Szinkron aktív ✓',
      settings: 'Szinkron beállítások',
      translating: 'Fordítás',
      noSubtitles: 'Feliratok nem elérhetők'
    }
  }
};

const DEFAULT_LANGUAGE = 'cs';

function getLanguageConfig(langCode) {
  return LANGUAGES[langCode] || LANGUAGES[DEFAULT_LANGUAGE];
}

window.LANGUAGES = LANGUAGES;
window.DEFAULT_LANGUAGE = DEFAULT_LANGUAGE;
window.getLanguageConfig = getLanguageConfig;
