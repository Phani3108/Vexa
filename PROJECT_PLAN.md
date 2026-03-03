# AI Caller — Project Plan

**Goal:** An AI voice agent that answers your phone calls, handles them intelligently based on your instructions, and lets you monitor / take over from a mobile app.

---

## The Problem

Your phone rings constantly — deliveries, spam, maintenance, unknown callers.  
You have to pick up every call, interrupt what you're doing, and deal with it.

**AI Caller fixes this:**  
Your AI agent picks up, talks to the caller naturally, follows your custom instructions per call type, and only alerts you when it matters.

---

## How It Works

```
[Caller] → Twilio Phone Number → AI Voice Agent (OpenAI Realtime)
                                        │
                                        ├── Knows your delivery instructions
                                        ├── Knows who's calling (from history)
                                        ├── Handles it based on category
                                        │
                                        └── [Your Phone] ← Live transcript
                                                         ← Push notification
                                                         ← "Take over" button
```

---

## System Components

### 1. Backend (Node.js + Express)
- Receives calls via Twilio
- Runs AI voice agent (OpenAI Realtime gpt-realtime-mini)
- Generates dynamic prompts per call
- Stores call history in MongoDB
- Streams live transcripts to mobile app via Socket.io

### 2. Mobile App (React Native — future)
- Connects to backend via Socket.io
- Shows live call transcript
- Push notification on important calls
- One-tap call takeover (join the call yourself)
- Manage call categories and instructions

### 3. MongoDB (3 collections)
- `UserConfig` — your preferences and call categories
- `Call` — every call with full transcript and AI analysis
- `Caller` — profile per phone number (context for future calls)

---

## The AI Agent (Core Feature)

The agent is powered by **OpenAI Realtime API** with bidirectional audio streaming.

### What makes it smart: Dynamic Prompts

Every call gets a fresh prompt built from:

1. **Your call categories** — rules you define:
   - _"If it's a food delivery → tell them to leave food at the door"_
   - _"If it's spam → end the call politely"_
   - _"If it's maintenance → ask what the visit is about"_

2. **Caller history** — what we know about this number:
   - Previous calls, what they were about, what the AI did
   - Known caller profile (name, organization, relationship)

3. **Category context** — how similar calls were handled:
   - Even for a first-time caller, AI knows "Swiggy deliveries usually go to the door"

### Call Categories
You define categories with keywords and instructions. The AI figures out which category applies and acts accordingly.

| Category | Keywords | Action |
|----------|----------|--------|
| Food Delivery | swiggy, zomato, food | Leave at door |
| Package/Courier | courier, parcel, amazon | Leave with security |
| Maintenance | plumber, electrician, repair | Ask details, take note |
| Visitor | here to see, coming over | Ask name and purpose |
| Sales/Spam | offer, plan, insurance | End call politely |

**You can add any category you want. No code changes needed.**

---

## Mobile App Screens

### 1. Home / Dashboard
- Active call banner (when a call is in progress)
- Recent calls list with category badges
- Quick stats (calls today, spam blocked, messages taken)

### 2. Live Call Monitor
- Shows when AI is on a call
- Live transcript (streamed in real time via Socket.io)
- Detected category badge (e.g. "🍕 Food Delivery")
- **"Take Over"** button → joins you into the call
- **"End Call"** button

### 3. Call History
- List of all calls, sorted by date
- Filter by category
- Tap to see full transcript + AI summary
- Edit caller profile (add name, notes, tags)

### 4. Settings / Categories
- Manage call categories (add, edit, delete)
- Edit per-category instructions for the AI
- VIP contacts (always connect immediately)
- Blocked numbers
- AI voice and tone settings

### 5. Caller Profiles
- View known callers (from call history)
- Add notes and context the AI will use next time
- See call history per caller

---

## Data Flow: What Happens on Each Call

