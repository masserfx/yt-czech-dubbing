const BASE = 'http://localhost:3847';

async function post(path, data) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function seed() {
  // === Nové komunikace: kickoff s aktualizovanými 2026 daty ===
  await post('/api/messages', {
    from_agent: 'Strateg',
    to_agent: 'Team',
    content: 'Tým, máme plnou moc od CEO. Cíl této session: vytvořit realistický funkční model pro VoiceDub AI včetně prezentace. Využíváme aktualizovaná tržní data z dubna 2026. Kritik měl pravdu v 1. kole — nyní pracujeme s realistickými čísly.',
    type: 'announcement'
  });

  await post('/api/messages', {
    from_agent: 'Analytik',
    to_agent: 'Team',
    content: 'Update tržních dat (Q2 2026): Globální AI Dubbing Software Market = $1.16B (2026), projekce $3.66B (2035), CAGR 14.2 %. eLearning segment roste 59 % YoY v enterprise AI dubbingu. CEE podíl odhaduji na 3-4 % globálního trhu = $35-45M addressable. Realistický SAM pro CZ/SK/PL/HU: $8-12M.',
    type: 'data'
  });

  await post('/api/messages', {
    from_agent: 'Analytik',
    to_agent: 'Team',
    content: 'Konkurence (duben 2026): HeyGen $24-180/měs, Synthesia od $22/měs, Rask.ai $60 (25 min) / $150 (100 min) / $750 (500 min), ElevenLabs podporuje CZ/SK/PL/HU v 29 jazycích, per-minute pricing. Mezera na trhu: CEE-native kvalita + enterprise API s českou jurisdikcí (GDPR/AI Act).',
    type: 'data'
  });

  await post('/api/messages', {
    from_agent: 'Produktak',
    to_agent: 'Team',
    content: 'Stack 2026 ověřen: Gemini 2.5 Flash Image = 500 req/den FREE bez karty (ideální pro demo ilustrace). Veo 3.1 Lite přes AI Studio = ~10 videí/den FREE, cinematic control (pan/tilt/lighting). Nano Banana 2 (3.1 Flash Image) je placené ($0.045/img 1K), ale Flash 2.5 Image pokryje 95 % potřeb zdarma.',
    type: 'data'
  });

  await post('/api/messages', {
    from_agent: 'Obchodnik',
    to_agent: 'Team',
    content: 'Revidovaný pricing po analýze konkurence: Starter €79 (200 min), Business €249 (1000 min), Enterprise od €999 (5000+ min). Proti Rask Business (€750 za 500 min) nabízíme 2× více minut za 1/3 ceny + nativní CEE hlasy + GDPR/AI Act compliance v EU. USP: "AI dubbing od CEE týmu, pro CEE trh".',
    type: 'data'
  });

  await post('/api/messages', {
    from_agent: 'Kritik',
    to_agent: 'Team',
    content: 'Souhlasím s úpravami. Ještě zdůrazňuji: AI Act (platnost srpen 2026) vyžaduje transparentní označení AI generovaného obsahu. To je naše výhoda proti US hráčům — compliance-by-default. Marketingový úhel: "Compliant AI dubbing for EU" má kupní potenciál u korporátů s EU regulatory team.',
    type: 'challenge'
  });

  await post('/api/messages', {
    from_agent: 'Marketar',
    to_agent: 'Team',
    content: 'Pitch deck + cinematic demo v pipeline. Použiju Apple-style scroll storytelling: (1) Hero s živým překladem, (2) Problem (corporate pain), (3) Solution stack, (4) Market, (5) Business model s interaktivní kalkulačkou, (6) Roadmap, (7) Tým, (8) Ask. Animace přes GSAP ScrollTrigger + Lenis smooth-scroll. Keyframes přes Gemini 2.5 Flash Image (free).',
    type: 'update'
  });

  // === Reporty: aktualizovaná tržní analýza 2026 ===
  await post('/api/reports', {
    title: 'Tržní analýza Q2 2026 — aktualizace',
    section: 'Analyza',
    agent: 'Analytik',
    content: `# Tržní analýza — update duben 2026

## Globální čísla (ověřeno)
| Metrika | Hodnota 2026 | Projekce 2035 | CAGR |
|---------|-------------|---------------|------|
| AI Dubbing Software Market | $1.16 B | $3.66 B | 14.2 % |
| AI Dubbing Tools Market | $1.17 B | $1.74 B | 14.2 % |
| Global Dubbing & Voice-Over | $4.94 B | $11.18 B | 8.5 % |

**Klíčový trend**: eLearning & corporate training **59 % YoY růst** v enterprise AI dubbingu (zdroj: RWS, duben 2026).

## CEE fokus
- Populace CZ/SK/PL/HU: 68M
- Podíl CEE na EU AI Video Generator Market: ~5 %
- **Addressable market (AI dubbing CEE)**: €30-40M
- **SAM (CZ/SK/PL/HU, enterprise-ready segment)**: €8-12M
- **SOM Year 1 (realistic)**: €120-180k MRR (€1.4-2.2M ARR)
- **SOM Year 3**: €600-900k MRR (€7-11M ARR)

## Konkurenční mapa 2026
| Hráč | Cena/min | CEE kvalita | EU compliance | API | Focus |
|------|----------|-------------|---------------|-----|-------|
| HeyGen | ~$0.40 | ⚠ omezeno | US-based | ✓ | Avatars + marketing |
| Synthesia | ~$0.35 | ⚠ omezeno | UK-based | ✓ | Corporate training |
| Rask.ai | ~$0.20 | ✓ základní | UA-based | ✓ | Creators & SMB |
| ElevenLabs Dubbing | ~$0.30 | ✓ 29 jazyků | US-based | ✓ | Audio-first |
| **VoiceDub AI** | **€0.25** | **✓✓ nativní** | **✓ CZ s.r.o.** | **✓ plán Q3** | **CEE enterprise + e-learning** |

## Mezera na trhu
1. **CEE-native kvalita** — Synthesia/HeyGen nemají nativní CS/SK/PL/HU hlasy na úrovni Azure Neural TTS
2. **EU AI Act compliance-by-default** — místní jurisdikce, DPA v CZ, watermarking output
3. **Price/value pro CEE rozpočty** — €249/měs za 1000 min (Rask Business €750 za 500 min = 6× horší value)

## Kvalifikované leady (pipeline pro pilot)
- E-learning (CZ): Seduo.cz, EduTree, Online Jazyky
- Corporate SSC (Brno/Praha): IBM, Red Hat, Tieto, SAP
- Training providers (SK/PL): SkillShare partneři

## Rizika
- ElevenLabs přidá premium CEE hlasy (est. Q3 2026) — musíme být první
- Gemini pricing changes (Pro tier placené od 1.4.2026) — zvýšení nákladů o 10-15 %
- AI Act implementace vyžaduje prompt disclosure — náklady na UI warning flow`
  });

  await post('/api/reports', {
    title: 'Finanční model 2026-2028',
    section: 'Financie',
    agent: 'Strateg',
    content: `# Finanční model VoiceDub AI

## Unit economics (per month per zákazník)

### Starter (€79/mes, 200 min)
- Revenue: €79
- COGS: translation €0.60, TTS €3.20, infra €1.50 = **€5.30**
- Gross margin: **€73.70 (93 %)**

### Business (€249/mes, 1000 min)
- Revenue: €249
- COGS: translation €3.00, TTS €16.00, infra €4.00 = **€23.00**
- Gross margin: **€226 (91 %)**

### Enterprise (€999+, 5000+ min)
- Revenue: €999 (avg €1 400 s overage)
- COGS: translation €15, TTS €80, infra €20, support €50 = **€165**
- Gross margin: **€1 235 (88 %)**

## 24-month forecast (base case)
| Měsíc | Starter | Business | Enterprise | MRR | Burn | Net |
|-------|---------|----------|------------|-----|------|-----|
| M3 | 5 | 2 | 0 | €893 | €8 000 | -€7 107 |
| M6 | 18 | 8 | 1 | €4 421 | €10 000 | -€5 579 |
| M9 | 35 | 16 | 2 | €8 783 | €12 000 | -€3 217 |
| M12 | 60 | 28 | 4 | €15 708 | €14 000 | **+€1 708** |
| M18 | 120 | 55 | 9 | €31 206 | €18 000 | +€13 206 |
| M24 | 200 | 95 | 18 | €57 537 | €22 000 | +€35 537 |

**Break-even: měsíc 12** při 60/28/4 skladbě zákazníků.

## CAC / LTV
- **CAC** (blended): €180 (LinkedIn outreach €120 + demos €60)
- **LTV** (Business, 24-mes churn 3 %/mes): €249 × 0.91 × 30 = **€6 800**
- **LTV/CAC**: 37× (velmi zdravé)
- **Payback period**: 0.8 měsíce

## Ask (seed round)
- Částka: **€150 000**
- Runway: 18 měsíců do break-even + buffer
- Použití:
  - 45 % produkt (API, Azure TTS, compliance)
  - 25 % sales (LinkedIn ABM, 2 SDR na část úvazku)
  - 15 % marketing (case studies, pilot programs)
  - 10 % provoz (s.r.o., účetnictví, právní)
  - 5 % rezerva

## Exit scénáře
- **Trade sale** (2029-2030): strategic buyer (Synthesia, HeyGen, nebo EU lokalizační firma), 4-6× ARR = €28-45M
- **Growth round** (2028): Series A €3-5M, pokračovat do evropského scaleup
- **Bootstrap path**: cash-flow positive od M12, distribuce zisku bez dilution`
  });

  await post('/api/reports', {
    title: 'Tech stack 2026 — kompletní BOM',
    section: 'Produkt',
    agent: 'Produktak',
    content: `# Technologický stack (ověřeno Q2 2026)

## Překlad
| Engine | Cena | Kvalita | Rate limit | Použití |
|--------|------|---------|-----------|---------|
| Gemini 2.5 Flash-Lite | €0.075/1M tok | Velmi dobrá | 500 RPD free | **Starter tier** |
| Gemini 2.5 Flash | €0.15/1M tok | Výborná | 1 000 RPD free | **Business tier** |
| Claude Haiku 4.5 | €0.25/1M tok | Nejlepší | placené | **Enterprise + compliance** |
| DeepL API | €5/1M znaků | Výborná | 500k free | **Fallback** |

## TTS
| Engine | Cena | Kvalita | SLA | Použití |
|--------|------|---------|-----|---------|
| Edge TTS (Bing) | Zdarma | Dobrá | Žádné | **Free / Chrome extension** |
| Azure Neural TTS | $16/1M znaků | Výborná | 99.9 % | **Business/Enterprise** |
| Google Cloud TTS | $16/1M znaků | Výborná | 99.9 % | **Backup** |

## Video generace (pro marketing/demo)
| Engine | Cena | Free tier | Použití |
|--------|------|-----------|---------|
| Veo 3.1 Lite | ~$0.15/s | 10 videí/den | **Demo/marketing clips** |
| Nano Banana 2 | $0.045/img 1K | — | **Hi-res illustrations** |
| Gemini 2.5 Flash Image | Zdarma | 500 req/den | **Product screenshots** |

## Backend
- **Cloudflare Workers** — API endpoints, $5/mes baseline
- **Cloudflare R2** — audio storage, $0.015/GB
- **Cloudflare D1** — metadata DB, free tier 5GB
- **Neon Postgres** — primary DB, $19/mes
- **Clerk.dev** — auth, SSO, $25/mes per 500 MAU

## Frontend / web
- **Next.js 15** — marketing + dashboard
- **shadcn/ui + Tailwind** — UI system
- **GSAP 3 + Lenis** — cinematic scroll
- **Framer Motion** — micro-interactions

## Dev / DevOps
- **GitHub Actions** — CI/CD zdarma
- **Sentry** — error tracking, free 50k events/mes
- **PostHog** — analytics, free 1M events/mes
- **Vercel / Cloudflare Pages** — hosting zdarma

## Mesíční náklady infrastruktury (steady state při 300 zákaznících)
- Cloudflare Workers: €20
- R2 storage: €15
- Neon DB: €19
- Clerk: €45
- Domain + SSL: €5
- Monitoring: €0 (free tiers)
- **Celkem fix: €104/mes**

## AI API náklady (per 1000 minut dabingu)
- Gemini překlad: ~€3
- Azure TTS: ~€16
- Compute: ~€2
- **Celkem variable: €21/1000 min = €0.021/min**`
  });

  // === Nové úkoly pro tento sprint ===
  const tasks = [
    { agent: 'Strateg', title: 'Schválit revidovanou strategii 2026', description: 'Finální review celkového plánu před pitchem', status: 'done', priority: 1 },
    { agent: 'Analytik', title: 'Market research Q2 2026', description: 'Globální trh $1.16B, CAGR 14.2%, CEE SAM €8-12M', status: 'done', priority: 1 },
    { agent: 'Produktak', title: 'Tech stack BOM + náklady', description: 'Kompletní tech stack s cenami za duben 2026', status: 'done', priority: 1 },
    { agent: 'Obchodnik', title: 'Finanční model 24-měsíční', description: 'MRR/CAC/LTV/break-even projekce se třemi scénáři', status: 'done', priority: 1 },
    { agent: 'Marketar', title: 'Pitch deck — Apple-style web', description: 'Single-page scroll storytelling s cinematic motion', status: 'in-progress', priority: 1 },
    { agent: 'Marketar', title: 'Animovaný návod (cinematic tutorial)', description: 'Scroll-triggered animation přes GSAP + generované keyframes', status: 'in-progress', priority: 1 },
    { agent: 'Produktak', title: 'Interaktivní finanční kalkulačka', description: 'Live sliders pro pricing scénáře, LTV výpočet', status: 'in-progress', priority: 2 },
    { agent: 'Kritik', title: 'Review finálního pitchu', description: 'Oponentura před prezentací CEO', status: 'pending', priority: 2 },
    { agent: 'Strateg', title: 'Založit VoiceDub s.r.o. (CZ)', description: 'Notář, ARES, ŽL, bank. účet, DPH', status: 'pending', priority: 1 },
    { agent: 'Produktak', title: 'MVP API na Cloudflare Workers', description: 'POST /v1/dub endpoint: video URL → Gemini + Azure TTS', status: 'pending', priority: 1 },
    { agent: 'Obchodnik', title: 'Outreach 20 pilot e-learning firem', description: 'Cold LinkedIn + email, cíl 5 pilotů zdarma', status: 'pending', priority: 1 },
    { agent: 'Strateg', title: 'Investor deck PDF (10 slides)', description: 'Export z pitch webu jako PDF pro investory', status: 'pending', priority: 2 },
  ];
  for (const t of tasks) await post('/api/tasks', t);

  console.log('Seed 2026 data inserted!');
}

seed().catch(console.error);
