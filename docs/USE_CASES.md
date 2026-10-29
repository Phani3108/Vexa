# Vexa use cases: the deep plan

**What this is:** every use case Vexa should serve over the next ten years, designed far enough to build:
- who it's for and what starts it;
- the conversation;
- what Vexa does and remembers;
- what it connects to;
- guardrails;
- evals with thresholds;
- the moment we show in the demo.

It extends Part B of [LAUNCH_PLAN.md](LAUNCH_PLAN.md). Status is as of 29 Oct 2026.

## Principles
1. **One agent for every call, in and out.** Vexa answers for you, calls for you, and remembers for you, across phone, the internet and later every channel.
2. **The engine decides; models read and speak.** Every use case is a **flow pack**: flows + business data + guardrails + evals. Flows stay deterministic and auditable.
3. **A person decides anything that commits them.** Money, bookings, promises and transfers above a limit always go to the owner.
4. **Every pack ships with its guardrails table and its eval set passing.** The release gate is in CI.
5. **Works the way India talks.** 8 languages, mixed speech, Indian numbers and dates, from day one.
6. **Built so it can be tried before anyone pays.** Each use case can be shown through an in-app test call or a Vexa Link, before phone numbers exist.

## How each use case reaches people

| Channel | What it is | Accounts needed | Status |
|---|---|---|---|
| 🧪 **Test call** | The owner (or a demo) plays the caller in the app; same engine, same flows | None | **Live** |
| 🌐 **Vexa Link** | Public talk page + QR per owner; callers talk in any phone browser | None (hosting only) | Next |
| ☎️ **Phone number** | Calls forwarded to a Vexa number | Twilio (self-serve, non-India) or Exotel (India, KYC) | Built for Twilio; Exotel waits on KYC |
| 📤 **Outbound call** | Vexa dials out for the owner | Same as phone number + TRAI-safe rules | Planned |
| 💬 **WhatsApp / SMS** | Follow-ups, confirmations, links | Meta Business / DLT | Waits on accounts; `sms:` and `upi://` links work today |

**So:** every use case below can be **built and demoed now** (🧪, mostly 🌐). Only real-world phone traffic waits for numbers.

## Catalogue

Legend: **Built** = in the product today. **W1/W2/W3** = launch wave. Channel shows where it works in real life.

### Personal: protect, act, remember
| ID | Use case | Human need | Real-life channel | Wave | Status |
|---|---|---|---|---|---|
| P1 | Deliveries and directions, OTP handoff | Attention | ☎️ | — | **Built** |
| P2 | Bank, loan and sales calls, negotiated | Attention | ☎️ | — | **Built** |
| P3 | Trusted contacts, Focus until a time | Relationships | ☎️ | — | **Built** |
| P4 | **Scam shield** (digital arrest, KYC/OTP fraud, fake courier, impostor relative) | Harm | ☎️ (🧪 demo) | W1 | Plan |
| P5 | **Family guardian**: protect a parent's phone, alerts to the child | Harm, relationships | ☎️ | W1 | Plan |
| P6 | **Elder daily check-in and SOS** | Relationships, harm | 📤 | W2 | Plan |
| P7 | **Calls on your behalf**: book, cancel, complain, get quotes, wait on hold | Get things done | 📤 | W2 | Plan |
| P8 | **Memory and promises**: "what did the electrician quote?" | Remember | App | W1 | Plan |
| P9 | **Health admin**: appointments, report follow-ups, medicine refill reminders (no advice) | Get things done | ☎️ 📤 | W2 | Plan |
| P10 | **Money hygiene**: EMI, insurance, bill and renewal calls; never shares data | Harm, get things done | ☎️ | W2 | Plan |
| P11 | **Accessibility**: live captions, type-to-talk, elder simple mode | Language & ability | ☎️ 🌐 | W2 | Plan |
| P12 | **Live interpreter**: you speak Telugu, they hear Hindi | Language & ability | 🌐 → ☎️ | W1 (🌐) | Plan |
| P13 | **Home and society**: gate/security calls, visitors, maids, maintenance | Attention | ☎️ | W2 | Plan |
| P14 | **Work calls**: recruiters, clients, brand deals (job seekers, freelancers, creators) | Attention, earn | ☎️ 🌐 | W2 | Plan |
| P15 | **Driving / busy mode**: summaries read out on request | Attention | App | W2 | Plan |

