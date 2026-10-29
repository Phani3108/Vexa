# 📞 Vexa — AI Receptionist for People and Small Businesses

Vexa answers your phone when you can't. It follows **multi-turn call flows** (quote, booking, emergency, delivery and others), understands callers in one sentence, answers their questions mid-call, and only interrupts you when it matters.

It works in two modes:
- **Personal**: screens unknown callers, handles deliveries, shuts down spam, and protects your focus time.
- **Business**: a receptionist that captures leads, takes booking requests, escalates emergencies and texts confirmations.

## Guardrails and evals

### Guardrails

| Guardrail | What it prevents | Where it is enforced | Default and flag |
|---|---|---|---|
| Login and tokens | Account takeover, code guessing | `otpService.js`, `middleware/auth.js` | Hashed codes, 10 min, 5 tries; JWT 7 d / 30 d; production requires `JWT_SECRET` |
| Rate limits | Abuse and runaway cost | `app.js`, `routes/auth.js`, `simulator.js`, `assistant.js` | API 600/15 min; codes 5/15 min; test calls 40/min; commands 30/min; outbound calls 10/min (in memory) |
| Owner isolation | One owner seeing another's calls | Every query scoped by `req.userId`; `ownedCall()` for live calls | On |
| Twilio signature | Forged call webhooks | `routes/voice.js` `twilioWebhook` | On in production; `TWILIO_VALIDATE_SIGNATURE` |
| Call audio stream token | A stranger opening a call's audio socket and driving the AI | `lib/streamToken.js`, `VoiceAgent.handleMediaStream` | On (single-use, 2-minute, bound to the call id); socket closed if no valid start within 5 s; `STREAM_AUTH=off` ignored in production |
| Spam screening | Robocalls and spoofing reaching the owner | `workflows/risk.js`, `routes/voice.js` | Risk 0–100; blocked numbers rejected; aggressive shield rejects ≥ 80 |
| Flow validation | Broken, looping or dead-end flows | `workflows/validate.js` | Known steps only, valid targets, end step required, `maxTurns` 2–20 |
| Engine limits | Endless calls | `workflows/engine.js` | 10 turns, 2 re-asks, 50-step loop guard; partial message saved |
| Emergency override | Missing a real emergency | `engine.js` emergency switch, `callSession.js` urgent alert | Escalation words + model flag; owner alerted mid-call |
| Who gets through | Interruptions the owner didn't want | `engine.js` `transfer_allowed` | VIP / always-transfer / emergency; never in Focus; business hours |
| Human approval | AI committing the owner | `outcomes.js`, `PATCH /api/bookings/:id` | Bookings are requests until the owner confirms |
| Grounded answers | Made-up prices, hours or directions | `nlu.js`, `callSession.js` directions prompt, `PromptGenerator.js` | "Answer ONLY from" business info; catalog for prices |
| Prompt-injection sanitizer | Owner or caller text taking over prompts | `PromptGenerator._sanitize` | Strips "ignore previous instructions", "system prompt" and similar |
| Model failure fallbacks | A slow or refusing model stalling a call | `nlu.js`, `translate.js`, `claude.js`, `ConversationAnalyzer.js` | Hard timeouts; offline rules; English; keyword analysis; refusal fallback (`ANTHROPIC_FALLBACKS`) |
| Transcript filters | Acting on noise or echoes | `VoiceAgent.js` transcript handler | Noise, echo, URL, gibberish, post-interruption fragments dropped; backchannels ignored |
| Recording consent and retention | Recording without notice; keeping audio forever | `callSession.js`, `media.js` | Notice on; 90 days; per-call delete; 15-minute signed links |
| Dev-only routes | Demo data in production | `users.js`, `media.js` | Off in production unless `ENABLE_DEMO_DATA=true` |
| Secrets | Keys leaking through the repo or logs | `backend/.env` (git-ignored), `.dockerignore`, `lib/redact.js` | Only `.env.example` is tracked; every log line scrubbed of API keys and bearer tokens |
| Test-call isolation | Rehearsals polluting real data | `simulatorService.js`, `callHistoryService.js`, `outcomes.js` | No caller memory, no real SMS |
| Scam shield | Fraud scripts (digital arrest, fake courier, KYC/SIM block, impostor relative, prize) and OTP/PIN/remote-app requests reaching the owner or getting answers | `workflows/scam.js`, `engine.js` step 0, `callSession.js` alert | On for every account; skipped for VIPs and always-transfer callers; delivery OTPs at the door allowed |
| Pack refusal rules | Medical advice, allergen promises, fixed quotes, mark guarantees, treatment-safety calls, religion/caste/diet property filters | `packs/*.js` `guardrails.refuse`, `engine.js` `refusalFor`, model `restricted` label | On when the pack is installed |
| Record privacy | Order, report or fee status told to the wrong person | `engine.js` `lookupRecord` | Shared only when the caller's phone (or name, if the record has no phone) matches |
| Payment link limit | The AI asking for large payments on its own | `outcomes.js` `pay_link` | Above `payLinkAutoLimit` (₹5,000 default) the link waits for owner approval; simulated on test calls |

