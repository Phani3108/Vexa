# Security

## Reporting a vulnerability
Please report it privately using GitHub's **Report a vulnerability** button: Security tab → Advisories → Report a vulnerability. Please don't open a public issue.

Include:
- what you found,
- how to reproduce it,
- what an attacker could do with it.

We aim to acknowledge reports within 3 working days and to fix confirmed high-severity issues within 14 days.

## Supported versions
Only the latest `main` is supported. There are no maintained release branches yet.

## What protects Vexa today
Each row names the file where the control is enforced. The full table, with defaults and flags, is in the README under **Guardrails**.

| Area | Control |
|---|---|
| Sign-in | Phone codes are hashed and expire in 10 minutes, with 5 tries. Google ID tokens are verified for audience, signature, expiry and verified email. JWTs need a strong `JWT_SECRET` in production (`middleware/auth.js`, `routes/auth.js`) |
| Tenant isolation | Every query is scoped to the signed-in owner. Family guardians see only what the dependant shares (`services/familyService.js`) |
| Public endpoints | Vexa Link, the interpreter guest page and the agent API are rate-limited per IP and capped per account per day. They never expose customer records (`routes/link.js`, `routes/interpreter.js`, `routes/agent.js`) |
| Call audio | A single-use stream token is bound to the call; the socket closes without it (`lib/streamToken.js`). Twilio webhook signatures are checked in production |
| Outbound fetches | The server fetches only Google Sheets CSV exports for imports (`services/importService.js`), plus the configured providers (Anthropic, OpenAI, Twilio, Web Push, Google). It never fetches a URL a user supplies |
| Secrets | `.env` files are git-ignored. Every log line has API keys and bearer tokens scrubbed (`lib/redact.js`). Config responses never include push endpoints or device tokens. `npm run check:deploy` validates production values without printing them |
| AI cost | Each account has a daily AI budget, and the server has a kill switch (`AI_KILL_SWITCH`). Over budget, Vexa falls back to offline rules (`services/quotaService.js`) |
| Fraud | The scam shield ends fraud calls and never shares OTPs, PINs or owner details (`workflows/scam.js`), and is gated in CI by the pack + scam eval with zero leaks |
| Privacy | Owners can export or delete their account and all its data (`services/accountService.js`). Recordings have a retention period and 15-minute signed links |
| Dependencies | CI fails on high or critical `npm audit` findings in production dependencies, for both the backend and the web app |

## Known limits
- Rate-limit counters, live calls, Vexa Link sessions and interpreter rooms are held in memory. Run a single instance until Redis is added (launch phase L6).
- `firebase-admin` 13 pulls in moderate advisories (`uuid`, `google-gax`). Upgrading to 14 is a breaking change and is planned.
- Bring-your-own-key encryption (launch phase L1) is not built yet. All AI calls use the server's key.
