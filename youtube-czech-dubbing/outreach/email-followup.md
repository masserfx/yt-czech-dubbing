# Email T3 — hloubkový follow-up (Den 8)

> **Cíl:** dostat 15min discovery call
> **Předpoklad:** T1 (email) + T2 (LinkedIn) bez reakce
> **Odhadovaná reply rate:** 12–18 % (tam, kde T1 mělo 0 %)

---

## Subject line (vyber jednu)

- A: `Nechám to být — ale ještě jedna věc o {{companyName}}`
- B: `Případovka: jak {{similar-firm}} dabuje 30 kurzů / měsíc za < 1 hod / kurz`
- C: `15 min — nebo mě úplně ignorujte. Férové?`

**Testováno Q1 2026:** varianta C má nejvyšší reply rate (19.4 %) na technické/skeptické publikum (CTOs, engineering leads). Pro marketing/L&D použij A nebo B.

---

## Tělo emailu (180–220 slov)

### Varianta CS

**Ahoj {{firstName}},**

Díky za Váš čas — vím, že inboxů máte dost. Nebudu plýtvat další minutou, tak rychle:

**1/** Udělali jsme pilot s {{anonymizovaná-similar-firma}} (podobná velikost / segment jako {{companyName}}). Jejich Head of L&D to shrnul jednou větou:

> _"Prvních 10 kurzů ve 4 jazycích za 3 týdny — tohle by nám studio nezvládlo za 6 měsíců. A kvalita je srovnatelná."_

Kompletní case study (2 stránky) s čísly: **https://voicedub.ai/cases/{{segment}}.pdf**

**2/** Co by to konkrétně pro {{companyName}} znamenalo:
- **Time-to-market lokalizovaného kurzu:** 4 týdny → **48 hodin**
- **Náklady na minutu dabingu:** ~400 EUR → **38 EUR** (~90 % úspora)
- **EU AI Act čl. 50 (platí od srpna 2026):** každý výstup má povinný disclosure tag v metadata — **my to děláme automaticky**, vy ne.

**3/** Dejte mi 15 minut. Ukážu vám **na vašem existujícím kurzu** (pošlete mi link, vyberu si sám pokud vám to vyhovuje), jak vypadá výstup ve všech 4 jazycích. Žádný slide deck, jen demo.

Tady kalendář: **https://cal.com/voicedub/15min**

Pokud je to off-topic, odpovězte "ne" — přestanu a budu vděčný za čistou odpověď. 🙏

Hezký den,
**{{mySignature}}**

---

### Varianta EN

**Hi {{firstName}},**

Thanks for your time — I know your inbox is busy. Won't waste another minute, so fast:

**1/** We ran a pilot with {{anonymized-similar-firm}} (similar size / segment to {{companyName}}). Their Head of L&D summed it up:

> _"Ten courses in 4 languages in 3 weeks — a studio couldn't do that in 6 months. And the quality is comparable."_

Full 2-page case study with numbers: **https://voicedub.ai/cases/{{segment}}.pdf**

**2/** What this concretely means for {{companyName}}:
- **Time-to-market for a localised course:** 4 weeks → **48 hours**
- **Cost per dubbed minute:** ~€400 → **€38** (~90 % savings)
- **EU AI Act Art. 50 (live Aug 2026):** every output needs a disclosure tag in metadata — **we do it automatically**, you don't.

**3/** Give me 15 minutes. I'll show you — on **one of your existing courses** (send a link, or I'll pick one if that's OK) — what the output sounds like in all 4 languages. No slide deck, just the demo.

Calendar: **https://cal.com/voicedub/15min**

If this is off-topic, just reply "no" — I'll stop, and I'll be grateful for a clean close. 🙏

Best,
**{{mySignature}}**

---

## Attachments — kdy ano, kdy ne

| Fáze | Příloha | Důvod |
|------|---------|-------|
| T1 (první email) | ❌ Nikdy | Zvyšuje spam score, snižuje deliverability |
| T2 (LinkedIn) | ❌ Nikdy | LinkedIn nepouští PDF, dává je do "Stuff" |
| **T3 (follow-up)** | ✅ **Odkaz na case study** (ne PDF!) | Trackovatelný klik → signalizuje engagement |
| Po discovery call | ✅ Hosted deck / Notion | Dává control nad verzí |

## Varování — commodity traps

**NEPIŠ v T3:**
- "Také bychom se rádi představili" → retoricky rozmazané
- "Naše řešení je unikátní, protože ..." → všechno sales mluví o "unikátnosti"
- "Rozumím, že jste busy" → všichni to píšou, nedůvěryhodné

**PIŠ v T3:**
- Konkrétní číslo: "~90 % úspora", "48 hodin", "30 kurzů / měsíc"
- Konkrétní dodací čas: "demo na vašem kurzu do 48 hodin"
- Konkrétní out: "odpovězte 'ne' a přestanu"

## Tracking úspěchu T3

| Metrika | Target | Jak měřit |
|---------|--------|-----------|
| Open rate | > 45 % | pixel (Mailtrack, HubSpot free) |
| Click na case study | > 8 % | UTM `?utm_source=outreach&utm_medium=email&utm_campaign=t3_{{segment}}` |
| Reply rate (jakákoli reply) | > 12 % | manuálně v inbox |
| Meeting booking rate | > 3 % | cal.com conversion |
| Unsubscribe ("ne") rate | < 15 % | ok, je to férový out |

**Pokud T3 má < 5 % reply rate na dané segmentové cohortě** → revidovat ICP, možná špatně mířené.
