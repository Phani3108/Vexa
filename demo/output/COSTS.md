# Vexa demo — what each call cost

Measured from Claude usage on every request (model: **claude-opus-5-5**, $4 / 1M input tokens, $20 / 1M output tokens; thinking is billed as output). Recorded 2 Oct 2026, 9:41 PM IST.

| # | Call | Caller turns | Claude requests | Input tokens | Output tokens | Total tokens | Cost (USD) | Cost (INR @ ₹84) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Delivery executive | 3 | 5 | 7,318 | 744 | 8,062 | $0.0442 | ₹3.71 |
| 2 | Bank loan call | 5 | 6 | 9,355 | 812 | 10,167 | $0.0537 | ₹4.51 |
| 3 | Trusted contact (Amma) | 1 | 2 | 3,525 | 340 | 3,865 | $0.0209 | ₹1.76 |
| 4.a | Appointment booking | 3 | 4 | 6,973 | 602 | 7,575 | $0.0399 | ₹3.35 |
| 4.b | Address & directions | 3 | 4 | 6,978 | 648 | 7,626 | $0.0409 | ₹3.43 |
| 4.c | Stock, price & total | 3 | 4 | 7,001 | 624 | 7,625 | $0.0405 | ₹3.40 |
| 3* | Ask Vexa: "busy until 7 PM" | — | 1 | 1,387 | 260 | 1,647 | $0.0107 | ₹0.90 |
| | **Total** | | **26** | **42,537** | **4,030** | **46,567** | **$0.2507** | **₹21.06** |

## Where the tokens go (per call)

| # | Understanding (per turn) | Directions (generated) | Post-call analysis |
|---|---|---|---|
| 1 | 3× · 4,598 tok · $0.0228 | 1× · 604 tok · $0.0047 | 1× · 2,860 tok · $0.0167 |
| 2 | 5× · 7,354 tok · $0.0365 | — | 1× · 2,813 tok · $0.0172 |
| 3 | 1× · 1,320 tok · $0.0064 | — | 1× · 2,545 tok · $0.0145 |
| 4.a | 3× · 4,783 tok · $0.0235 | — | 1× · 2,792 tok · $0.0165 |
| 4.b | 3× · 4,809 tok · $0.0251 | — | 1× · 2,817 tok · $0.0158 |
| 4.c | 3× · 4,765 tok · $0.0236 | — | 1× · 2,860 tok · $0.0169 |

## Notes

- **Per call: ~$0.02–0.05 (₹1.75–4.50)** at Opus 5.5 list prices. ~85% of tokens are input (the prompt with your flows, business info and the conversation so far).
- **Not included:** telephony (Twilio minutes) and live voice (speech-in/speech-out). This recording used local macOS voices, which are free.
- **Cheapest levers, if you want them:** prompt caching of the stable prompt prefix (most of the input tokens repeat every turn), or running per-turn understanding on Claude Haiku 4.5 and keeping Opus for post-call analysis.
- Development test runs and the screen-capture run used extra tokens on top of the six recorded calls; those are not part of the per-call figures above.