### Evals and quality gates

| Eval | What it measures | When it runs | Threshold | Status |
|---|---|---|---|---|
| Indian-language understanding set (`backend/eval/nlu`) | Language, code-mixing, facts, yes/no, phone numbers across 8 languages (161 cases) | Every change in CI (offline, `--min 0.97`); `-- --mode claude` on demand | ≥ 97% offline (CI gate); ≥ 90% mixed-language target | Live · offline 99%, Claude 100% (157-case run) |
| Held-out set (`holdout.jsonl`) | Same, 50 new phrasings never tuned against | Every change in CI (`--min 0.95`) | Should track the main set | Live · offline 98%, Claude 100% |
| Pack + scam eval (`backend/eval/packs`) | 45 scripted calls across 7 packs (flow, outcome, actions, refusals, what must never be said) and 26 scam scripts plus lookalike genuine calls (precision, recall, leaks) | Every change in CI (offline, `--min 1`); `-- --mode claude` on demand | 100% and zero leaks (CI gate) | Live · offline 71/71, scam precision 1.0, recall 1.0, 0 leaks |
| Backend unit tests | Flows, extractors, emergency, shields, Focus, sanitizer, recorder, Indian numbers/dates/yes-no, stream-token and log-redaction security, packs, orders, records, listings, refusals, scam shield, UPI links | `npm test` before release | All pass | Live · 62 tests passing, run in CI |
| Mobile tests | App render, API client, transcript store | `jest` in `mobile/` | All pass | Partial · 9 tests |
| Web app checks | Type safety and build | `tsc -b && vite build`, `oxlint` | No errors | Partial · no unit tests |
| Runtime quality signals | Model used per turn, latency, tokens and cost by purpose, questions asked/skipped, risk, action status | Every call (saved on the call) | — | Live |
| Per-flow stats | Runs, completed, transferred, average turns and questions (30 days) | `GET /api/workflows` | — | Live |
| Speech eval on real Indian voices | Word error rate, language detection, facts from audio, reply latency | Planned (Phase 1B/1C) | ≥ 95% facts clean, ≥ 90% noisy, ≤ 1.5 s p95 | Planned |
| CI pipeline | Backend tests, understanding gate, web lint and build, Docker build, dependency audit | GitHub Actions on every push and pull request (`.github/workflows/ci.yml`) | All jobs green | Live |

---

## Vexa — end-to-end workflow

How an owner sets Vexa up, how every call is answered, understood and acted on, and what happens after it ends. Each box names the exact code path, model, API or data store involved; numbered badges match the step-by-step walkthrough below.

![Vexa — end-to-end workflow](workflow.png)

<sub>Source of truth: Phani3108/Vexa, branch wave1 (commit 3568e5d, 29 Oct 2026) · Full readout with every table: [readout.html](readout.html) (open locally or download).</sub>

| | |
|---|---|
| **Scope** | UC1 Set up the assistant · UC2 Answer a call (live phone calls and in-app test calls) · UC3 After the call. Personal and Business modes share the same pipeline. · Wave 1: seven business packs and the scam shield (in-app test calls) |
| **Source of truth** | github.com/Phani3108/Vexa · branch `wave1` · commit `3568e5d` · 29 Oct 2026 · backend/src, web/src, backend/.env.example, Dockerfile, docker-compose.yml, .github/workflows, backend/test, backend/eval |
| **Planned items** | From ROADMAP.md (India-first plan): Indian speech engines and voices, Indian phone number, WhatsApp, UPI, calendar and CRM. Drawn as Not integrated. |
| **Live status** | Text understanding, flows, analysis, translation and the app run end to end today. The live phone path (Twilio + OpenAI Realtime) is complete in code but has not been run on a real call: no Twilio or OpenAI keys are configured. |
| **Prepared by** | Phani Marupaka with Claude Code · 29 Oct 2026 |

