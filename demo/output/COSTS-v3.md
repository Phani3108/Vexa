# Demo v3: what each conversation cost

Recorded 2026-10-29 12:22 UTC on a local Vexa server. Every figure comes from Claude's usage on each request. ₹ is at 84 per $.

| Conversation | Requests | Input tokens | Output tokens | Cost | ₹ |
|---|---|---|---|---|---|
| Clinic · Vexa Link · Tamil | 8 | 15,661 | 1,292 | $0.0538 | ₹4.52 |
| Restaurant · Hindi order | 6 | 11,535 | 1,074 | $0.0448 | ₹3.77 |
| Kirana · Vexa Link · UPI | 8 | 16,898 | 1,384 | $0.0601 | ₹5.04 |
| Scam shield · family guardian | 4 | 7,145 | 818 | $0.0317 | ₹2.66 |
| Memory and promises | 4 | 12,280 | 989 | $0.0457 | ₹3.84 |
| Interpreter (3 messages) | 3 | 1,266 | 160 | $0.0041 | ₹0.35 |
| **Total paid by the businesses** | | | | **$0.2403** | **₹20.18** |

**Customer side:** the customer's own assistant (`claude-opus-5-5`) used 5,292 input and 660 output tokens to place the agent-to-agent order, about $0.0344. The customer pays this, not the shop. The shop's agent API made no model calls for that order.

**Models used, by purpose:** claude-opus-5-5 (post-call analysis), claude-sonnet-5-5 (translation), claude-sonnet-5-5 (understanding).

**Not included:** phone-line and voice costs. This recording used local synthesized voices.
