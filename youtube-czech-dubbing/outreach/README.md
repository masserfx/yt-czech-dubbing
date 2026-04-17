# VoiceDub Outreach Pack

Cold-outreach materiál pro Q2 2026 pilotní kampaň (20 firem / měsíc, CEE e-learning / HR / compliance).

## Struktura

```
outreach/
├── README.md              ← tento soubor
├── targets.md             ← 20 cílových firem (Tier A–E) + ICP + KPI
├── email-template-cs.md   ← T1 cold email (česky) + 3 subject line varianty
├── email-template-en.md   ← T1 cold email (English) pro PL/HU/international
├── linkedin-messages.md   ← T2 connect request + DM + T3 personalized follow-up
├── email-followup.md      ← T3 hloubkový email (Den 8) s case study link
└── outreach-log.csv       ← tracking sheet (date, company, touch, reply, meeting, …)
```

## 3-touch sekvence — rychlý overview

| # | Den | Kanál | Soubor | Cíl |
|---|-----|-------|--------|-----|
| T1 | 0 | Email | `email-template-{cs,en}.md` | Pitch + nabídka demo zdarma |
| T2 | 3 | LinkedIn connect + DM | `linkedin-messages.md` | Sociální potvrzení + demo link |
| T3 | 8 | Email | `email-followup.md` | Case study + konkrétní call ask |

Pokud po T3 žádná reakce → archiv, retarget za 90 dní s novou case study.

## Týdenní kadence (1 person)

- **Po / Út:** research 10–15 kontaktů pro daný týden (LinkedIn Sales Nav lookup → vyplnit prázdná políčka v `outreach-log.csv`)
- **Út 10:00 CET:** batch send T1 (20 emailů)
- **Pá:** batch T2 (LinkedIn connects — max 15/den kvůli rate limitu)
- **Středa následující týden:** batch T3 (follow-up na non-responders)

## Nástroje (free tier stačí na MVP)

| Potřeba | Nástroj | Cena |
|---------|---------|------|
| Email send + tracking (open/click) | **Mailtrack** (Gmail plugin) | Free 100 emails/den |
| Warm-up domény | **lemwarm** nebo **warmupinbox** | Free 30 dní, pak $29/měs |
| LinkedIn research | **Sales Navigator** (pokud budget) nebo **RocketReach** | $79/měs / $49/měs |
| CRM | **HubSpot Free** | Free do 1M kontaktů |
| Scheduling | **cal.com** | Free forever |
| SPF/DKIM setup | Cloudflare DNS (už máme doménu) | Free |

**Minimální setup:** Gmail custom domain (voicedub.ai) + Mailtrack + cal.com + Google Sheets.
**Total cost:** ~€7/měs (Google Workspace Business Starter).

## Key metrics (90denní target)

| KPI | Target | Skutečnost |
|-----|--------|------------|
| Outreach odesláno (T1) | 80 | — |
| Open rate | > 45 % | — |
| Reply rate (T1–T3 combined) | > 15 % | — |
| Meetings booked | > 10 | — |
| Pilot signed | ≥ 3 | — |
| Paid POC | ≥ 5 | — |

## Playbook "první pilot"

1. **První odpověď "zajímá mě":** odpověď do 2 hodin, nabídni 3 časy během 48 hodin
2. **Discovery call (15 min):** NE pitch slides, ALE otázky: "Který kurz by byl nejpalčivější?" "Co blokovalo dosud?" "Kdo rozhoduje o budgetu?"
3. **POC offer (free, 1 kurz):** zaslat dub ve 4 jazycích do 48 hodin
4. **Review call (30 min):** poslechnout výstup s L&D týmem, ladit glossary
5. **Pilot pricing:** 3-měsíční flat fee 1 200 EUR / 50 minut / měsíc + SLA 48h delivery
6. **Contract (jednoduchý, 2 stránky):** cena, SLA, data processing (GDPR DPA), EU AI Act disclosure commitment
7. **Měsíční NPS + expand:** po 30 dnech review, target → roční kontrakt 15 000 EUR

## Právní poznámky

- **GDPR:** B2B cold email = legitimate interest (čl. 6(1)(f)) pokud na pracovní mail + relevant produkt + easy opt-out
- **EU AI Act čl. 50:** platí od srpna 2026 — každý AI-generated audio/video musí mít disclosure (my to řešíme technicky: ID3 tag `VoiceDub-Generated: true`)
- **DPA (Data Processing Agreement):** připravit standardní template pro každý pilot (VoiceDub = processor, zákazník = controller)

## Kontakt pro interní dotazy

Prodejní lead: **{{your-name}}** <sales@voicedub.ai>