### Business: earn and serve
| ID | Use case | Real-life channel | Wave | Status |
|---|---|---|---|---|
| B1 | Bookings with confirmation | ☎️ 🌐 | — | **Built** |
| B2 | Address, directions, hours | ☎️ 🌐 | — | **Built** |
| B3 | Stock, price, total, reserve | ☎️ 🌐 | — | **Built** |
| B4 | **Clinic / diagnostics pack** | ☎️ 🌐 | W1 | Plan |
| B5 | **Salon / spa pack** | ☎️ 🌐 | W1 | Plan |
| B6 | **Restaurant pack**: reservations + takeaway orders | ☎️ 🌐 | W1 | Plan |
| B7 | **Kirana / hardware pack**: orders for delivery + UPI | ☎️ 🌐 | W1 | Plan |
| B8 | **Home services pack**: job booking, dispatch, technician ETA | ☎️ 🌐 | W1 | Plan |
| B9 | **Coaching / school pack**: admissions, fees, demo classes | ☎️ 🌐 | W1 | Plan |
| B10 | **Real estate pack**: lead qualification, site visits | ☎️ 🌐 | W1 | Plan |
| B11 | **Payments**: UPI advance / deposit link after the call | 🌐 💬 | W1 | Plan |
| B12 | **Order status / existing customers** (from a sheet) | ☎️ 🌐 | W1 | Plan |
| B13 | **Confirmation and reminder calls** (COD, no-shows) | 📤 | W2 | Plan |
| B14 | **Teams and shared inbox** | App | W2 | Plan |
| B15 | **After-hours and emergencies** (extends the built flow) | ☎️ | W1 | Partly built |

### Community and public good (new horizon)
| ID | Use case | Real-life channel | Wave |
|---|---|---|---|
| C1 | **Civic helpdesk**: ration, pension, certificates. Answers from the office's own FAQ in the caller's language | ☎️ 🌐 | W2 |
| C2 | **Farmer helpline**: mandi prices, weather, scheme deadlines (from a data feed) | ☎️ | W3 |
| C3 | **NGO / support line**: triage, callback, crisis routing to humans | ☎️ | W3 |

### The agent era (10-year bets)
| ID | Bet | First version we can build |
|---|---|---|
| A1 | **Agent-to-agent**: your Vexa talks to a business's AI over an API | Public "callable agent" endpoint for every business on Vexa (🌐, buildable now) |
| A2 | **Your own voice** (consented clone) | Consent + watermark policy; Indian TTS voices first |
| A3 | **Every channel, one agent** (WhatsApp voice/text, RCS, speakers, earbuds, glasses, cars) | Channel adapter interface; Vexa Link is the first non-phone channel |
| A4 | **Proactive assistant**: Vexa briefs you, chases promises | In-app daily brief exists; add "Vexa calls you" |
| A5 | **Verified identity**: CNAP names, verified business IDs, deepfake-voice detection | Store verification signals; detection eval when vendors mature |
| A6 | **Voice commerce**: UPI 123Pay, ONDC orders by voice | UPI link action (B11) |
| A7 | **On-device private mode** | NLU already behind `structuredJson`; an on-device model becomes another provider |
| A8 | **Pack marketplace**: community/partner packs per profession and language | Pack format (below) is the unit |

---

## Shared building blocks

These are built once and reused by many use cases.