### The flow, step by step

_Numbers match the badges in the diagram._

**UC1 · Sign in**

1. The owner opens the Vexa app (installable web app, or the mobile app) and enters a phone number. The app calls `POST /api/auth/otp/request`, then `POST /api/auth/otp/verify` with the 6-digit code.
2. The server stores only a hash of the code, accepts it for 10 minutes and allows 5 tries. A correct code returns a 7-day access token and a 30-day refresh token. The first login creates the account.
3. The code is sent by Twilio Verify, or as a plain Twilio SMS. In development no SMS is sent and the code is shown on screen.
4. Codes and accounts live in MongoDB. Expired codes delete themselves.
5. Rate limits stop code guessing and SMS abuse, and production will not start with a weak signing secret.

**UC1 · Configure flows, business and languages**

6. The owner picks Personal or Business, an industry template, opening hours, a product catalog with stock and prices, FAQs, VIP contacts, the greeting language and recording settings.
7. Vexa ships 17 ready-made call flows. Owners can edit them step by step; every edit is checked before it is saved, so a flow can't loop or dead-end.
8. Owners can also just say what they want ("I'm busy until 7 pm", "block that number"). Claude turns that into actions; a rule-based parser takes over if Claude is unavailable.
9. Settings, the catalog, shields and notes for specific callers are stored in MongoDB.
10. Only approved fields can be edited, commands are rate-limited and capped, and the built-in safety flows can't be removed.
50. A business can install a ready-made pack for its trade. Its flows replace the generic ones and a sample business can be loaded to try it at once (`POST /api/packs/:id/install`).

**UC2 · Ring and screen**

11. A caller dials the owner. The owner's carrier forwards the call to the Vexa Twilio number. Owners can rehearse the same pipeline with an in-app test call.
12. Before answering, Vexa finds the owner, recalls the caller, checks VIPs, Focus and business hours, and scores spam risk. Blocked or very risky callers are rejected before any AI cost. Twilio is told to stream the audio to Vexa.
13. The OpenAI Realtime voice speaks the greeting written by the flow engine, including the recording notice.
14. Twilio sends call events to Vexa's webhooks and streams the audio in both directions over a WebSocket.
15. Caller history is read: their name, what past calls were about, any note the owner left for them, and whether they are usually spam.
16. Twilio signatures are verified in production, and the call's audio stream is only accepted with a single-use token signed for that exact call. The risk score and the owner's shield decide how strict to be.

**UC2 · Listen and understand**

17. The owner can watch the call live: the transcript, the facts Vexa has captured and the caller's language.
18. Each caller sentence is cleaned (noise, echoes and false starts are dropped) and processed in order, one turn at a time.
19. OpenAI turns the caller's speech into text. On flow calls the voice model never answers on its own; the flow engine decides every reply.
20. Claude reads each sentence and returns structured facts in English: which flow, names, dates, quantities, any question, an emergency, the language and an English translation. It has 5 seconds.
21. The live call's state is kept in server memory and is lost if the server restarts.
22. If Claude is slow or down, built-in rules understand Indian numbers, dates, yes/no and phone numbers in eight languages, so the call keeps going.
23. This understanding is measured on 211 test sentences in eight languages, including 50 held back from tuning.
51. Every sentence is first checked by the scam shield. A fraud script or a request for an OTP, PIN or screen-sharing app ends the call at once; nothing about the owner is shared, the owner is alerted and the phrases are saved as evidence.

**UC2 · Decide and reply**

24. The caller hears the answer in the language they are using right now, even when they switch mid-call.
25. The flow engine, not the model, decides what happens next: switch to emergency, confirm, answer a side question, look up stock and price, transfer or end. Several facts can be captured from one sentence.
26. For deliveries, Claude writes directions to the owner's home from the courier's location, using only the saved address and gate notes.
27. The voice speaks the engine's line in the caller's language, mixing in English the way the caller does.
28. On test calls, Claude translates the reply in text; on live calls the voice does it, which saves a request.
29. Prices, stock, hours, address and FAQs come from the owner's profile, so Vexa never guesses a number.
30. Calls are capped at 10 turns, unanswered questions end in a message for the owner, and answers are limited to the owner's own business information.
52. Pack flows take orders item by item with an exact total, tell callers their order, report or fee status (only to the phone number on the record), and match property listings.
53. Pack refusal rules stop Vexa giving medical advice, allergen promises, fixed quotes, guaranteed marks or discriminatory property filters; it refuses politely and carries on.

