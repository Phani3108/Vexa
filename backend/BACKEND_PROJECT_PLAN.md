# AI Caller — Backend Project Plan

**Updated:** February 2026  
**Focus:** AI Voice Agent · Dynamic Prompts · Call Context · Mobile App Integration  
**Test strategy:** Outbound calls via API (`POST /voice/outbound-call`)

---

## What We're Building

A backend that makes a **smart AI assistant answer phone calls**.  
The agent:
1. Picks up the call (via Twilio)
2. Talks naturally with the caller (via OpenAI Realtime — gpt-realtime-mini)
3. Knows the **user's preferences** (delivery instructions, visitor rules, etc.) from MongoDB
4. Knows the **caller's history** (who called before, what for, what we did)
5. Streams live transcripts to the mobile app via Socket.io
6. Analyzes the call after it ends and stores categorized data for future context

---

## How a Call Works (End-to-End)

```
Someone calls → Twilio receives → POST /voice/incoming-call webhook
                                          │
                              ┌───────────▼───────────┐
                              │   buildCallContext()   │
                              │                        │
                              │  1. Load user config   │
                              │     (callCategories,   │
                              │      vipContacts, etc) │
                              │                        │
                              │  2. Load caller ctx    │
                              │     - Previous calls   │
                              │     - Category history │
                              │     - Caller profile   │
                              │                        │
                              │  3. PromptGenerator    │
                              │     builds system      │
                              │     prompt dynamically │
                              └───────────┬───────────┘
                                          │
                              ┌───────────▼───────────┐
                              │   TwiML → WebSocket   │
                              │   /voice/media-stream  │
                              └───────────┬───────────┘
                                          │
                    ┌─────────────────────▼─────────────────────┐
                    │           VoiceAgent                        │
                    │                                             │
                    │  Twilio audio ←──────────→ OpenAI   │
                    │           bidirectional audio stream        │
                    │                                             │
                    │  Transcripts ──────────→ Socket.io         │
                    │                         → Mobile App       │
                    │                                             │
                    │  call:completed event                       │
                    └─────────────────────┬─────────────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │  ConversationAnalyzer  │
                              │                        │
                              │  GPT-4.1-mini analyzes │
                              │  transcript against    │
                              │  user's categories     │
                              │                        │
                              │  → categoryId          │
                              │  → summary             │
                              │  → callerName/org      │
                              │  → actionTaken         │
                              └───────────┬───────────┘
                                          │
                              ┌───────────▼───────────┐
                              │  callHistoryService    │
                              │                        │
                              │  Save Call document    │
                              │  Update Caller profile │
                              │  (lastCategoryId,      │
                              │   callerName, etc.)    │
                              └───────────────────────┘
```

---

## The Dynamic Prompt System (Core of the AI Agent)

This is the game changer. Instead of a static prompt, every call gets a **fresh prompt** built from three sources:

### 1. User's Call Categories (`UserConfig.callCategories`)
The user defines categories with:
- `id` — e.g. `"delivery.food"`
- `label` — e.g. `"Food Delivery"`
- `keywords` — what triggers detection: `["swiggy", "zomato", "food order"]`
- `action` — what to do: `follow_instructions | take_message | connect_user | end_call | ask_purpose`
- `instructions` — verbatim text injected into the AI prompt:
  > _"Tell the delivery person to leave the food at the main door and ring the bell once."_

Each category becomes a named section in the system prompt. The AI reads them all upfront so it knows exactly what to say the moment it detects a category.

**Adding a new category is just a DB write — no code change needed.**

```
POST /api/users/categories
{
  "id": "delivery.laundry",
  "label": "Laundry Pickup",
  "keywords": ["laundry", "clothes", "pickup"],
  "action": "follow_instructions",
  "instructions": "Tell them to pick up the bag from the door handle."
}
```

### 2. Caller Context (from `callHistoryService.getCallerContext()`)
Three levels of context loaded before every call:

```
Level 1 — Caller Profile (Caller collection)
  • callerName, organization, relationship
  • lastCategoryId (what they usually call about)
  • contextSummary (narrative built from past calls)
  • tags (user-defined labels)

Level 2 — Recent Calls from THIS number (Call collection)
  • Last 5 calls: date, category, summary, actionTaken
  • Lets AI say: "Oh, are you following up on your last order?"

Level 3 — Category Context (similar calls, any number)
  • Last 5 calls with the same categoryId
  • Lets AI know: "Swiggy deliveries usually go to the door"
  • Gives richer context even for first-time callers
```

