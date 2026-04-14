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
    voiceRoles: {
      M: { edge: 'cs-CZ-AntoninNeural', pitch: 1.0, rate: 1.0 },
      F: { edge: 'cs-CZ-VlastaNeural', pitch: 1.0, rate: 1.0 },
      C: { edge: 'cs-CZ-VlastaNeural', pitch: 1.15, rate: 1.05 },
      N: { edge: 'cs-CZ-AntoninNeural', pitch: 0.95, rate: 0.95 }
    },
    claudePrompt: 'Jsi překladatel pro český dabing YouTube videí. Přelož přepis z angličtiny do přirozené mluvené češtiny. Pravidla: Používej hovorovou češtinu vhodnou pro mluvené slovo, ne literární styl. Vynech vyplňovací slova (you know, I mean, basically). NEPŘEKLÁDEJ vlastní jména a značky. DETEKCE MLUVČÍCH: Před každý přeložený segment přidej tag [M] pro muže, [F] pro ženu, [C] pro dítě, [N] pro narátora. Urči pohlaví z kontextu (jména, zájmena, způsob mluvy). Pokud si nejsi jistý, použij [M]. Vrať POUZE tagy a překlad, nic jiného.',
    geminiPrompt: 'Jsi překladatel pro český dabing YouTube videí. Přelož přepis z angličtiny do přirozené mluvené češtiny. Pravidla: Používej hovorovou češtinu vhodnou pro mluvené slovo, ne literární styl. Vynech vyplňovací slova (you know, I mean, basically). NEPŘEKLÁDEJ vlastní jména a značky. DETEKCE MLUVČÍCH: Před každý přeložený segment přidej tag [M] pro muže, [F] pro ženu, [C] pro dítě, [N] pro narátora. Urči pohlaví z kontextu (jména, zájmena, způsob mluvy). Pokud si nejsi jistý, použij [M]. Vrať POUZE tagy a překlad, nic jiného.',
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
    voiceRoles: {
      M: { edge: 'sk-SK-LukasNeural', pitch: 1.0, rate: 1.0 },
      F: { edge: 'sk-SK-ViktoriaNeural', pitch: 1.0, rate: 1.0 },
      C: { edge: 'sk-SK-ViktoriaNeural', pitch: 1.15, rate: 1.05 },
      N: { edge: 'sk-SK-LukasNeural', pitch: 0.95, rate: 0.95 }
    },
    claudePrompt: 'Si prekladateľ pre slovenský dabing YouTube videí. Prelož prepis z angličtiny do prirodzenej hovorenej slovenčiny. Pravidlá: Používaj hovorovú slovenčinu vhodnú pre hovorené slovo. Vynechaj výplňové slová. NEPREKLADAJ vlastné mená a značky. DETEKCIA HOVORCOV: Pred každý preložený segment pridaj tag [M] pre muža, [F] pre ženu, [C] pre dieťa, [N] pre rozprávača. Urči pohlavie z kontextu. Ak si nie si istý, použi [M]. Vráť IBA tagy a preklad, nič iné.',
    geminiPrompt: 'Si prekladateľ pre slovenský dabing YouTube videí. Prelož prepis z angličtiny do prirodzenej hovorenej slovenčiny. Pravidlá: Používaj hovorovú slovenčinu vhodnú pre hovorené slovo. Vynechaj výplňové slová. NEPREKLADAJ vlastné mená a značky. DETEKCIA HOVORCOV: Pred každý preložený segment pridaj tag [M] pre muža, [F] pre ženu, [C] pre dieťa, [N] pre rozprávača. Urči pohlavie z kontextu. Ak si nie si istý, použi [M]. Vráť IBA tagy a preklad, nič iné.',
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
    voiceRoles: {
      M: { edge: 'pl-PL-MarekNeural', pitch: 1.0, rate: 1.0 },
      F: { edge: 'pl-PL-AgnieszkaNeural', pitch: 1.0, rate: 1.0 },
      C: { edge: 'pl-PL-AgnieszkaNeural', pitch: 1.15, rate: 1.05 },
      N: { edge: 'pl-PL-MarekNeural', pitch: 0.95, rate: 0.95 }
    },
    claudePrompt: 'Jesteś tłumaczem dla polskiego dubbingu filmów YouTube. Przetłumacz transkrypcję z angielskiego na naturalny mówiony polski. Zasady: Używaj potocznego polskiego odpowiedniego dla mowy. Pomijaj słowa wypełniające. NIE tłumacz nazw własnych i marek. DETEKCJA MÓWCÓW: Przed każdym przetłumaczonym segmentem dodaj tag [M] dla mężczyzny, [F] dla kobiety, [C] dla dziecka, [N] dla narratora. Określ płeć z kontekstu. Jeśli nie jesteś pewien, użyj [M]. Zwróć TYLKO tagi i tłumaczenie.',
    geminiPrompt: 'Jesteś tłumaczem dla polskiego dubbingu filmów YouTube. Przetłumacz transkrypcję z angielskiego na naturalny mówiony polski. Zasady: Używaj potocznego polskiego odpowiedniego dla mowy. Pomijaj słowa wypełniające. NIE tłumacz nazw własnych i marek. DETEKCJA MÓWCÓW: Przed każdym przetłumaczonym segmentem dodaj tag [M] dla mężczyzny, [F] dla kobiety, [C] dla dziecka, [N] dla narratora. Określ płeć z kontekstu. Jeśli nie jesteś pewien, użyj [M]. Zwróć TYLKO tagi i tłumaczenie.',
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
    voiceRoles: {
      M: { edge: 'hu-HU-TamasNeural', pitch: 1.0, rate: 1.0 },
      F: { edge: 'hu-HU-NoemiNeural', pitch: 1.0, rate: 1.0 },
      C: { edge: 'hu-HU-NoemiNeural', pitch: 1.15, rate: 1.05 },
      N: { edge: 'hu-HU-TamasNeural', pitch: 0.95, rate: 0.95 }
    },
    claudePrompt: 'YouTube videók magyar szinkronjának fordítója vagy. Fordítsd le az angol átiratot természetes beszélt magyarra. Szabályok: Használj köznyelvi magyart. Hagyd ki a töltelékszavakat. NE fordítsd le a tulajdonneveket és márkákat. BESZÉLŐ FELISMERÉS: Minden lefordított szegmens elé tegyél [M] taget férfi, [F] taget női, [C] taget gyerek, [N] taget narrátor hanghoz. Határozd meg a nemet a kontextusból. Ha bizonytalan vagy, használj [M]-et. CSAK a tageket és a fordítást add vissza.',
    geminiPrompt: 'YouTube videók magyar szinkronjának fordítója vagy. Fordítsd le az angol átiratot természetes beszélt magyarra. Szabályok: Használj köznyelvi magyart. Hagyd ki a töltelékszavakat. NE fordítsd le a tulajdonneveket és márkákat. BESZÉLŐ FELISMERÉS: Minden lefordított szegmens elé tegyél [M] taget férfi, [F] taget női, [C] taget gyerek, [N] taget narrátor hanghoz. Határozd meg a nemet a kontextusból. Ha bizonytalan vagy, használj [M]-et. CSAK a tageket és a fordítást add vissza.',
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
  },

  // ── Additional languages (translation + TTS, minimal config) ──
  en: {
    code: 'en', name: 'English', flag: '🇬🇧', bcp47: 'en-US',
    translationCodes: { google: 'en', deepl: 'EN', mymemory: 'en', libre: 'en' },
    voicePriority: [/samantha/i, /google.*en/i], voiceFallbackLangs: ['en-US', 'en-GB', 'en'],
    azureVoices: [{ id: 'en-US-JennyNeural', label: 'Jenny', gender: 'female' }, { id: 'en-US-GuyNeural', label: 'Guy', gender: 'male' }],
    claudePrompt: 'Translate the following text to English. Return ONLY the translation.',
    geminiPrompt: 'Translate the following text to English. Return ONLY the translation.',
    wordsPerMinute: 150, diacriticsRegex: /(?!)/,
    trailingWords: /\s+(and|or|the|a|an|in|on|at|to|for|of|with|but)\s*$/i,
    uiStrings: { activate: 'English dubbing', loading: 'Loading...', active: 'Dubbing active ✓', settings: 'Settings', translating: 'Translating', noSubtitles: 'Subtitles not available' }
  },
  de: {
    code: 'de', name: 'Deutsch', flag: '🇩🇪', bcp47: 'de-DE',
    translationCodes: { google: 'de', deepl: 'DE', mymemory: 'de', libre: 'de' },
    voicePriority: [/anna/i, /google.*de/i], voiceFallbackLangs: ['de-DE', 'de'],
    azureVoices: [{ id: 'de-DE-KatjaNeural', label: 'Katja', gender: 'female' }, { id: 'de-DE-ConradNeural', label: 'Conrad', gender: 'male' }],
    claudePrompt: 'Übersetze den folgenden Text ins Deutsche. Gib NUR die Übersetzung zurück.',
    geminiPrompt: 'Übersetze den folgenden Text ins Deutsche. Gib NUR die Übersetzung zurück.',
    wordsPerMinute: 130, diacriticsRegex: /[äöüß]/i,
    trailingWords: /\s+(und|oder|der|die|das|ein|eine|in|auf|mit|zu|von|für)\s*$/i,
    uiStrings: { activate: 'Deutsche Synchronisation', loading: 'Laden...', active: 'Synchronisation aktiv ✓', settings: 'Einstellungen', translating: 'Übersetze', noSubtitles: 'Untertitel nicht verfügbar' }
  },
  fr: {
    code: 'fr', name: 'Français', flag: '🇫🇷', bcp47: 'fr-FR',
    translationCodes: { google: 'fr', deepl: 'FR', mymemory: 'fr', libre: 'fr' },
    voicePriority: [/thomas/i, /google.*fr/i], voiceFallbackLangs: ['fr-FR', 'fr'],
    azureVoices: [{ id: 'fr-FR-DeniseNeural', label: 'Denise', gender: 'female' }, { id: 'fr-FR-HenriNeural', label: 'Henri', gender: 'male' }],
    claudePrompt: 'Traduis le texte suivant en français. Renvoie UNIQUEMENT la traduction.',
    geminiPrompt: 'Traduis le texte suivant en français. Renvoie UNIQUEMENT la traduction.',
    wordsPerMinute: 135, diacriticsRegex: /[àâéèêëïîôùûüÿçœæ]/i,
    trailingWords: /\s+(et|ou|le|la|les|un|une|de|du|des|en|à|pour|dans|avec)\s*$/i,
    uiStrings: { activate: 'Doublage français', loading: 'Chargement...', active: 'Doublage actif ✓', settings: 'Paramètres', translating: 'Traduction', noSubtitles: 'Sous-titres non disponibles' }
  },
  es: {
    code: 'es', name: 'Español', flag: '🇪🇸', bcp47: 'es-ES',
    translationCodes: { google: 'es', deepl: 'ES', mymemory: 'es', libre: 'es' },
    voicePriority: [/monica/i, /google.*es/i], voiceFallbackLangs: ['es-ES', 'es-MX', 'es'],
    azureVoices: [{ id: 'es-ES-ElviraNeural', label: 'Elvira', gender: 'female' }, { id: 'es-ES-AlvaroNeural', label: 'Alvaro', gender: 'male' }],
    claudePrompt: 'Traduce el siguiente texto al español. Devuelve SOLO la traducción.',
    geminiPrompt: 'Traduce el siguiente texto al español. Devuelve SOLO la traducción.',
    wordsPerMinute: 140, diacriticsRegex: /[áéíóúñü¡¿]/i,
    trailingWords: /\s+(y|o|el|la|los|las|un|una|de|del|en|a|para|con|por)\s*$/i,
    uiStrings: { activate: 'Doblaje español', loading: 'Cargando...', active: 'Doblaje activo ✓', settings: 'Ajustes', translating: 'Traduciendo', noSubtitles: 'Subtítulos no disponibles' }
  },
  pt: {
    code: 'pt', name: 'Português', flag: '🇵🇹', bcp47: 'pt-PT',
    translationCodes: { google: 'pt', deepl: 'PT-PT', mymemory: 'pt', libre: 'pt' },
    voicePriority: [/google.*pt/i], voiceFallbackLangs: ['pt-PT', 'pt-BR', 'pt'],
    azureVoices: [{ id: 'pt-PT-RaquelNeural', label: 'Raquel', gender: 'female' }, { id: 'pt-BR-FranciscaNeural', label: 'Francisca (BR)', gender: 'female' }],
    claudePrompt: 'Traduza o seguinte texto para português. Retorne APENAS a tradução.',
    geminiPrompt: 'Traduza o seguinte texto para português. Retorne APENAS a tradução.',
    wordsPerMinute: 140, diacriticsRegex: /[àáâãéêíóôõúüç]/i,
    trailingWords: /\s+(e|ou|o|a|os|as|um|uma|de|do|da|em|no|na|para|com|por)\s*$/i,
    uiStrings: { activate: 'Dobragem português', loading: 'A carregar...', active: 'Dobragem ativa ✓', settings: 'Definições', translating: 'A traduzir', noSubtitles: 'Legendas não disponíveis' }
  },
  it: {
    code: 'it', name: 'Italiano', flag: '🇮🇹', bcp47: 'it-IT',
    translationCodes: { google: 'it', deepl: 'IT', mymemory: 'it', libre: 'it' },
    voicePriority: [/google.*it/i], voiceFallbackLangs: ['it-IT', 'it'],
    azureVoices: [{ id: 'it-IT-ElsaNeural', label: 'Elsa', gender: 'female' }, { id: 'it-IT-DiegoNeural', label: 'Diego', gender: 'male' }],
    claudePrompt: 'Traduci il seguente testo in italiano. Restituisci SOLO la traduzione.',
    geminiPrompt: 'Traduci il seguente testo in italiano. Restituisci SOLO la traduzione.',
    wordsPerMinute: 140, diacriticsRegex: /[àèéìòù]/i,
    trailingWords: /\s+(e|o|il|la|lo|le|gli|un|una|di|del|della|in|a|per|con|da)\s*$/i,
    uiStrings: { activate: 'Doppiaggio italiano', loading: 'Caricamento...', active: 'Doppiaggio attivo ✓', settings: 'Impostazioni', translating: 'Traduzione', noSubtitles: 'Sottotitoli non disponibili' }
  },
  nl: {
    code: 'nl', name: 'Nederlands', flag: '🇳🇱', bcp47: 'nl-NL',
    translationCodes: { google: 'nl', deepl: 'NL', mymemory: 'nl', libre: 'nl' },
    voicePriority: [/google.*nl/i], voiceFallbackLangs: ['nl-NL', 'nl'],
    azureVoices: [{ id: 'nl-NL-ColetteNeural', label: 'Colette', gender: 'female' }, { id: 'nl-NL-MaartenNeural', label: 'Maarten', gender: 'male' }],
    claudePrompt: 'Vertaal de volgende tekst naar het Nederlands. Geef ALLEEN de vertaling terug.',
    geminiPrompt: 'Vertaal de volgende tekst naar het Nederlands. Geef ALLEEN de vertaling terug.',
    wordsPerMinute: 135, diacriticsRegex: /[ëïé]/i,
    trailingWords: /\s+(en|of|de|het|een|in|op|van|voor|met|aan|door)\s*$/i,
    uiStrings: { activate: 'Nederlandse nasynchronisatie', loading: 'Laden...', active: 'Nasynchronisatie actief ✓', settings: 'Instellingen', translating: 'Vertalen', noSubtitles: 'Ondertiteling niet beschikbaar' }
  },
  ru: {
    code: 'ru', name: 'Русский', flag: '🇷🇺', bcp47: 'ru-RU',
    translationCodes: { google: 'ru', deepl: 'RU', mymemory: 'ru', libre: 'ru' },
    voicePriority: [/milena/i, /google.*ru/i], voiceFallbackLangs: ['ru-RU', 'ru'],
    azureVoices: [{ id: 'ru-RU-SvetlanaNeural', label: 'Светлана', gender: 'female' }, { id: 'ru-RU-DmitryNeural', label: 'Дмитрий', gender: 'male' }],
    claudePrompt: 'Переведи следующий текст на русский язык. Верни ТОЛЬКО перевод.',
    geminiPrompt: 'Переведи следующий текст на русский язык. Верни ТОЛЬКО перевод.',
    wordsPerMinute: 130, diacriticsRegex: /[а-яА-ЯёЁ]/,
    trailingWords: /\s+(и|или|в|на|с|к|для|от|по|за|не|что|как)\s*$/i,
    uiStrings: { activate: 'Русский дубляж', loading: 'Загрузка...', active: 'Дубляж активен ✓', settings: 'Настройки', translating: 'Перевод', noSubtitles: 'Субтитры недоступны' }
  },
  uk: {
    code: 'uk', name: 'Українська', flag: '🇺🇦', bcp47: 'uk-UA',
    translationCodes: { google: 'uk', deepl: 'UK', mymemory: 'uk', libre: 'uk' },
    voicePriority: [/google.*uk/i], voiceFallbackLangs: ['uk-UA', 'uk'],
    azureVoices: [{ id: 'uk-UA-PolinaNeural', label: 'Поліна', gender: 'female' }, { id: 'uk-UA-OstapNeural', label: 'Остап', gender: 'male' }],
    claudePrompt: 'Переклади наступний текст українською мовою. Поверни ТІЛЬКИ переклад.',
    geminiPrompt: 'Переклади наступний текст українською мовою. Поверни ТІЛЬКИ переклад.',
    wordsPerMinute: 130, diacriticsRegex: /[а-яА-ЯіІїЇєЄґҐ]/,
    trailingWords: /\s+(і|або|в|на|з|до|для|від|по|за|не|що|як)\s*$/i,
    uiStrings: { activate: 'Український дубляж', loading: 'Завантаження...', active: 'Дубляж активний ✓', settings: 'Налаштування', translating: 'Переклад', noSubtitles: 'Субтитри недоступні' }
  },
  ja: {
    code: 'ja', name: '日本語', flag: '🇯🇵', bcp47: 'ja-JP',
    translationCodes: { google: 'ja', deepl: 'JA', mymemory: 'ja', libre: 'ja' },
    voicePriority: [/google.*ja/i], voiceFallbackLangs: ['ja-JP', 'ja'],
    azureVoices: [{ id: 'ja-JP-NanamiNeural', label: 'Nanami', gender: 'female' }, { id: 'ja-JP-KeitaNeural', label: 'Keita', gender: 'male' }],
    claudePrompt: '次のテキストを日本語に翻訳してください。翻訳のみを返してください。',
    geminiPrompt: '次のテキストを日本語に翻訳してください。翻訳のみを返してください。',
    wordsPerMinute: 100, diacriticsRegex: /[\u3040-\u30ff\u4e00-\u9faf]/,
    trailingWords: /\s*[はがのにをでとも]\s*$/,
    uiStrings: { activate: '日本語吹替', loading: '読み込み中...', active: '吹替アクティブ ✓', settings: '設定', translating: '翻訳中', noSubtitles: '字幕なし' }
  },
  ko: {
    code: 'ko', name: '한국어', flag: '🇰🇷', bcp47: 'ko-KR',
    translationCodes: { google: 'ko', deepl: 'KO', mymemory: 'ko', libre: 'ko' },
    voicePriority: [/google.*ko/i], voiceFallbackLangs: ['ko-KR', 'ko'],
    azureVoices: [{ id: 'ko-KR-SunHiNeural', label: 'SunHi', gender: 'female' }, { id: 'ko-KR-InJoonNeural', label: 'InJoon', gender: 'male' }],
    claudePrompt: '다음 텍스트를 한국어로 번역하세요. 번역만 반환하세요.',
    geminiPrompt: '다음 텍스트를 한국어로 번역하세요. 번역만 반환하세요.',
    wordsPerMinute: 110, diacriticsRegex: /[\uac00-\ud7af]/,
    trailingWords: /\s*[은는이가을를의에서도]\s*$/,
    uiStrings: { activate: '한국어 더빙', loading: '로딩 중...', active: '더빙 활성 ✓', settings: '설정', translating: '번역 중', noSubtitles: '자막 없음' }
  },
  zh: {
    code: 'zh', name: '中文 (简体)', flag: '🇨🇳', bcp47: 'zh-CN',
    translationCodes: { google: 'zh-CN', deepl: 'ZH', mymemory: 'zh-CN', libre: 'zh' },
    voicePriority: [/google.*zh/i], voiceFallbackLangs: ['zh-CN', 'zh'],
    azureVoices: [{ id: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao', gender: 'female' }, { id: 'zh-CN-YunxiNeural', label: 'Yunxi', gender: 'male' }],
    claudePrompt: '请将以下文本翻译成简体中文。只返回翻译内容。',
    geminiPrompt: '请将以下文本翻译成简体中文。只返回翻译内容。',
    wordsPerMinute: 90, diacriticsRegex: /[\u4e00-\u9fff]/,
    trailingWords: /\s*[的了在是不有和就都]\s*$/,
    uiStrings: { activate: '中文配音', loading: '加载中...', active: '配音激活 ✓', settings: '设置', translating: '翻译中', noSubtitles: '字幕不可用' }
  },
  'zh-TW': {
    code: 'zh-TW', name: '中文 (繁體)', flag: '🇹🇼', bcp47: 'zh-TW',
    translationCodes: { google: 'zh-TW', deepl: 'ZH', mymemory: 'zh-TW', libre: 'zt' },
    voicePriority: [/google.*zh/i], voiceFallbackLangs: ['zh-TW', 'zh'],
    azureVoices: [{ id: 'zh-TW-HsiaoChenNeural', label: 'HsiaoChen', gender: 'female' }, { id: 'zh-TW-YunJheNeural', label: 'YunJhe', gender: 'male' }],
    claudePrompt: '請將以下文本翻譯成繁體中文。只返回翻譯內容。',
    geminiPrompt: '請將以下文本翻譯成繁體中文。只返回翻譯內容。',
    wordsPerMinute: 90, diacriticsRegex: /[\u4e00-\u9fff]/,
    trailingWords: /\s*[的了在是不有和就都]\s*$/,
    uiStrings: { activate: '中文配音', loading: '載入中...', active: '配音啟動 ✓', settings: '設定', translating: '翻譯中', noSubtitles: '字幕不可用' }
  },
  ar: {
    code: 'ar', name: 'العربية', flag: '🇸🇦', bcp47: 'ar-SA',
    translationCodes: { google: 'ar', deepl: 'AR', mymemory: 'ar', libre: 'ar' },
    voicePriority: [/google.*ar/i], voiceFallbackLangs: ['ar-SA', 'ar'],
    azureVoices: [{ id: 'ar-SA-ZariyahNeural', label: 'Zariyah', gender: 'female' }, { id: 'ar-SA-HamedNeural', label: 'Hamed', gender: 'male' }],
    claudePrompt: 'ترجم النص التالي إلى العربية. أعد الترجمة فقط.',
    geminiPrompt: 'ترجم النص التالي إلى العربية. أعد الترجمة فقط.',
    wordsPerMinute: 120, diacriticsRegex: /[\u0600-\u06ff]/,
    trailingWords: /\s+(و|أو|في|من|على|إلى|عن|مع|هذا|هذه|التي|الذي)\s*$/,
    uiStrings: { activate: 'الدبلجة العربية', loading: 'جاري التحميل...', active: 'الدبلجة نشطة ✓', settings: 'الإعدادات', translating: 'الترجمة', noSubtitles: 'الترجمة غير متوفرة' }
  },
  hi: {
    code: 'hi', name: 'हिन्दी', flag: '🇮🇳', bcp47: 'hi-IN',
    translationCodes: { google: 'hi', deepl: null, mymemory: 'hi', libre: 'hi' },
    voicePriority: [/google.*hi/i], voiceFallbackLangs: ['hi-IN', 'hi'],
    azureVoices: [{ id: 'hi-IN-SwaraNeural', label: 'Swara', gender: 'female' }, { id: 'hi-IN-MadhurNeural', label: 'Madhur', gender: 'male' }],
    claudePrompt: 'निम्नलिखित पाठ का हिंदी में अनुवाद करें। केवल अनुवाद लौटाएं।',
    geminiPrompt: 'निम्नलिखित पाठ का हिंदी में अनुवाद करें। केवल अनुवाद लौटाएं।',
    wordsPerMinute: 120, diacriticsRegex: /[\u0900-\u097f]/,
    trailingWords: /\s+(और|या|में|पर|से|को|के|का|की|है|नहीं|यह)\s*$/,
    uiStrings: { activate: 'हिन्दी डबिंग', loading: 'लोड हो रहा...', active: 'डबिंग सक्रिय ✓', settings: 'सेटिंग्स', translating: 'अनुवाद', noSubtitles: 'उपशीर्षक उपलब्ध नहीं' }
  },
  tr: {
    code: 'tr', name: 'Türkçe', flag: '🇹🇷', bcp47: 'tr-TR',
    translationCodes: { google: 'tr', deepl: 'TR', mymemory: 'tr', libre: 'tr' },
    voicePriority: [/google.*tr/i], voiceFallbackLangs: ['tr-TR', 'tr'],
    azureVoices: [{ id: 'tr-TR-EmelNeural', label: 'Emel', gender: 'female' }, { id: 'tr-TR-AhmetNeural', label: 'Ahmet', gender: 'male' }],
    claudePrompt: 'Aşağıdaki metni Türkçeye çevirin. SADECE çeviriyi döndürün.',
    geminiPrompt: 'Aşağıdaki metni Türkçeye çevirin. SADECE çeviriyi döndürün.',
    wordsPerMinute: 130, diacriticsRegex: /[çğıöşü]/i,
    trailingWords: /\s+(ve|veya|bir|bu|da|de|için|ile|gibi|olarak)\s*$/i,
    uiStrings: { activate: 'Türkçe dublaj', loading: 'Yükleniyor...', active: 'Dublaj aktif ✓', settings: 'Ayarlar', translating: 'Çeviri', noSubtitles: 'Altyazı mevcut değil' }
  },
  sv: {
    code: 'sv', name: 'Svenska', flag: '🇸🇪', bcp47: 'sv-SE',
    translationCodes: { google: 'sv', deepl: 'SV', mymemory: 'sv', libre: 'sv' },
    voicePriority: [/google.*sv/i], voiceFallbackLangs: ['sv-SE', 'sv'],
    azureVoices: [{ id: 'sv-SE-SofieNeural', label: 'Sofie', gender: 'female' }, { id: 'sv-SE-MattiasNeural', label: 'Mattias', gender: 'male' }],
    claudePrompt: 'Översätt följande text till svenska. Returnera BARA översättningen.',
    geminiPrompt: 'Översätt följande text till svenska. Returnera BARA översättningen.',
    wordsPerMinute: 135, diacriticsRegex: /[åäö]/i,
    trailingWords: /\s+(och|eller|i|på|med|till|från|för|av|den|det|en|ett)\s*$/i,
    uiStrings: { activate: 'Svensk dubbning', loading: 'Laddar...', active: 'Dubbning aktiv ✓', settings: 'Inställningar', translating: 'Översätter', noSubtitles: 'Undertexter ej tillgängliga' }
  },
  da: {
    code: 'da', name: 'Dansk', flag: '🇩🇰', bcp47: 'da-DK',
    translationCodes: { google: 'da', deepl: 'DA', mymemory: 'da', libre: 'da' },
    voicePriority: [/google.*da/i], voiceFallbackLangs: ['da-DK', 'da'],
    azureVoices: [{ id: 'da-DK-ChristelNeural', label: 'Christel', gender: 'female' }, { id: 'da-DK-JeppeNeural', label: 'Jeppe', gender: 'male' }],
    claudePrompt: 'Oversæt følgende tekst til dansk. Returnér KUN oversættelsen.',
    geminiPrompt: 'Oversæt følgende tekst til dansk. Returnér KUN oversættelsen.',
    wordsPerMinute: 135, diacriticsRegex: /[æøå]/i,
    trailingWords: /\s+(og|eller|i|på|med|til|fra|for|af|den|det|en|et)\s*$/i,
    uiStrings: { activate: 'Dansk dubbning', loading: 'Indlæser...', active: 'Dubbing aktiv ✓', settings: 'Indstillinger', translating: 'Oversætter', noSubtitles: 'Undertekster ikke tilgængelige' }
  },
  nb: {
    code: 'nb', name: 'Norsk', flag: '🇳🇴', bcp47: 'nb-NO',
    translationCodes: { google: 'no', deepl: 'NB', mymemory: 'no', libre: 'nb' },
    voicePriority: [/google.*nb/i, /google.*no/i], voiceFallbackLangs: ['nb-NO', 'no-NO', 'nb', 'no'],
    azureVoices: [{ id: 'nb-NO-PernilleNeural', label: 'Pernille', gender: 'female' }, { id: 'nb-NO-FinnNeural', label: 'Finn', gender: 'male' }],
    claudePrompt: 'Oversett følgende tekst til norsk. Returner KUN oversettelsen.',
    geminiPrompt: 'Oversett følgende tekst til norsk. Returner KUN oversettelsen.',
    wordsPerMinute: 135, diacriticsRegex: /[æøå]/i,
    trailingWords: /\s+(og|eller|i|på|med|til|fra|for|av|den|det|en|et)\s*$/i,
    uiStrings: { activate: 'Norsk dubbing', loading: 'Laster...', active: 'Dubbing aktiv ✓', settings: 'Innstillinger', translating: 'Oversetter', noSubtitles: 'Undertekster ikke tilgjengelig' }
  },
  fi: {
    code: 'fi', name: 'Suomi', flag: '🇫🇮', bcp47: 'fi-FI',
    translationCodes: { google: 'fi', deepl: 'FI', mymemory: 'fi', libre: 'fi' },
    voicePriority: [/google.*fi/i], voiceFallbackLangs: ['fi-FI', 'fi'],
    azureVoices: [{ id: 'fi-FI-NooraNeural', label: 'Noora', gender: 'female' }, { id: 'fi-FI-HarriNeural', label: 'Harri', gender: 'male' }],
    claudePrompt: 'Käännä seuraava teksti suomeksi. Palauta VAIN käännös.',
    geminiPrompt: 'Käännä seuraava teksti suomeksi. Palauta VAIN käännös.',
    wordsPerMinute: 125, diacriticsRegex: /[äö]/i,
    trailingWords: /\s+(ja|tai|on|ei|se|kun|niin|myös|mutta|että|joka|tämä)\s*$/i,
    uiStrings: { activate: 'Suomenkielinen dubbing', loading: 'Ladataan...', active: 'Dubbing aktiivinen ✓', settings: 'Asetukset', translating: 'Käännetään', noSubtitles: 'Tekstitykset eivät saatavilla' }
  },
  el: {
    code: 'el', name: 'Ελληνικά', flag: '🇬🇷', bcp47: 'el-GR',
    translationCodes: { google: 'el', deepl: 'EL', mymemory: 'el', libre: 'el' },
    voicePriority: [/google.*el/i], voiceFallbackLangs: ['el-GR', 'el'],
    azureVoices: [{ id: 'el-GR-AthinaNeural', label: 'Athina', gender: 'female' }, { id: 'el-GR-NestorasNeural', label: 'Nestoras', gender: 'male' }],
    claudePrompt: 'Μεταφράστε το ακόλουθο κείμενο στα ελληνικά. Επιστρέψτε ΜΟΝΟ τη μετάφραση.',
    geminiPrompt: 'Μεταφράστε το ακόλουθο κείμενο στα ελληνικά. Επιστρέψτε ΜΟΝΟ τη μετάφραση.',
    wordsPerMinute: 130, diacriticsRegex: /[\u0370-\u03ff\u1f00-\u1fff]/,
    trailingWords: /\s+(και|ή|σε|με|για|από|στο|στη|του|της|το|τα|οι|ένα)\s*$/i,
    uiStrings: { activate: 'Ελληνικό ντουμπλάζ', loading: 'Φόρτωση...', active: 'Μεταγλώττιση ενεργή ✓', settings: 'Ρυθμίσεις', translating: 'Μετάφραση', noSubtitles: 'Υπότιτλοι μη διαθέσιμοι' }
  },
  ro: {
    code: 'ro', name: 'Română', flag: '🇷🇴', bcp47: 'ro-RO',
    translationCodes: { google: 'ro', deepl: 'RO', mymemory: 'ro', libre: 'ro' },
    voicePriority: [/google.*ro/i], voiceFallbackLangs: ['ro-RO', 'ro'],
    azureVoices: [{ id: 'ro-RO-AlinaNeural', label: 'Alina', gender: 'female' }, { id: 'ro-RO-EmilNeural', label: 'Emil', gender: 'male' }],
    claudePrompt: 'Traduceți următorul text în română. Returnați DOAR traducerea.',
    geminiPrompt: 'Traduceți următorul text în română. Returnați DOAR traducerea.',
    wordsPerMinute: 135, diacriticsRegex: /[ăâîșț]/i,
    trailingWords: /\s+(și|sau|în|pe|cu|la|de|din|pentru|ca|nu|este|un|o)\s*$/i,
    uiStrings: { activate: 'Dublare română', loading: 'Se încarcă...', active: 'Dublare activă ✓', settings: 'Setări', translating: 'Traducere', noSubtitles: 'Subtitrări indisponibile' }
  },
  bg: {
    code: 'bg', name: 'Български', flag: '🇧🇬', bcp47: 'bg-BG',
    translationCodes: { google: 'bg', deepl: 'BG', mymemory: 'bg', libre: 'bg' },
    voicePriority: [/google.*bg/i], voiceFallbackLangs: ['bg-BG', 'bg'],
    azureVoices: [{ id: 'bg-BG-KalinaNeural', label: 'Калина', gender: 'female' }, { id: 'bg-BG-BorislavNeural', label: 'Борислав', gender: 'male' }],
    claudePrompt: 'Преведете следния текст на български. Върнете САМО превода.',
    geminiPrompt: 'Преведете следния текст на български. Върнете САМО превода.',
    wordsPerMinute: 130, diacriticsRegex: /[\u0400-\u04ff]/,
    trailingWords: /\s+(и|или|в|на|с|за|от|по|до|не|е|се|да)\s*$/i,
    uiStrings: { activate: 'Български дублаж', loading: 'Зареждане...', active: 'Дублаж активен ✓', settings: 'Настройки', translating: 'Превод', noSubtitles: 'Субтитрите не са налични' }
  },
  th: {
    code: 'th', name: 'ไทย', flag: '🇹🇭', bcp47: 'th-TH',
    translationCodes: { google: 'th', deepl: null, mymemory: 'th', libre: 'th' },
    voicePriority: [/google.*th/i], voiceFallbackLangs: ['th-TH', 'th'],
    azureVoices: [{ id: 'th-TH-PremwadeeNeural', label: 'Premwadee', gender: 'female' }, { id: 'th-TH-NiwatNeural', label: 'Niwat', gender: 'male' }],
    claudePrompt: 'แปลข้อความต่อไปนี้เป็นภาษาไทย ส่งคืนเฉพาะคำแปลเท่านั้น',
    geminiPrompt: 'แปลข้อความต่อไปนี้เป็นภาษาไทย ส่งคืนเฉพาะคำแปลเท่านั้น',
    wordsPerMinute: 100, diacriticsRegex: /[\u0e00-\u0e7f]/,
    trailingWords: /\s*(และ|หรือ|ที่|ใน|จาก|ของ|ไม่|เป็น|ได้|มี)\s*$/,
    uiStrings: { activate: 'พากย์ไทย', loading: 'กำลังโหลด...', active: 'พากย์เสียงใช้งาน ✓', settings: 'ตั้งค่า', translating: 'กำลังแปล', noSubtitles: 'ไม่มีคำบรรยาย' }
  },
  vi: {
    code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', bcp47: 'vi-VN',
    translationCodes: { google: 'vi', deepl: null, mymemory: 'vi', libre: 'vi' },
    voicePriority: [/google.*vi/i], voiceFallbackLangs: ['vi-VN', 'vi'],
    azureVoices: [{ id: 'vi-VN-HoaiMyNeural', label: 'HoaiMy', gender: 'female' }, { id: 'vi-VN-NamMinhNeural', label: 'NamMinh', gender: 'male' }],
    claudePrompt: 'Dịch đoạn văn bản sau sang tiếng Việt. Chỉ trả về bản dịch.',
    geminiPrompt: 'Dịch đoạn văn bản sau sang tiếng Việt. Chỉ trả về bản dịch.',
    wordsPerMinute: 120, diacriticsRegex: /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i,
    trailingWords: /\s+(và|hoặc|trong|của|cho|từ|với|là|không|được|có)\s*$/i,
    uiStrings: { activate: 'Lồng tiếng Việt', loading: 'Đang tải...', active: 'Lồng tiếng hoạt động ✓', settings: 'Cài đặt', translating: 'Đang dịch', noSubtitles: 'Không có phụ đề' }
  },
  id: {
    code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', bcp47: 'id-ID',
    translationCodes: { google: 'id', deepl: 'ID', mymemory: 'id', libre: 'id' },
    voicePriority: [/google.*id/i], voiceFallbackLangs: ['id-ID', 'id'],
    azureVoices: [{ id: 'id-ID-GadisNeural', label: 'Gadis', gender: 'female' }, { id: 'id-ID-ArdiNeural', label: 'Ardi', gender: 'male' }],
    claudePrompt: 'Terjemahkan teks berikut ke dalam Bahasa Indonesia. Kembalikan HANYA terjemahannya.',
    geminiPrompt: 'Terjemahkan teks berikut ke dalam Bahasa Indonesia. Kembalikan HANYA terjemahannya.',
    wordsPerMinute: 130, diacriticsRegex: /(?!)/,
    trailingWords: /\s+(dan|atau|di|ke|dari|untuk|dengan|yang|ini|itu|tidak|adalah)\s*$/i,
    uiStrings: { activate: 'Dubbing Indonesia', loading: 'Memuat...', active: 'Dubbing aktif ✓', settings: 'Pengaturan', translating: 'Menerjemahkan', noSubtitles: 'Subtitle tidak tersedia' }
  },
};

const DEFAULT_LANGUAGE = 'cs';

function getLanguageConfig(langCode) {
  return LANGUAGES[langCode] || LANGUAGES[DEFAULT_LANGUAGE];
}

window.LANGUAGES = LANGUAGES;
window.DEFAULT_LANGUAGE = DEFAULT_LANGUAGE;
window.getLanguageConfig = getLanguageConfig;
