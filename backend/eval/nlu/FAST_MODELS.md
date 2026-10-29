# Choosing the fast model (per-turn understanding)

Run on 29 Oct 2026 with `ANTHROPIC_FAST_MODEL=<model> npm run eval:nlu -- --mode claude`. The set has 161 cases across 8 languages. Response times are the median of 6 real `understand()` calls through the app's own client.

| Model | Whole cases | Facts (slots) | Language label | Cost per caller sentence | Median reply | Wrong facts |
|---|---|---|---|---|---|---|
| `claude-sonnet-5-5` | **98%** (158/161) | **100%** (92/92) | 97% | $0.0065 | **2.1 s** | none |
| `claude-haiku-5-5` | 96% (155/161) | 98% (90/92) | 97% | **$0.0003** | 2.6 s | "padi" (Telugu for 10) read as 8; "kaale" (tomorrow, Gujarati) dropped |
| Offline rules only | 99% | — | — | $0 | instant | (rules only cover what they were written for) |

**Default: Sonnet 5.5**, because a wrong quantity or day in an order or booking costs more than the model does. A 10-turn conversation costs about $0.07 with Sonnet 5.5 and about $0.003 with Haiku 5.5.

Raw results: `fast-sonnet-5-5.json`, `fast-haiku-5-5.json`.

Client note: Haiku 5.5 accepts `effort` (now sent, as `low`) but has no server-side refusal fallback, so that option is sent only to Opus, Sonnet and Fable (`lib/claude.js`).