**UC2 · Hand off or steer**

31. When a call needs the owner, their app asks "pick up, or let Vexa handle it?". During any call the owner can send Vexa a note, ask it to collect an email, transfer or end the call.
32. Clear rules decide who gets through: VIPs and chosen callers, emergencies, nobody during Focus, and business calls only during opening hours.
33. To transfer, Twilio moves the caller into a conference and calls the owner with a short spoken summary first.
34. Push notifications go to the owner's phone through Firebase, when it is configured.
35. All live updates reach the owner's app over an authenticated Socket.io connection.
36. Emergencies always override other settings and alert the owner while the call is still going.

**UC3 · Save and analyse**

37. When the call ends, Vexa builds a transcript with every line as spoken plus English, saves the outcome, updates what it knows about the caller and records the exact AI cost.
38. Claude summarises the call: category, summary, urgency, whether it is a lead or spam.
39. Claude translates the transcript into English and writes the summary in the caller's language too.
40. Everything is saved in MongoDB as the call history that future calls draw on.
41. The recording is saved as a stereo audio file (on a persistent volume in Docker) and deleted automatically after the owner's retention period.
42. Every call carries quality signals: whether the model was used each turn, latency, tokens and cost by purpose, and how many questions were skipped.

**UC3 · Act and follow up**

43. The owner reads the call in English and the caller's language, listens to the recording, approves bookings and sends a reply.
44. Each outcome (inbox, booking request, text, alert, spam tag) is recorded with whether it was done, simulated or skipped.
45. The owner can read any call in any of the eight languages; the translation is saved, so it is paid for once.
46. Confirmation texts and replies go out by Twilio SMS. Test calls only simulate them.
47. Calendar booking, CRM sync, WhatsApp and UPI payment links are planned, not built.
48. A person approves every booking, and recordings can only be played through short-lived links.
49. Every change runs 47 backend tests, the understanding test gate, the web build and the Docker build in CI; 9 mobile tests also exist.
54. For orders, Vexa texts a UPI payment link for the exact total; above the owner's limit the link waits for approval.
55. Every change runs 71 scripted pack and scam calls in CI; any failure or leak blocks the release.

<details><summary><b>Data and history calls</b></summary>

What Vexa reads and writes about past calls, callers and the owner, and what is lost or not integrated.

| Source | Read or written | When | Notes |
|---|---|---|---|
| Caller memory (`Caller`, last 5 calls by number, last 5 in category) | Read | Start of every call (`getCallerContext`) | Name, running summary (600 chars), notes to deliver, always-transfer, spam and short-call counts. Test calls excluded. |
| Caller memory update | Written | End of every real call (`_updateCallerProfile`) | Appends to the summary; one-time notes are removed once delivered. Test calls never write. |
| Owner config (`UserConfig`) | Read | Every call and turn | Business profile, catalog, hours, FAQs, VIPs, blocked numbers, shield, Focus times, recording settings, flows. |
| Call record (`Call`) | Written | End of call (`saveCall`) | Transcript as spoken + English, analysis, local-language summary, flow run, languages, AI usage, recording metadata, follow-up status. |
| Bookings (`Booking`) | Written / updated | Booking flow; owner approval | Status requested → confirmed / declined; customer is texted. |
| Recordings (disk) | Written / read / deleted | Live calls; playback; every 6 h sweep | Stereo WAV in `RECORDINGS_DIR`, signed 15-minute playback links, retention default 90 days. |
| Translations cache (`Call.translations`) | Written / read | "Read in…" on call detail | Saved per language so repeat views cost nothing. |
| Active calls, test sessions, translation cache, rate-limit counters | In memory | During calls | Lost on restart; a single server instance only (no Redis store). |
| Redis (`config/redis.js`) | Not used | — | Client defined but never imported. |
| Calendar, CRM, WhatsApp, UPI, Indian telephony | Not integrated | — | Planned in ROADMAP.md. |
| Pack data (`UserConfig.businessProfile`: catalog, records, listings, UPI ID; `packs`) | Read / written | Pack install; every pack call | Records are answered only to the phone number on them; sample data is optional. |
| Scam evidence (`Call.analysis.scam`) | Written | Scam call ends | Type, label and the caller's phrases; call tagged spam, category "Scam blocked". |

