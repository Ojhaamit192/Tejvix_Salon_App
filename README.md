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

The Razorpay backend functions (`create-razorpay-order.js`,
`verify-razorpay-payment.js`) are untouched and ready to use. The
`index.html` UX rewrite replaced the old form-based booking flow with the
step-by-step wizard described further down in this README, so the earlier
`startRazorpayBooking()` helper no longer exists as dead code in the file.
To re-enable Razorpay: in `finalizeBooking()`'s appointment branch, call
`create-razorpay-order` (amount = the selected service's price), open
Razorpay Checkout with the returned `order_id`/`key_id`, and on success call
`verify-razorpay-payment` instead of going straight to the UPI QR step —
the same pattern used before, just inside the new wizard's finalize step.
Razorpay gives verified, bank-confirmed payments (rather than the honesty-
based "I have paid" tap), which is worth moving to once you're ready for
real transaction volume.

---

## Major update: Full UX redesign (mobile-app-style navigation)

`index.html` was rewritten from a single long page into a proper mobile-app
structure. **No features were removed or changed on the backend** — every
existing capability (services, staff, live queue, walk-in tokens, advance
booking, UPI self-report payment, reviews, loyalty, WhatsApp, maps, gallery,
PWA) is still there, just organized around a clearer user journey.

### What changed

- **Bottom navigation** (Home / Services / Queue / Book) replaces scrolling
  through one long page — each tab has a single, clear purpose.
- **Home tab** is a "Discover" view: gallery, rating, address, a single
  primary "Book Appointment" button, then previews of Popular Services,
  Team, and Reviews, each linking deeper. Booking is the primary action;
  everything else is secondary.
- **Services tab** and **Queue tab** are dedicated full views instead of
  being sections you had to scroll past.
- **Book tab is a step-by-step wizard**, not one long form:
  Type → Service → Staff → (Date → Time, for advance bookings) → Details →
  Review → Confirm. Each screen asks for exactly one decision.
  - A **progress indicator** at the top shows completed/current/upcoming
    steps at a glance.
  - **Back always preserves your earlier choices** — the wizard's data
    lives in one JS object (`wizard.data`) that's never cleared by
    navigating backward, only by finishing or explicitly restarting.
  - Selected options get a clear accent border, background tint, and
    checkmark — never ambiguous which one is picked.
  - A **sticky bottom bar** shows the running price and a consistently
    labeled action button (`Continue` while stepping through, `Join Queue`
    or `Continue to Payment` on the final review step) — no need to scroll
    to find the next button.
- **Consistent button language** throughout: `Continue` to progress,
  `Join Queue` / `Continue to Payment` to finalize, `Back` to go back,
  `Try Again` to retry a failed load. No more mixed `Next` / `Proceed` /
  `Submit` wording.
- **Loading states use skeletons** (`.skel` shimmering placeholders)
  instead of blank space or a bare "Loading..." string.
- **Empty and error states are designed**, not raw text: an icon, a plain-
  language explanation, and — for errors — a working `Try Again` button
  that retries the exact same request.
- **Mobile-first**: the whole layout is built for narrow screens first
  (bottom nav, single-column wizard, sticky CTA sized for thumbs), and
  simply has more breathing room on wider screens rather than being
  redesigned separately for desktop.

### What stayed exactly the same (backend, data, APIs)

Nothing in `netlify/functions/`, `supabase/`, `admin.html`, or the database
schema changed for this update — only `index.html`'s structure and code.
Every API call the new wizard makes (`/api/book`, `/api/services`,
`/api/staff`, `/api/queue`, `/api/mark-payment-claimed`, `/api/reviews`) is
the same endpoint, same payload shape, as before.

---

## Major update: 5 add-ons (My Bookings, reminders, Razorpay, charts, owner dashboard)

### Extra setup step: run migration 6

Run **`supabase/migration_6_reminders_sms_log_owner.sql`** in Supabase's SQL
Editor (after migration_5). It adds a `reminder_sent` flag to `tokens` and a
new `sms_logs` table (used by the owner dashboard's SMS counts).

### 1. "My Bookings" lookup

New page: **`my-bookings.html`**. A customer enters their phone number and
sees every booking — any salon, upcoming and past — under that number. No
login needed; it's linked from the footer of the main app. Backed by the
new `my-bookings.js` function (`GET /api/my-bookings?phone=...`).

### 2. Appointment reminder SMS

A new **scheduled function**, `send-reminders.js`, runs automatically every
5 minutes (configured in `netlify.toml` — Netlify's own scheduler, no
external cron service needed). It finds appointments happening in the next
25–35 minutes that haven't been reminded yet and texts the customer, then
marks them so they aren't reminded twice. This function isn't reachable via
`/api/*` — Netlify invokes it on its own timer. You can watch it run under
**Netlify → Functions → send-reminders → Logs**.

### 3. Razorpay is now wired in (with automatic fallback)

The booking wizard's advance-booking step now **tries Razorpay first**: if
`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set, the customer gets
Razorpay's full checkout (verified, bank-confirmed payment). If Razorpay
isn't configured, it **silently falls back** to the UPI self-report flow
from before — no error shown to the customer either way, and no code
changes needed when you're ready to add Razorpay later (just add the two
environment variables and redeploy).

### 4. Visual analytics in the salon admin panel

`admin.html`'s "Today's summary" now includes three charts (via Chart.js,
loaded from a CDN — no build step needed): a 7-day revenue trend, a
services-popularity bar chart, and a busiest-hours bar chart. `analytics.js`
now returns a week of data instead of just today for these.

### 5. Owner dashboard (platform-wide, for you)

New page: **`owner-dashboard.html`** — separate from any salon's admin
panel, protected by its own `OWNER_PASSWORD` environment variable (pick any
strong password and set it in Netlify, alongside your other variables).
Shows, across **every salon on the platform**:

- Total bookings, customers served, no-shows, revenue tracked
- Unique customers and average revenue per customer
- A 7-day bookings & revenue trend chart
- Most-booked services platform-wide
- A per-salon breakdown table (bookings/served/revenue for each shop)
- SMS activity (sent / dev-mode / failed counts, from the new `sms_logs`
  table — this is why migration_6 adds that table)

Backed by the new `owner-analytics.js` function.

### New environment variable

| Key | Value |
|---|---|
| `OWNER_PASSWORD` | any password you choose — protects `owner-dashboard.html` |

(`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` were already documented earlier
in this file — set those too if you want Razorpay active now rather than
later.)

---

## Update: one active booking per phone number, per salon

A customer can now only have **one active booking at a time** at a given
salon — whether that's a walk-in token currently waiting/being served, or
an advance appointment scheduled for later. Trying to book again while one
is already active is rejected with a clear message (e.g. "You already have
an active token (T3) in today's queue" or "...an appointment booked for
20 Sep, 5:30 PM").

This applies everywhere a booking can be created:
- `book.js` (walk-in and the UPI self-report appointment flow)
- `create-razorpay-order.js` — checked **before** taking payment, so a
  customer is never charged for a booking that would then be rejected
- `verify-razorpay-payment.js` — a safety-net check for the rare case of
  two booking attempts happening at almost the same instant

A booking becomes "inactive" again once staff mark it `done` or `no_show`
(walk-in/queue) or it's checked in (appointment) — at that point the same
phone number is free to book again immediately.

No new migration needed — this only adds a check using columns that
already exist.

---

## Update: automatic payout to the salon after Razorpay payment (RazorpayX)

Razorpay Route (the marketplace split-payment product) now requires the
platform to show ₹40 Lakh+ in GST turnover (a rule that took effect
January 1, 2026), so it isn't accessible for a new/small platform. Instead,
this update uses **RazorpayX Payouts** — a separate product with no such
turnover requirement — to automatically send each salon their share right
after a customer's Razorpay payment is verified.

### How it works

1. Customer pays via Razorpay checkout (as before) — money lands in your
   Razorpay account.
2. The instant the payment is verified and the appointment is created,
   `verify-razorpay-payment.js` calls RazorpayX's Payout API to send that
   exact amount to the **salon's own UPI ID** (the same `upi_id` field
   already used for the QR-code flow — no new field to fill in).
3. The outcome (`success`, `failed`, or `no_upi_on_file` if the salon
   hasn't set a UPI ID) is saved on the booking and shown as a badge next
   to that appointment in the admin panel's "Upcoming appointments" list —
   e.g. "● Sent to your UPI" or "● Payout failed — check RazorpayX".

The payout step is best-effort and never blocks the booking itself: if
RazorpayX isn't configured yet, or the payout fails for any reason, the
customer's payment and appointment are still confirmed normally — it just
means you (or the salon) may need to follow up on that payout manually.

### Extra setup step: run migration 7

Run **`supabase/migration_7_razorpayx_payout.sql`** in Supabase's SQL
Editor (after migration_6). It adds `payout_status` and `payout_id`
columns to `tokens` — no new tables.

### Setting up RazorpayX

1. From your existing Razorpay Dashboard, look for **RazorpayX** (Razorpay's
   business banking product) and start onboarding.
2. This requires its own one-time KYC/activation for **your** business (not
   per salon) and linking a current account with one of RazorpayX's partner
   banks (RBL, Yes Bank, Axis, or ICICI, depending on availability).
3. Once activated, find your **RazorpayX account number** on the dashboard.
4. In Netlify: add `RAZORPAY_X_ACCOUNT_NUMBER` with that value.
   `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (already set for the payment
   gateway) work for RazorpayX too — no separate keys needed.
5. Redeploy.

### Getting each salon's UPI ID

This reuses the `upi_id` column on `salons` (from migration_3). If a salon
doesn't have one set yet, add it via Supabase Table Editor — the same value
already used to show the customer-facing payment QR now doubles as the
payout destination.

### Trade-offs worth knowing about

- A small RazorpayX payout fee applies per transaction, on top of the
  regular Razorpay gateway fee.
- Money technically passes through your account for a moment before being
  paid out — worth keeping in mind for your own bookkeeping (you're
  holding, then forwarding, the salon's share, not just collecting your own
  commission).
- If your platform later qualifies for Route (₹40L+ GST turnover), that
  remains a cleaner long-term option — this RazorpayX approach is the
  practical way to get "money goes straight to the salon" working right
  now, without waiting to hit that threshold.

---

## Update: 9 features from the "Universal Super-App" wishlist

After an honest look at all 21 requested features (some needed different
payment/SMS infrastructure entirely, or were more marketing language than
buildable specs — see the in-chat breakdown), here's what got built:

### 1. Multi-service cart
The booking wizard's Service step is now multi-select — pick Haircut *and*
Shaving *and* Facial in one booking, with a running total shown live.

### 2. Retail add-on shelf
A new "Add-ons" step lets customers add retail products (gel, oil, etc.) to
their booking. Manage products per salon in the new `products` table
(Supabase Table Editor — same pattern as services/staff).

### 3. SMS vs WhatsApp channel choice
Customers pick how they want updates. WhatsApp mode skips the SMS (saving
gateway cost) and instead shows a **"Save to WhatsApp"** button with the
booking details pre-filled, so the customer can send it to themselves.

### 4. Happy Hours discount
A toggle in the salon's Admin Panel (Settings card) auto-applies a flat
discount (default 20%) on every booking, Monday–Wednesday.

### 5. High-demand surge fee
When a salon's queue reaches 5+ people waiting, a ₹30 surge fee is added
automatically to new walk-in bookings — no manual toggle needed.

### 6. Walk-in Quick-Add (no phone needed)
A button in the Admin Panel lets staff add an offline/cash walk-in guest —
name and service only, no phone number — so every customer counts toward
revenue and analytics even if they don't want to share their number.

### 7. Cancellation/no-show reason log
Marking a customer as a no-show now requires typing a reason first — this
is saved on the booking (`cancellation_reason`) so an owner can review
patterns later and catch staff skipping bookings to avoid commission.

### 8. Mock vs Real SMS mode
A toggle in the salon Settings card: "Mock" mode skips real SMS sending
entirely (free) — perfect for live pitch demos without burning SMS credit;
"Real" mode sends actual messages as usual.

### 9. One-tap repeat booking
When a returning customer types their phone number, the wizard looks up
their last order at that salon (via the same lookup that powers My
Bookings) and offers "Repeat your last order — Haircut, Hair Gel?" as a
single tap that pre-fills their whole cart.

### Already built earlier (mentioned in the wishlist but not rebuilt)
Live wait-time predictor, stylist selection, PWA install, one-active-
booking-per-phone (server-side, stronger than a localStorage device lock),
and the Owner Dashboard (which already covers the "App Owner Matrix" ask,
now with CSV export added too).

### Coming soon (and why)
- **Bank refund engine** — needs real integration with Razorpay's Refunds
  API; the reschedule/cancellation-reason pieces are built, but automated
  bank refunds with a processing fee need careful, separate work.
- **Voice assistant & counter audio announcements** — genuinely buildable
  (Web Speech API + Supabase Realtime) but intentionally left for a
  dedicated follow-up rather than rushed into this batch.
- **Geofencing fraud shield** — GPS-based proximity checks from a browser
  are unreliable and easy to spoof; not worth shipping as a false sense of
  security.
- **Global (New York) / multi-currency expansion** — Fast2SMS and
  Razorpay/UPI are India-only; real international support needs a
  completely different payment and messaging stack, not a code change.

### Extra setup step: run migration 8

Run **`supabase/migration_8_cart_addons_surge_happyhours.sql`** in
Supabase's SQL Editor (after migration_7). It adds the `products` table
and several columns to `tokens`/`salons` — all additive, existing
single-service bookings keep working exactly as before.
