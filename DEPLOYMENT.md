# Deployment

Two Vercel projects from one GitHub repository. Deploy the server first — the
client needs its URL.

## Status

| Step | State |
|---|---|
| GitHub repo | **Done** — https://github.com/Nanoots/picklebella |
| Supabase schema, RLS, functions, seed data | **Done** — applied to project `nudbgiikbquoqeccjaxh` |
| Local `client/.env.local` and `server/.env` | **Done** — one field left blank, see below |
| Service role key | **Done** — set in Vercel |
| Server on Vercel | **Live** — https://picklebella-server-eight.vercel.app (12/12 endpoint checks passing) |
| Client on Vercel | **Live** — https://picklebella-client.vercel.app |
| First staff account | Not created |

Project reference values, both safe to publish:

```
SUPABASE_URL   https://nudbgiikbquoqeccjaxh.supabase.co
ANON KEY       sb_publishable_O0F_djYNXDigdMk-9QtlLQ_KWZOJJIu
```

## 1. The one secret you need to add

It is already set **in Vercel**, so the deployed server works. Your **local**
`server/.env` still has `SUPABASE_SERVICE_ROLE_KEY=` blank — fill that in only
if you want to run the server on your own machine. Get it from
**Supabase → Settings → API Keys → the `sb_secret_...` key**.

Note that legacy JWT API keys are disabled on this project, so the old
`service_role` key format no longer works. Use the new secret key.

This key bypasses row level security completely. Never put it in the client
project, never prefix it `VITE_`, never commit it, never paste it into a chat
or an issue. If it leaks, roll it in the same screen and redeploy.

`server/.env` already contains a generated `QUOTE_SIGNING_SECRET`. Copy that
same value into Vercel later — regenerating it invalidates any quote a
customer is holding mid-booking.

## 2. Database — already applied

Migrations 1–5 are live. **Do not run `supabase db push`** against this
project; the migration history was written directly and the CLI will report
drift. The files in `server/supabase/migrations/` are the source of truth for a
*fresh* project.

**`20250101000006_payments.sql` still needs applying.** It is what makes real
payments possible: it adds the `pending` booking status, teaches the
no-double-booking constraint to respect a live payment hold, and adds the
functions the webhook calls. Paste it into the Supabase SQL editor and run it.
Until it is applied, `POST /api/bookings` will fail — the API calls
`create_bookings` with arguments the old function does not have.

Three things to set in the dashboard:

- **Authentication → Providers → Email**: turn on *Confirm email*. Without it,
  anyone can sign up as any address, including one that looks like staff.
- **Authentication → URL Configuration**: set Site URL to the client's deployed
  URL and add it to Redirect URLs, so confirmation and password-reset links
  come back to the right place.