</details>

<details><summary><b>LLM calls</b></summary>

Claude is used for all text intelligence when `ANTHROPIC_API_KEY` is set (OpenAI chat is the fallback provider). OpenAI Realtime handles live speech. Every Claude call is metered per call (tokens, cost, latency).

| Call (function) | Model | When it runs | What it produces | Switch / flag |
|---|---|---|---|---|
| Per-turn understanding · `nlu.understand()` | Claude fast model (`ANTHROPIC_FAST_MODEL`, else `ANTHROPIC_MODEL` = claude-opus-5-5) · low effort · 2,048 tokens | Every caller sentence | Flow, facts in English, answer from business info, emergency, wants a person, goodbye, language, code-mixing, English translation, yes/no, scam label, restricted-request label (pack refusal rules) | `NLU_TIMEOUT_MS` (5 s), `NLU_DISABLED` |
| Reply translation · `translateText()` | Claude fast model · 2,000 tokens | Test calls, greeting, owner notes | Reply in the caller's language and script (mixed if they mix) | Off on live calls (voice translates) |
| Transcript translation · `translateLines()` | Claude main model · 8,000 tokens · 30 s | End of call; "Read in…" | Every line in English (or the chosen language) | — |
| Summary translation · `translateText()` | Claude fast model · 20 s | End of call; "Read in…" | Summary in the caller's language and native script | — |
| Grounded directions · `groundedDirections()` | Claude fast model · 1,500 tokens · 6 s | Delivery flow, once | Directions from the courier's location using only saved facts | Template fallback |
| Post-call analysis · `ConversationAnalyzer.analyze()` | Claude main model · 4,096 tokens · 30 s | End of every call | Category, summary, sentiment, urgency, lead, spam, action items | Keyword fallback |
| Ask Vexa · `assistantService.runCommand()` | Claude main model · 2,048 tokens · 10 s | Owner commands | Up to 5 actions: shield, block, VIP, always-transfer, note, flow on/off, brief | Rule parser fallback |
| Speech to text | OpenAI `gpt-4o-mini-transcribe` (in Realtime) | Live calls | Caller transcript | `OPENAI_API_KEY` |
| Voice (speech in, speech out) | OpenAI Realtime `OPENAI_DEPLOYMENT_NAME` (gpt-realtime-mini) · voice shimmer by default | Live calls | Speaks the engine's lines in the caller's language; free conversation only when no flow is active | `OPENAI_API_KEY`, `OPENAI_ENDPOINT` (Azure) |
| Text fallback provider · `chatCompletion()` | OpenAI `OPENAI_CHAT_DEPLOYMENT` (gpt-4.1-mini) | Only if no Anthropic key | Same JSON outputs as above | `OPENAI_API_KEY` |

</details>

<details><summary><b>Embedding models</b></summary>

| Model | Used for | Where it runs |
|---|---|---|
| None | Vexa uses no embeddings or vector store. Knowledge is the owner's own structured profile, passed to Claude directly. | — |

</details>

<details><summary><b>API calls and integrations</b></summary>