| Block | Used by | What it is | Exists today |
|---|---|---|---|
| **Pack format** | All B*, C*, P4, P13 | `packs/<id>/`: flows JSON, FAQ seed, catalog schema, guardrail rules, eval cases, demo script | Flows + industry templates (`config/templates.js`, `workflows/templates.js`) |
| **Vexa Link** | All 🌐 | Public talk page + QR per owner; rate-limited sessions on the test-call engine | Test-call engine (`simulatorService.js`) |
| **Scam classifier step** | P4, P5, P10 | Per-turn scam-pattern score (script cues + requests for OTP/PIN/Aadhaar + urgency/threats), hard refusals | Risk score is pre-call only (`risk.js`) |
| **Sensitive-data guard** | P4, P5, P7, P10 | Never speak or confirm OTP, UPI PIN, card, Aadhaar, passwords; detect and refuse | Prompt rules only |
| **Linked accounts** | P5, P6, B14 | Guardian ↔ dependant, owner ↔ staff, with consent and scoped views | `Account.members` planned (L1) |
| **Memory store** | P8, P9, P10, P14, A4 | People, promises, quotes, dates from every call; searchable; erasable per caller | Caller memory (summary only, `callHistoryService.js`) |
| **Outbound engine** | P6, P7, P9, B13 | Dial, detect a human vs a phone menu, press keypad digits, wait on hold, task brief + limits, report | Outbound dial stub (`/voice/outbound-call`) |
| **Pay link action** | B7, B11, A6 | `upi://pay?pa=<vpa>&am=<amount>&tn=<note>` link + QR, sent after the call | — |
| **Order and record lookup** | B12, B6, B7 | Read rows from a sheet/CSV (order id → status), like catalog lookup | Catalog `lookup` step |
| **Captions and type-to-talk** | P11, P12 | Live transcript to the owner + the owner's typed text spoken to the caller | Whisper path (`/voice/whisper`, simulator whisper) |
| **Two-way interpreter** | P12 | Both directions translated; the owner speaks their language | Caller-side translation |
| **Callable agent API** | A1 | `POST /agents/:handle/ask {intent, slots}` → structured answer, for other AIs | Flows + NLU |

---

## Deep dives: Wave 1 (build first)

Each block follows the same template. Conversations are examples; real ones vary by language.

### P4 Scam shield
- **Who / when:** anyone; peaks with elders and first-time smartphone users. Triggered when a call shows scam signals: "police/CBI/customs/courier", "your number will be blocked", "KYC expiring", "share the OTP", "stay on the line", a relative "in trouble" asking for money.
- **Conversation:**
  - Caller (Hinglish): *"Main CBI se bol raha hoon, aapke Aadhaar se ek parcel mein drugs mile hain, video call pe aaiye."*
  - Vexa: *"Main Phani ki assistant hoon. Hum is call pe koi bhi personal jaankari share nahi karte. Agar aap official officer hain, toh likhit notice bhejiye."* The engine ends politely and alerts the owner.
- **What Vexa does:**
  1. Per-turn scam score (new step `screen:scam`) from model signals plus a rule list.
  2. At the threshold, switches to the `p_scam` flow.
  3. Refuses any data, never transfers, ends the call.
  4. Pushes "Likely scam: fake CBI / digital arrest", with the evidence lines highlighted.
  5. Offers "Report on 1930 / cybercrime.gov.in" and "Block number".
- **Data:** scam type, phrases matched, caller number, recording; adds to the account's block suggestions.
- **Guardrails:**
  - Never speaks or confirms OTP, PIN, card, Aadhaar, address or family details.
  - Never transfers a flagged call to the owner; only an explicit owner override in the app can.
  - No threats or insults back.
  - The 1930 helpline is shown to the owner, never read to the scammer.
- **Evals:**
  - Scam set: 60 scripted calls in 6 languages + 40 legitimate look-alikes (real bank, courier, police verification).
  - Precision ≥ 0.95, recall ≥ 0.90, **sensitive-data leaks = 0**, false-transfer = 0.