### 3. Prompt Structure (PromptGenerator)
```
## IDENTITY
  Who the AI is, who it's working for, tone/style

## CALL HANDLING RULES
  [For each category, sorted by priority]
  ### FOOD DELIVERY [category: delivery.food]
  Trigger words: swiggy, zomato, food order
  Action: Follow the instructions below exactly.
  Instructions: "Tell the delivery person to leave the food..."

## VIP CONTACTS
  [If any — who to prioritize and connect immediately]

## CALLER CONTEXT
  [What we know about this specific number]
  Recent calls:
    1. 12/Feb [Food Delivery]: Swiggy order → Told to leave at door
    2. ...

## GUIDELINES
  Unknown callers, escalation keywords, blocked numbers
```

---

## Call Categorization

Categories are stored in `UserConfig.callCategories` and are **fully customizable per user**.

### Default Categories (shipped with new accounts)
| ID | Label | Default Action |
|----|-------|----------------|
| `delivery.food` | Food Delivery | `follow_instructions` |
| `delivery.package` | Package / Courier | `follow_instructions` |
| `delivery.grocery` | Grocery Delivery | `follow_instructions` |
| `service.maintenance` | Maintenance / Repair | `ask_purpose` |
| `service.visitor` | Visitor / Guest | `ask_purpose` |
| `business.sales` | Sales / Marketing | `end_call` |
| `spam.telemarketing` | Spam | `end_call` |
| `personal.unknown` | Unknown Personal | `take_message` |

### Action Types
| Action | What the AI does |
|--------|-----------------|
| `follow_instructions` | Reads out the `instructions` field verbatim |
| `take_message` | Asks name + purpose, says owner will call back |
| `connect_user` | Tells caller you'll connect them now (triggers escalation) |
| `end_call` | Politely ends the call |
| `ask_purpose` | Asks why they're calling before deciding |

---

## MongoDB Schema

### `UserConfig` — user preferences + categories
```js
{
  userId: "default",
  name: "John",
  about: "...",
  twilioNumber: "+1...",
  aiSettings: { voice: "shimmer", tone: "professional but friendly" },
  
  // ← CORE: drives the dynamic prompt
  callCategories: [
    {
      id: "delivery.food",
      label: "Food Delivery",
      keywords: ["swiggy", "zomato"],
      action: "follow_instructions",
      instructions: "Tell them to leave at the door.",
      notify: true,
      priority: 3
    },
    // ... more categories
  ],
  
  vipContacts: [{ name: "Mom", phoneNumber: "+1...", relationship: "family" }],
  blockedNumbers: [],
  unknownCallerAction: "screen",
  escalationKeywords: ["emergency", "urgent", "hospital"],
  deviceTokens: [{ token: "...", platform: "ios" }]
}
```

### `Call` — every call record
```js
{
  callId: "CA...",
  userId: "default",
  phoneNumber: "+1...",        // caller's number
  direction: "incoming",
  status: "completed",
  duration: 45,
  transcript: [
    { speaker: "caller", text: "Hi, I have a delivery from Swiggy", timestamp },
    { speaker: "ai",     text: "Please leave it at the main door.", timestamp }
  ],
  analysis: {
    categoryId: "delivery.food",    // ← links back to UserConfig.callCategories
    categoryLabel: "Food Delivery",
    confidence: 0.95,
    summary: "Swiggy delivery. AI told them to leave food at the door.",
    sentiment: "positive",
    callerName: null,
    organization: "Swiggy",
    actionTaken: "Told delivery to leave at main door",
    urgency: "normal"
  }
}
```

### `Caller` — profile per phone number
```js
{
  phoneNumber: "+1...",
  callerName: "Swiggy Delivery",
  organization: "Swiggy",
  lastCategoryId: "delivery.food",    // ← pre-loads category context next time
  lastCategoryLabel: "Food Delivery",
  totalCalls: 12,
  contextSummary: "Regular Swiggy delivery agent. Always leaves at door.",
  tags: ["delivery", "swiggy"]
}
```

---

## Real-time: What the Mobile App Receives

The mobile app connects via Socket.io. Events emitted during a call:

```
call:started    → { callId, from, callerName, timestamp, isVIP }
call:transcript → { callId, speaker: "caller"|"ai", text, timestamp }
call:intent     → { callId, categoryId, categoryLabel, confidence }  ← real-time detection
call:action     → { callId, action, response }
call:ended      → { callId, duration, summary, categoryId }
```

Commands from the mobile app:
```
call:takeover   → { callId }       triggers Conference Bridge
call:disconnect → { callId }       ends the call
```

---

## API Reference

### Voice (Twilio + Agent)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/voice/incoming-call` | Twilio webhook for incoming calls |
| POST | `/voice/call-status` | Twilio call status updates |
| POST | `/voice/outbound-twiml` | TwiML served to Twilio for outbound |
| **POST** | **`/voice/outbound-call`** | **← TEST THIS: Start an AI call** |
| POST | `/voice/takeover` | User joins call via Conference Bridge |
| POST | `/voice/end-call` | Force end a call |
| GET | `/voice/status` | Active calls debug info |