| System | Call | Purpose | Auth |
|---|---|---|---|
| Anthropic | `client.beta.messages.create` (structured JSON output; server-side refusal fallback beta) | All text intelligence above | `ANTHROPIC_API_KEY` |
| OpenAI / Azure OpenAI | WSS `/v1/realtime` (or Azure `/openai/realtime`); `POST /chat/completions` fallback | Live speech; text fallback | `OPENAI_API_KEY` (Bearer or `api-key`) |
| Twilio Voice (inbound) | `POST /voice/incoming-call`, `/voice/call-status`, `/voice/takeover-status`, `/voice/outbound-twiml`; WSS `/voice/media-stream` | Answer, screen, stream audio | Twilio request signature (production) |
| Twilio Voice (outbound) | `calls.create`, `calls(sid).update`, `<Dial><Conference>` | Owner callback, hang up, transfer | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| Twilio SMS / Verify | `messages.create`; `verify.v2.services(…).verifications` | Login codes, booking texts, replies | Same, plus `TWILIO_VERIFY_SERVICE_SID` |
| Firebase Cloud Messaging | `admin.messaging().send` | Push notifications | `FIREBASE_SERVICE_ACCOUNT` (optional) |
| Vexa API (owner app) | `/api/auth/*`, `/api/users/*`, `/api/calls/*`, `/api/workflows/*`, `/api/assistant/*`, `/api/bookings/*`, `/api/simulator/*`, `/media/recordings/:token` | Everything the app does | JWT bearer; recording via signed link |
| Socket.io | Events `call:transcript`, `call:language`, `call:handoff`, `call:urgent`, `call:analyzed`, `booking:requested` | Live updates to the owner | JWT in handshake |
| UPI deep link (NPCI format) | `upi://pay?pa=…&am=…` sent inside a Twilio SMS | Payment link for an order total | None (no gateway); the owner's UPI ID |

</details>

<details><summary><b>Tech stack</b></summary>

| Layer | Components and versions |
|---|---|
| Backend | Node.js ≥ 20 (22 in Docker), Express 5.2, Mongoose 8.23, Socket.io 4.8, ws 8, helmet 8, express-rate-limit 8, jsonwebtoken 9, winston 3, axios 1 |
| AI | @anthropic-ai/sdk 0.131 (Claude Opus 5.5 by default, optional fast model e.g. Haiku 4.5); OpenAI Realtime (gpt-realtime-mini, gpt-4o-mini-transcribe); OpenAI chat gpt-4.1-mini as fallback |
| Telephony and messaging | twilio 5.12 (Voice, Media Streams, Conference, SMS, Verify); firebase-admin 13.8 (push) |
| Data | MongoDB 7 (Docker) or embedded mongodb-memory-server 11 in development; recordings on local disk |
| Web app | React 19, React Router 7, Vite 8, TypeScript 6, lucide-react, socket.io-client 4.8; installable PWA (manifest + service worker) |
| Mobile app | React Native 0.84, React 19.2, React Navigation 7 (uses the same API) |
| Deploy | Multi-stage Dockerfile (node:22-alpine) serving API + web; docker-compose with mongo:7 |
| Demo and evals | playwright-core 1.63, macOS speech synthesis, Swift AVFoundation encoder; node:test; custom NLU eval runner |

</details>

<details><summary><b>Switches</b></summary>

| Env flag | Effect | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Turns on Claude for all text intelligence | Unset → OpenAI chat, else offline rules |
| `ANTHROPIC_MODEL` | Main model (analysis, translation, commands) | claude-opus-5-5 |
| `ANTHROPIC_FAST_MODEL` | Model for per-turn understanding, reply translation, directions | Same as main |
| `ANTHROPIC_FALLBACKS` | Server-side refusal fallback | On (`off` disables) |
| `NLU_TIMEOUT_MS` / `NLU_DISABLED` | Per-turn model budget / switch the model off | 5000 ms / on |
| `OPENAI_API_KEY`, `OPENAI_ENDPOINT`, `OPENAI_DEPLOYMENT_NAME` | Live voice (Azure if endpoint set) | Unset → live voice off; gpt-realtime-mini |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Live calls, SMS, OTP | Unset → app and test calls only |
| `TWILIO_VERIFY_SERVICE_SID` | OTP via Twilio Verify | Unset → plain SMS |
| `TWILIO_VALIDATE_SIGNATURE` | Force webhook signature checks | On in production |
| `WEBHOOK_URL` | Public base URL for Twilio | http://localhost:3000 |
| `BARGE_IN_MS` | How long a caller must talk over Vexa to interrupt | 600 ms |
| `DEFAULT_COUNTRY_CODE` | Country for 10-digit spoken numbers | +91 |
| `RECORDINGS_DIR` | Where recordings are stored | backend/.data/recordings |
| `FIREBASE_SERVICE_ACCOUNT` | Push notifications | Unset → off |
| `MONGODB_URI` | Database | Embedded in development; required in production |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Token signing and lifetimes | Required in production; 7 d; 30 d |
| `ENABLE_DEMO_DATA` | Demo routes in production | Off |
| `OTP_FORCE_SMS` | Send real codes in development | Off |
| `STREAM_TOKEN_SECRET` | Signs the per-call audio stream token | Derived from `JWT_SECRET` |
| `MIN_APP_VERSION` / `LATEST_APP_VERSION` | Android app forced / suggested update | Unset |

