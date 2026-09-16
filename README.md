# Tejvix — Multi-Salon Live Queue Platform

A token/queue booking platform that any local salon can join — not just one
shop. Built with **Supabase** (database), **Fast2SMS** (SMS notifications),
and deployed entirely on **Netlify** (frontend + serverless backend).

Two demo salons are seeded so you can show it working for more than one shop:
**Tejvix Salon** and **Prince Salon**, both in Muzaffarpur.

## What's in this project

- `index.html` — the customer-facing app. With no `?salon=` in the URL it
  shows a **directory** of all salons; with `?salon=tejvix` (or any slug) it
  shows that salon's live queue board and booking form.
- `admin.html` — the **staff panel**. Opened as `admin.html?salon=tejvix`,
  it shows who's being served and has one big **"Call Next Customer"**
  button, protected by a PIN.
- `netlify/functions/` — serverless functions: `salons.js` (list salons),
  `book.js` (create a token), `queue.js` (read the live queue),
  `next.js` (staff calls the next customer).
- `supabase/schema.sql` — the database schema to run in your Supabase project.
- `netlify.toml` — routes `/api/*` to the functions.

## How the pieces fit together

```
Customer's phone  ──►  index.html (?salon=prince-salon)
                          │  fetch("/api/book"), fetch("/api/queue")
                          ▼
                    Netlify Functions  ──►  Supabase (Postgres)
                          │                   stores salons + tokens
                          └──►  Fast2SMS  ──►  Customer's SMS

Staff at the counter  ──►  admin.html (?salon=prince-salon)
                          │  fetch("/api/next")  [PIN-protected]
                          ▼
                    Netlify Functions  ──►  Supabase: mark current token
                                              "done", next one "serving"
                                         ──►  Fast2SMS: text that customer
                                              + the one after them
```

The database is never reached directly from the browser — Supabase's
**service role key** (a secret, full-access key) lives only in Netlify's
environment variables and is used only inside the functions. This is why
`supabase/schema.sql` doesn't add any public read/write policies: the only
door in is through your own functions.

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates the `salons` and `tokens`
   tables and seeds the two demo salons (Tejvix, Prince Salon).
3. Go to **Settings → API** and copy:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role key** (not the `anon` key!) → this is `SUPABASE_SERVICE_ROLE_KEY`

## 2. Set up Fast2SMS

1. Sign up at [fast2sms.com](https://www.fast2sms.com) (new accounts get some free SMS credit).
2. Go to **Dev API** ([fast2sms.com/dashboard/dev-api](https://www.fast2sms.com/dashboard/dev-api)) and copy your API key → this is `FAST2SMS_API_KEY`.

## 3. Push to GitHub & deploy on Netlify

```bash
git init
git add .
git commit -m "Multi-salon queue platform"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Then on [app.netlify.com](https://app.netlify.com): **Add new site → Import an
existing project** → connect the repo. `netlify.toml` already sets the build
config, so just deploy.

## 4. Add environment variables

In Netlify: **Site settings → Environment variables**, add:

| Key | Value |
|---|---|
| `SUPABASE_URL` | from Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key (keep secret!) |
| `FAST2SMS_API_KEY` | from Fast2SMS Dev API page |

Redeploy (**Deploys → Trigger deploy**) so the functions pick these up.

Without these set, everything still runs — SMS just gets skipped and logged
as `[DEV MODE - SMS not sent]` (see **Functions → book/next → Logs** on Netlify),
and Supabase calls will fail until the keys are added.

## Try it out

- Directory: `https://your-site.netlify.app/`
- Tejvix's page: `https://your-site.netlify.app/index.html?salon=tejvix`
- Prince Salon's page: `https://your-site.netlify.app/index.html?salon=prince-salon`
- Tejvix staff panel: `https://your-site.netlify.app/admin.html?salon=tejvix` (PIN: `1234`)
- Prince Salon staff panel: `https://your-site.netlify.app/admin.html?salon=prince-salon` (PIN: `5678`)

(Change these demo PINs in the `salons` table before showing this to anyone outside your team.)

## Adding a new salon

Run this in Supabase's SQL Editor (adjust the values):

```sql
insert into salons (slug, name, address, phone, admin_pin)
values ('new-salon-slug', 'New Salon Name', 'Address, City', '+91 xxxxxxxxxx', '9999');
```

It'll immediately show up in the directory and get its own booking page and
staff panel — no code changes needed.

## Limitations to know about (this is a demo-grade build)

- The staff panel's PIN check is simple and meant for a single-location demo,
  not bank-grade security — anyone with the PIN and the URL can call the next
  customer. Good enough to show the concept; add real staff logins before
  running this for real money.
- All salons currently share the same services & pricing list on the page
  (Hair Cut, Hair Spa, etc.) — add a `services` column to `salons` in
  Supabase and read from it in `index.html` if each salon needs its own list.
- The queue board polls every 5 seconds rather than updating instantly.
  Supabase's Realtime feature could push updates the moment they happen —
  a good next upgrade once the basics are working.
