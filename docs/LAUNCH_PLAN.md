# Vexa: commercial launch on Android, use-case expansion, 10-year horizon

## Context
- Vexa works end to end in the web app and in test calls:
  - **Personal and Business modes:** 17 call flows, Claude for understanding, 8 languages including Indian mixed-language speech, bilingual transcripts, recording, Ask Vexa, bookings, cost per call.
  - **Proof points:** a CEO workflow readout and an 18-minute demo video.
- It **cannot be sold yet**:
  - Every AI and phone key is a server-wide setting (no per-user keys, no encryption).
  - Only one account can get a phone number.
  - The web app assumes it is served from the same server as the API.
  - The React Native app is stale.
  - There is no billing, quota, tenant model, CI or production hardening.
  - The live phone path has never run on a real call.
- **The goal:**
  - An APK people install, choose **Managed** (works instantly, Vexa pays the AI) or **bring their own keys**, get a Vexa phone number, forward their calls with one tap, and hear Vexa answer a test call within 5 minutes.
  - Then widen what Vexa does for people and businesses so it stays relevant for the next decade.
  - Then rebuild the demo video around it.
- **Decisions made with you:** managed + bring-your-own keys; Vexa provides Indian numbers (bring-your-own telephony optional); Capacitor-wrapped web app + native Kotlin call screener; direct APK beta → Play Store; India first.
- **Hard constraint:** Android apps cannot listen to or speak into phone-call audio (only the system dialer can). So calls must be forwarded to a cloud number Vexa answers. The phone app is the owner's control centre plus an on-phone **call screener** that decides, before the phone rings, which calls ring and which go to Vexa.

```
Caller ─► owner's SIM ─► [Vexa app: Android call-screening role]
                           ├─ contact / VIP → rings normally
                           └─ unknown / spam → rejected → carrier forwards on busy
                                             ─► Vexa number (Exotel, India) ─► Vexa cloud (Mumbai)
                                                  flows · Claude · realtime voice · recording · billing
                                             ─► owner's app: live view, handoff, summary (push)
```

---

## Part A: Commercial launch foundation (phases L0–L8)

Design validated against the code (file:line). Sizes: S ≈ days, M ≈ 1–2 weeks, L ≈ 2–3 weeks.

**Start on day 1 (external lead time):**
- Exotel KYC, Voicebot streaming and a pool of 30 numbers.
- TRAI DLT registration (sender ID and SMS templates).
- Google Play organisation account (D-U-N-S).
- Firebase project.
- AWS Mumbai + MongoDB Atlas Mumbai.
- Razorpay KYC.
- Privacy policy, terms, data-processing agreement, grievance officer.