</details>

<details><summary><b>Known gaps (from the code)</b></summary>

- The live phone path (Twilio + OpenAI Realtime) is complete in code but has not run on a real call; no keys are configured.
- Active calls, test sessions and rate-limit counters live in memory: one server instance only, and a restart drops live calls.
- Unused code and dependencies: `config/redis.js`, `pg`, `bcrypt`.
- Per-turn replies take 2–9 s on Opus; a fast model (e.g. Haiku) is recommended for live calls.

</details>

---

## Highlights

| | |
|---|---|
| **Flow engine** | 17 editable playbooks (10 business, 7 personal). One sentence can fill several facts, so Vexa skips questions; it answers side questions and resumes; it switches to Emergency mid-call. The engine decides every step, the model only reads and speaks. |
| **Speaks your caller's language** | English, Hindi, Telugu, Tamil, Malayalam, Marathi, Gujarati, Spanish, with mid-call switching. Understands Hinglish and other languages typed in English letters, lakh/dedh, kal/parso, haan/avunu/illa, and replies the way the caller talks. |
| **Live call and Copilot** | Watch the transcript and captured facts live. Pick up from the handoff prompt, or send Vexa a note, ask for an email, transfer or end the call. |
| **Ask Vexa** | Plain-English commands: "Focus until 7 pm", "Always put Mom straight through", "Tell Dana her parts arrived" (delivered on her next call), "Block that number". |
| **Screening** | Standard, Focus, Spam shield and Silent modes; a spam risk score before the phone rings; VIPs and emergencies can break through. |
| **Outcomes** | Leads in your inbox, booking requests you approve with one tap (the caller is texted), live stock, price and totals from your catalog, urgent alerts during the call. |
| **After the call** | Summary in English and in the caller's language, transcript as spoken with English under each line, "Read in…" any of 8 languages, stereo recording with tap-to-jump. |
| **Business packs** | Seven ready-made receptionists: clinic, salon, restaurant, kirana, home services, coaching, real estate. Exact order totals read back, order/report/fee status (only to the number on the record), listing matches, UPI payment links, and refusal rules per trade (no medical advice, no allergen promises, no discriminatory filters). |
| **Scam shield** | Spots "digital arrest", fake courier, KYC/SIM blocking, impostor relatives, prizes and any OTP/PIN request, in English, Hinglish and Indian languages. Ends the call, shares nothing, alerts you with the evidence and the 1930 helpline. |
| **Cost on every call** | Exact Claude tokens and cost saved with each call: about $0.05 (₹4.34) per call in the demo, on Claude Opus 5.5. |

## Demo

▶ [demo/output/vexa-demo.mp4](demo/output/vexa-demo.mp4) · 18 min · [subtitles](demo/output/vexa-demo.srt) · [cost of each call](demo/output/COSTS.md). Every call in it was handled live by Claude; the voices are synthesized.

- Personal: a courier guided to the door and handed to you for the OTP, a bank loan call negotiated from 14% to 12.5%, Amma told you're free after 7 PM.
- Business: a booking, directions and Sunday hours, stock with price and total.
- Languages: Telugu → Hindi → English in one call, a Hinglish caller, six more languages, then the bilingual transcript, "Read in Gujarati" and the recording.

<details><summary>Rebuild the video</summary>

With the backend running: `node demo/run-scenarios.mjs`, `node demo/attach-recording.mjs`, `node demo/capture-screens.mjs`, `node demo/build-timeline.mjs`, `node demo/make-data.mjs`, `node demo/write-costs.mjs`, `node demo/render-frames.mjs`, then `swift demo/encode.swift demo/build/frames 12 demo/build/audio/mix.wav demo/output/vexa-demo.mp4`.

</details>

## Quick start (local, zero config)

```bash
cd backend && npm install && npm run dev      # API on :3000, embedded MongoDB starts automatically
cd web && npm install && npm run dev          # phone app on :5173
```

1. Open http://localhost:5173 and sign in with any phone number (in development the code is filled in; no SMS is sent).
2. Pick **Just me** or **My business** and finish setup. You land on a **test call**: type or speak as the caller.
3. On **Home**, tap **Load sample calls**, then explore Activity, a call's detail, Flows and Ask Vexa (the centre orb).

