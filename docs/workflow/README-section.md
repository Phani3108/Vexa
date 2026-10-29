## Guardrails and evals

### Guardrails

| Guardrail | What it prevents | Where it is enforced | Default and flag |
|---|---|---|---|
| Login and tokens | Account takeover, code guessing | `otpService.js`, `middleware/auth.js` | Hashed codes, 10 min, 5 tries; JWT 7 d / 30 d; production requires `JWT_SECRET` |
| Rate limits | Abuse and runaway cost | `app.js`, `routes/auth.js`, `simulator.js`, `assistant.js` | API 600/15 min; codes 5/15 min; test calls 40/min; commands 30/min; outbound calls 10/min (in memory) |
| Owner isolation | One owner seeing another's calls | Every query scoped by `req.userId`; `ownedCall()` for live calls | On |
| Twilio signature | Forged call webhooks | `routes/voice.js` `twilioWebhook` | On in production; `TWILIO_VALIDATE_SIGNATURE`. Media-stream WebSocket not covered (gap) |
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
| Secrets | Keys leaking | `backend/.env` (git-ignored), `.dockerignore` | Only `.env.example` is tracked |
| Test-call isolation | Rehearsals polluting real data | `simulatorService.js`, `callHistoryService.js`, `outcomes.js` | No caller memory, no real SMS |

### Evals and quality gates

| Eval | What it measures | When it runs | Threshold | Status |
|---|---|---|---|---|
| Indian-language understanding set (`backend/eval/nlu`) | Language, code-mixing, facts, yes/no, phone numbers across 8 languages (161 cases) | On demand: `npm run eval:nlu` (offline, free) or `-- --mode claude` | ≥ 90% on mixed-language and English-letter cases (Phase 1 target) | Live · offline 99%, Claude 100% (157-case run) |
| Held-out set (`holdout.jsonl`) | Same, 50 new phrasings never tuned against | Same | Should track the main set | Live · offline 98%, Claude 100% |
| Backend unit tests | Flows, extractors, emergency, shields, Focus, sanitizer, recorder, Indian numbers/dates/yes-no | `npm test` before release | All pass | Live · 42 tests passing |
| Mobile tests | App render, API client, transcript store | `jest` in `mobile/` | All pass | Partial · 9 tests |
| Web app checks | Type safety and build | `tsc -b && vite build`, `oxlint` | No errors | Partial · no unit tests |
| Runtime quality signals | Model used per turn, latency, tokens and cost by purpose, questions asked/skipped, risk, action status | Every call (saved on the call) | — | Live |
| Per-flow stats | Runs, completed, transferred, average turns and questions (30 days) | `GET /api/workflows` | — | Live |
| Speech eval on real Indian voices | Word error rate, language detection, facts from audio, reply latency | Planned (Phase 1B/1C) | ≥ 95% facts clean, ≥ 90% noisy, ≤ 1.5 s p95 | Planned |
| CI pipeline | Tests and evals on every change | — | — | Planned · none configured |

---

## Vexa — end-to-end workflow

How an owner sets Vexa up, how every call is answered, understood and acted on, and what happens after it ends. Each box names the exact code path, model, API or data store involved; numbered badges match the step-by-step walkthrough below.

![Vexa — end-to-end workflow](workflow.png)

<sub>Source of truth: Phani3108/Vexa, branch workflow-readout (commit 0e827a5, 29 Oct 2026) · Full readout with every table: [readout.html](readout.html) (open locally or download).</sub>

| | |
|---|---|
| **Scope** | UC1 Set up the assistant · UC2 Answer a call (live phone calls and in-app test calls) · UC3 After the call. Personal and Business modes share the same pipeline. |
| **Source of truth** | github.com/Phani3108/Vexa · branch `workflow-readout` · commit `0e827a5` · 29 Oct 2026 · backend/src, web/src, backend/.env.example, Dockerfile, docker-compose.yml, backend/test, backend/eval |
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

**UC2 · Ring and screen**

11. A caller dials the owner. The owner's carrier forwards the call to the Vexa Twilio number. Owners can rehearse the same pipeline with an in-app test call.
12. Before answering, Vexa finds the owner, recalls the caller, checks VIPs, Focus and business hours, and scores spam risk. Blocked or very risky callers are rejected before any AI cost. Twilio is told to stream the audio to Vexa.
13. The OpenAI Realtime voice speaks the greeting written by the flow engine, including the recording notice.
14. Twilio sends call events to Vexa's webhooks and streams the audio in both directions over a WebSocket.
15. Caller history is read: their name, what past calls were about, any note the owner left for them, and whether they are usually spam.
16. Twilio signatures are verified in production, the risk score and the owner's shield decide how strict to be. Known gap: the audio WebSocket has no separate auth check.

