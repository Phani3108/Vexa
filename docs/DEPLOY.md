# Deploy Vexa on the internet (Render + MongoDB Atlas)

You need four free accounts and about 30 minutes. You don't need a phone number, SMS provider, Firebase or Play Store account. Customers reach Vexa through **Vexa Link**, a web page plus QR code, and through the **agent API**. Owners install the web app on their phones.

```
Phone browser / installed app ──HTTPS──► Render (Docker: API + web app, Singapore)
                                             │
                                             ├──► MongoDB Atlas M0 (AWS Mumbai)
                                             ├──► Claude API (understanding, analysis, translation)
                                             └──► Web Push services (Google / Apple / Mozilla)
```

| Step | Where | What you get |
|---|---|---|
| 1 | MongoDB Atlas | `MONGODB_URI` |
| 2 | Google Cloud console | `GOOGLE_CLIENT_ID` (sign-in without SMS) |
| 3 | Your laptop | `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (notifications) |
| 4 | Render | The live site, e.g. `https://vexa.onrender.com` |
| 5 | Your phone | Installed app, a pack, and your Vexa Link QR code |

## 1. Database: MongoDB Atlas (free)
1. Go to **cloud.mongodb.com** and sign up.
2. Click **Create** and choose **M0 Free**:
   - Provider: **AWS**.
   - Region: **Mumbai (ap-south-1)**.
3. Under **Database Access**, add a user with a password. The password should be letters and numbers only, so it doesn't need URL-encoding.
4. Under **Network Access**, add `0.0.0.0/0`. Render's free plan has no fixed outgoing IP.
5. Go to **Connect → Drivers** and copy the `mongodb+srv://…` string.
6. In that string:
   - Replace `<password>` with your password.
   - Add the database name `/vexa` before the `?`.

## 2. Google sign-in (free)
Without SMS login codes, this is how you and your beta users sign in.
1. Go to **console.cloud.google.com**.
2. Create a project.
3. Under **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name: **Vexa**.
   - Support email: your own email.
   - Leave it in **Testing** mode and add your beta users' Gmail addresses as test users.
4. Under **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** your Render URL from step 4, e.g. `https://vexa.onrender.com`, plus `http://localhost:5173` for local testing.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). This is not a secret.

## 3. Notification keys (already made)
A key pair has been generated for you in `backend/.data/vapid-production.json`. That file is git-ignored and readable only by you. Open it and copy both values when Render asks for them, and keep the private key secret.

To make a new pair instead, run `npx web-push generate-vapid-keys`.

### Check everything before you deploy
Create `backend/.env.production` (also git-ignored) with `MONGODB_URI`, `ANTHROPIC_API_KEY`, `ANTHROPIC_FAST_MODEL=claude-haiku-5-5`, `GOOGLE_CLIENT_ID` and `VAPID_SUBJECT`, then run:
```bash
cd backend && npm run check:deploy -- --env .env.production
```
The check connects to Atlas, makes one tiny call to each Claude model, checks the Google client ID format, and confirms the notification keys belong together. It never prints a secret; it tells you exactly what to fix.

## 4. Render (free web service)
1. Push this repo to GitHub. It already contains `render.yaml`.
2. In Render, go to **New → Blueprint**, pick the repo, and fill in the values it asks for:

| Variable | Value |
|---|---|
| `MONGODB_URI` | from step 1 |
| `ANTHROPIC_API_KEY` | your Claude API key |
| `GOOGLE_CLIENT_ID` | from step 2 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | from step 3 |
| `VAPID_SUBJECT` | `mailto:` plus your email |

   `JWT_SECRET` and `STREAM_TOKEN_SECRET` are generated for you.
3. Wait for the first deploy (about 5 minutes), then open `https://<name>.onrender.com/health`. You should see `"mongodb":"connected"`.
4. If Render gave you a different URL than the one you put into Google in step 2, add the real one to **Authorized JavaScript origins**.

> **Free-plan limits:**
> - The service sleeps after 15 idle minutes, and the next visit takes about 50 seconds to wake it.
> - In-progress chats and interpreter rooms are kept in memory, so a restart ends them.
>
> For a beta with real customers, use the **Starter** plan ($7/month), which never sleeps.

## 5. On your phone
1. Open your Render URL in **Chrome** (Android) or **Safari** (iPhone) and choose **Continue with Google**.
2. Install the app:
   - Android: Chrome → ⋮ → **Install app**, or tap **Install Vexa** in Me.
   - iPhone: **Share → Add to Home Screen**.
3. In **Me → Notifications on this device**, turn notifications on. A test notification arrives.
4. In **Me → Business packs**, pick yours (for example, Kirana) and keep **Load a sample business** on to try it right away.
5. In **Me → Vexa Link & QR**, turn the link on. Download the QR code, print it for the counter, or share the link on WhatsApp.
6. Scan the QR code with a second phone and talk to your receptionist in Hindi, Telugu or English.

## What works without a phone number

| Works today | Needs a phone provider (Exotel / Twilio) |
|---|---|
| Vexa Link conversations (voice and text, 8 languages) | Answering real phone calls |
| Packs, orders with UPI pay button, booking requests | SMS login codes and SMS confirmations |
| Scam shield, family guardian alerts | Recording real calls |
| Memory, promises and reminders; Ask Vexa | Live call takeover |
| Interpreter (phone to phone) | |
| Agent API for other AIs | |
| Test calls from the app | |

## Updating
Push to `main` and Render redeploys automatically. Before you deploy, CI runs the tests, the language-understanding gate and the pack + scam eval.
