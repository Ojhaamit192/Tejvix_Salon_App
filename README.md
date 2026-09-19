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

---

## Major update: Maps, WhatsApp, Gallery, Payment QR, Custom Branding, PWA

### Extra setup step: run migration 3

After `migration_2`, also run **`supabase/migration_3_branding_maps_payment.sql`**
in Supabase's SQL Editor. It adds 4 optional columns to the existing `salons`
table — no new tables, safe to re-run.

### Setting these up (done via Supabase Table Editor — no admin UI yet)

Open Supabase → Table Editor → `salons`, find the salon's row, and fill in:

- **`upi_id`** — the salon's UPI ID (e.g. `princesalon@okhdfcbank`). After a
  customer books, a QR code appears with the service's price pre-filled —
  works with any UPI app (GPay, PhonePe, Paytm, etc.).
- **`payment_qr_url`** — instead of a dynamic UPI QR, paste a link to a photo
  of the shop's own printed QR code (upload it anywhere and paste the link
  here). If both this and `upi_id` are set, `payment_qr_url` takes priority.
- **`photos`** — an array of photo URLs (upload photos anywhere — Google
  Photos, Imgur, etc. — and paste the links) to show a gallery on the
  salon's page and a thumbnail in the directory. Example:
  `{"https://.../pic1.jpg","https://.../pic2.jpg"}`
- **`brand_color`** — a hex color (e.g. `#2E86DE`) to give a salon its own
  accent color instead of the default Tejvix orange.

None of these are required — a salon with none of them set just looks like
before.

### What's new on the pages

- **Google Maps** — every salon page now shows an embedded map and a
  "Get Directions" button, built from the salon's address (no Google Maps
  API key needed).
- **WhatsApp button** — appears automatically using the salon's phone number.
- **Photo gallery** — shows if `photos` is set (see above).
- **Payment QR** — appears right after a customer books, if `upi_id` or
  `payment_qr_url` is set.
- **Installable app (PWA)** — visiting the site on a phone offers "Add to
  Home Screen"; it opens like an app afterwards. `manifest.json` and `sw.js`
  handle this — the service worker only caches the page shell, never the
  live queue/booking data.
- **Per-page SEO** — each salon's page sets its own title and meta
  description via JavaScript. Since this is a static site with no
  server-side rendering, this helps modern crawlers (which do run
  JavaScript) but won't show up in simple `view-source` — a known
  limitation of this architecture, not a bug.

### Note on the payment QR

The dynamic UPI QR is generated by pasting a UPI deep-link into a free
third-party QR image service (`api.qrserver.com`) — no backend code, no new
function. It's fine for this use case, but if you'd rather not depend on a
third-party QR generator long-term, swapping it for a bundled QR-code
JS library is a small, self-contained change whenever you're ready.

---

## Major update: 7-day advance booking with Razorpay payment

### Extra setup step: run migration 4

After `migration_3`, also run **`supabase/migration_4_razorpay.sql`** in
Supabase's SQL Editor. It adds `payment_status`, `razorpay_order_id`, and
`razorpay_payment_id` columns to the existing `tokens` table — no new tables.

### Set up Razorpay

1. Create an account at [razorpay.com](https://razorpay.com) (test mode works
   immediately with no KYC; live payments need Razorpay's business
   verification, same as any payment gateway).
2. Go to **Settings → API Keys** and generate a Key ID + Key Secret.
3. In Netlify: **Site settings → Environment variables**, add:

| Key | Value |
|---|---|
| `RAZORPAY_KEY_ID` | starts with `rzp_test_` or `rzp_live_` |
| `RAZORPAY_KEY_SECRET` | keep this secret — never put it in the frontend |

Redeploy after adding these.

### How the new booking flow works

- **Walk-in** bookings are unchanged — join the live queue immediately, pay
  the salon directly (the optional UPI QR from before still applies here).
- **"Book for later"** now offers a **date picker for the next 7 days**
  (not just today), followed by a time slot for that day.
- Submitting an advance booking no longer calls `/api/book`. Instead:
  1. The browser asks `create-razorpay-order.js` to create an order for the
     service's price.
  2. Razorpay's Checkout popup opens (handles cards, UPI, netbanking, wallets
     — "saare options" — automatically; nothing to configure per-method).
  3. On success, the browser sends the payment details to
     `verify-razorpay-payment.js`, which **re-checks the payment signature
     server-side** (never trust a "success" message from the browser alone)
     and only then creates the appointment in Supabase and sends the
     confirmation SMS.
- If payment fails or is cancelled, no appointment is created — the customer
  can just try again.

### Important: one Razorpay account for the whole platform (for now)

All salons currently share **one** Razorpay account (yours), so payments
settle to your bank account, not each salon's. This is the simplest way to
get advance payments working across a multi-salon platform. If different
salons need money to land directly in their own accounts, that requires
**Razorpay Route** (their marketplace/split-payment product, where each
salon links their own bank account) — a bigger project than this update,
worth doing once you have real salons on board who need that.

### Test mode vs live mode

Razorpay's **test mode** keys let you test the entire flow (including test
card numbers listed in Razorpay's docs) without moving real money — good for
trying this out before going live. Switching to `rzp_live_` keys later needs
no code changes, just updating the two environment variables.

---

## Update: Simple "Scan & Confirm" payment (Razorpay made optional)

For now, advance bookings use a simpler, zero-setup payment flow instead of
Razorpay (Razorpay's code is still in the project — see below on switching
to it later, once you're ready to set it up).

### How it works

1. Customer picks a date (next 7 days), time, and service, and submits.
2. The slot is reserved immediately in Supabase.
3. If the salon has `upi_id` or `payment_qr_url` set (from migration_3), a
   payment screen appears with a UPI QR code for that service's exact price.
   The customer scans it with any UPI app and pays.
4. The customer taps **"I have completed the payment ✓"** — this is a
   self-reported confirmation, not a verified one (unlike Razorpay, there's
   no bank-side proof). It's an interim, trust-based solution.
5. An **invoice** appears on screen — salon name, customer details, service,
   amount, date/time, booking reference, and payment status. The customer
   can tap **Print/Save**, and a pre-filled **WhatsApp message is opened**
   to the salon's phone number (from the salon's own WhatsApp, no API or
   Twilio/Meta setup needed) so the owner is notified instantly. If a salon
   has no `upi_id`/`payment_qr_url` set, the payment step is skipped
   entirely and the invoice shows "Payment: Not required".
6. The booking shows up immediately in the admin panel's **"Upcoming
   appointments"** list, with a **● Paid** or **● Payment pending** badge.

No new environment variables or Razorpay account are needed for this — it
reuses the `upi_id` / `payment_qr_url` columns from migration_3.

### Switching to Razorpay later

The Razorpay functions (`create-razorpay-order.js`,
`verify-razorpay-payment.js`) and the `startRazorpayBooking()` function in
`index.html` are still in the codebase, just not wired to the booking form
right now. To switch back once Razorpay is set up: in `index.html`, find
`startUpiClaimBooking({ name, phone, serviceId, staffId, scheduledAt });`
inside the form's submit handler and change it to
`startRazorpayBooking({ name, phone, serviceId, staffId, scheduledAt });`.
Razorpay gives verified, bank-confirmed payments (rather than the honesty-
based "I have paid" tap), which is worth moving to once you're ready for
real transaction volume.
