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
  // === Team Communication ===
  await post('/api/messages', {
    from_agent: 'Strateg',
    to_agent: 'Team',
    content: 'Team, zahajuji B2B strategicky workshop. Nase Chrome extenze pro cesky dabing YouTube videi ma unikatni technologii — real-time preklad + TTS synteza. Cil: identifikovat B2B segmenty, kde tato technologie prinese nejvyssi hodnotu. Kazdy zpracuje svou oblast, report do konce dne.',
    type: 'announcement'
  });
  await post('/api/messages', {
    from_agent: 'Analytik',
    to_agent: 'Strateg',
    content: 'Analyzoval jsem trh. Klicove segmenty: (1) E-learning platformy — lokalizace kurzu, (2) Korporatni komunikace — preklad interni videi, (3) Customer support — multijazykove video navody, (4) Media & broadcasting — rychly dabing obsahu. TAM pro CZ/SK/PL/HU trh odhaduji na 45M EUR rocne.',
    type: 'message'
  });
  await post('/api/messages', {
    from_agent: 'Obchodnik',
    to_agent: 'Strateg',
    content: 'Pripravil jsem go-to-market strategii. Prvni faze: freemium model pro SMB, druha faze: enterprise licencovani s custom hlasy a SLA. Klicovi partneri: LMS platformy (Moodle, iSpring), video hosting (Vimeo Business), corporate communication tools.',
    type: 'message'
  });
  await post('/api/messages', {
    from_agent: 'Marketar',
    to_agent: 'Strateg',
    content: 'SEO strategie hotova. Cilova klicova slova: "preklad videi do cestiny", "automaticky dabing", "AI video lokalizace", "cesky TTS". Landing page bude mit demo s live prevodem — nejlepsi konverzni nastroj. Content marketing pres YouTube kanaly a LinkedIn.',
    type: 'message'
  });
  await post('/api/messages', {
    from_agent: 'Produktak',
    to_agent: 'Strateg',
    content: 'Roadmap pro B2B: Q2 — API endpoint pro batch preklad, Q3 — admin dashboard + team management, Q4 — custom voice cloning integrace + on-premise deployment. Priorita 1 je stabilni API — bez nej zadny enterprise nepodepise.',
    type: 'message'
  });
  await post('/api/messages', {
    from_agent: 'Strateg',
    to_agent: 'Team',
    content: 'Sumarizace pro vedeni: Identifikovany 4 klicove B2B segmenty s TAM 45M EUR. Go-to-market: freemium -> enterprise. Technicka priorita: API endpoint + admin panel. Marketing: SEO + demo landing page. Detaily v reportech nize.',
    type: 'summary'
  });

  // === Tasks ===
  const tasks = [
    { agent: 'Analytik', title: 'Trzni analyza B2B segmentu', description: 'Kompletni analyza TAM/SAM/SOM pro CZ/SK/PL/HU trh', status: 'done', priority: 1 },
    { agent: 'Analytik', title: 'Konkurencni analyza', description: 'Mapovani existujicich reseni (Synthesia, HeyGen, Rask.ai)', status: 'done', priority: 1 },
    { agent: 'Obchodnik', title: 'Go-to-market strategie', description: 'Faze 1-3 vstup na trh, pricing model', status: 'done', priority: 1 },
    { agent: 'Obchodnik', title: 'Partnerska strategie', description: 'Identifikace a prioritizace potencialnich partneru', status: 'done', priority: 2 },
    { agent: 'Marketar', title: 'SEO strategie a klicova slova', description: 'Keyword research, content plan', status: 'done', priority: 1 },
    { agent: 'Marketar', title: 'Navrh landing page', description: 'Wireframe a copy pro B2B landing page', status: 'done', priority: 2 },
    { agent: 'Produktak', title: 'B2B Product Roadmap', description: 'Roadmap Q2-Q4 2026 s milestones', status: 'done', priority: 1 },
    { agent: 'Produktak', title: 'API specifikace', description: 'REST API navrh pro batch preklad', status: 'in-progress', priority: 2 },
    { agent: 'Strateg', title: 'Obchodni plan — executive summary', description: 'Celkovy obchodni plan a financni projekce', status: 'done', priority: 1 },
    { agent: 'Strateg', title: 'Investor pitch deck', description: 'Priprava podkladu pro investory', status: 'pending', priority: 3 },
    { agent: 'Marketar', title: 'Webova prezentace — implementace', description: 'HTML/CSS landing page s demo sekcemi', status: 'in-progress', priority: 2 },
    { agent: 'Obchodnik', title: 'Pricing kalkulacka', description: 'Interaktivni nastroj pro vypocet ceny B2B', status: 'pending', priority: 3 },
  ];
  for (const t of tasks) await post('/api/tasks', t);

  // === Reports ===
  await post('/api/reports', {
    title: 'B2B Trzni analyza',
    section: 'Analyza',
    agent: 'Analytik',
    content: `# Trzni analyza — B2B Video Lokalizace

## Executive Summary
Trh automaticke video lokalizace v regionu CEE (CZ/SK/PL/HU) roste o 28% rocne. Nase technologie — real-time AI preklad s TTS syntezou — oslovi segmenty, kde rychlost a cena prevazi nad studiovym dabingem.

## Cilove segmenty

### 1. E-learning & EdTech (TAM: 18M EUR)
- **Poptavka**: Univerzity, firemni skoleni, online kurzy
- **Pain point**: Lokalizace 1h videa studiovym dabingem stoji 800-2000 EUR a trva 5-10 dni
- **Nase reseni**: Automaticky preklad za minuty, cena 10-50 EUR/hodina obsahu
- **Cilovi zakaznici**: Moodle implementace, iSpring, Coursera partneri v CZ/SK

### 2. Korporatni komunikace (TAM: 12M EUR)
- **Poptavka**: Mezinarodni firmy s pobockami v CEE
- **Pain point**: CEO all-hands, compliance videa, onboarding — casto jen v anglictine
- **Nase reseni**: Okamzity preklad internich videi do lokalnich jazyku
- **Cilovi zakaznici**: SSC centra (Brno, Praha, Bratislava, Krakov)

### 3. Customer Support & Knowledge Base (TAM: 8M EUR)
- **Poptavka**: SaaS firmy, e-commerce, technicka podpora
- **Pain point**: Video navody jen v EN, zakaznici v CEE je nechapou
- **Nase reseni**: Automatizovany preklad video dokumentace
- **Cilovi zakaznici**: Zendesk/Freshdesk uzivatele, e-shopy

### 4. Media & Content (TAM: 7M EUR)
- **Poptavka**: Zpravodajstvi, podcasty, YouTube kanaly
- **Pain point**: Rychly preklad breaking news, podcastu pro CEE publikum
- **Nase reseni**: Near-real-time dabing pro live/recorded obsah
- **Cilovi zakaznici**: Medialni domy, podcast studia

## TAM / SAM / SOM
| Metrika | Hodnota |
|---------|---------|
| TAM (CEE) | 45M EUR |
| SAM (CZ/SK focus) | 15M EUR |
| SOM (Year 1) | 0.5M EUR |
| SOM (Year 3) | 3M EUR |

## Konkurence
| Hrac | Cena/min | Kvalita | Real-time | CEE jazyky |
|------|----------|---------|-----------|------------|
| Synthesia | 0.5 EUR | Vysoka | Ne | Omezene |
| HeyGen | 0.3 EUR | Vysoka | Ne | Omezene |
| Rask.ai | 0.2 EUR | Stredni | Ne | Ano |
| **My** | **0.02 EUR** | **Stredni** | **Ano** | **Nativni** |

Nase konkurencni vyhoda: 10x levnejsi, real-time schopnost, nativni CEE hlasy.`
  });

  await post('/api/reports', {
    title: 'Go-to-Market strategie',
    section: 'Strategie',
    agent: 'Obchodnik',
    content: `# Go-to-Market strategie

## Faze 1: Freemium Launch (Q2 2026)
- **Produkt**: Chrome extenze + zakladni API (100 min/mesic zdarma)
- **Cil**: 500 registrovanych firem, 50 platících
- **Pricing**: Free tier (100 min) / Pro (29 EUR/mesic, 500 min) / Business (99 EUR/mesic, 2000 min)
- **Kanaly**: Product Hunt launch, LinkedIn outreach, SEO

## Faze 2: Enterprise (Q3-Q4 2026)
- **Produkt**: Admin dashboard, team management, SLA, prioritni podpora
- **Cil**: 10 enterprise zakazniku (ACV 5-20k EUR)
- **Pricing**: Enterprise (od 499 EUR/mesic), custom pricing pro 10k+ min
- **Kanaly**: Partnerstvi s LMS platformami, primy sales

## Faze 3: Platform (2027)
- **Produkt**: API marketplace, custom voice cloning, on-premise
- **Cil**: 50+ enterprise, 2000+ SMB
- **Pricing**: Usage-based + platform fee
- **Kanaly**: Channel partners, system integratori

## Pricing Model
| Tier | Cena/mesic | Minuty | Jazyky | Podpora |
|------|-----------|--------|--------|---------|
| Free | 0 EUR | 100 | 4 | Community |
| Pro | 29 EUR | 500 | 4 | Email |
| Business | 99 EUR | 2000 | 8+ | Priority |
| Enterprise | 499+ EUR | Unlimited | All | Dedicated |

## Partnerska strategie
1. **LMS integrace**: Moodle plugin, iSpring partnership
2. **Video hosting**: Vimeo Business API integrace
3. **Corporate tools**: Microsoft Teams app, Slack bot
4. **Reselleri**: IT distributori v CEE (ALEF, SWS, eD system)`
  });

  await post('/api/reports', {
    title: 'SEO & Marketing Plan',
    section: 'Marketing',
    agent: 'Marketar',
    content: `# SEO & Marketing Plan

## Cilova klicova slova

### Primarni (vysoka konverze)
- "automaticky preklad videi do cestiny" (vol: 480/mes, diff: low)
- "AI dabing videa" (vol: 320/mes, diff: low)
- "preklad YouTube videi" (vol: 1200/mes, diff: medium)
- "lokalizace e-learning obsahu" (vol: 260/mes, diff: low)

### Sekundarni (awareness)
- "TTS cesky hlas" (vol: 590/mes)
- "preklad online skoleni" (vol: 340/mes)
- "automaticke titulky cestina" (vol: 720/mes)

## Content strategie
1. **Blog**: 2x tydne — case studies, tutorialy, porovnani
2. **YouTube kanal**: Demo videa, before/after preklady
3. **LinkedIn**: Thought leadership posty o AI lokalizaci
4. **Newsletter**: Tydenni tipy pro video lokalizaci

## Landing Page struktura
1. **Hero**: "Prelozte kazde video do cestiny za minuty" + live demo
2. **Pain points**: 3 boxy — cena studioveno dabingu, cas, jazykova bariéra
3. **Reseni**: Jak to funguje (3 kroky)
4. **Use cases**: E-learning, Corporate, Support, Media
5. **Pricing**: 4 tiery s CTA
6. **Testimonials**: Beta uzivatele
7. **CTA**: "Zacnete zdarma — 100 minut na nas"

## Metriky
- Organic traffic: 5000 navstev/mesic do 6 mesicu
- Conversion rate: 3% free trial signup
- CAC: pod 50 EUR
- LTV/CAC ratio: minimalne 3:1`
  });

  await post('/api/reports', {
    title: 'Product Roadmap B2B',
    section: 'Produkt',
    agent: 'Produktak',
    content: `# B2B Product Roadmap 2026

## Q2 2026 — Foundation
- REST API pro batch preklad (upload video -> vrat prelozene audio)
- Webhook notifikace po dokonceni prekladu
- API key management + usage tracking
- Rate limiting a fair-use policy
- Dokumentace (OpenAPI/Swagger)

## Q3 2026 — Team & Admin
- Admin dashboard (prehled pouziti, billing, team members)
- Team management (role: admin, translator, viewer)
- Bulk operations (prelozit playlist/kurz najednou)
- Quality review workflow (schvaleni prekladu pred publikaci)
- SSO integrace (SAML, Google Workspace)

## Q4 2026 — Enterprise
- Custom voice profiles (natrenovani hlasu na vzorku)
- Glossar/terminologie management (firemni slovnik)
- On-premise deployment option (Docker container)
- SLA dashboard a uptime monitoring
- Compliance (GDPR data processing agreement)

## 2027 — Platform
- Marketplace pro custom hlasy a jazykove modely
- Real-time API pro live streaming preklad
- SDK pro mobilni aplikace (iOS/Android)
- White-label reseni pro partnery
- AI quality scoring (automaticke hodnoceni kvality prekladu)

## Technicke predpoklady
| Komponenta | Stav | Priorita |
|-----------|------|----------|
| Edge TTS multi-voice | Hotovo | - |
| Speaker detection | Hotovo | - |
| Gemini translation | Hotovo | - |
| REST API wrapper | Planovano | P0 |
| Admin UI | Planovano | P1 |
| Custom voices | Research | P2 |
| On-premise | Planovano | P2 |`
  });

  await post('/api/reports', {
    title: 'Obchodni plan — Executive Summary',
    section: 'Strategie',
    agent: 'Strateg',
    content: `# Obchodni plan — Executive Summary

## Vize
Stat se jednickou v automaticke video lokalizaci pro stredoevropsky trh. Technologie, ktera preklada a dabuje video obsah v realnem case, za zlomek ceny studia.

## Problem
- Studia dabing 1h videa: 800-2000 EUR, 5-10 dnu
- 73% firem v CEE ma interni videa jen v anglictine
- E-learning obsah je casto nedostupny v lokalnich jazycich
- Zakaznicka podpora pres video roste o 35% rocne, ale lokalizace nestaci

## Reseni
AI-powered Chrome extenze + API pro automaticky preklad a dabing videi:
- **Real-time preklad** — zive behem sledovani
- **Batch processing** — nahrat video, stahnout prelozenou verzi
- **Multi-voice** — automaticka detekce mluvcich, muzsky/zensky/detsky hlas
- **4 CEE jazyky** — cestina, slovenstina, polstina, madarstina

## Financni projekce

| Rok | MRR | Zakaznici | Gross Margin |
|-----|-----|-----------|-------------|
| 2026 H2 | 15k EUR | 200 | 78% |
| 2027 | 85k EUR | 1200 | 82% |
| 2028 | 250k EUR | 3500 | 85% |

## Investicni potreba
- **Seed round**: 200k EUR
- **Pouziti**: 40% vyvoj (API, admin), 30% sales/marketing, 20% infrastruktura, 10% provoz
- **Runway**: 18 mesicu do break-even

## Tym
- CEO/CTO: Zakladatel — fullstack developer, 10+ let zkusenosti
- Agent tym: AI-asistovane strategie, analyzy, marketing

## Klicove metriky (KPIs)
1. MAU (Monthly Active Users): 500 -> 5000 za 12 mesicu
2. Paid conversion: 10%+
3. Churn: pod 5% mesicne
4. NPS: 50+
5. API uptime: 99.5%+`
  });

  console.log('Seed data inserted successfully!');
}

seed().catch(console.error);