| Phase | Outcome | Key changes (files) | Size |
|---|---|---|---|
| **L0 Safety baseline + CI** | Known holes closed; one real call proven | Signed, single-use stream token for `/voice/media-stream` (new `lib/streamToken.js`; `voice.js` TwiML `<Parameter>`; `VoiceAgent.handleMediaStream` rejects without it); remove `twilioNumber`/`webhookUrl` from public `/api/meta`; redact keys in logs (`config/logger.js`, strip axios `err.config`); delete unmounted `routes/webhooks.js`; GitHub Actions: tests, `eval:nlu` offline gate (`--min 0.97`), web build, docker; recordings Docker volume; first real Twilio call with `ANTHROPIC_FAST_MODEL=claude-haiku-4-5` | S |
| **L1 Tenancy + key vault** | Every AI/phone call uses *that* account's keys; keys encrypted, never returned | New models `Account` (aiMode managed/byok, plan, onboarding, limits), `Credential` (AES-256-GCM envelope, AWS KMS; `last4` only), `AuditEvent`, `RefreshSession` (revocable tokens); `lib/vault/`, `lib/tenant/providers.js` (`resolveProviders`, fail-closed, BYOK never falls back to Vexa keys); thread providers through the existing ledger in `lib/usage.js` (`newLedger`/`withLedger` already wrap every AI call site in `callSession.js`, `media.js`, `assistant.js`) and on `callContext` for live voice; `claude.js` per-key client cache instead of the singleton (`:30-33`); `llm.js`/`ConversationAnalyzer` context-aware; `routes/account.js` + live key validation (Anthropic 1-token call, OpenAI realtime handshake); migration script | M–L |
| **L2 Phone numbers (India)** | Every user gets a Vexa number; calls routed and verified per account | `services/telephony/` adapter interface (Twilio, **Exotel primary**, Plivo stub); media adapters (Exotel 16-bit PCM ↔ μ-law, add `encodeUlaw` beside `decodeUlaw` in `lib/recorder.js`); `PhoneNumber` model + `numberService` (atomic pool assign, 60-day cooldown on release, bring-your-own Twilio connect); per-account webhook verification by `To` number; `lib/forwarding.js` carrier code table (Jio/Airtel/Vi/BSNL, marked unverified until tested on real SIMs); DLT-only SMS templates (`config/smsTemplates.js`); admin pool/KYC console | L |
| **L3 Android APK** | Signed APK: secure login, push, call screener, one-tap forwarding | Capacitor in `web/` (`capacitor.config.ts`, appId `in.vexa.app`); `VITE_API_URL` + `lib/platform.ts` `API_BASE` (fixes `api.ts:46,66`, `live.tsx:50`, absolute recording URLs from `media.js:32`); Android Keystore token storage; FCM (`lib/push.ts`, channels calls/urgent/summary/system; data-only high-priority live/handoff pushes in `pushNotificationService.js`); Kotlin plugin: `CallScreeningService` (contacts ring, unknown callers rejected → forwarded), carrier detection, dial forwarding codes with `#` intact, contacts picker for VIPs, full-screen "Pick up / Let Vexa handle"; CORS for `https://localhost`; CI builds a signed APK → Firebase App Distribution; retire `mobile/` | L |
| **L4 "Works instantly" onboarding** | Install → hearing Vexa answer in < 5 min, with a clear fix for every failure | New steps: sign in → profile → **Managed or bring-your-own keys** (validated live, "use Managed instead" escape) → get number (business KYC) → one-tap forwarding by detected carrier → enable screener → **loopback test call** (Vexa's test line calls the owner; the screener declines it; carrier forwards; Vexa answers; stages streamed live) → done. Failure states: forwarding inactive, carrier doesn't forward on reject (fall back to "no answer" mode), key error, pool empty. Replaces `Onboarding.tsx` + operator text in `PhoneSetup.tsx` | M |
| **L5a Metering + caps** (before beta) | Cost and usage per call and per account; nothing runs away | Capture OpenAI realtime + transcription usage in `VoiceAgent` (`response.done`); `UsageRecord`/`UsageCounter`; `config/pricing.json`; `quotaService` (plan minutes, daily managed spend cap, concurrent calls, max call length, message-only mode when over, global kill switch); `Usage.tsx` | M |
| **L5b Billing** (after beta) | Paid plans with UPI Autopay | Razorpay Subscriptions; plans: Trial (14 days / 30 min), Personal, Business, Personal-own-keys, Business-own-keys (platform fee + phone minutes); overage as add-ons, capped; idempotent signed webhooks; suspend → message-only after grace; GST invoices. **Check Play's payments policy; fallback is web-only purchase** | M |
| **L6 Production readiness** | Fast, observable, multi-server | **Before beta:** recordings → S3 Mumbai (KMS, presigned links), Sentry (personal data scrubbed), per-turn latency metrics (target first audio ≤ 1.5 s p50 via Haiku, an "offline-first" path when the rules are confident, filler phrase after 1.2 s). **Before Play:** Redis (socket adapter, per-user rate limits, call hand-off between webhook and media servers, active-call registry for owner commands), OpenTelemetry, secrets manager, 2+ instances behind a load balancer, graceful drain, load test of 50 concurrent calls | M–L |
| **L7 Compliance** | DPDP-ready, TRAI-safe | **Before beta:** itemised consent records (service, recording, AI processing); caller notice "recorded and handled by an AI assistant" in the caller's language (can't be turned off in production); export and delete-account (crypto-shred keys, number cooldown, cancel subscription); retention defaults; **outbound AI calls restricted to recent callers / the owner** (TRAI rules on unsolicited calls). **Before Play:** DLT-only SMS, number KYC (no Aadhaar storage), Play data-safety inventory | M |
| **L8 Play Store** | Public listing | Organisation account, Play App Signing, internal → closed → staged production rollout; declarations (call screening, full-screen intent, contacts disclosure), English + Hindi listing, in-app update prompt via `minAppVersion` | S–M |

**Order:** L0 → L1 → (L2 ∥ L3) → L4 → L5a + L6a + L7a → **beta to 20 users** → L5b → L6b → L7b → L8.

