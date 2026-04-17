# VoiceDub API

REST API pro automatický překlad a dabing videa. Běží na **Cloudflare Workers** (edge serverless, <50 ms cold start).

## Architektura

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /v1/dub
       ▼
┌──────────────────────┐     ┌──────────────────┐
│ Cloudflare Worker    │────►│  Gemini 2.5 Flash│  překlad
│  /v1/dub             │     └──────────────────┘
│  /v1/voices          │     ┌──────────────────┐
│  /v1/jobs/{id}       │────►│  Azure Neural TTS│  syntéza
│  /v1/health          │     └──────────────────┘
└──────┬───────────────┘              │
       │                              ▼
       ├──► D1 (jobs metadata)   ┌─────────┐
       ├──► R2 (audio storage)   │   R2    │
       ├──► KV (API keys + RL)   │  audio  │
       └──► Queue (long jobs)    └─────────┘
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

### `GET /v1/jobs/{id}`
Status úlohy.

### `GET /v1/voices?lang=cs`
Dostupné hlasy.

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
npx wrangler dev --port 8787
```

## Deploy na Cloudflare

```bash
# 1. Login
npx wrangler login

# 2. Vytvoř KV, R2, D1
npx wrangler kv namespace create API_KEYS
npx wrangler r2 bucket create voicedub-audio
npx wrangler d1 create voicedub-jobs

# 3. Přidej binding ID do wrangler.toml

# 4. Aplikuj migrace
npx wrangler d1 execute voicedub-jobs --file=migrations/0001_init.sql

# 5. Secrets
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put AZURE_SPEECH_KEY
npx wrangler secret put AZURE_SPEECH_REGION

# 6. Deploy
npx wrangler deploy
```

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

- [x] PoC: sync text → translated audio
- [ ] Async pipeline s Queues pro URL videa
- [ ] Speaker detection (multi-voice)
- [ ] Glossary management endpoint
- [ ] Webhook signatures (HMAC)
- [ ] Stripe billing per minute
- [ ] Admin dashboard (Next.js 15)

## EU AI Act compliance

Každé vygenerované audio obsahuje v metadata (ID3 tag) flag `VoiceDub-Generated: true` a odkaz na disclosure dle čl. 50 AI Actu.
