# YouTube Czech Dubbing - Instalace a Použití

## Co to dělá?
Rozšíření pro Chrome, které automaticky překládá a dabuje YouTube videa do češtiny.
- Extrahuje titulky z YouTube videa (automatické i manuální)
- Překládá je do češtiny pomocí bezplatných překladových API
- Čte přeložený text českým hlasem (Web Speech API)
- Synchronizuje dabing s přehráváním videa
- Zobrazuje české titulky přímo na videu

## Instalace (Chrome)

1. **Otevřete Chrome** a přejděte na `chrome://extensions/`
2. **Zapněte "Režim pro vývojáře"** (přepínač vpravo nahoře)
3. **Klikněte na "Načíst rozbalené rozšíření"**
4. **Vyberte složku** `youtube-czech-dubbing` z tohoto repozitáře
5. Rozšíření se objeví v seznamu a ikona 🇨🇿 se zobrazí v panelu nástrojů

## Použití

1. **Otevřete jakékoli YouTube video**
2. **Klikněte na tlačítko "Český dabing"** pod videem (nad názvem)
   - Nebo klikněte na ikonu rozšíření v panelu nástrojů Chrome
3. **Počkejte na překlad** - rozšíření stáhne titulky a přeloží je
4. **Dabing se automaticky spustí** a synchronizuje s videem

## Nastavení (v popup okně)

| Nastavení | Popis |
|-----------|-------|
| Hlasitost dabingu | Hlasitost českého hlasu (0-100%) |
| Rychlost řeči | Jak rychle mluví český hlas (0.5x-2x) |
| Výška hlasu | Výška českého hlasu |
| Hlasitost originálu | Hlasitost původního zvuku během dabingu |
| Ztlumit originál | Úplně ztlumit původní zvuk |
| Hlas | Výběr z dostupných českých hlasů |

## Požadavky

- **Google Chrome** (verze 88+) nebo **Chromium** / **Edge** / **Brave**
- **Internetové připojení** (pro překlad)
- **České hlasy** - Chrome na Windows/macOS obvykle obsahuje české hlasy.
  Na Linuxu můžete potřebovat nainstalovat balíček `speech-dispatcher-espeak-ng`

## Jak to funguje

1. **Extrakce titulků**: Čte titulky z YouTube API (automatické nebo manuální)
2. **Překlad**: Používá bezplatné překladové API (MyMemory, LibreTranslate, Google Translate)
3. **Text-to-Speech**: Využívá Web Speech API zabudované v prohlížeči
4. **Synchronizace**: Sleduje čas videa a spouští dabing ve správný moment

## Omezení

- Kvalita dabingu závisí na dostupných TTS hlasech v prohlížeči
- Překlad nemusí být vždy perfektní (automatický strojový překlad)
- Videa bez jakýchkoli titulků nelze dabovat
- Bezplatné překladové API mají denní limity (~5000 znaků/den pro MyMemory)
- TTS hlas zní synteticky (není to lidský dabing)

## Řešení problémů

**"Titulky nejsou k dispozici"**
- Video nemá žádné titulky ani automaticky generované titulky

**Neslyším český hlas**
- Zkontrolujte, zda máte nainstalované české hlasy: `chrome://settings/languages`
- Na Linuxu: `sudo apt install speech-dispatcher-espeak-ng`

**Překlad nefunguje**
- Zkontrolujte internetové připojení
- Denní limit překladů mohl být vyčerpán, zkuste to zítra

## Licence

Zdarma a open source. Vytvořeno pro osobní použití.
