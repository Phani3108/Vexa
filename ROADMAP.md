# Vexa — Launch Roadmap (SME pivot)

**Positioning:** *The AI receptionist that turns missed calls into booked jobs.*
Small businesses miss a large share of their inbound calls, and most callers who reach voicemail call a competitor instead. Vexa answers every call, captures the lead, and puts it in an inbox.

**Wedge:** Start with home services (plumbing, HVAC, electrical). These businesses take a high volume of calls, each job is worth a lot, owners are on job sites and can't answer, and emergencies justify the "transfer to me" feature. Expand to clinics, salons and professional services using the industry templates that are already built.

## What shipped in this pass

| Area | Before | Now |
|---|---|---|
| Auth | Any phone number got a JWT. Dev mode let anyone act as any user. | SMS one-time code (Twilio Verify / SMS), hashed and TTL'd. Refresh tokens rejected as access tokens. |
| Voice API | `/voice/outbound-call`, `takeover`, `end-call` were public (toll fraud). | JWT required, and the call must belong to the caller's account. Twilio signature validation. |
| Realtime | Any socket could `join:user` any room and read live transcripts. | Socket.io JWT handshake; the server assigns the room. |
| Data | `PUT /config` mass-assignment (could steal another account's Twilio number). | Whitelisted fields, plus a unique `twilioNumber` index. |
| Matching | Empty or anonymous caller ID matched every VIP and emergency contact. | Last-10-digit match with a 7-digit minimum. |
| Product | Personal call screener with no UI beyond the mobile app. | Business mode with industry templates, FAQs and hours, after-hours handling, lead capture, follow-up inbox, KPIs, in-browser test calls, and a web dashboard. |
| Ops | Needed MongoDB Atlas + Azure to boot. | Zero-config dev (embedded Mongo, offline AI). Supports OpenAI or Azure. Dockerfile + compose. |

## Shipped in pass 2: flow engine and phone app

- Deterministic multi-turn **flow engine** (`backend/src/workflows/`) used by both real calls and test calls. On real calls the engine decides each reply and the realtime model only speaks it (`create_response: false`), so behavior is predictable and cheap.
- 14 built-in flows (8 business, 6 personal) and a visual **flow editor** with server-side validation.
- **Copilot** whispers, **Ask Vexa**, **Shields**, **spam risk score**, **notes for the next call**, **always-transfer** callers, **booking approvals**, **smart SMS replies**, **daily brief**.
- **Phone-first PWA** with device frame on desktop, browser speech for voice test calls, and an installable manifest and service worker.
- 27 backend tests: engine conversations, extractors, Ask Vexa grammar, priority time and hours.

## Phase 1 — Private beta (next 2–4 weeks)

```mermaid
flowchart LR
  A[Sign up OTP] --> B[Onboarding: industry template]
  B --> C[Test call in browser]
  C --> D[Provision number<br/>Twilio API]
  D --> E[Forward business line]
  E --> F[Live calls → Inbox]
  F --> G[Weekly ROI email]
```

- [ ] **Self-serve number provisioning.** Buy a local Twilio number per account during onboarding and set its webhook through the API. Today one shared number is assigned to the first account.
- [ ] **Billing.** Stripe subscriptions with metered minutes (for example, $49/mo for 100 calls, $149/mo for 400). Enforce a hard cap on call duration (`TODO.md` §9).
- [ ] **SMS follow-up to the caller.** After the call, text "Thanks for calling Bright Plumbing — we'll call you tomorrow morning", with the booking link.
- [ ] **Owner notifications.** Email or SMS for each lead, in addition to push. Many SME owners won't install an app.
- [ ] **Teams.** Separate the account from the user: add an `Account` with `members[]` and roles (owner, staff). Today `userId` is the owner's phone.
- [ ] **Observability.** Sentry, per-call latency (time to first word), cost per call.

## Phase 2 — Retention and differentiation

- [ ] **Calendar booking.** Integrate Google Calendar and Calendly so the AI books real slots instead of "the team will confirm".
- [ ] **CRM and job tools.** Push leads to HubSpot, Jobber, ServiceTitan, Housecall Pro and Zapier.
- [ ] **Spam risk scoring before answering.** Use `TODO.md` §5: number reputation, call frequency, Twilio Lookup and CNAM.
- [ ] **Call recordings with consent notice.** Recording laws differ by state (two-party consent); this is a legal requirement.
- [ ] **Multi-location.** Several numbers per account, each with its own hours.
- [ ] **Languages.** Spanish first for the US market. The multilingual prompt rules are already in place.

## Phase 3 — Scale

- [ ] **Telephony abstraction layer.** Support Twilio, Telnyx and SIP. Add India DIDs (the original market).
- [ ] **Horizontal scaling.** Move active-call state from in-memory to Redis, use a sticky WebSocket load balancer, and use the Socket.io Redis adapter.
- [ ] **Compliance.** SOC 2 groundwork, data retention controls, and a DPA template. Add a HIPAA-eligible tier before selling to clinics.

## Known gaps (honest list)

- Active calls live in process memory. A restart drops live calls, and you cannot run more than one instance yet.
- The voice path has not been exercised end-to-end in this pass because no Twilio or OpenAI credentials are available here. The prompt, analyzer and simulator are covered by tests and the browser preview.
- The flow-driven voice path (VoiceAgent `_flowTurn`, `/voice/whisper`) is code-complete but has not been run against live Twilio and OpenAI. Test latency (transcription → engine → speech) before beta.
- The React Native app in `mobile/` uses the same backend contract but doesn't have the new features (flows, Copilot, Ask Vexa). Recommendation: wrap the PWA with Capacitor for the App Store and Play Store instead of maintaining two UIs. Keep React Native only if native call screening (CallKit or Android Call Screening) becomes the wedge.
- The in-memory rate limiter and simulator sessions are per-process. Move them to Redis with the scaling work.

## Success metrics for beta

| Metric | Target |
|---|---|
| Onboarding → first test call | > 80% |
| Answered calls with a captured lead or resolution | > 70% |
| Spam calls ended in < 15s | > 90% |
| Weekly active owners (open inbox ≥ 1×/wk) | > 60% |
| Paid conversion after 14-day trial | > 25% |
