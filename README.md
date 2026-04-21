# 📞 Vexa — AI Call Screener

Vexa is your personal AI assistant that answers phone calls on your behalf, screens callers, and sends you a summary — so you only talk to the people that matter.

## ✨ What It Does

- 🤖 **AI answers your calls** — Uses OpenAI's Realtime Voice API to have natural conversations with callers
- 🛡️ **Screens unknown callers** — Asks who they are, why they're calling, and whether it's urgent
- 📝 **Transcribes everything** — Full call transcripts with AI-generated summaries
- 🔔 **Alerts you in real time** — Live transcript streaming to your phone via WebSocket
- 🚨 **Escalates urgent calls** — Transfers the call to you if the AI detects it's important
- 🚫 **Blocks spam** — Blocked numbers get auto-rejected before the AI even picks up
- ⭐ **VIP list** — Your important contacts get a warmer greeting and faster escalation
- 🎙️ **Pick your AI voice** — Choose from 8 different voices (alloy, echo, shimmer, ash, ballad, coral, sage, verse)

## 🏗️ How It Works

```
Caller → Twilio → Backend (Express) → OpenAI Realtime API
                       ↕                      ↕
                   MongoDB              AI Voice Agent
                       ↕
                 Socket.io → React Native App
```

1. A call comes into your Twilio number
2. Backend connects the caller's audio to OpenAI's Realtime Voice API
3. The AI has a conversation, figures out who's calling and why
4. You get a live transcript on your phone + a summary when the call ends
5. If it's urgent, the AI transfers the call to you directly

## 📱 Mobile App (React Native)

- 📋 **Call history** — See all screened calls with summaries and sentiment
- 🔴 **Live transcript** — Watch the AI conversation happen in real time
- 👤 **Caller profiles** — AI remembers returning callers and their context
- ⚙️ **Settings** — Voice, tone, greeting, categories, priority hours
- ⭐ **VIP contacts** — Mark important callers for special treatment
- 🚫 **Blocked numbers** — Manage your block list from the app
- 🔐 **Auth** — Phone number login with JWT tokens

## 🖥️ Backend (Node.js + Express)

- 🔌 **Twilio integration** — Handles inbound/outbound calls via webhooks
- 🧠 **OpenAI Realtime** — WebSocket connection to GPT-4o for voice conversations
- 💾 **MongoDB** — Stores calls, transcripts, caller profiles, user config
- 📡 **Socket.io** — Real-time events pushed to the mobile app
- 🔒 **Security** — Helmet, rate limiting, JWT auth, input validation
- 📊 **Logging** — Winston logger with structured output

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Mobile | React Native 0.84, TypeScript, React Navigation |
| Backend | Node.js, Express 5, Socket.io |
| AI | OpenAI Realtime API (GPT-4o voice) |
| Telephony | Twilio Programmable Voice |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcrypt |
| Push | Firebase Cloud Messaging |

## 📂 Project Structure

```
Vexa/
├── backend/                # Express API server
│   └── src/
│       ├── app.js          # Entry point
│       ├── config/         # DB, logging config
│       ├── middleware/      # Auth middleware
│       ├── models/mongodb/  # Mongoose schemas (Call, Caller, UserConfig)
│       ├── routes/         # API routes (auth, calls, users, voice, context)
│       ├── services/       # Business logic (call history, user config, Twilio)
│       └── voice/          # Voice agent, prompt generator, conversation analyzer
├── mobile/                 # React Native app
│   └── src/
│       ├── screens/        # All app screens
│       ├── services/       # API client, socket, transcript store
│       ├── contexts/       # Auth + theme providers
│       ├── navigation/     # Tab + stack navigators
│       └── styles/         # Screen stylesheets
```

## 🚀 Getting Started

### Backend

```bash
cd backend
cp .env.example .env        # Add your Twilio, OpenAI, MongoDB credentials
npm install
npm run dev                 # Starts with nodemon on port 3000
```

**Required environment variables:**
- `MONGODB_URI` — MongoDB connection string
- `OPENAI_API_KEY` — OpenAI API key (needs Realtime API access)
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Twilio credentials
- `TWILIO_PHONE_NUMBER` — Your Twilio phone number
- `JWT_SECRET` — Secret for signing tokens

### Mobile

```bash
cd mobile
npm install
npx pod-install             # iOS only
npm run ios                 # or npm run android
```

## 🏛️ Architecture Highlights

- **Multi-user** — Every call, transcript, and config is scoped to a user ID. No shared data between users
- **Real-time pipeline** — Twilio media streams → OpenAI WebSocket → Socket.io → mobile app, all streaming
- **Caller memory** — The AI remembers past interactions with the same caller and adjusts its behavior
- **Category system** — Calls are auto-categorized (personal, work, delivery, medical, etc.) with per-category rules

## 📜 License

MIT