- **Demo moment:** a "digital arrest" call in Hinglish, shut down in two turns; the owner's phone shows the alert with highlighted phrases and a one-tap block.

### P5 Family guardian
- **Who / when:** an adult child (the guardian) protects a parent's (the dependant's) phone; often an NRI or someone in another city.
- **Setup:**
  - The guardian invites the parent.
  - The parent accepts on their own phone, with consent in their language.
  - The parent's number gets Vexa.
  - The guardian's account is linked as a guardian.
- **Conversation:** the same as P1–P4, on the parent's line, in the parent's language (Telugu for Amma).
- **What Vexa does:**
  - Family and the parent's contacts always ring.
  - Unknown callers are screened.
  - Scam calls are shut down and the **guardian gets the alert**.
  - Daily digest to the guardian ("3 calls handled: 1 courier, 1 loan offer declined, 1 scam blocked").
  - The guardian can add VIPs and notes remotely.
- **Data:** linked-account record, consent record, guardian scope (summaries only by default).
- **Guardrails:**
  - The parent's consent is required and revocable.
  - The guardian sees summaries, not recordings, unless the parent allows.
  - The parent can always see what the guardian sees.
- **Evals:**
  - Permission tests: a guardian can't read a recording without the grant, can't act on unlinked accounts.
  - Alert delivery within 10 s.
- **Demo moment:** a scam call to Amma in Telugu; her son's phone in another city lights up "Blocked a fake bank call to Amma".

### P8 Memory and promises
- **Who / when:** everyone, after any call.
- **Interaction:**
  - Ask Vexa: *"What did the AC guy quote?"* → "₹1,800 for gas refill, Ravi from CoolTech, on 12 Oct; he said he can come Saturday."
  - *"Who promised to call back?"* → a list with due dates.
- **What Vexa does:**
  - After each call, extracts `{people, organisations, amounts, dates, promises (who, what, by when)}` into a per-account memory store.
  - Ask Vexa queries it.
  - Due promises trigger a nudge ("The bank said they'd call by Monday. They haven't. Call them?").
- **Guardrails:** owner-only; erasing a caller erases their memory items; never used across accounts; no inference about sensitive traits.
- **Evals:**
  - Retrieval set of 50 questions over 30 recorded calls: answer accuracy ≥ 90%, citation to the right call 100%.
  - Cross-account leak tests = 0.
- **Demo moment:** "What did the electrician quote?" answered with the exact amount and a link to the call.

### P12 Live interpreter (internet first)
- **Who / when:**
  - a migrant worker talking to a landlord;
  - an NRI talking to a parent's doctor;
  - a shop owner with a tourist.
- **Interaction:**
  - Both people open the same Vexa Link (or one shares their screen).
  - The owner speaks Telugu and the other person hears Hindi, and vice versa, with captions for both.
- **What Vexa does:** turn-by-turn translation with the existing language layer; keeps names, numbers and prices exact; saves a bilingual transcript.
- **Guardrails:** shows the original and the translation; numbers and amounts never rephrased; disclaimer for legal and medical use.
- **Evals:**
  - Translation set (8 × 8 pairs, 20 lines each): meaning preserved ≥ 95% (LLM judge + spot check).
  - Numbers exact 100%.
- **Demo moment:** the owner speaks Telugu, a customer replies in Hindi, both read captions.

### B4 Clinic / diagnostics pack
- **Flows:**
  - book / reschedule / cancel (by doctor, slot);
  - report ready? (lookup by booking id or phone);
  - timings and fees;
  - home sample collection;
  - emergency → "Please call 108 or go to the nearest emergency room" + alert to staff.
