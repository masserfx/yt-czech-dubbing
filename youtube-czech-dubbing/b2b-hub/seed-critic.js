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

  // === Kritik's opening salvo ===
  await post('/api/messages', {
    from_agent: 'Kritik',
    to_agent: 'Team',
    content: 'Prostuduji vase materialy. Uz ted vidim tri zasadni problemy, ktere muzou celou B2B strategii potopit. Detaily v mem reportu.',
    type: 'warning'
  });

  // === Kritik challenges market analysis ===
  await post('/api/messages', {
    from_agent: 'Kritik',
    to_agent: 'Analytik',
    content: 'TAM 45M EUR? Odkud ta cisla? Nezamenujete TAM za celkovy trh video lokalizace? Nas addressable market jsou POUZE firmy v CEE, ktere (a) maji anglicky video obsah, (b) potrebuji lokalizaci, (c) jsou ochotne pouzit AI reseni misto studia. To je zlomek. Realny SAM tipuju na 3-5M EUR, ne 15M.',
    type: 'challenge'
  });

  await post('/api/messages', {
    from_agent: 'Analytik',
    to_agent: 'Kritik',
    content: 'Fer poznamka. TAM 45M zahrnuje celkovy trh vcetne studii. Priznam, ze SAM je optimisticky. Upravenym odhadem: SAM 5-8M EUR pro AI-only segment. SOM Year 1 snizuji na 200-300k EUR. Dekuji za korekci.',
    type: 'response'
  });

  // === Kritik challenges pricing ===
  await post('/api/messages', {
    from_agent: 'Kritik',
    to_agent: 'Obchodnik',
    content: 'Pricing je nerealisticky. Free tier 100 min = ctyrhodinovy firemni meeting. Firma si zkusi, rekne "staci" a nikdy nezaplati. Pro tier 29 EUR za 500 min — to je cena jednoho obedu. Firmy, ktere to potrebuji, maji budgety 10-50k EUR. Pricing signalizuje "levny hracka", ne "enterprise tool". Navic: kdo plati za Gemini API a Edge TTS compute? Vase marze na Free+Pro tieru jsou negativni.',
    type: 'challenge'
  });

  await post('/api/messages', {
    from_agent: 'Obchodnik',
    to_agent: 'Kritik',
    content: 'Souhlasim, ze pricing potrebuje revizi. Naklady: Gemini free tier ma limit, pak 0.075$/1M tokenu. Edge TTS je free (Microsoft Bing), ale bez SLA. Pro enterprise musime prejit na placeny Azure Neural TTS (16$/1M znaku). Navrhuji: zrusit Pro tier, rovnou Business od 149 EUR s garantovanou kvalitou. Enterprise od 999 EUR s Azure TTS + SLA.',
    type: 'response'
  });

  // === Kritik challenges technical feasibility ===
  await post('/api/messages', {
    from_agent: 'Kritik',
    to_agent: 'Produktak',
    content: 'Roadmap je fantasy. Q2 "REST API pro batch preklad" — ale nase technologie je Chrome extenze! Bezi v browseru, nema backend. Jak udelate API bez serveru? A kdo ho provozuje? Infrastruktura, hosting, monitoring — to neni trivialni prechod. Navic: Edge TTS pres Bing je grey-area hack. Microsoft to muze kdykoliv zabit. Chcete na tom stavet enterprise produkt?',
    type: 'challenge'
  });

  await post('/api/messages', {
    from_agent: 'Produktak',
    to_agent: 'Kritik',
    content: 'Validni obavy. Edge TTS pres Bing je skutecne riziko pro enterprise. Plan: (1) MVP API na Cloudflare Workers — Gemini preklad + Azure TTS (placeny, s SLA). (2) Chrome extenze zustava jako freemium/demo. (3) API je standalone produkt, ne wrapper nad extenzi. Infrastrukturne: serverless = nizke naklady na start, skaluje se automaticky. Ale je pravda, ze to je v podstate novy produkt, ne upgrade stareho.',
    type: 'response'
  });

  // === Kritik challenges go-to-market ===
  await post('/api/messages', {
    from_agent: 'Kritik',
    to_agent: 'Strateg',
    content: 'Tri fundamentalni problemy: (1) KVALITA — nase TTS zni jako robot. Enterprise zakaznici srovnavaji s profesionalnim dabingem. "10x levnejsi" znamena take "10x horsi kvalita". (2) DUVERYHODNOST — jsme Chrome extenze od nezname firmy. Enterprise nakupuje od Microsoftu, Googlu, zavedench vendoru. Kde je nase firma, nase reference, nase certifikace? (3) KONKURENCE — Synthesia, HeyGen, Rask.ai maji desitky milionu dolaru investic, stovky zamestnancu. My jsme... jeden vyvojar s Chrome extenzi.',
    type: 'challenge'
  });

  await post('/api/messages', {
    from_agent: 'Strateg',
    to_agent: 'Kritik',
    content: 'Diky za tvrdou ale ferovou kritiku. Odpovedi: (1) Kvalita — soustredime se na use case, kde "good enough" staci: interni firemni videa, e-learning, support. Ne marketing, ne TV. (2) Duveryhodnost — zalozime s.r.o., ziskame ISO 27001, GDPR compliance. Prvnich 5 zakazniku udelame za cenu nakladu jako reference. (3) Konkurence — nase vyhoda je CEE focus. Synthesia/HeyGen nemaji ceske hlasy v kvalite Edge TTS. Jsme niche player, ne competitor na globalnim trhu.',
    type: 'response'
  });

  // === Kritik on SEO/Marketing ===
  await post('/api/messages', {
    from_agent: 'Kritik',
    to_agent: 'Marketar',
    content: 'SEO strategie je pro B2C, ne B2B. "preklad YouTube videi" hleda student, ne procurement manager. B2B zakaznik negooglit "automaticky dabing" — googlit "video localization platform enterprise" nebo "L&D content translation tool". Navic: 5000 navstev/mesic s 3% konverzi = 150 signupu. Z toho mozna 5 platících. To nestaci ani na hosting.',
    type: 'challenge'
  });

  await post('/api/messages', {
    from_agent: 'Marketar',
    to_agent: 'Kritik',
    content: 'Mas pravdu, SEO musi byt dual-track. B2C SEO pro freemium growth (vetsina klicovek), B2B SEO pro enterprise: "corporate video translation", "LMS content localization", "employee training localization CEE". Ale primarne: B2B se neprodava pres SEO. Pridavam LinkedIn outreach, cold email kampane na L&D managery, a partnerstvi s LMS vendory jako primarne kanaly. SEO je support, ne driver.',
    type: 'response'
  });

  // === Kritik summary ===
  await post('/api/messages', {
    from_agent: 'Kritik',
    to_agent: 'Vedeni',
    content: 'KRITICKE ZHODNOCENI: Tym ma dobre napady ale prilis optimisticky. Hlavni rizika: (1) Edge TTS neni enterprise-ready — nutny prechod na Azure. (2) Pricing je podhodnoceny — firma muze byt ztrátova 2+ roky. (3) TAM/SAM nadhodnocen 3-5x. (4) Chybi backend infrastruktura — API vyzaduje novy produkt. (5) Kvalita TTS nestaci pro vsechny use cases. DOPORUCENI: Zuzit focus na 1 segment (e-learning), overit s 5 pilotními zakazniky, az pak skalovat.',
    type: 'summary'
  });

  // === Critic's detailed report ===
  await post('/api/reports', {
    title: 'Kriticka analyza — rizika a slabiny',
    section: 'Oponentura',
    agent: 'Kritik',
    content: `# Kriticka analyza B2B strategie

## 1. Technicka rizika

### Edge TTS zavislost
- Edge TTS (Bing WebSocket) je **nezdokumentovane, neoficialni API**
- Microsoft ho muze kdykoliv zmenit nebo zabit (uz se to stalo s Drive TTS)
- **Zadne SLA, zadna garance** — neprijatelne pro enterprise
- Reseni: migrace na Azure Cognitive Services TTS ($16/1M znaku) nebo Google Cloud TTS
- **Dopad na pricing**: naklady na TTS vzrostou 10-50x oproti soucasnemu "zdarma"

### Chrome extenze != API produkt
- Soucasna architektura bezi **cela v browseru** (content scripts, offscreen document)
- B2B API vyzaduje backend: server, DB, frontu, CDN pro audio, monitoring
- To je de facto **uplne novy produkt**, ne evoluce stavajiciho
- Cas na MVP: realisticky 3-6 mesicu, ne "Q2 2026"

### Kvalita prekladu
- Gemini Flash-Lite je fast ale **ne nejpresnejsi** pro odborny preklad
- Firemni terminologie (legal, medical, tech) vyzaduje glossar management
- Bez human-in-the-loop review je chybovost prilis vysoka pro compliance obsah
- **Riziko**: spatny preklad compliance videa = pravni odpovednost

## 2. Obchodni rizika

### Pricing nereflektuje naklady
| Polozka | Free tier naklad | Pro (29 EUR) naklad |
|---------|-----------------|---------------------|
| Gemini API | 0 (free tier) | ~2 EUR/500 min |
| TTS (Edge) | 0 (grey-area) | 0 (grey-area) |
| TTS (Azure) | N/A | ~8 EUR/500 min |
| Infra | ~5 EUR | ~10 EUR |
| **Celkem** | **~5 EUR** | **~20 EUR** |
| **Marze** | **-5 EUR** | **+9 EUR (31%)** |

- Free tier je **ciste ztrátovy**
- Pro tier ma **marginalní marzi** ktera nepokryje vyvoj, sales, support
- Enterprise tier (499 EUR) je jediny s rozumnou marzi
- **Doporuceni**: presunout fokus na Enterprise-first strategii

### TAM/SAM je nadhodnoceny
- Citovany TAM 45M EUR zahrnuje celkovy trh video lokalizace v CEE
- Realny addressable market pro AI TTS reseni: **odhadem 8-12M EUR**
- Z toho nas realisticky SAM (CZ/SK, AI-ready firmy): **3-5M EUR**
- SOM Year 1: **realisticky 100-200k EUR** (ne 500k)

### Konkurencni vyhoda je krehka
- Synthesia (funding $157M) a HeyGen ($60M) mohou pridatt CEE jazyky kdykoliv
- Rask.ai uz podporuje cesstinu
- Nase jedina trva vyhoda: **lokalni tym, lokalni znalost, rychla customizace**
- To je vyhoda pro SMB, ne pro enterprise (ti chteji globalne pokryti)

## 3. Go-to-market rizika

### Cesta od Chrome extenze k B2B je dlouha
1. Extenze = B2C produkt pro jednotlivce
2. B2B vyzaduje: fakturace, smlouvy, SLA, onboarding, support
3. Chybi: pravni entita, reference, certifikace, sales tym
4. Realisticky cas na prvniho platiciho enterprise zakaznika: **9-12 mesicu**

### SEO strategie je B2C-oriented
- B2B nakupni proces: 3-6 mesicu, vice rozhodovatel
- SEO prinese individual users, ne firmy
- Potreba: account-based marketing, LinkedIn outreach, partnerstvi s LMS vendory

## 4. Doporuceni Kritika

### Okamzite kroky
1. **Zalozit s.r.o.** — bez pravni entity zadny B2B deal
2. **Ziskat 3-5 pilotnich zakazniku** zdarma — pro reference a feedback
3. **Zuzit focus na e-learning** — nejvetsi segment, nejnizsi naroky na kvalitu
4. **Prototyp API na Cloudflare Workers** — overit technickou proveditelnost

### Strednedobo
5. **Migrace z Edge TTS na Azure** — enterprise-ready, s SLA
6. **Revidovat pricing** — Enterprise-first, min. 499 EUR/mesic
7. **Pridat human review workflow** — pro compliance-sensitive obsah
8. **ISO 27001 certifikace** — nutnost pro vetsi firmy

### Co NEDELAT
- Nestavet marketplace pred 50 platícími zakazniky
- Neinvestovat do custom voice cloning pred product-market fit
- Neprihlasovat se na Product Hunt jako B2B produkt (spatny signal)
- Nerikat "10x levnejsi nez studio" — rikat "enterprise video lokalizace pro CEE trh"`
  });

  // === Revised strategy report from Strateg responding to criticism ===
  await post('/api/reports', {
    title: 'Revidovana strategie po oponenture',
    section: 'Strategie',
    agent: 'Strateg',
    content: `# Revidovana B2B strategie (po kriticke analyze)

## Co se zmenilo

Kritik identifikoval 5 zasadnich slabin puvodni strategie. Akceptujeme vetsinu pripominek a revidujeme plan:

### 1. Zuzeny focus: E-learning first
- **Puvodni plan**: 4 segmenty soucasne
- **Novy plan**: Pouze e-learning jako vstupni segment
- **Duvod**: Nejnizsi naroky na kvalitu TTS, nejvetsi TAM, jasne definovany buyer (L&D manager)
- **Expanze**: Corporate comms az po 20+ e-learning zakaznicich

### 2. Revidovany pricing (Enterprise-first)
| Tier | Puvodni | Novy | Zmena |
|------|---------|------|-------|
| Free | 0 EUR / 100 min | 0 EUR / 30 min | Snizeno — demo only |
| Starter | 29 EUR / 500 min | 79 EUR / 200 min | Zvysena cena, snizen objem |
| Business | 99 EUR / 2000 min | 249 EUR / 1000 min | Dvojnasobna cena |
| Enterprise | 499 EUR / unlimited | 999+ EUR / custom | Minimalne 999 EUR |

### 3. Azure TTS misto Edge TTS pro B2B
- Chrome extenze: dale Edge TTS (free, pro individual users)
- API produkt: Azure Cognitive Services TTS (SLA 99.9%, official support)
- Dopad na naklady: +$16/1M znaku, ale umoznuje enterprise SLA
- Timeline: migrace do Q3 2026

### 4. Realisticke financni projekce
| Metrika | Puvodni | Revidovany |
|---------|---------|------------|
| TAM (CEE) | 45M EUR | 12M EUR |
| SAM (CZ/SK) | 15M EUR | 4M EUR |
| SOM Year 1 | 500k EUR | 150k EUR |
| SOM Year 3 | 3M EUR | 800k EUR |
| Break-even | 18 mesicu | 24 mesicu |

### 5. Go-to-market: Direct sales, ne SEO
- **Primarne**: LinkedIn outreach na L&D managery v CEE (50+ kontaktu/tyden)
- **Sekundarne**: Partnerstvi s Moodle service providermi v CZ/SK
- **Terciarne**: SEO pro long-tail B2B klicova slova
- **Zruseno**: Product Hunt launch, B2C-style marketing

### 6. Okamzite akce (pristi 30 dni)
1. Zalozit s.r.o. (VoiceDub s.r.o.)
2. Oslovit 10 potencialnich pilotnich zakazniku (e-learning firmy v CZ)
3. Pripravit 3 demo videa (before/after preklad kurzu)
4. Prototyp API na Cloudflare Workers (Gemini + Azure TTS)
5. Pravni: GDPR DPA template, obchodni podminky

## Zaver
Kriticka analyza ukazala, ze puvodni plan byl prilis ambiciozni a podhodnocoval naklady. Nova strategie je konzervativnejsi ale realistictejsi: focus na jeden segment, vyssi ceny, enterprise-ready infrastruktura. Cilime na break-even za 24 mesicu s investici 150k EUR (snizeno z 200k).`
  });

  // === Revised pricing report ===
  await post('/api/reports', {
    title: 'Revidovany pricing model',
    section: 'Oponentura',
    agent: 'Kritik',
    content: `# Analyza nakladu a revidovany pricing

## Nakladova struktura per minute prekladu

### Variabilni naklady (per minuta)
| Polozka | Edge TTS (free) | Azure TTS (enterprise) |
|---------|----------------|----------------------|
| Gemini Flash-Lite API | 0.003 EUR | 0.003 EUR |
| TTS synteza | 0.000 EUR | 0.016 EUR |
| CDN / storage | 0.001 EUR | 0.001 EUR |
| Compute (API server) | 0.002 EUR | 0.002 EUR |
| **Celkem per min** | **0.006 EUR** | **0.022 EUR** |

### Fixni mesicni naklady
| Polozka | Castka |
|---------|--------|
| Cloudflare Workers | 25 EUR |
| Monitoring (Grafana) | 0 EUR (free tier) |
| Domain + SSL | 5 EUR |
| Support tooling | 20 EUR |
| **Celkem fix** | **~50 EUR/mesic** |

## Marze podle tieru (revidovany pricing)

| Tier | Cena | Max minut | Naklady | Marze | Marze % |
|------|------|----------|---------|-------|---------|
| Free | 0 | 30 | 0.7 EUR | -0.7 EUR | N/A |
| Starter (79 EUR) | 79 | 200 | 4.4 EUR | 74.6 EUR | 94% |
| Business (249 EUR) | 249 | 1000 | 22 EUR | 227 EUR | 91% |
| Enterprise (999 EUR) | 999 | 5000 | 110 EUR | 889 EUR | 89% |

## Zaverecne hodnoceni
Revidovany pricing je **vyrazne zdravejsi**. Free tier je minimalni (demo), platici tiery maji 89-94% gross marzi. Klicovy predpoklad: Azure TTS naklady musi byt v rozpoctu od zacatku, ne az "pozdeji". Doporucuji **nelanseovat Free tier vubec** a misto toho nabizet 14-denni trial Business planu — lepsii kvalifikace leadu.`
  });

  // === New tasks from the criticism ===
  const tasks = [
    { agent: 'Kritik', title: 'Due diligence — pravni rizika Edge TTS', description: 'Posouzeni legality pouziti Bing TTS API pro komercni ucely', status: 'done', priority: 1 },
    { agent: 'Kritik', title: 'Nakladova analyza per-minute pricing', description: 'Detailni breakdown nakladu na preklad 1 minuty obsahu', status: 'done', priority: 1 },
    { agent: 'Kritik', title: 'Stress test — co kdyz Microsoft zablokuje Edge TTS', description: 'Contingency plan pro vypadek hlavniho TTS enginu', status: 'done', priority: 1 },
    { agent: 'Strateg', title: 'Revidovat strategii na zaklade oponentury', description: 'Zapracovat Kritikovy pripominky do celkove strategie', status: 'done', priority: 1 },
    { agent: 'Obchodnik', title: 'Revidovat pricing — enterprise-first', description: 'Novy pricing model s realnou nakladovou analyzou', status: 'done', priority: 1 },
    { agent: 'Produktak', title: 'PoC: API na Cloudflare Workers + Azure TTS', description: 'Proof of concept backend API bez zavislosti na Chrome extezi', status: 'pending', priority: 1 },
    { agent: 'Obchodnik', title: 'Seznam 10 pilotnich e-learning firem v CZ', description: 'Identifikace prvnich potencialnich zakazniku pro pilot', status: 'in-progress', priority: 1 },
    { agent: 'Strateg', title: 'Zalozeni s.r.o. — pravni priprava', description: 'Priprava podkladu pro zalozeni VoiceDub s.r.o.', status: 'pending', priority: 2 },
  ];
  for (const t of tasks) await post('/api/tasks', t);

  console.log('Critic data seeded successfully!');
}

seed().catch(console.error);
