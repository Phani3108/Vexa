# Vexa — Master To-Do & Planning Reference

> **Decision:** US-only first. India (SIP) later.
> **Primary Focus:** Spam-proofing as a decision engine, not just conversation.
> **Positioning:** Personal AI Call Firewall — filters attention, not just spam.

---

## 1. What Vexa Already Has (Beyond a Truecaller Clone)

- [x] Answers spam, sales, and insurance calls
- [x] Answers delivery calls
- [x] DND modes
- [x] VIP allowlist
- [x] Live transcript + recordings
- [x] Memory of previous calls
- [x] English + Hindi support (more planned)

> Vexa is already past "identify spam" and into **active call handling / call triage + workflow**.

---

## 2. Features Worth Borrowing from Truecaller

### A) Advanced Blocking Controls (Must-Have)

- [ ] **Auto-hangup rules** — pre-answer where possible; otherwise first 2 seconds
- [ ] Stronger patterns:
  - [ ] Repeat callers
  - [ ] Time windows
  - [ ] Unknown international numbers
  - [ ] "Call me back" loops

### B) AI Voice Detection (Optional, Sharp Positioning)

- [ ] **"Is this a real human?" signal** — detect AI-generated / voice-cloned calls
- [ ] Flag + apply stricter flow for likely synthetic/scam voices

### C) Assistant Customization

- [ ] **Tone packs**: polite, firm, very short, very strict
- [ ] **"Don't waste time" mode** for spam-heavy users

> Skip: who viewed profile, incognito, contact requests, badge — not core unless building a network graph.

---

## 3. Telephony Strategy

### Decision: US-Only (Twilio) for Now

- [x] Keep Twilio for US/global
- [ ] Add **Twilio Lookup API** (CNAM, carrier type)
- [ ] Add **Twilio Voice Insights** (latency + call analytics)
- [ ] Add **Twilio call status webhooks**
- [ ] Design a **Telephony Abstraction Layer** (multi-provider) so India providers can be plugged in later

### Future: India Numbers (SIP) — Deferred

- [ ] Research India DID provider + SIP routing
- [ ] Route calls via SIP to AI stack (Vapi or custom)

---

## 4. Language Expansion (Done Right)

- [ ] **Per-utterance language detection** (not one-time detect-and-stick)
- [ ] Preserve original utterance
- [ ] Convert to canonical "reasoning language"
- [ ] Respond back in detected language + tone
- [ ] **Cost-effective model strategy:**
  - [ ] Small fast LLM for classification + extraction (intent, spam likelihood, entities)
  - [ ] Escalate to bigger model only for edge cases

---

## 5. Spam-Proofing — Three Layers

### Layer 1: Pre-Answer Risk Scoring (Before Vexa Speaks)

Compute a **Spam Risk Score (0–100)** the moment a call hits.

**Inputs:**
- [ ] Number reputation (third-party + internal)
- [ ] Call frequency in last X days
- [ ] Time-of-day anomaly
- [ ] Repeated missed calls pattern
- [ ] Number spoof likelihood (area code mismatch)
- [ ] User's past interaction history with this number
- [ ] Network metadata (if available)

**Actions by score:**

| Risk Score | Action |
|---|---|
| 0–30 | Let through normally |
| 30–60 | AI screens |
| 60–80 | AI screens aggressively (short flow) |
| 80–100 | Auto-hangup or auto-decline |

### Layer 2: First 5–10 Seconds Intelligence

- [ ] Ask one high-signal question: **"What's this regarding?"**
- [ ] Analyze:
  - [ ] Silence / delay pattern
  - [ ] Scripted pacing
  - [ ] Robotic cadence
  - [ ] Evasive responses
  - [ ] Keyword patterns (loan, Medicare, warranty, etc.)
- [ ] Score conversational legitimacy in real time
- [ ] If spam probability spikes → interrupt politely → end call → add to memory

### Layer 3: Adaptive Caller Memory (The Moat)

- [ ] Build a **Caller Profile Object** per number:
  ```
  CallerID: +1XXX
  Trust Score: 22/100
  Past Intents: [Insurance pitch ×3, Warranty scam ×1]
  User Action History: [Ignored ×2, Block suggested but not applied]
  Call Pattern: [Calls Tue mornings]
  Resolution Rate: 0% legitimate
  ```
- [ ] Auto-adjust risk score over time
- [ ] Memory-weighted decisions:
  - [ ] "This caller always turns into insurance pitch"
  - [ ] "This number is linked to delivery"
  - [ ] "User always ignores this pattern"

> Truecaller = global network intelligence. Vexa = **hyper-personal intelligence**.

---

## 6. Caller Memory as a User-Facing Feature

- [ ] "We've spoken to this number 3 times"
- [ ] "They usually call about delivery"
- [ ] "Last time you told them: call after 6pm"
- [ ] "Suggested action: auto-silence next time"

> Make Vexa feel like it's **learning the user's life**, not just classifying spam.

---

## 7. US-Specific Spam Enhancements

### VoIP / Spoof Detection

- [ ] Area code mismatch heuristics (neighbor spoofing)
- [ ] Frequent short-duration pattern detection
- [ ] CNAM inconsistencies

### AI Voice Scam Detection

- [ ] Unnatural pitch consistency check
- [ ] Low emotional variance detection
- [ ] Script repetition pattern detection
- [ ] Label as **"Possible Synthetic Voice"** (builds trust even if imperfect)

---

## 8. Conversation Tightening

Flows must be **extremely short, intent-specific, non-open-ended**.

### Spam Flow
- [ ] 1 question → 1 confirmation → terminate
- [ ] Do NOT let spam calls drift conversationally

### Delivery Flow
- [ ] Ask order ID or merchant → confirm → inform user

---

## 9. Cost Protection Strategy

- [ ] **Hard cap screening time**: 20–30 seconds max
- [ ] Early hang-up rules
- [ ] Small, fast LLM for classification (default)
- [ ] Advanced reasoning model only when needed
- [ ] Target: average spam call **under 12 seconds**

---

## 10. User-Facing Feature Ideas (Boost "Spam-Proof" Perception)

- [ ] "Auto-hangup 3rd repeat caller"
- [ ] "Block all calls from insurance category"
- [ ] "Block unknown numbers after 9pm"
- [ ] **"Aggressive Mode"** toggle
- [ ] **"Silent Shield" mode** (AI handles, no notification unless important)

---

## 11. Voice Stack Architecture

| Layer | Choice |
|---|---|
| **Telephony** | Twilio (US/global). Add India provider later. |
| **STT** | Prioritize streaming accuracy + code-mix stability |
| **TTS** | Prioritize low-latency + Indian voices + consistent prosody |
| **Brain** | Small model for 90% calls; bigger model only when needed |

**Metrics to track:** time-to-first-word, interruptions, hangup rate.

---

## 12. Infra Roadmap (v1 → v2)

- [ ] Telephony abstraction layer design (multi-provider)
- [ ] Call policy engine schema (rules + risk + memory)
- [ ] Language expansion plan (which languages first + how to QA)
- [ ] Cost envelope per 1k calls (keep it predictable)

---

## 🚀 Next 30-Day Focus

1. [ ] **Build Spam Risk Scoring Engine (v1)**
2. [ ] **Tighten 5-second conversational detection**
3. [ ] **Add "Aggressive Shield Mode"**
4. [ ] **Shorten average spam handling time**
5. [ ] **Expose caller memory insights to user**