- **Conversation:** *"Dr Rao ka appointment kal shaam ka milega?"* → slots from the clinic's schedule → booked as a request → SMS / WhatsApp / `sms:` confirmation.
- **Data:** doctors, slots, fees, test list with prices and fasting rules, report status sheet.
- **Guardrails:**
  - **No medical advice, diagnosis or dosage** (hard refusal + offer a call-back from staff).
  - Emergency words always win.
  - Report status only to the registered phone number.
- **Evals:**
  - 20 scenario calls (booking, reschedule, fasting question, emergency, someone else asking for a report): slots 95%, refusals 100%, emergency routing 100%.
- **Demo moment:** a Tamil caller asks about a blood-test fast and gets the clinic's own rule; then asks "what medicine should I take?" and is refused kindly.

### B5 Salon / spa pack
- **Flows:** book by service + stylist; packages and prices; reschedule; late-arrival message; first-visit offer.
- **Guardrails:** prices from the menu only; no booking outside staff hours; deposits via the owner-approved link.
- **Evals:** 15 scenario calls; slot capture ≥ 95%; double-booking checks.
- **Demo moment:** "Saturday 11 baje haircut + beard, Rahul se" → booked, with the price total.

### B6 Restaurant pack
- **Flows:**
  - table reservation (party size, time, occasion);
  - takeaway / delivery order (menu items, quantities, total, pickup time);
  - "Is X available today?";
  - timings;
  - complaints → owner.
- **Data:** menu (items, prices, veg/non-veg, availability toggle), tables, delivery radius.
- **Guardrails:** prices and availability from the menu only; allergens: only state what the menu lists, else "please confirm with staff"; order read back before placing.
- **Evals:** 20 calls; order total exact 100%; read-back present 100%.
- **Demo moment:** a Hindi caller orders 2 paneer tikka + 4 rotis; Vexa reads back ₹560, takeaway at 8:15.

### B7 Kirana / hardware pack (extends B3)
- **Flows:** stock and price (built) → **order for home delivery** (address, slot) → **UPI pay link** (B11) → order status (B12).
- **Guardrails:** stock never oversold; delivery only within radius; payment link amount = read-back total.
- **Evals:** totals exact 100%; out-of-stock alternatives offered ≥ 90%.
- **Demo moment:** "dus LED bulb aur do pankha bhej do" → total, address captured, a UPI link arrives on WhatsApp/SMS.

### B8 Home services pack
- **Flows:** job intake (problem, address, urgency, preferred slot, photos via link); estimate ranges from the price list; dispatch to a technician (staff app / SMS); **technician ETA** follow-up ("where is my plumber?" → status).
- **Guardrails:** estimates only as ranges from the list; gas leaks, sparks and floods → emergency script + immediate owner alert.
- **Evals:** 20 calls; urgency classification ≥ 95%; emergency 100%.
- **Demo moment:** "AC se paani tapak raha hai" → booked tomorrow 10–12; later "technician kab aayega?" → "Arjun is 20 minutes away".

### B9 Coaching / school pack
- **Flows:** admissions enquiry (course, grade, batch timings, fees); demo class booking; fee-due queries (by student id); parent callbacks.
- **Guardrails:** fees only from the fee table; no promises on results or placements; minors' data → parent's number only.
- **Evals:** 15 calls; correct batch and fees 100%.
- **Demo moment:** a parent in Marathi asks for Class 10 maths batches; a demo class is booked.

### B10 Real estate pack
- **Flows:** lead qualification (budget, BHK, area, timeline, loan needed); listing match from the inventory sheet; **site visit booking**; follow-up reminders.
- **Guardrails:** no price commitments beyond listed ranges; RERA number stated when asked; no discrimination in matching (no religion/caste/diet filters accepted).
- **Evals:** 15 calls; budget/BHK capture ≥ 95%; discriminatory filters refused 100%.
- **Demo moment:** "2BHK Gachibowli 80 lakh tak" → 2 matching listings → site visit Sunday 11.