```
1. Phone rings → Twilio webhook fires
2. Backend loads your user config (callCategories, VIP list, etc.)
3. Backend loads caller context from MongoDB
   a. Caller profile (name, org, lastCategory)
   b. Last 5 calls from this number
   c. Last 5 calls in likely category (even from other numbers)
4. PromptGenerator builds system prompt (fresh every call)
5. TwiML connects Twilio audio to WebSocket
6. VoiceAgent bridges audio ↔ OpenAI Realtime
7. Live transcript emitted via Socket.io → mobile app
8. Call ends → ConversationAnalyzer runs
   a. Classifies into one of your categories
   b. Extracts caller name, org, summary, action taken
9. Call saved to MongoDB
10. Caller profile updated (lastCategoryId, contextSummary)
11. Push notification sent if category has notify: true
```

---

## Development Phases

### Phase 0 — Core Call Flow ✅ DONE
- [x] Twilio → WebSocket → OpenAI Realtime bridge
- [x] Live audio: agent speaks and listens
- [x] Socket.io: transcript events to mobile
- [x] MongoDB: call records saved
- [x] VoiceAgent, PromptGenerator, ConversationAnalyzer

### Phase 1 — Smart Agent 🔄 IN PROGRESS
- [x] Dynamic prompt from callCategories
- [x] 3-level caller context (profile + history + category history)
- [x] Category CRUD API (add/edit/delete categories)
- [ ] Real-time category detection during call (emit `call:intent`)
- [ ] Conference Bridge: user takes over call
- [ ] Push notifications on important calls
- [ ] Auto-update Caller.contextSummary after each call

### Phase 2 — Mobile App 📋 NEXT
- [ ] Socket.io integration in React Native
- [ ] Live Call Monitor screen
- [ ] Call History screen
- [ ] Category management screen (Settings)
- [ ] Take Over button (Conference Bridge join)
- [ ] Push notification tap → opens live call screen

### Phase 3 — Polish
- [ ] Caller profile screen (edit name, notes, tags)
- [ ] Spam detection improvements
- [ ] VIP contact management UI
- [ ] Call analytics / stats screen
- [ ] Multiple Twilio numbers support

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, Express |
| Voice AI | OpenAI Realtime (gpt-realtime-mini) |
| Post-call Analysis | OpenAI Chat (gpt-4.1-mini) |
| Telephony | Twilio (phone numbers, media streams, conference bridge) |
| Database | MongoDB Atlas (Mongoose) |
| Real-time | Socket.io (backend → mobile) |
| Mobile | React Native (TypeScript) |
| Auth | JWT |
| Dev tools | ngrok (local webhook exposure) |

---

## Testing Without a US Number

Since direct call forwarding (Indian SIM → US Twilio number) doesn't work due to carrier restrictions, we test using **outbound calls from the API**:

```bash
# This triggers the AI agent to call your number
# You pick up and talk to the AI

curl -X POST http://localhost:3000/voice/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+91XXXXXXXXXX",
    "callerName": "Test Swiggy Delivery",
    "context": "Food delivery test"
  }'
```

The full AI agent runs on the outbound call — same dynamic prompt, same context system, same post-call analysis.

---

## Repository Structure

```
AICaller/
├── backend/                    Node.js + Express backend
│   ├── src/
│   │   ├── app.js              Server entry point
│   │   ├── voice/              AI agent core
│   │   │   ├── VoiceAgent.js
│   │   │   ├── PromptGenerator.js
│   │   │   └── ConversationAnalyzer.js
│   │   ├── services/           Business logic
│   │   ├── routes/             API endpoints
│   │   └── models/mongodb/     DB schemas
│   ├── package.json
│   └── BACKEND_PROJECT_PLAN.md
│
├── mobile/                     React Native app (future)
│   ├── src/
│   │   ├── screens/
│   │   ├── contexts/
│   │   └── services/
│   └── App.tsx
│
└── PROJECT_PLAN.md             ← This file
```
