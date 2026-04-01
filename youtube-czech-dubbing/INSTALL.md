# YouTube Czech Dubbing - Instalace a Použití

## Co to dělá?
Rozšíření pro Chrome, které automaticky překládá a dabuje YouTube videa do češtiny.
- Extrahuje titulky z YouTube videa (automatické i manuální)
- Překládá je do češtiny pomocí bezplatných překladových API
- Čte přeložený text českým hlasem (Web Speech API)
- Synchronizuje dabing s přehráváním videa
- Zobrazuje české titulky přímo na videu

## Stažení

1. Přejděte na [Releases](https://github.com/masserfx/yt-czech-dubbing/releases/latest)
2. Stáhněte soubor `youtube-czech-dubbing-v*.zip` (v sekci Assets)
3. Rozbalte do libovolné složky

## Instalace (3 kroky)

### macOS i Windows — postup je stejný

1. **Otevřete Chrome** a do adresního řádku zadejte:
   ```
   chrome://extensions/
   ```

2. **Zapněte "Režim pro vývojáře"** — přepínač vpravo nahoře na stránce

3. **Klikněte na "Načíst rozbalené rozšíření"** (Load unpacked)
   - Vyberte rozbalenou složku `youtube-czech-dubbing` (tu, která obsahuje soubor `manifest.json`)
   - Rozšíření se objeví v seznamu a ikona se zobrazí v panelu nástrojů Chrome

> **Tip:** Funguje i v prohlížečích **Edge**, **Brave** a **Chromium** — postup je stejný.

## Použití

1. **Otevřete jakékoli YouTube video** s titulky
2. **Klikněte na tlačítko "Český dabing"** pod videem
   - Nebo klikněte na ikonu rozšíření v panelu nástrojů Chrome
3. **Počkejte na překlad** — rozšíření stáhne titulky a přeloží je
4. **Dabing se automaticky spustí** a synchronizuje s videem

## Nastavení (v popup okně)

Klikněte na ikonu rozšíření v panelu nástrojů a upravte:

| Nastavení | Popis |
|-----------|-------|
| Hlasitost dabingu | Hlasitost českého hlasu (0–100%) |
| Rychlost řeči | Jak rychle mluví český hlas (0.5x–2x) |
| Výška hlasu | Výška českého hlasu |
| Hlasitost originálu | Hlasitost původního zvuku během dabingu |
| Ztlumit originál | Úplně ztlumit původní zvuk |
| Hlas | Výběr z dostupných českých hlasů |

## České hlasy na různých platformách

### macOS
Chrome na macOS automaticky nabízí české hlasy (Zuzana, Zuzana Premium). Není potřeba nic instalovat.

### Windows
Chrome na Windows obsahuje české hlasy přes Microsoft Speech API. Pokud český hlas chybí:
1. Otevřete **Nastavení** → **Čas a jazyk** → **Jazyk a oblast**
2. Přidejte **Čeština** jako jazyk
3. Klikněte na čeština → **Možnosti** → stáhněte **Hlasový balíček**
4. Restartujte Chrome

### Linux
```bash
sudo apt install speech-dispatcher-espeak-ng
```

## Požadavky

- **Google Chrome** (verze 88+) nebo **Edge** / **Brave** / **Chromium**
- **Internetové připojení** (pro překlad)

## Řešení problémů

**"Titulky nejsou k dispozici"**
- Video nemá žádné titulky ani automaticky generované titulky

**Neslyším český hlas**
- Zkontrolujte, zda máte nainstalované české hlasy (viz sekce výše)
- V nastavení rozšíření zkuste změnit hlas

**Překlad nefunguje**
- Zkontrolujte internetové připojení
- Denní limit překladů mohl být vyčerpán, zkuste to zítra

**Rozšíření zmizelo po restartu Chrome**
- Při sideloadingu (Režim pro vývojáře) Chrome rozšíření zachová, ale může zobrazit varování — to je normální, stačí ho zavřít

## Sdílení s ostatními

1. Spusťte build skript:
   ```bash
   ./build.sh
   ```
2. Vznikne soubor `youtube-czech-dubbing-v*.zip`
3. Pošlete .zip soubor příjemci
4. Příjemce ho rozbalí a nainstaluje podle návodu výše

## Licence

Zdarma a open source. Vytvořeno pro osobní použití.
