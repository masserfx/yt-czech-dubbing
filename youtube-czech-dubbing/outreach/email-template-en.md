# Email T1 — English calibrated pitch (Tier B, C, D)

> **For:** Head of Content / L&D Director / Production Coordinator
> **When:** Tue–Thu 9:30–11:00 CET (hits EU + UK inbox fresh)
> **Subject lines (pick ONE — don't A/B blast):**
> - A: `{{firstName}}, dub your courses in 4 CEE languages in under 1 hour`
> - B: `{{companyName}} + VoiceDub = 10× cheaper localisation`
> - C: `Question about "{{courseName}}" localisation` ← **highest reply rate, most work**

---

## Body (160–200 words — don't over-write)

**Hi {{firstName}},**

Saw {{courseName}} on your site — really well produced. Noticed you have the Czech version but not SK / PL / HU. Are you looking at those markets, or is it parked because of dubbing cost?

I've spent the past year building **VoiceDub** — an AI dubbing API that takes your existing course and ships it in four CEE languages in **under an hour** and at **one-tenth the cost** of a studio. We use Azure Neural TTS (enterprise SLA 99.9 %) plus a glossary layer for technical terms, so it sounds natural — not robotic.

**Concrete for {{companyName}}:** if you have 50 courses × 20 min, traditional dubbing across 4 languages ≈ **€160 000 and 4 months**. With VoiceDub, **< €12 000 and under 2 weeks**.

Want to try it on one course **for free**? Send me a 30-second source and I'll return the full dub in all 4 languages within 48 hours — judge the output, not the slides.

Just reply "yes, try it".

Best,
**{{mySignature}}**
VoiceDub — [voicedub.ai](https://voicedub.ai) · [30s demo](https://voicedub.ai/demo)

---

## Variables

| Token | Source | Example |
|-------|--------|---------|
| `{{firstName}}` | LinkedIn | "Peter" |
| `{{companyName}}` | website | "Skillmea" |
| `{{courseName}}` | their catalog — **must be a real course title** | "Cybersecurity Essentials 2026" |
| `{{mySignature}}` | your name + role + phone | "Leoš Hradek, CEO · +420 ..." |

## Hard NO-GOs

- ❌ `Dear Mr./Mrs.` — reads as spam template, instant delete
- ❌ empty `{{courseName}}` — kills trust, reply rate drops to < 2 %
- ❌ attaching a case-study PDF in first email — bumps spam score, reply rate −30 %
- ❌ blasting all 3 subject lines in one batch — pick ONE per tier
- ❌ sending from gmail without SPF/DKIM — use `@voicedub.ai` w/ custom domain auth

## Follow-up (same thread, if no reply in 5 days)

**Subject:** `Re: {{original subject}}`

> Hi {{firstName}},
>
> Quick bump — the free demo offer stands. If it's off-topic for you, just reply "no" and I'll stop. Thanks.
>
> {{mySignature}}

**The shortest possible follow-up (18 words) gets > 25 % reply rate — because it doesn't create cognitive load.**

## Compliance

- GDPR: B2B cold email is legitimate interest (Art. 6(1)(f) GDPR) **if** the product is relevant B2B and sent to a **work email** (not gmail/hotmail).
- Unsubscribe link is not required, but ❝`If off-topic, reply "no" and I'll stop.`❞ is a valid opt-out.
- EU AI Act Art. 50 (effective Aug 2026): Every VoiceDub output carries a disclosure tag (ID3 `VoiceDub-Generated: true`). Mention this in T3 follow-up to reduce legal friction.
- UK recipients: UK GDPR + PECR — same rules as EU GDPR for B2B soft opt-in.
