# Vexa demo — what each call cost

Measured from Claude usage on every request (model: **claude-opus-5-5**, $4 / 1M input tokens, $20 / 1M output tokens; thinking is billed as output). Recorded 5 Oct 2026, 4:35 pm IST. INR at ₹84 per $.

| # | Call | Languages | Caller turns | Claude requests | Input tokens | Output tokens | Total tokens | Cost (USD) | Cost (INR) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Delivery executive | English | 3 | 5 | 10,755 | 894 | 11,649 | $0.0609 | ₹5.12 |
| 2 | Bank loan call | English | 5 | 6 | 15,094 | 1,024 | 16,118 | $0.0809 | ₹6.79 |
| 3 | Trusted contact (Amma) | English | 1 | 2 | 4,667 | 384 | 5,051 | $0.0263 | ₹2.21 |
| 4.a | Appointment booking | English | 3 | 4 | 10,413 | 717 | 11,130 | $0.0560 | ₹4.70 |
| 4.b | Address & directions | English | 3 | 4 | 10,420 | 760 | 11,180 | $0.0569 | ₹4.78 |
| 4.c | Stock, price & total | English | 3 | 4 | 10,439 | 743 | 11,182 | $0.0566 | ₹4.76 |
| 6 | Caller switches language | English, Telugu, Hindi | 3 | 7 | 11,745 | 967 | 12,712 | $0.0663 | ₹5.57 |
| 7 | Hinglish caller | English, Hindi | 3 | 8 | 12,323 | 1,051 | 13,374 | $0.0703 | ₹5.91 |
| 8.te | Tenglish | English, Telugu | 1 | 4 | 6,393 | 820 | 7,213 | $0.0420 | ₹3.53 |
| 8.ta | Tamil | English, Tamil | 1 | 4 | 6,394 | 726 | 7,120 | $0.0401 | ₹3.37 |
| 8.ml | Malayalam | English, Malayalam | 1 | 4 | 6,321 | 778 | 7,099 | $0.0408 | ₹3.43 |
| 8.mr | Marathi | English, Marathi | 1 | 4 | 6,303 | 726 | 7,029 | $0.0397 | ₹3.34 |
| 8.gu | Gujarati | English, Gujarati | 1 | 4 | 6,516 | 954 | 7,470 | $0.0451 | ₹3.79 |
| 8.es | Spanish | English, Spanish | 1 | 4 | 6,444 | 796 | 7,240 | $0.0417 | ₹3.50 |
| 3* | Ask Vexa: “busy until 7 PM” | English | — | 1 | 1,387 | 88 | 1,475 | $0.0073 | ₹0.61 |
| 6* | Read call 6 in Gujarati (on demand) | Gujarati | — | 2 | 1,013 | 412 | 1,425 | $0.0123 | ₹1.03 |
| | **Total** | | | **67** | **126,627** | **11,840** | **138,467** | **$0.7433** | **₹62.44** |

## Where the tokens go (per call)

| # | Understanding (per turn) | Translation (replies) | Directions (generated) | Post-call analysis |
|---|---|---|---|---|
| 1 | 3× · 8,182 tok · $0.0395 | — | 1× · 603 tok · $0.0047 | 1× · 2,864 tok · $0.0168 |
| 2 | 5× · 13,305 tok · $0.0637 | — | — | 1× · 2,813 tok · $0.0172 |
| 3 | 1× · 2,518 tok · $0.0120 | — | — | 1× · 2,533 tok · $0.0143 |
| 4.a | 3× · 8,350 tok · $0.0398 | — | — | 1× · 2,780 tok · $0.0162 |
| 4.b | 3× · 8,374 tok · $0.0414 | — | — | 1× · 2,806 tok · $0.0155 |
| 4.c | 3× · 8,329 tok · $0.0398 | — | — | 1× · 2,853 tok · $0.0168 |
| 6 | 3× · 8,376 tok · $0.0399 | 3× · 1,554 tok · $0.0102 | — | 1× · 2,782 tok · $0.0162 |
| 7 | 3× · 8,314 tok · $0.0396 | 4× · 2,227 tok · $0.0140 | — | 1× · 2,833 tok · $0.0167 |
| 8.te | 1× · 3,371 tok · $0.0167 | 2× · 1,192 tok · $0.0096 | — | 1× · 2,650 tok · $0.0156 |
| 8.ta | 1× · 3,421 tok · $0.0176 | 2× · 1,068 tok · $0.0082 | — | 1× · 2,631 tok · $0.0143 |
| 8.ml | 1× · 3,382 tok · $0.0168 | 2× · 1,122 tok · $0.0098 | — | 1× · 2,595 tok · $0.0142 |
| 8.mr | 1× · 3,400 tok · $0.0170 | 2× · 964 tok · $0.0069 | — | 1× · 2,665 tok · $0.0158 |
| 8.gu | 1× · 3,386 tok · $0.0167 | 2× · 1,306 tok · $0.0111 | — | 1× · 2,778 tok · $0.0173 |
| 8.es | 1× · 3,387 tok · $0.0169 | 2× · 1,086 tok · $0.0079 | — | 1× · 2,767 tok · $0.0169 |

## Notes

- **Average per call: $0.0517 (₹4.34)** across 14 calls. English-only calls average $0.0563; calls in other languages average $0.0483, because Vexa also translates its replies and writes the summary in the caller's language.
- One-question calls (scenario 8) still pay for post-call analysis, which is the single largest request per call.
- **Not included:** telephony (phone-line minutes) and live voice (speech-in/speech-out). This recording used local macOS voices, which are free.
- **Cheapest levers:** run per-turn understanding and translation on Claude Haiku 4.5 (`ANTHROPIC_FAST_MODEL`) and keep Opus for post-call analysis; cache the stable prompt prefix.
- Test runs and the screen-capture run used extra tokens on top of these calls; they are not part of the figures above.