**Beta gate (all must hold):**
- 20 users on Jio, Airtel and Vi; on Samsung, Xiaomi and Pixel.
- Forwarding codes verified on real SIMs.
- Loopback test passes for ≥ 90% of installs.
- p50 first audio ≤ 1.5 s.
- No key ever appears in logs.
- Cost per call tracked within 10% of provider dashboards.
- Delete-account works end to end.

---

## Part B: Use cases, organised by the human need

Vexa's job is **"your agent for every call, in and out."** Seven lasting human needs:
1. Protect my attention
2. Protect me from harm
3. Get things done by phone for me
4. Keep relationships warm
5. Never lose what was said
6. Talk across language and ability
7. Earn and serve customers

Each use case is a **flow pack**: flows + prompts + guardrails + evals, following the readout standard. Packs reuse the engine (`workflows/engine.js` step types; new types only where named).

### Wave 1: launch (ships with beta and Play)
| Use case | Need | What Vexa does | New capability | Guardrails | Evals |
|---|---|---|---|---|---|
| Call screening + deliveries + bank/loan + trusted contacts | 1 | Existing flows, now on real phones with the on-device screener | Screener policy sync | Contacts always ring; emergencies break through | Existing 42 tests + NLU set |
| **Scam shield 2.0** ("digital arrest", KYC/OTP fraud, fake courier/customs, impostor relative) | 2 | Detects scam scripts mid-call, never reveals OTP/UPI PIN/Aadhaar, warns the owner, logs the evidence, offers the 1930 cyber-crime helpline | Scam-pattern classifier step; national helpline card | Never confirms or reads out personal data; never transfers to the owner a call flagged as scam | Scam test set (Hinglish/Telugu/Tamil scripts): precision ≥ 0.95, zero sensitive-data leaks |
| **Family guardian** (an adult child protects parents) | 2, 4 | Parent's number is screened by Vexa; the child gets summaries and scam alerts; trusted family always rings | Linked accounts (guardian ↔ dependant), shared alerts | Dependant's consent recorded; guardian sees summaries, not recordings, unless allowed | Linked-account permission tests |
| **Vertical packs**: clinic, salon, restaurant, kirana/hardware, home services, coaching, real estate | 7 | Booking, reschedule, stock and price, directions, lead qualification, site visits, admissions enquiries | Pack installer (industry templates → flows + FAQs + catalog import from CSV/Google Sheets) | Clinics: no medical advice, emergency → "call 108"; prices only from catalog | Per-pack scenario test set (10–20 calls each, scored by an LLM judge + slot checks) |
| **WhatsApp follow-ups + UPI payment links** | 7 | Booking confirmations, location pins, "pay ₹500 advance" links after the call | WhatsApp Business API (template messages), Razorpay payment links action | Templates only; owner approves money requests | Delivery and template-compliance tests |

### Wave 2 (6–12 months)
| Use case | Need | What Vexa does | New capability | Guardrails | Evals |
|---|---|---|---|---|---|
| **Calls on your behalf** ("book Dr Rao Saturday", "cancel my gym", "dispute this Airtel bill", "get 3 plumber quotes") | 3 | Places the call, navigates phone menus, waits on hold, negotiates within your limits, reports back | Outbound agent: dial, keypad tones and menu navigation, hold detection, task brief + spending/commitment limits | Discloses it's an AI assistant; never commits money beyond the limit; only to businesses or numbers you name (TRAI) | Task-success set against simulated businesses (menu trees, hold, refusals): success ≥ 80%, zero over-commitments |
| **Memory and promises** | 5 | "What did the electrician quote?"; tracks promises ("bank will call back Monday") and nudges | Per-account memory (people, promises, quotes) with search; reminder engine | Owner-only; per-caller erasure | Retrieval test set (answer accuracy, no cross-account leaks) |
| **Accessibility mode** (deaf / hard of hearing, speech difficulty, low literacy) | 6 | Live captions; type-to-speak during a call; simple voice-only UI for elders | Owner live typing into the call (whisper path exists); large-text mode | Caller told that text-to-speech is in use | Caption latency and accuracy |
| **Live interpreter** (migrant workers, NRIs, landlords) | 6 | Owner speaks Telugu, caller hears Hindi, both ways | Two-way translation using the existing language layer | Shows the original and the translation | Translation quality set across 8 languages |
| **Teams and shared inbox** | 7 | Route by skill/shift, staff roles, shared follow-ups, calendar booking (Google Calendar) | `Account.members`, roles, calendar connector | Role-based access; audit | Routing tests |
| **Driving / busy mode** | 1 | Android Auto–style summaries, read out on request | Driving-mode trigger | No screen use while driving | — |
| **Order confirmation and reminder calls** (cash-on-delivery confirmation, appointment no-shows) | 7 | Outbound transactional calls to the business's own customers | Campaigns limited to transactional templates | TRAI transactional only, consent, quiet hours | Contact-rate and opt-out handling tests |

