# 📞 Vexa — AI Receptionist for People and Small Businesses

Vexa answers your phone when you can't. It follows **multi-turn call flows** (quote, booking, emergency, delivery and others), understands callers in one sentence, answers their questions mid-call, and only interrupts you when it matters.

It works in two modes:
- **Personal**: screens unknown callers, handles deliveries, shuts down spam, and protects your focus time.
- **Business**: a receptionist that captures leads, takes booking requests, escalates emergencies and texts confirmations.

▶ **Demo video:** [demo/output/vexa-demo.mp4](demo/output/vexa-demo.mp4) (subtitles: [vexa-demo.srt](demo/output/vexa-demo.srt), per-call AI cost: [COSTS.md](demo/output/COSTS.md)). It covers a delivery call with directions and handoff, a loan spam call with negotiation, a trusted-contact call, three business calls (booking, address, stock and price), and a platform tour.

## What makes it different

| Feature | What it does |
|---|---|
| **Flow engine** | Each call type is a playbook of steps: questions, confirmations, if/else branches, actions, transfers. One sentence like "I'm Dana, I need a quote for a water heater tomorrow" fills 4 fields at once, so Vexa skips 3 questions. It answers side questions from your FAQs and then resumes. It switches to the Emergency flow mid-call. A turn cap stops it looping. |
| **Live understanding** | The call screen fills in "Name ✓, Needs ✓, Timing…" while the caller talks. |
| **Copilot** | Steer a live call: "Tell them I'll call back in 10 min", ask for their email, put them through, end politely. |
| **Ask Vexa** | Plain-English commands, typed or spoken: "Tell Dana her parts arrived" (delivered on her next call), "Always put Mom straight through", "Focus for 2 hours", "Block that warranty number", "What did I miss?" |
| **Shields** | Standard, Focus, Spam shield and Silent modes. Each call gets a spam risk score (0–100) before it rings. |
| **Outcomes** | Leads go to your inbox. Booking requests get one-tap approval and a confirmation text. The caller gets an SMS. You get urgent alerts during the call. |
| **8 languages, mid-call switching** | English, Hindi, Telugu, Tamil, Malayalam, Marathi, Gujarati, Spanish. Vexa replies in whatever language the caller is speaking *right now* — Telugu → Hindi → English in one call works. The flow engine stays in English, so playbooks, prices and addresses are written once. |
| **Bilingual transcripts** | Every line is stored as spoken **and** in English; the summary comes in English plus the caller's language. "Read the whole call in…" translates any call into any of the 8 languages on demand (cached). |
| **Call recording** | Phone calls are recorded in stereo (caller left, Vexa right) straight from the media stream — no extra Twilio cost. Tap a transcript line to jump to that moment. Optional "this call may be recorded" notice, auto-delete after 7–365 days, per-call delete. |
| **Phone app** | Installable app (Add to Home Screen) with test calls by voice or text (browser speech). |

```
Caller ─▶ Twilio ─▶ risk score ─▶ Flow engine (English) ◀── NLU: facts + language + English translation
                                     │  says next line ─▶ Realtime voice, in the caller's language ─▶ caller
                                     ├─▶ recorder (stereo WAV) ─▶ signed playback link
                                     ├─▶ live events ─▶ phone app (Copilot, take over)
                                     └─▶ outcomes: lead · booking · SMS · alert · spam tag
```

## Quick start (local, zero config)

```bash
cd backend && npm install && npm run dev      # API on :3000 (embedded MongoDB starts automatically)
cd web && npm install && npm run dev          # Phone app on :5173 (proxies to :3000)
```

Open http://localhost:5173 and sign in with any phone number. In development the login code is filled in and no SMS is sent. Then:

1. Pick **Just me** or **My business** and finish the 3-step setup.
2. You land on a **test call**. Play the caller by typing or using the mic. Try saying everything at once and watch the flow skip questions.
3. On **Home**, tap **Load sample calls**, then explore Activity, a call's detail page, Flows (open one to edit its steps), and the center orb (Ask Vexa).

Without `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`), understanding uses the deterministic offline engine (English; script-based language detection only). With a key, Claude extracts the facts, detects the language and translates, but the engine still decides every step.

Per-turn latency: set `ANTHROPIC_FAST_MODEL=claude-haiku-4-5` to run understanding and translation on Haiku while post-call analysis stays on the main model. Recordings live in `RECORDINGS_DIR` (default `backend/.data/recordings`).

Multilingual demo against a real model: `node demo/run-multilingual.mjs` (needs the server on :3000), then `node demo/attach-recording.mjs` to attach a synthesized stereo recording to that call.

To run a single server instead: `cd web && npm run build`, then `cd backend && npm start`. The API serves the built dashboard at http://localhost:3000.

## Going live with real calls

1. Fill in `backend/.env` (see `.env.example`): `OPENAI_API_KEY`, `TWILIO_*`, `WEBHOOK_URL`, `MONGODB_URI`, `JWT_SECRET`.
2. Point your Twilio number's voice webhook to `https://YOUR-SERVER/voice/incoming-call`.
3. Forward the business line to the Twilio number. The **Phone setup** page lists the carrier codes.

Deploy: `JWT_SECRET=$(openssl rand -hex 32) docker compose up --build` builds a single image with the API and dashboard, plus MongoDB.

## Project layout

```
backend/   Express API, Twilio webhooks, OpenAI Realtime bridge, Socket.io
  src/voice/        VoiceAgent, PromptGenerator, ConversationAnalyzer
  src/services/     calls, user config, OTP, simulator, Twilio, push
  src/config/       Mongo (embedded in dev), industry templates
  test/             node --test unit tests (npm test)
web/       React + Vite phone app (installable PWA; device frame on desktop)
backend/src/workflows/  flow engine, templates, extractors, NLU, risk, outcomes
mobile/    React Native app (owners on the go)
```

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `POST /api/auth/refresh`, `GET /api/auth/me` |
| Account | `GET/PUT /api/users/config`, `POST /api/users/onboarding`, `GET /api/users/templates`, categories, VIPs, blocked numbers, priority time |
| Calls | `GET /api/calls` (filters: `q`, `category`, `followUp`, `leads`, `includeTest`), `GET /api/calls/stats`, `GET /api/calls/callers`, `GET/DELETE /api/calls/:id`, `PATCH /api/calls/:id/follow-up` |
| Flows | `GET/POST /api/workflows`, `PUT/PATCH/DELETE /api/workflows/:id`, `POST /api/workflows/reset` |
| Assistant | `GET /api/assistant/brief`, `POST /api/assistant/command`, `PUT /api/assistant/shield` |
| Bookings | `GET /api/bookings`, `PATCH /api/bookings/:id` (confirm or decline, texts the caller) |
| Test calls | `POST /api/simulator/start` (`flowId` optional), `/:id/message`, `/:id/whisper`, `/:id/end` |
| Recording & languages | `GET /api/calls/:id/recording-link` (15-min signed URL → `GET /media/recordings/:token`, Range supported), `DELETE /api/calls/:id/recording`, `POST /api/calls/:id/translate` `{ lang }` |
| Voice | Twilio webhooks (signature-checked in production) plus owner actions `POST /voice/takeover`, `/voice/whisper`, `/voice/end-call`, `/voice/outbound-call` (JWT) |

Every `/api/*` route and every owner voice action requires `Authorization: Bearer <token>`. Socket.io clients authenticate with `io(url, { auth: { token } })`.

See [ROADMAP.md](ROADMAP.md) for the launch plan.

## License

MIT
