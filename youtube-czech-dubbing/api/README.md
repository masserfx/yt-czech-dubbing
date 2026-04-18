# VoiceDub API

REST API pro automatický překlad a dabing videa. Běží na **Cloudflare Workers** (edge serverless, <50 ms cold start).

## Architektura

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /v1/dub   (translate + synthesize)
       │ POST /v1/synthesize  (TTS-only, cached)
       │ GET  /v1/usage       (tenant stats)
       ▼
┌──────────────────────┐     ┌──────────────────┐
│ Cloudflare Worker    │────►│  Gemini 2.5 Flash│  překlad
│  /v1/dub             │     │  DeepL / OpenAI  │  fallback
│  /v1/synthesize      │     └──────────────────┘
│  /v1/voices          │     ┌──────────────────┐
│  /v1/jobs/{id}       │────►│  Azure Neural TTS│  syntéza
│  /v1/usage           │     └──────────────────┘
│  /v1/health          │              │
└──────┬───────────────┘              ▼
       │                         ┌─────────┐
       ├──► D1 (jobs, usage)     │   R2    │
       ├──► R2 (audio + TTS cache)│  audio  │
       ├──► KV (API keys + RL)   └─────────┘
       └──► Queue (long jobs)
```

## Endpoints

### `POST /v1/dub`
Zahájí překlad a dabing.

```bash
curl -X POST http://localhost:8787/v1/dub \
  -H "Authorization: Bearer vd_test_abc123xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "source_text": "Welcome to cybersecurity training.",
    "target_language": "cs",
    "voice_id": "cs-CZ-VlastaNeural"
  }'
```

Response (quick mode, source_text):
```json
{
  "job_id": "...",
  "status": "completed",
  "translated_text": "Vítejte ve školení o kybernetické bezpečnosti.",
  "audio_url": "/v1/audio/dev/.../xxx.mp3",
  "duration_seconds": 4
}
```

Response (URL mode, async):
```json
{ "job_id": "...", "status": "pending", "estimated_duration_seconds": 180 }
```

### `POST /v1/synthesize`
TTS-only endpoint pro transcript mode (překlad už proběhl na klientu).
R2 cache s SHA-256 klíčem `tts-cache/<tenant>/<hash>.mp3` — opakované věty
se neúčtují u Azure.

```bash
curl -X POST http://localhost:8787/v1/synthesize \
  -H "Authorization: Bearer vd_test_abc123xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Vítejte ve školení.",
    "voice_id": "cs-CZ-AntoninNeural",
    "language": "cs",
    "speed": 25,
    "disable_watermark": true
  }'
```

Body fields:
- `text` (required, max 2000 zn.)
- `voice_id` (default: per-language Vlasta/Viktoria/Zofia/Noemi)
- `language` (cs|sk|pl|hu|en, default cs)
- `speed`, `pitch` (-50..+50 %, default 0)
- `disable_watermark` — per-segment bypass pro live dubbing (session-level disclosure na klientu)

Response: `{ audio_base64, voice_id, cached: boolean, duration_seconds, characters }`

### `GET /v1/jobs/{id}`
Status úlohy.

### `GET /v1/voices?lang=cs`
Dostupné hlasy.

### `GET /v1/usage?period=today|week|month|all&group_by=day|hour`
Tenant statistiky (requests, znaky, audio minuty, providers, rate-limit stav).
Data scope = `apiKey.tenant_id` (cross-tenant read impossible).

```bash
curl -H "Authorization: Bearer vd_live_..." \
  "https://voicedub-api.masserfx.workers.dev/v1/usage?period=week&group_by=day"