- **No AI key:** offline rules detect all 8 languages and pick up names, dates, numbers and yes/no; the engine still runs every flow. Free-form understanding needs Claude.
- **`ANTHROPIC_API_KEY` in `backend/.env`:** Claude handles understanding, translation and post-call analysis. For faster turns, add `ANTHROPIC_FAST_MODEL=claude-haiku-4-5`.
- **One server:** `cd web && npm run build`, then `cd backend && npm start` serves the app at http://localhost:3000.
- **Checks:** `cd backend && npm test && npm run eval:nlu`.

## Going live with real calls

1. In `backend/.env` (see `.env.example`): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (live voice), `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER`, `WEBHOOK_URL`, `MONGODB_URI`, `JWT_SECRET`.
2. Point the Twilio number's voice webhook to `https://YOUR-SERVER/voice/incoming-call`.
3. Forward your phone to the Twilio number. **Me → Phone setup** shows the codes (GSM `*004*<number>#`, Verizon `*71<number>`).
4. Deploy: `JWT_SECRET=$(openssl rand -hex 32) docker compose up --build` (API, web app and MongoDB).

The live phone path is complete in code but has not yet run on a real call: place test calls before onboarding customers.

## Project layout

```
backend/
  src/workflows/    flow engine, templates, extractors, NLU, risk score, outcomes
  src/voice/        live calls: VoiceAgent (Twilio ↔ OpenAI Realtime), prompts, post-call analysis
  src/services/     calls, user config, OTP, test calls, Ask Vexa, Twilio, push
  src/lib/          Claude client, translation, languages, Indian-language rules, recorder, cost ledger
  src/routes/       REST API and Twilio webhooks
  test/             unit tests (npm test)
  eval/nlu/         Indian-language understanding eval (npm run eval:nlu)
web/                React + Vite phone app (installable PWA)
mobile/             React Native client on the same API (predates flows, Copilot and Ask Vexa)
docs/workflow/      CEO workflow readout: workflow.json (source), workflow.png, readout.html
demo/               demo recording pipeline and the video
```

## API reference

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `POST /api/auth/refresh`, `GET /api/auth/me` |
| Account | `GET/PUT /api/users/config`, `POST /api/users/onboarding`, `POST /api/users/mode`, `GET /api/users/templates`, categories, VIPs, blocked numbers, priority time |
| Calls | `GET /api/calls` (`q`, `category`, `followUp`, `leads`, `includeTest`), `GET /api/calls/stats`, `GET /api/calls/callers`, `GET/DELETE /api/calls/:id`, `PATCH /api/calls/:id/follow-up`, `GET /api/calls/:id/reply-draft`, `POST /api/calls/:id/sms` |
| Recording and languages | `GET /api/calls/:id/recording-link` (15-min signed link to `GET /media/recordings/:token`), `DELETE /api/calls/:id/recording`, `POST /api/calls/:id/translate` `{ lang }` |
| Flows | `GET/POST /api/workflows`, `PUT/PATCH/DELETE /api/workflows/:id`, `POST /api/workflows/reset` |
| Ask Vexa and bookings | `GET /api/assistant/brief`, `POST /api/assistant/command`, `PUT /api/assistant/shield`, `GET /api/bookings`, `PATCH /api/bookings/:id` |
| Test calls | `POST /api/simulator/start`, `/:id/message`, `/:id/whisper`, `/:id/end` |
| Mobile context | `POST /api/context/outgoing-call`, `GET/PUT /api/context/caller/:phoneNumber`, `GET/PUT /api/context/user-profile`, `GET /api/context/summary` |
| Voice | Twilio webhooks `POST /voice/incoming-call`, `/voice/call-status` (signature-checked in production); owner actions `POST /voice/takeover`, `/voice/whisper`, `/voice/end-call`, `/voice/outbound-call` |

All routes need `Authorization: Bearer <token>` except sign-in (`/api/auth/otp/*`, `/api/auth/refresh`), `GET /api/meta`, `GET /health`, Twilio webhooks and signed recording links. Socket.io connects with `io(url, { auth: { token } })`.

Plans: [ROADMAP.md](ROADMAP.md).

## License

MIT, as declared in `backend/package.json`.
