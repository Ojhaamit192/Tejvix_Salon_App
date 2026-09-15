# Tejvix Salon — Token & Queue App

A token/queue booking app for **Tejvix**, a salon in Muzaffarpur.
Built to deploy entirely on **Netlify** via GitHub — no separate backend server to host.

- `index.html` — the customer-facing app (booking form, live queue board, services)
- `netlify/functions/` — serverless functions that handle the queue and send SMS via Twilio
- `netlify.toml` — routes `/api/*` to the functions
- Queue data is stored in **Netlify Blobs** (Netlify's built-in key-value store), so no external database is needed

## Why serverless functions instead of one HTML file

Twilio needs an Account SID and Auth Token to send SMS — these are secret. Putting
them directly in `index.html`/JavaScript would let anyone who views the page
source steal them and send SMS on your Twilio bill. So the Twilio calls live in
small Node.js functions that run on Netlify's servers, and `index.html` only
talks to those functions over `/api/...`.

## 1. Push this to GitHub

```bash
cd tejvix-salon-app
git init
git add .
git commit -m "Tejvix salon token app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(`.env` and `node_modules` are already excluded via `.gitignore` — never commit real Twilio keys.)

## 2. Deploy on Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
2. Connect GitHub and pick this repository.
3. Build settings: leave **Publish directory** as `.` and **Functions directory** as `netlify/functions` — `netlify.toml` already has these set, so Netlify should detect them automatically.
4. Deploy. Netlify installs the dependencies in `package.json` automatically.

## 3. Add your Twilio credentials

In the Netlify dashboard: **Site settings → Environment variables**, add:

| Key | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | from console.twilio.com |
| `TWILIO_AUTH_TOKEN` | from console.twilio.com |
| `TWILIO_FROM_NUMBER` | your Twilio phone number, e.g. `+1xxxxxxxxxx` |

Then trigger a redeploy (**Deploys → Trigger deploy**) so the functions pick up the new variables.

Without these set, the app still works fully — SMS sending just gets skipped, and a
`[DEV MODE - SMS not sent]` line is logged instead (visible in **Functions → book/next → Logs** on Netlify).

## 4. Enable Netlify Blobs

Netlify Blobs works out of the box on Netlify's servers with no extra setup — it's automatically available to your functions once deployed.

## Testing locally before deploying (optional)

If you have [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed:

```bash
npm install
npm install -g netlify-cli
netlify dev
```

Copy `.env.example` to `.env` and fill in your Twilio details for local testing
(or leave it out to test in dev mode with no real SMS sent). `netlify dev` runs
`index.html` and the functions together, so you can test the whole flow at
`http://localhost:8888`.

## How the queue works

- A customer submits the form → `book.js` assigns the next token (T1, T2, ...) for
  today, saves it in the queue's blob, and sends a Twilio SMS confirmation.
- Salon staff call `next.js` (`POST /api/next`) to move the queue forward — it
  marks the current token done, promotes the next one to "serving" and texts
  them, and also texts whoever is now second in line to get ready.
- `index.html` polls `queue.js` (`GET /api/queue`) every 5 seconds to keep the
  live board up to date.
- The queue resets naturally each day, since tokens are stored under a key
  based on today's date.

## What to add next

- A small admin page or button that calls `/api/next`, so staff don't need a
  separate tool to advance the queue.
- WhatsApp notifications: Twilio's WhatsApp API works through the same
  `_twilio.js` helper — just use a WhatsApp-enabled Twilio number (e.g.
  `whatsapp:+14155238886`) as the `from`/`to` prefix.