**UC2 · Listen and understand**

17. The owner can watch the call live: the transcript, the facts Vexa has captured and the caller's language.
18. Each caller sentence is cleaned (noise, echoes and false starts are dropped) and processed in order, one turn at a time.
19. OpenAI turns the caller's speech into text. On flow calls the voice model never answers on its own; the flow engine decides every reply.
20. Claude reads each sentence and returns structured facts in English: which flow, names, dates, quantities, any question, an emergency, the language and an English translation. It has 5 seconds.
21. The live call's state is kept in server memory and is lost if the server restarts.
22. If Claude is slow or down, built-in rules understand Indian numbers, dates, yes/no and phone numbers in eight languages, so the call keeps going.
23. This understanding is measured on 211 test sentences in eight languages, including 50 held back from tuning.

**UC2 · Decide and reply**

24. The caller hears the answer in the language they are using right now, even when they switch mid-call.
25. The flow engine, not the model, decides what happens next: switch to emergency, confirm, answer a side question, look up stock and price, transfer or end. Several facts can be captured from one sentence.
26. For deliveries, Claude writes directions to the owner's home from the courier's location, using only the saved address and gate notes.
27. The voice speaks the engine's line in the caller's language, mixing in English the way the caller does.
28. On test calls, Claude translates the reply in text; on live calls the voice does it, which saves a request.
29. Prices, stock, hours, address and FAQs come from the owner's profile, so Vexa never guesses a number.
30. Calls are capped at 10 turns, unanswered questions end in a message for the owner, and answers are limited to the owner's own business information.

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
41. The recording is saved as a stereo audio file and deleted automatically after the owner's retention period.
42. Every call carries quality signals: whether the model was used each turn, latency, tokens and cost by purpose, and how many questions were skipped.

**UC3 · Act and follow up**

43. The owner reads the call in English and the caller's language, listens to the recording, approves bookings and sends a reply.
44. Each outcome (inbox, booking request, text, alert, spam tag) is recorded with whether it was done, simulated or skipped.
45. The owner can read any call in any of the eight languages; the translation is saved, so it is paid for once.
46. Confirmation texts and replies go out by Twilio SMS. Test calls only simulate them.
47. Calendar booking, CRM sync, WhatsApp and UPI payment links are planned, not built.
48. A person approves every booking, and recordings can only be played through short-lived links.
49. 42 backend tests and 9 mobile tests guard releases today; there is no automatic CI pipeline yet.

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

</details>

<details><summary><b>LLM calls</b></summary>

Claude is used for all text intelligence when `ANTHROPIC_API_KEY` is set (OpenAI chat is the fallback provider). OpenAI Realtime handles live speech. Every Claude call is metered per call (tokens, cost, latency).

| Call (function) | Model | When it runs | What it produces | Switch / flag |
|---|---|---|---|---|
| Per-turn understanding · `nlu.understand()` | Claude fast model (`ANTHROPIC_FAST_MODEL`, else `ANTHROPIC_MODEL` = claude-opus-5-5) · low effort · 2,048 tokens | Every caller sentence | Flow, facts in English, answer from business info, emergency, wants a person, goodbye, language, code-mixing, English translation, yes/no | `NLU_TIMEOUT_MS` (5 s), `NLU_DISABLED` |
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

</details>

<details><summary><b>Known gaps (from the code)</b></summary>

- The live phone path (Twilio + OpenAI Realtime) is complete in code but has not run on a real call; no keys are configured.
- The `/voice/media-stream` WebSocket has no auth check of its own.
- Active calls, test sessions and rate-limit counters live in memory: one server instance only, and a restart drops live calls.
- Recordings are not on a Docker volume, so a container rebuild loses them.
- No CI pipeline; no web unit tests.
- Unused code and dependencies: `routes/webhooks.js` (never mounted), `config/redis.js`, `pg`, `bcrypt`.
- Per-turn replies take 2–9 s on Opus; a fast model (e.g. Haiku) is recommended for live calls.

</details>