- **Authentication → Providers → Anonymous Sign-Ins**: turn this on. It is
  what powers "Continue as Guest" — a real, if disposable, session with no
  email or password, so a visitor can pay without creating an account. It
  reuses the same booking/payment endpoints as everyone else (see
  `client/src/lib/auth.ts`'s `continueAsGuest`), so nothing else needs
  enabling for it to work. Supabase also recommends turning on CAPTCHA
  (Authentication → Attack Protection) to keep the anonymous endpoint from
  being used to inflate the user count — migration
  `20250101000008_guest_and_phone_login.sql` is the schema half of this (it
  makes `profiles.email` nullable, since an anonymous account has none).

## 3. Local development

```bash
cd server && npm install && npm run dev     # http://localhost:3000
cd client && npm install && npm run dev     # http://localhost:5173
```

Both `.env` files are already filled in for local work apart from the service
role key. Check `http://localhost:3000/api/health` returns
`{"data":{"status":"ok"}}` before opening the client.

## 4. Server project on Vercel

New project → import `Nanoots/picklebella` → set **Root Directory** to `server`.

Environment variables (Production, Preview, Development):

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://nudbgiikbquoqeccjaxh.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_O0F_djYNXDigdMk-9QtlLQ_KWZOJJIu` |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase, secret |
| `ALLOWED_ORIGINS` | the client's URL — fill in after step 5 |
| `QUOTE_SIGNING_SECRET` | copy from your local `server/.env` |
| `QUOTE_TTL_SECONDS` | `900` |
| `PAYMONGO_SECRET_KEY` | `sk_test_…` or `sk_live_…`, secret — see step 4a |
| `PAYMONGO_WEBHOOK_SECRET` | `whsk_…`, secret — see step 4a |
| `PUBLIC_APP_URL` | the client's URL, no trailing slash |
| `PAYMENT_HOLD_SECONDS` | `900` |

Deploy, then check `https://YOUR-SERVER.vercel.app/api/health`.

## 4a. PayMongo

Nothing can be booked until this is done: with no key, `POST /api/bookings`
answers 503 and the modal says online payment is not set up. That is
deliberate — the alternative is marking bookings paid when no money moved.

1. **Get the secret key.** PayMongo dashboard → Developers → API Keys. Copy the
   *secret* key (`sk_test_…` while you are testing, `sk_live_…` when you are
   ready to take real money). Your wallet/merchant account number is not an API
   key and will be rejected at boot with an explanatory error.

2. **Enable the methods** you want under Developers → Payment Methods: GCash,
   Maya and QR Ph. A method that is off in the dashboard fails at the attach
   step no matter what the site shows.

3. **Register the webhook.** This is what turns a payment into a booking:
   without it PayMongo has no way to tell the server that the money arrived.

   In the dashboard: **Developer Tools → Webhooks → Add Endpoint**.

   | Field | Value |
   |---|---|
   | Endpoint URL | `https://picklebella-server-eight.vercel.app/api/payments/webhook` |
   | Events | `payment.paid`, `payment.failed` |

   On save it shows a secret starting with `whsk_`. **Copy it straight away**
   — it is displayed once. That value is `PAYMONGO_WEBHOOK_SECRET`. If you lose
   it, delete the endpoint and add it again.

   <details>
   <summary>The same thing from a terminal, if you prefer</summary>

   ```bash
   curl https://api.paymongo.com/v1/webhooks \
     -u sk_test_YOUR_KEY: \
     -H 'Content-Type: application/json' \
     -d '{ "data": { "attributes": {
           "url": "https://picklebella-server-eight.vercel.app/api/payments/webhook",
           "events": ["payment.paid", "payment.failed"] } } }'
   ```

   The secret is `attributes.secret_key` in the response.
   </details>

4. **Test mode and live mode have separate webhooks.** An endpoint belongs to
   whichever mode the dashboard toggle was in when you created it. Create it in
   test mode while the key is `sk_test_…`; when you move to `sk_live_…`, add the
   endpoint again in live mode and update `PAYMONGO_WEBHOOK_SECRET`.

5. **Redeploy the server project** once the variables are set. Vercel only
   picks up environment changes on a new deployment, so a payment attempt
   before that still behaves as though nothing is configured.

### How a booking is paid for

1. The customer presses Pay. The server prices the basket from the signed
   quote, writes the slots as `pending`, and opens a PayMongo payment intent.
2. The customer is redirected to GCash or Maya (QR Ph shows a QR code instead).
3. PayMongo calls the webhook; the rows move to `paid`.
4. The customer lands on `/?payment=pi_…`, which asks the server what happened
   rather than trusting the URL — and settles the booking itself if the webhook
   has not arrived yet.

While a payment is in flight the court is **off sale**: the exclusion
constraint counts `pending` alongside `paid`, so two people cannot be sent to
GCash for the same 7pm slot. An abandoned checkout releases its hold after
`PAYMENT_HOLD_SECONDS`.

## 5. Client project on Vercel

New project → same repo → **Root Directory** `client`.

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://picklebella-server-eight.vercel.app` |
| `VITE_SUPABASE_URL` | `https://nudbgiikbquoqeccjaxh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_O0F_djYNXDigdMk-9QtlLQ_KWZOJJIu` |

The CSP in `client/vercel.json` already names the live API and Supabase hosts,
so nothing needs editing before this deploy:

```
connect-src 'self' https://picklebella-server-eight.vercel.app https://nudbgiikbquoqeccjaxh.supabase.co
img-src 'self' data: blob: https://*.paymongo.com https://*.tile.openstreetmap.org
```

(`*.tile.openstreetmap.org` is the venue map on the landing/booking pages — Leaflet loads
tiles as plain `<img>` requests, which CSP treats as `img-src`, not `connect-src`. Two earlier
attempts didn't make it: MapLibre GL + OpenFreeMap's vector tiles were dropped after the Web
Worker script turned out to not survive Vite's production bundling, and CARTO's "free" raster
basemaps turned out to require registering a domain/API key, watermarking every tile "API KEY
REQUIRED" otherwise. See the "maplibre-gl worker fix" project memory if any of this needs
revisiting.)

If the server ever moves to a different URL, this must be updated too or the
browser will silently block every API call.

`img-src` also names `https://*.paymongo.com`, which is where the QR Ph code
image is served from. Remove it and QR Ph payments show a broken image.

## 6. Close the loop

On the **server** project set:

```
ALLOWED_ORIGINS=https://picklebella-client.vercel.app,http://localhost:5173
```

No trailing slashes, no spaces around the comma. Then **redeploy the server** —
environment variable changes do not apply to an existing deployment.

Until this matches the client origin exactly, the browser discards every API
response and the site reports "Could not reach the server". The server is fine
in that state; curl against it works. Only the browser is blocked, because only
browsers enforce CORS.

Preview deployments get a fresh URL each time, so add those explicitly if you
want CORS working on previews.

## 7. Create your first staff account

Sign up through the deployed site with the address that should have staff
access, confirm the email, then in the Supabase SQL editor:

```sql
insert into public.admin_users (user_id, note)
select id, 'Owner'
from auth.users
where email = 'you@example.com'
on conflict (user_id) do nothing;
```

There is deliberately no endpoint for this — adding an admin requires database
access, so compromising the API is not enough to become one.

## 8. Verify before trusting it

- `/api/health` responds.
- Landing page loads with no CSP violations in the browser console.
- Sign-up sends a confirmation email.
- A signed-in non-staff account gets **403** from
  `https://YOUR-SERVER.vercel.app/api/admin/bookings`.
- `curl https://YOUR-SERVER.vercel.app/api/admin/members` with no token returns
  **401**, not data.
- Headers present:
  `curl -sI https://YOUR-CLIENT.vercel.app | grep -i "strict-transport\|content-security"`
- Book a slot end to end, then try to book the same slot from a second browser —
  the second should fail with a "just taken" message, not a double booking.

The database-level guarantees behind that last one are already tested and
passing; see the Verified section of SECURITY.md.

## Notes

**Deployment protection.** For a test deployment that should not be publicly
reachable, turn on Vercel Authentication in the client project's settings. It
also gates the API, so protect both projects or neither.

**Custom domains** mean updating `ALLOWED_ORIGINS`, the CSP `connect-src`, and
Supabase's Site URL and Redirect URLs.

**Rollback.** Both projects keep previous deployments; promote an older one from
the dashboard. Database migrations do not roll back with them — write a new
migration instead.
