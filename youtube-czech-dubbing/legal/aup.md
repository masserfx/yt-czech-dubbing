# VoiceDub — Acceptable Use Policy (AUP)

**Version 1.0 · účinnost 2026-04-17**

Tato AUP doplňuje [Terms of Service](./tos.md) a definuje, jaké použití VoiceDub API / Chrome extension je **zakázáno**. Porušení AUP je důvodem k okamžitému ukončení služby bez nároku na refund per čl. 5 smlouvy.

## 1. Obecné zásady

Service Provider (dále "VoiceDub") poskytuje AI-driven překlad a syntézu řeči. Customer je zodpovědný za:

- legalitu sources (nesmí uploadovat obsah, ke kterému nemá práva)
- pravdivost výstupů (VoiceDub negarantuje přesnost překladu v medicínských / právních / finančních kontextech)
- dodržování EU AI Act čl. 50 — povinná disclosure u AI-generated contentu (VoiceDub to dělá automaticky, viz § 7)

## 2. Zakázané kategorie obsahu

Výstup VoiceDub NESMÍ být použit pro:

### 2.1 Deepfake osobní identity
- Syntéza hlasu reálné osoby bez jejího písemného souhlasu (inkl. celebrit, politiků, ředitelů firem)
- Imitace hlasu zemřelé osoby bez souhlasu pozůstalých (estate rights)
- **Výjimka:** edukativní / umělecké užití s jasným disclosurem a právním titulem

### 2.2 Politická manipulace
- Mikrotargetovaná politická reklama před volbami (72 hodin před volebním dnem v EU)
- Falešné prohlášení kandidátů, úředníků, státních institucí
- Kampaně financované státy, které jsou na EU sanction listu

### 2.3 Zdravotnická tvrzení
- AI-generated diagnózy, léčebné postupy, medikace ("tohle ti pomůže na X")
- Health misinformation o vakcínách, pandemiích, léčivech
- **Výjimka:** licencovaný healthcare provider s medical review sign-off přímo v contractu

### 2.4 Finanční poradenství
- AI-generated investment advice bez licence (MiFID II v EU)
- Scam kampaně (phishing, investment fraud, crypto pump-and-dump)

### 2.5 Obsah pro nezletilé
- Jakýkoliv CSAM (child sexual abuse material) — okamžité forwarding na NCMEC + národní policii
- Grooming / predatory content cílený na děti

### 2.6 Násilí a nenávist
- Incitement k násilí nebo genocidě
- Hate speech proti chráněným skupinám (EU Framework Decision 2008/913/JHA)

### 2.7 Komerční podvody
- Robocalls a scam hovory (FTC / BEREC enforcement)
- Falešné zákaznické recenze, ghost reviews
- Copyright infringement (dabing filmů / hudby bez licence)

## 3. Důsledky porušení

| Závažnost | Akce |
|-----------|------|
| 1. zjištění, low-risk | Warning email, 7 dní na nápravu |
| 2. zjištění nebo high-risk | Pozastavení účtu, audit logs, požadavek na remedy plan |
| CSAM, deepfake politika, terrorism | **Okamžité ukončení + reporting** na národní orgány |

Žádný refund při ukončení z důvodu AUP violation.

## 4. Reporting mechanism

Podezření na zneužití: [abuse@voicedub.ai](mailto:abuse@voicedub.ai) — response do 24 hodin, anonymně akceptováno.

Pro emergency (CSAM, active harm): použijte také formulář [report.voicedub.ai/emergency](https://report.voicedub.ai/emergency).

## 5. Technické ochrany (layered defense)

- **Input screening:** source URLs jsou hashovány a zkontrolovány proti známým deepfake signatures
- **Output watermark:** každé audio má 0.5s disclosure chime (CS/SK/PL/HU/EN lokalizovaný)
- **Metadata tag:** ID3 `VoiceDub-Generated: true` + `VoiceDub-TenantID: <hash>` pro forensic trace
- **Voice cloning restriction:** v0.1 API NEpodporuje custom voice cloning — pouze preset Azure Neural voices; tím default eliminujeme významnou část deepfake risk

## 6. Tenant responsibility (DPA linkage)

Per [DPA](./dpa.md) čl. 6, Customer je data controller a přebírá odpovědnost za legality submitted sources. VoiceDub je processor a nezíská práva k customer content kromě nezbytných pro service delivery.

## 7. AI Act čl. 50 compliance

Accessibility-friendly disclosure (audible + metadata + optional visual chip) je default pro všechny tiers. Enterprise tier může disable audio disclosure **pouze** po podepsání [AI-Content Disclosure Undertaking](./undertaking.md), ve kterém Customer přebírá plnou odpovědnost za disclosure na vlastní distribution channel.

## 8. Updates AUP

Verze a changelog: [voicedub.ai/legal/aup/changelog](https://voicedub.ai/legal/aup/changelog).
Materiální změny oznamujeme emailem 30 dní předem. Enterprise tier má právo opt-out během 30-day notice window (pro-rated refund).

---

*VoiceDub s.r.o. · IČO TBD · sídlo TBD · [voicedub.ai](https://voicedub.ai)*
