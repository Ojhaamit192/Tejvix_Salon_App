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

---

## Major update: Staff, Services, Appointments, Reviews, Loyalty, Analytics

This platform now includes:

- **Estimated wait time** — each service has a duration; the queue board shows
  "~X min" per person waiting, based on the services ahead of them.
- **Multiple barbers (parallel queues)** — each salon can have several staff
  members, each with their own independent queue. The booking form lets a
  customer pick a barber (or "Any available").
- **Advance appointment booking** — customers can toggle "Book for later"
  and pick a time slot today; staff check them in from the admin panel when
  they arrive, which converts them into a normal queue token.
- **No-show handling** — the staff panel has two buttons: "Done — Call Next"
  and "Skip (No-Show) — Call Next", so a customer who doesn't show up
  doesn't block the queue.
- **Owner analytics** — the staff panel shows today's total bookings, how
  many were served vs no-shows, the most popular service, the busiest hour,
  and estimated revenue.
- **Ratings & reviews** — after a customer is marked "Done", they get an SMS
  with a link (`index.html?review=<token_id>`) to rate their visit 1-5 stars.
  Average ratings show up as a badge on each salon's card in the directory.
- **Loyalty rewards** — every 5th visit (by phone number) is flagged in the
  booking confirmation SMS ("This is your visit #5 — ask staff about your
  reward!").

### Extra setup step: run the migration

After `schema.sql`, also run **`supabase/migration_2_staff_services_reviews.sql`**
in Supabase's SQL Editor. It adds the `services`, `staff`, and `reviews`
tables, extends `tokens` with the new columns, and seeds 6 services + 2
staff members for each of the two demo salons. It's safe to re-run — it
won't duplicate rows.

### New functions

`services.js`, `staff.js`, `reviews.js`, `analytics.js`, `checkin.js`,
`appointments.js` — all follow the same `/api/*` pattern as before, no
extra Netlify configuration needed.

### Simplifications worth knowing about (this is still demo-grade)

- Appointment slots are only offered for "later today", not future dates —
  extending this to multi-day booking just means giving the time picker a
  date component too.
- No-show detection is manual (staff taps the button) rather than automatic
  after a timeout — automatic detection would need a scheduled/cron
  function, which Netlify supports (Scheduled Functions) as a next step.
- The review SMS just points customers to a link; there's no reminder if
  they don't tap it.
- Analytics are simple aggregates computed on the fly — fine at this scale,
  but a growing salon chain would eventually want a proper reporting table.
