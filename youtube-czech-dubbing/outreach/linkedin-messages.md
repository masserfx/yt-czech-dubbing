# LinkedIn 3-touch sekvence

> **Pravidlo č. 1:** LinkedIn není email. Max **300 znaků** v connect noteu, max **500** v prvním messaging DM.
> **Pravidlo č. 2:** Nikdy neposílej link v connect note (zvyšuje reject rate o 40 %). První link až v 2. zprávě.
> **Pravidlo č. 3:** Nepoužívej Sales Navigator InMail na Tier A/B — vypadá jako spam. Standardní connect + note konvertuje 2× lépe.

---

## Touch 2 — Connect request (Den 3 po emailu T1)

### Varianta CS (Tier A, C)

> Ahoj {{firstName}}, posílal jsem mail ohledně dabingu kurzů do SK/PL/HU. Kdybyste měli chvilku — rád vám 30s demo ukážu přímo. Díky!

**Character count:** ~180 / 300

### Varianta EN (Tier B, D)

> Hi {{firstName}}, emailed about dubbing your courses into 4 CEE languages. Happy to show a 30-sec demo if you have a minute. Cheers!

**Character count:** ~150 / 300

---

## Touch 2.5 — Po akceptaci connect requestu (pošli DO 24 hodin)

### CS

> Díky za spojení, {{firstName}}! 🙌
>
> Aby to nebyl další sales pitch — tady je přímá ukázka na jednom z vašich existujících kurzů (udělal jsem to rychle jako proof-of-concept, 30 sekund ČJ → SK + PL + HU):
>
> 👉 **https://voicedub.ai/demo/{{companyName-slug}}**
>
> Pokud zvuk nesedí nebo máte k terminologii výhrady, řekněte — glossary ladíme s vámi. Kdybyste chtěli probrat pilot, můj kalendář je tady: https://cal.com/voicedub/15min
>
> A pokud to je off-topic, stačí krátké "ne" a přestanu. 🙏

### EN

> Thanks for connecting, {{firstName}}! 🙌
>
> Not another pitch — here's a 30-second proof-of-concept I ran on one of your existing courses (CZ source → SK + PL + HU dub):
>
> 👉 **https://voicedub.ai/demo/{{companyName-slug}}**
>
> If the voice or terminology is off, tell me — we tune the glossary with you. If you want to discuss a pilot, grab 15 min here: https://cal.com/voicedub/15min
>
> And if this is off-topic, just reply "no" and I'll stop. 🙏

**Proč tenhle formát funguje:**
1. **První link** až v 2. zprávě → algoritmus LinkedIn ho netagne jako promo
2. **Konkrétní demo na jejich kurzu** (audit funnel) → ne generic landing page → nepřekonatelný hook
3. **"Pokud to je off-topic, řekni ne"** → dává out, což paradoxně zvyšuje odpovědi o 30 % (loss aversion)
4. **Emoji sparingly** (2 × max) → nepůsobí desperátně, ale přidává "human touch"

---

## Touch 3 — Pokud stále žádná odpověď (Den 8, email)

**Subject:** `Rychlá otázka — vidím, že {{companyName}} řeší {{nedávný trend}}`

> Ahoj {{firstName}},
>
> Koukám, že jste {{konkrétní fakt — new hire, acquisition, článek na HN/blog, recent funding, nový trh}}. Gratulace!
>
> To ještě víc potvrzuje, že VoiceDub může dávat smysl — {{propojení mezi jejich krokem a naším hodnotovým návrhem}}.
>
> Pokud chcete 15 minut popovídat, tady kalendář: cal.com/voicedub/15min. Pokud ne, úplně chápu — tahle zpráva je poslední. Díky za čas.
>
> {{mySignature}}

### Konkrétní příklady "konkrétní fakt" tokenů

| Typ signálu | Kde najít | Příklad použití |
|-------------|-----------|-----------------|
| Funding announce | Crunchbase / LinkedIn News | "Blahopřeju k Series A od XYZ Ventures — ta růstová fáze přesně volá po multi-language contentu." |
| New hire (VP L&D) | LinkedIn company updates | "Vidím, že jste najali Annu Novákovou na VP L&D — její příchod z {{ex-firma}} je perfektní timing pro modernizaci dabingu." |
| New market expansion | press release / web banner | "Zaregistroval jsem expansion do Polska — pokud potřebujete PL dabing pro onboarding nových kolegů, do 48 hodin to máte." |
| Product launch | product blog | "Launch vašeho nového kurzu {{course}} mě zaujal — mám předchystanou SK + PL verzi jako demo, pošlu?" |

**Tohle personalizované follow-up má 35 %+ reply rate** (oproti 6 % u generic bump emailu).

---

## Co NEDĚLAT v LinkedIn outreach

| Chyba | Proč špatně | Místo toho |
|-------|-------------|-----------|
| "Rád bych si s vámi propojil, abych vám mohl představit VoiceDub" | Transakční, spam | "Posílal jsem vám mail o dabingu — tohle je follow-up" |
| Generic "Hi, saw you're at {{company}}" | Všichni to vidí, rejct | Reference **specifický kurz** nebo **blog post** od nich |
| Link v connect note | Algorithmic spam filter | Link až v DM po connect accept |
| Follow-up < 48h po connect | "Stalker" vibes | Min. 5–7 dní mezi touches |
| Voice message > 30s | Nikdo neposlechne | Text zpráva, voice jen na explicit žádost |

## Rate limits LinkedIn 2026

- **Free account:** 100 connection requests / týden (od 2024, Microsoft enforcement)
- **Premium / Sales Nav:** 200 / týden (nominálně, reálně ~150)
- **Auto-tooling (Dripify, Expandi)** = **trvalý ban risk** — nepoužívat pro VoiceDub, jsme B2B s reputací

**Doporučená kadence:** 15 connect requests / pracovní den → 75 / týden → 300 / měsíc.
Z toho reálné meetings: **5–10 / měsíc** (konverze 1,5–3 %).
