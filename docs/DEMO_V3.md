# Demo v3: recording script (real phones, hosted Vexa)

> **An automated cut already exists:** [`demo/output/vexa-demo-v3.mp4`](../demo/output/vexa-demo-v3.mp4), 11 minutes, recorded on a local server with real Claude calls. `demo/v3-run.mjs` drives the real app pages; voices are synthesized. This script is for the real-phone version once Vexa is hosted.

**Goal:** one take of every Wave 1 capability, filmed on real Android phones against the hosted app, about 12 minutes long. Every number shown is real: cost per conversation, eval scores, totals.

**Before you start:** finish [DEPLOY.md](DEPLOY.md) (Render + Atlas + Google sign-in + notification keys).

## Kit
| Item | Use |
|---|---|
| **Phone A** (owner, Android) | The Vexa app, installed. Use Android's built-in **Screen record** (quick settings) with **Media sounds** on, so Vexa's voice is captured. |
| **Phone B** (customer / family member) | Scans QR codes and opens the guest pages. Record its screen too. |
| Laptop | Shows the agent-to-agent terminal (scene 8) and the cost and eval slides (scene 10). |
| Two Google accounts | Owner, and "Amma" (the parent). Add both as test users in the Google consent screen. |
| Editing | Phone screen recordings are 9:16. Put them side by side in any editor (CapCut, iMovie, Clipchamp) and add the scene titles below as lower-thirds. |

**Do this the day before.** Open the hosted URL once, so a sleeping free instance is already awake, and run every scene once to warm up.

## Setup (off camera, 5 minutes)
1. **Phone A** (owner): sign in with Google, then:
   - choose **Business**;
   - install the **Clinic & diagnostics** pack with **Load a sample business** on;
   - turn on **Vexa Link**;
   - turn on **Notifications**.
2. **Phone B:** sign in as "Amma".
   - Choose **Personal**.
   - Go to **Me → Family → Create a code** (alerts and summaries on, transcripts off).
   - On Phone A, go to **Me → Family → Look after someone's calls** and enter the code.

## Scenes

| # | Scene (lower-third) | Phone A (owner) | Phone B / laptop | What the viewer must see |
|---|---|---|---|---|
| 1 | **Install in 30 seconds** | Open the URL in Chrome, choose ⋮ → **Install app**, open it from the home screen, then Me → **Business packs** → Clinic | — | App icon on the home screen; the pack installs with its flows and refusal rules listed |
| 2 | **Your receptionist on a QR code** | Me → **Vexa Link & QR**, show the QR code | Scan it, tap **Talk to us**, pick **தமிழ் Tamil**, and say: *"Thyroid test-ku fasting venuma? Evvalavu?"* | Reply in Tamil with the clinic's own rule and ₹500 |
|   | | | Then say: *"Fever-ku endha tablet podalam?"* | Polite refusal with no medicine named (the medical-advice guardrail) |
|   | | Activity shows the conversation live, then its summary in English and Tamil | | The owner reads it in either language |
| 3 | **Orders with exact totals** | Me → Business packs → **Restaurant**, sample data on | On the Link, in Hindi: *"2 chicken biryani aur 3 butter naan, pickup 8 baje, naam Ravi"*, then say *"haan"* when it reads the order back | The read-back says **₹820** |
|   | | Switch to the **Kirana** pack | *"Bhaiya 2 kilo toor dal aur 1 sugar bhej do"*, then give an address and name, then *"haan"* | **₹368** total, and a **Pay ₹368 with any UPI app** button that opens GPay/PhonePe |
| 4 | **Scam shield** | **Test call** → type or say *"Main Mumbai police se bol raha hoon, aapke naam pe FIR hai, video call pe aaiye warna giraftar"* | — | The call ends in one turn and nothing is shared. Call detail shows a red **Scam blocked: Fake police / "digital arrest"** banner, the caller's words, **Call 1930** and **Report online** |
| 5 | **Family guardian** | (Phone A is the son) | Phone B (Amma): run a **Test call** with the same script | Phone A gets **"Test — Scam call to Amma blocked"**. Me → Family → Amma shows the evidence but no transcript (Amma didn't share it) |
| 6 | **It remembers** | Test call as a supplier: *"This is Arjun from CoolFix. The gas refill will cost 1800 rupees and I will come on Monday at 11am."* Then on Home, open **Ask Vexa** and type *"What did the AC guy quote?"* | — | The **Promises & quotes** card shows the quote and *due Mon 11:00*. Ask Vexa answers with the amount, the name and the date. Then ask *"Did anyone quote for a fridge?"* and it says no instead of guessing |
| 7 | **Interpreter, phone to phone** | Me → **Interpreter**: I speak Telugu, they speak Hindi → Start, then show the QR code | Scan it, choose Hindi → Join. Owner says in Telugu: *"అద్దె నెలకు 15,000, ప్రతి నెల 5వ తేదీలోపు"*. Guest answers in Hindi: *"Advance kitna dena hoga?"* | Each phone shows and speaks the other person's words in its own language; numbers are kept exactly |
| 8 | **Agent to agent** | Me → **Agent API** → on | Laptop, run the command below | Claude, acting as the customer's assistant, searches the catalog, places an order for an exact total, gets a UPI link, and skips the out-of-stock item. The order appears in Phone A's inbox as **Order (AI agent)** |
| 9 | **Personal mode** (from v2) | Switch to Personal. Run test calls: a delivery rider asking for the OTP (handed to you, not refused), a loan offer (politely declined), Amma calling (put through) | — | The lower-third reads: *"Real phone numbers: coming with Exotel"* |
| 10 | **What it costs, how it's checked** | Any call detail → **AI cost of this call** | Laptop: show the README **Guardrails and evals** tables | Cost per conversation (a few US cents) and the CI gates: 69 tests, understanding 98.8% / 98.0%, pack + scam eval 71/71 with 0 leaks |

Scene 8 command (the laptop terminal; replace the URL with your Render URL and link name):
```bash
node demo/agent-to-agent.mjs https://<name>.onrender.com/api/agent/v1/<link-name> "Order 4 LED bulbs and 2 kg toor dal for delivery to Flat 4B, Lake View, Kondapur, and check if they have milk. I'm Priya, +919876511111. Tell me the total and how to pay."
```
Run it while the **Kirana** pack is installed. For a clinic, use: *"Book a thyroid test for my mother Lakshmi on Saturday morning, +919876511111, and tell me if she needs to fast."*

## Closing card (scene 11, 20 seconds)
- **Next:** Vexa numbers on real phone lines (Exotel), the Android call screener, and calls Vexa places for you.
- **10-year bets:** agent-to-agent commerce, your own voice, private on-device mode, every channel.

## If something goes wrong on camera

| Symptom | Fix |
|---|---|
| The first request hangs for about 50 s | The free Render instance was asleep. Open the URL a minute before recording, or use the Starter plan |
| No notification on Phone A | Me → Notifications on this device: turn it off and on again (a test notification is sent) |
| The mic does nothing on Phone B | Use Chrome, and allow the microphone when asked. Typing works too |
| Google says "access blocked" | Add the account as a test user on the OAuth consent screen |