### Calls
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/calls` | All call history (paginated) |
| GET | `/api/calls/:id` | Full call with transcript |
| GET | `/api/calls/caller/:phone` | Caller context (profile + all calls + category history) |
| PATCH | `/api/calls/caller/:phone` | Update caller profile (name, notes, tags) |

### Users / Config
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/users/config` | Get full user config |
| PUT | `/api/users/config` | Update user config |
| GET | `/api/users/categories` | List call categories |
| POST | `/api/users/categories` | Add a new category |
| PUT | `/api/users/categories/:id` | Edit a category (instructions, keywords, action) |
| DELETE | `/api/users/categories/:id` | Remove a category |
| PUT | `/api/users/vip-contacts` | Set VIP contact list |
| POST | `/api/users/device-token` | Register push notification token |

---

## Testing: Outbound Call via API

This is the primary way to test the agent without call forwarding setup.

### Quick test
```bash
# 1. Make sure backend is running with ngrok
npm run dev

# 2. Set your Twilio webhook to your ngrok URL:
#    https://your-ngrok.ngrok.io/voice/incoming-call
#    https://your-ngrok.ngrok.io/voice/call-status

# 3. Trigger an outbound call
curl -X POST http://localhost:3000/voice/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "callerName": "Test Person",
    "context": "Calling to check if the order was received"
  }'

# Response includes callSid, callerName, previousCalls, lastCategory
```

### What to verify
1. **Call connects** → AI speaks the greeting
2. **Transcripts stream** → Socket.io emits `call:transcript` events
3. **Category detected** → Say "I have a delivery from Swiggy" → AI follows food delivery instructions
4. **Context loaded** → Call again from same number → AI references previous call
5. **Call saved** → After hang up, `GET /api/calls` shows the call with `categoryId`
6. **Caller updated** → `GET /api/calls/caller/:phone` shows `lastCategoryId: "delivery.food"`

---

## File Structure

```
backend/src/
├── app.js                          Express + Socket.io + WebSocket server
│
├── voice/
│   ├── VoiceAgent.js               Twilio ↔ OpenAI audio bridge + Socket.io emitter
│   ├── PromptGenerator.js          Builds dynamic system prompt from user config + context
│   └── ConversationAnalyzer.js     Post-call analysis → categoryId + summary
│
├── services/
│   ├── callHistoryService.js       Save/retrieve calls + 3-level caller context
│   ├── userConfigService.js        User config + category CRUD
│   ├── twilioService.js            Conference bridge (call takeover)
│   └── pushNotificationService.js  Firebase/APNs notifications
│
├── routes/
│   ├── voice.js                    Twilio webhooks + outbound-call API
│   ├── calls.js                    Call history + caller context API
│   ├── users.js                    User config + category management API
│   └── auth.js                     JWT auth
│
├── models/mongodb/
│   ├── UserConfig.js               User prefs + callCategories schema
│   ├── Call.js                     Call record with transcript + analysis.categoryId
│   └── Caller.js                   Caller profile with lastCategoryId + contextSummary
│
├── middleware/auth.js
└── config/mongodb.js
```

---

## Current Status

### ✅ Done
- VoiceAgent: Twilio ↔ OpenAI real-time audio bridge
- Socket.io: live transcript streaming to mobile app
- PromptGenerator: dynamic prompt from `callCategories` + caller context
- ConversationAnalyzer: category-based post-call analysis
- MongoDB schemas: `Call`, `Caller`, `UserConfig` with category system
- callHistoryService: 3-level context (caller profile + recent calls + category history)
- API: outbound call, incoming call, call history, user config, category CRUD

### 🔄 In Progress
- `twilioService.js`: Conference Bridge for call takeover
- `pushNotificationService.js`: Firebase Admin SDK

### 📋 Next
- Wire real-time category detection (emit `call:intent` during live call)
- Update Caller.contextSummary after each call (rolling GPT-generated narrative)
- Mobile app: Live Call Monitor screen + takeover button

---

## Environment Variables

```env
PORT=3000

# MongoDB
MONGODB_URI=mongodb+srv://...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# OpenAI
OPENAI_ENDPOINT=https://...openai.azure.com
OPENAI_API_KEY=...
OPENAI_DEPLOYMENT_NAME=gpt-realtime-mini         # for voice
OPENAI_CHAT_DEPLOYMENT=gpt-4.1-mini              # for analysis

# ngrok (local dev)
WEBHOOK_URL=https://your-ngrok.ngrok.io

# JWT
JWT_SECRET=...
```