### Wave 3+: the 10-year bets (designed for, built when ready)
| Bet | Why it lasts | First step now |
|---|---|---|
| **Agent-to-agent calls**: your Vexa talks to a business's AI over an API, not voice | Most businesses will run AI receptionists; machine-to-machine is faster and exact | Publish a Vexa "callable agent" endpoint (structured request → structured answer) using MCP-style tool descriptions |
| **Your own voice** (consented voice clone) | Callers hear "you"; trust | Consent + watermark policy; Indian TTS voices first |
| **On-device private mode** | On-phone models get capable; privacy laws tighten | Keep NLU behind `structuredJson`, so an on-device model is a new provider |
| **Every channel, one agent**: phone, WhatsApp voice/text, RCS, web chat, smart speakers, earbuds, glasses, cars | Calls are one of many surfaces | Channel adapter interface (the telephony adapter in L2 is the pattern) |
| **Verified identity calls**: CNAP (TRAI's caller-name display), verified business caller IDs, deepfake-voice detection | Voice fraud grows with AI | Store caller-ID verification signals; deepfake-detection eval when vendors mature |
| **Voice commerce**: UPI 123Pay, ONDC orders by voice | India's payments and commerce rails are voice-ready | Payment-link action (Wave 1) as the base |
| **Proactive assistant**: Vexa calls *you* with a daily brief, follow-ups and reminders | Moves from reactive to proactive | Daily brief exists (`assistantService`); add opt-in call delivery |
| **Flow marketplace**: community and partner packs | Long tail of professions and languages | Pack format from Wave 1 = the marketplace unit |

**Prioritisation rule:** pain × frequency × willingness to pay × feasible now. Every new pack ships only with its guardrails table and its eval set passing.

---

## Part C: Speech layer (carried over from the Phase 1 plan, still required)
- Indian speech engines (Sarvam / Google Chirp / Azure) behind a provider switch.
- An audio test set recorded by real speakers.
- Choose per language by measured accuracy and latency.
- Indian voices for replies.

Needed before Wave 2 outbound calls and the live interpreter.

## Part D: Demo video v3 (after Wave 1 is built)
Re-record on **real Android phones and real numbers**, all with live calls:
1. Install the APK → Managed vs own keys (key validated live) → number assigned → one-tap forwarding → loopback test answered by Vexa.
2. On-phone screener: a contact rings normally; an unknown number goes to Vexa.
3. The original scenarios (delivery + OTP handoff, loan negotiation, Amma after 7 pm, business booking / directions / stock), now on real calls.
4. Scam shield: a "digital arrest" call in Hinglish, blocked, with an owner alert and the evidence.
5. Family guardian: a scam call to a parent; the child gets the alert.
6. A clinic vertical pack plus a WhatsApp confirmation with a UPI advance link.
7. Usage and billing screen (minutes, cost per call, plan), the delete-account flow.
8. Closing: Wave 2 and 3 roadmap (calls on your behalf, memory, agent-to-agent).

Costs, latency per turn, guardrails and eval scores shown as in v2.

---

## Verification (per phase)
- **Tests:** unit tests named in each phase (vault tamper/rotation, tenant key isolation with a stub provider proving tenant A's key is used and Vexa's is not, number-pool concurrency, webhook per-account signatures, media PCM↔μ-law round-trip, metering from recorded realtime events, Razorpay webhook signatures, privacy export/delete).
- **Fake-carrier harness:** plays recorded audio into `/voice/media-stream/exotel` with a stub realtime server; runs in CI.
- **Field matrix before beta:** forwarding and reject→forward on Jio, Airtel, Vi × Samsung, Xiaomi, Pixel; loopback test; first-audio latency.
- **Evals:** NLU offline gate in CI; each Wave 1 pack's scenario set and the scam set must pass before release.
- **Workflow readout:** regenerated (`workflow-readout` skill) at each phase end, with README updated, guardrails and evals first.