### B11 Payments: UPI link after the call
- **What:** owner sets a UPI ID; flows can end with `action: pay_link {amount, note}`. Vexa sends `upi://pay?pa=…&pn=…&am=…&tn=…` (+ QR) via SMS intent / WhatsApp / Vexa Link. Payment confirmation is recorded manually by the owner (later: payment-gateway webhook).
- **Guardrails:**
  - The amount always equals the read-back total.
  - The owner approves the first link per caller, or sets an auto limit.
  - Never asks for card or PIN.
- **Evals:** link amount equals total 100%; no PIN prompts.
- **Demo moment:** after the kirana order, a UPI link for ₹1,880 opens a UPI app.

### B12 Order status / existing customers
- **What:** the owner uploads or links a sheet (order id, phone, status, ETA). The caller gives an order id or is recognised by number → status read out.
- **Guardrails:** status only to the matching phone number or after id + name match; no other customer's data.
- **Evals:** 20 lookups incl. wrong ids and other-customer probes: correct 100%, leaks 0.

### B15 After-hours and emergencies (extend)
- **What:** add per-pack emergency scripts (clinic → 108, home services → shut-off guidance only from the owner's text) and an "after-hours callback list" summary at opening time.
- **Evals:** emergency detection in 8 languages ≥ 98%.

---

## Deep dives: Wave 2 (compact)

| ID | Conversation sketch | What's new | Guardrails | Evals |
|---|---|---|---|---|
| **P6 Elder check-in / SOS** | 9 am: *"Namaste Amma, did you take your BP tablet?"* "Haan." → logged. No answer twice, or "not well" → the guardian is called | Outbound engine, schedules, escalation ladder | Consent of the elder; quiet hours; never gives medical advice | Escalation fires 100%; false alarms < 5% |
| **P7 Calls on your behalf** | Owner: "Cancel my gym membership." Vexa calls, navigates the phone menu, waits, asks for cancellation, reads back the reference number | Outbound engine: menu navigation with keypad digits, hold detection, task brief, limits | Discloses it's an AI; commits nothing above the limit; only to businesses or numbers the owner names | Simulated businesses (menus, hold, refusal, upsell): task success ≥ 80%, over-commitment 0 |
| **P9 Health admin** | "Book my mother's diabetes follow-up" → calls the clinic (P7) or uses the clinic's Vexa via A1 | P7 + A1 | No advice; health data marked sensitive, shorter retention | As P7 + no-advice 100% |
| **P10 Money hygiene** | Insurance renewal call → captures due date and premium into memory; refuses to share any data; reminds 3 days before | Memory (P8) + sensitive-data guard | Never shares or confirms account data | Leak 0; reminder accuracy ≥ 95% |
| **P11 Accessibility** | A deaf owner reads live captions and types a reply that Vexa speaks | Captions + type-to-talk on live calls | The caller is told text-to-speech is in use | Caption latency ≤ 1.5 s; accuracy ≥ 90% |
| **P13 Home and society** | Gate: *"Swiggy delivery for B-402"* → owner approves in the app → gate told "send up" | Approval action with a timeout | Default deny after the timeout; visitor log | Approval round trip ≤ 20 s |
| **P14 Work calls** | Recruiter call → role, CTC range, location, notice period captured; rate card for freelancers | Packs for job seekers and creators | No salary commitments | Slot capture ≥ 95% |
| **P15 Driving mode** | "Read my missed calls" → short spoken summaries | Spoken digest | Nothing to read on screen while driving | — |
| **B13 Confirmation / reminder calls** | "Your order of ₹1,200 cash-on-delivery: confirm delivery tomorrow?" | Outbound campaigns (transactional only) | TRAI: transactional only, consent, 9 am–9 pm, opt-out honoured | Opt-out 100%; contact rate tracked |
| **B14 Teams** | Calls routed by skill/shift; staff app; shared follow-ups | Members and roles (L1), routing step | Role-based access; audit | Routing tests |
| **C1 Civic helpdesk** | *"Ration card mein naam kaise jode?"* → steps from the office FAQ in the caller's language, documents list, office hours | FAQ pack + public Vexa Link | Answers only from the office's FAQ; no promises on approvals | FAQ answer accuracy ≥ 95% |

## Wave 3: designs to keep in mind now
- **A1 Agent-to-agent:**
  - Every business on Vexa exposes `POST /agents/:handle/ask` (intent + slots → answer + actions), described like an MCP tool.
  - P7 and P9 call it first and fall back to a voice call.
  - **Build the endpoint in Wave 1 (it's cheap).**
- **A4 Proactive assistant:** the daily brief + promises (P8) + elder check-ins (P6) become "Vexa calls you at 8 pm with your day".
- **A5 Verified identity:** record caller-ID verification (CNAP when operators expose it), mark verified businesses, add a deepfake-voice score when reliable detectors exist; the scam shield (P4) consumes it.
- **A2 Own voice, A3 every channel, A6 voice commerce, A7 on-device, A8 marketplace:** keep the provider and channel interfaces clean; no product work yet.

---

## Build order (internet-first, no external accounts)

| Step | Build | Use cases unlocked | Shown in demo v3 via |
|---|---|---|---|
| 1 | **Pack format + pack installer**; packs B4–B10 with seed data and eval sets | B4–B10 | Test calls + Vexa Link |
| 2 | **Scam classifier step + sensitive-data guard + `p_scam` flow + evidence alert** | P4 (P5, P10 later) | Test call |
| 3 | **Vexa Link** (public talk page + QR, rate-limited) | All 🌐 business packs, P12 | Real phone browser |
| 4 | **Pay link action (UPI)** + order/record lookup from CSV | B7, B11, B12 | Test call / Vexa Link |
| 5 | **Memory store + Ask Vexa questions + promise nudges** | P8 (P10 later) | App |
| 6 | **Linked accounts (guardian)** + digest | P5 | Two accounts in the app |
| 7 | **Two-way interpreter on Vexa Link** | P12 | Two phones |
| 8 | **Callable agent API** | A1 | API call shown in the demo |
| 9 | Installable app + web push + Google sign-in, then Render + Atlas | Real use | Real phone |
| — | Waits for phone numbers / accounts | P6, P7, P9, P13, B13 real traffic; WhatsApp; Exotel | — |

Infrastructure from LAUNCH_PLAN (L1 keys and tenancy, L5a caps, L7a privacy) continues alongside. L1 and L5a must land before strangers use Vexa Link.

## Eval standard for every pack
- `backend/eval/packs/<id>/cases.jsonl`: scripted multi-turn calls with expected slots, actions, refusals and the final outcome.
- One runner (extends `eval/nlu/run.mjs`): offline mode in CI, model mode on demand. Reports slot accuracy, outcome accuracy, refusal compliance, and leaks (must be 0).
- **Release gate:** a pack is enabled only when its set passes its thresholds. Thresholds live in the pack's `guardrails.md`.

## Demo v3: what it will show
1. Install the app on a real phone; sign in with Google; choose a business pack (clinic).
2. Generate the Vexa Link + QR; a "customer" scans it on a second phone and talks in Tamil about a fasting blood test; then asks for medicine advice and is refused kindly.
3. Restaurant order in Hindi with an exact read-back total; kirana order with a UPI link that opens a UPI app.
4. Scam shield: a "digital arrest" test call in Hinglish, blocked, with the evidence alert.
5. Family guardian: a scam call to Amma's line (test call), the son's account gets the alert.
6. Memory: "What did the electrician quote?"
7. Live interpreter: Telugu ↔ Hindi on two phones.
8. Agent-to-agent: one Vexa asks another clinic's Vexa for a slot over the API.
9. Personal phone scenarios from v2 (delivery, loan, Amma) as test calls, labelled "real phone numbers: coming with Exotel".
10. Cost per call, guardrails and eval scores for every pack shown at the end.
