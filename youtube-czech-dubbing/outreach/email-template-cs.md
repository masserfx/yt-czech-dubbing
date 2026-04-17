# Email T1 — český kalibrovaný pitch

> **Pro koho:** Head of Content / L&D Director / Product Manager
> **Kdy:** úterý–čtvrtek 9:30–11:00 CET
> **Subject line (A/B test — vyber podle ICP):**
> - A: `{{firstName}}, dabing vašich kurzů v 4 CEE jazycích za < 1 hod`
> - B: `{{companyName}} + VoiceDub = 10× levnější lokalizace`
> - C: `Otázka k lokalizaci kurzu "{{kurzName}}"` (hyper-personalized; best reply rate)

---

## Tělo emailu (160–200 slov, ne víc)

**Ahoj {{firstName}},**

Viděl jsem u vás na webu {{kurzName}} — skvěle udělané. Všiml jsem si, že máte verze v češtině, ale ne v SK / PL / HU. Zkoušíte to lokalizovat nebo je to parkovaný projekt kvůli ceně dabingu?

Poslední rok jsem postavil **VoiceDub** — AI dubbing API, který váš existující kurz přeloží a nadabuje do čtyř CEE jazyků za **méně než hodinu** a **deseti­tinu ceny** oproti studiu. Používáme Azure Neural TTS (enterprise SLA 99.9 %) + glossary na technické termíny, takže to zní přirozeně, ne roboticky.

**Konkrétně pro {{companyName}}:** Pokud máte 50 kurzů × 20 minut, klasický dabing 4 jazyků = cca **160 000 EUR a 4 měsíce**. U nás **< 12 000 EUR a do 2 týdnů**.

Zkusíme to na jednom kurzu **zdarma** jako důkaz? Nasdílím vám hotový výstup ve všech 4 jazycích do 48 hodin od vašeho souhlasu — ať vidíte kvalitu, ne slajdy.

Stačí "Jo, zkus to" a mail mi pošlete 30s zdroj.

Hezký den,
**{{mySignature}}**
VoiceDub — [voicedub.ai](https://voicedub.ai) · [demo 30s](https://voicedub.ai/demo)

---

## Personalizace — co vyplnit (povinně)

| Token | Kde najít | Příklad |
|-------|-----------|---------|
| `{{firstName}}` | LinkedIn profil | "Petře" |
| `{{companyName}}` | web | "Seduo" |
| `{{kurzName}}` | jejich katalog — **musí být reálné jméno kurzu** | "GDPR pro zaměstnance 2026" |
| `{{mySignature}}` | tvé jméno + role + tel | "Leoš Hradek, CEO · +420 ..." |

## Co ABSOLUTNĚ NEDĚLAT

- ❌ `Vážený pane X,` — příliš formální, zní jako sales template z roku 2010
- ❌ prázdný placeholder `{{kurzName}}` — totální turn-off, okamžitě smazat
- ❌ appendovat case-study PDF v prvním emailu — zvýší spam score a sníží reply rate o 30 %
- ❌ všechny 3 A/B subjects v jedné dávce — vybrat **jeden** na segment (Tier A → A, Tier B → B, Tier D → C)
- ❌ posílat z gmailu bez SPF/DKIM — pošli z `@voicedub.ai` s custom domain auth

## Follow-up ve stejném vlákně (pokud bez odpovědi do 5 dnů)

**Subject:** `Re: {{original subject}}`

> Ahoj {{firstName}},
>
> Ještě malá připomínka — nabídka hotového dema zdarma platí. Jestli je to pro vás irelevantní, stačí jedno "ne" a přestanu otravovat. Díky.
>
> {{mySignature}}

**Nekratší možný follow-up (18 slov) má reply rate > 25 %, protože nevytváří kognitivní zátěž.**

## Compliance poznámka

- GDPR: B2B cold email je legitimate interest (čl. 6 písm. f GDPR) **pokud** nabízíš relevantní B2B produkt a posíláš na **pracovní email** (ne gmail).
- Unsubscribe link není povinný, ale ❝`Pokud to je pro vás off-topic, stačí "ne" a přestanu.`❞ je dostatečný opt-out.
- EU AI Act čl. 50: Ve výstupu VoiceDub je povinná disclosure tag (ID3 `VoiceDub-Generated: true`) — zmínit v T3.