```

Response shape:
```json
{
  "period": "week",
  "range_from": "2026-04-11T...",
  "summary": {
    "requests_total": 142,
    "errors": 3,
    "requests_dub": 87,
    "requests_synthesize": 55,
    "characters_synthesized": 42198,
    "audio_seconds": 1734.2
  },
  "providers": { "gemini": 120, "deepl": 15, "openai": 7 },
  "buckets": [{ "ts": "2026-04-17T00:00:00Z", "requests": 42, "audio_seconds": 512.1 }],
  "rate_limit": { "tier": "business", "limit_per_minute": 300, "current": 5, "remaining": 295 }
}
```

Poznámka: statistiky před 2026-04-17 (migrace 0002) mají `characters_synthesized=0`
a `translator_provider=NULL` — sidepanel to značí jako "stats od 2026-04-17".

### `GET /v1/health`
Health check (bez auth).

## Lokální dev

```bash
cd api
npm install
npx wrangler dev --port 8787
```

Auth: použij `Authorization: Bearer vd_test_<cokoliv20+znakov>` (dev fallback akceptuje `vd_test_*`).

Pro reálné volání Gemini + Azure:
```bash
export GEMINI_API_KEY=<z aistudio.google.com>
export AZURE_SPEECH_KEY=<z Azure portal>
export AZURE_SPEECH_REGION=westeurope
# Volitelné fallback providery (runtime auto-select při Gemini error):
export DEEPL_API_KEY=<z developers.deepl.com>
export OPENAI_API_KEY=<z platform.openai.com>
npx wrangler dev --port 8787
```

### Translator fallback chain

Runtime selektor (`src/providers/translator.js`) vybere provider v pořadí:

1. **Gemini 2.5 Flash** (primary, free tier + nejlevnější)
2. **DeepL** (fallback, nejvyšší kvalita CEE)
3. **OpenAI GPT-4o-mini** (secondary fallback, nejspolehlivější dostupnost)

- Na 429/5xx primary → automaticky spadne na další provider
- Enterprise tier preferuje DeepL (kvalita > cena)
- Per-job override: `{"translator": "openai"}` v POST body
- Response vrací `translator_provider` pole pro observability

### AI Act čl. 50 (effective 2026-08-02)

Každý audio výstup má pre-pend disclosure:
- CS: "Tato nahrávka byla vygenerována umělou inteligencí."
- SK / PL / HU / EN: lokalizované varianty
- Layered s ID3 metadata tag `VoiceDub-Generated: true`
- Enterprise tier: `{"disable_watermark": true}` pouze s contractual opt-out

## Deploy na Cloudflare

```bash
# 1. Login
npx wrangler login

# 2. Vytvoř KV, R2, D1
npx wrangler kv namespace create API_KEYS
npx wrangler r2 bucket create voicedub-audio
npx wrangler d1 create voicedub-jobs

# 3. Přidej binding ID do wrangler.toml

# 4. Aplikuj migrace (sekvenčně z migrations/*.sql)
npx wrangler d1 migrations apply voicedub-jobs --remote

# 5. Secrets
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put AZURE_SPEECH_KEY
npx wrangler secret put AZURE_SPEECH_REGION
npx wrangler secret put DEEPL_API_KEY     # volitelné fallback
npx wrangler secret put OPENAI_API_KEY    # volitelné fallback
npx wrangler secret put API_SIGNING_SECRET

# 6. Deploy
npx wrangler deploy
```

### CI/CD (GitHub Actions)

V `.github/workflows/`:
- **test-api.yml** — `node --test` na push/PR do `api/`
- **build-extension.yml** — `bash build.sh` + upload `.zip` artifact
- **deploy-api-staging.yml** — auto-deploy na push do `main` (migrace + wrangler deploy + secret sync), environment `staging` pro manual-approval gate
- **release.yml** — tag `v*` → draft GitHub Release s `.zip` přiloženým

Required repo secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `GEMINI_API_KEY`, `DEEPL_API_KEY`, `OPENAI_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `API_SIGNING_SECRET`.

## Pricing (Cloudflare)

| Zdroj | Free tier | Placené |
|-------|-----------|---------|
| Workers requests | 100 k / den | $5 / 10M |
| D1 (SQL) | 5 GB + 25M reads | $1 / 1GB |
| R2 storage | 10 GB | $0.015 / GB / měs |
| KV | 1 GB + 100 k reads/den | $0.50 / 1M reads |

**Typický zákazník Business tier** (1 000 min/měs): ~$0.02 infra náklady + Gemini/Azure API.

## Rate limits (per API key)

| Tier | Requests/min |
|------|-------------|
| free | 10 |
| starter | 60 |
| business | 300 |
| enterprise | 1 200 |

## Roadmap

- [x] **A7** PoC: sync text → translated audio (`/v1/dub` quick mode)
- [x] **A8** `/v1/synthesize` + R2 TTS cache (transcript mode, SHA-256 klíč)
- [x] **A9** `/v1/usage` tenant stats + D1 denormalizace + sidepanel UI
- [x] **CI/CD** GitHub Actions (test, build, staging deploy, release)
- [ ] Async pipeline s Queues pro URL videa
- [ ] Speaker detection (multi-voice)
- [ ] Glossary management endpoint
- [ ] Webhook signatures (HMAC)
- [ ] Stripe billing per minute
- [ ] Admin dashboard (Next.js 15)

## EU AI Act compliance

Každé vygenerované audio obsahuje v metadata (ID3 tag) flag `VoiceDub-Generated: true` a odkaz na disclosure dle čl. 50 AI Actu.
