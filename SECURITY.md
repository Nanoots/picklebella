# Security

What this codebase protects, how, and what it deliberately does not yet cover.

## The problems this structure exists to solve

The prototype this grew out of kept everything in the browser. That is fine on
a laptop and dangerous on a public URL. Five things had to change before the
site could be deployed at all:

| Prototype behaviour | Why it fails in public | Now |
|---|---|---|
| `ADMIN_USERNAME = 'admin'`, `ADMIN_PASSWORD = 'admin123'` in a source file | Shipped in the JS bundle; readable by anyone with dev tools | Supabase Auth; staff access is a row in `admin_users` that no endpoint can write |
| Sign-in accepted any password | Anyone could sign in as anyone | Passwords verified by Supabase Auth, never handled by this code |
| Booking price computed in the browser and posted back | Book a court for ₱1 by editing a variable | Server prices the basket and HMAC-signs a quote; the total charged comes from inside the signed token |
| Whole booking list loaded into the browser to draw the calendar | Every customer's name, phone and email exposed on a public page | `/api/availability` returns hour statuses only — no personal data |
| Availability checked in JavaScript before writing | Two people can book the same slot at once | A Postgres exclusion constraint makes overlap impossible, plus one transaction for the whole confirmation |

## Layers

**Transport.** HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, and a `Permissions-Policy` that turns off camera,
microphone, geolocation and payment. Set in `client/vercel.json` and
`server/vercel.json`.

**Content Security Policy.** `script-src 'self'` with no `unsafe-inline` —
Vite's inline modulepreload polyfill is disabled in `vite.config.ts` so the
policy can stay strict. `object-src 'none'`, `frame-ancestors 'none'`,
`base-uri 'self'`. `connect-src` names the API and Supabase origins
explicitly, so injected script cannot exfiltrate to an arbitrary host.

**CORS.** An exact-match allowlist from `ALLOWED_ORIGINS`. No wildcard, no
regex, no `Access-Control-Allow-Credentials` — the API is bearer-token only,
so browsers never attach ambient credentials to it and CSRF has nothing to
ride on.

**Authentication.** Supabase Auth issues short-lived JWTs. Every protected
endpoint verifies the token against the auth server (`getUser`), which checks
signature and expiry, rather than merely decoding it. Identity is never read
from a request body.

**Authorisation.** `requireAdmin` checks `admin_users` on the server for every
`/api/admin/*` request. The client's `isAdmin` flag only decides whether to
draw the staff navigation. Setting it true in a console produces an empty
shell and a series of 403s.

**Row level security.** Enabled and forced on every table, deny-by-default,
with the broad Supabase grants revoked first. Three public reads exist:
active courts, opening hours, and your own bookings. No browser-held role has
any insert, update or delete policy on `bookings`. `promo_codes`, `blocks` and
`admin_users` have no policy at all and are unreachable with the anon key.

**Input validation.** Every body and query string goes through a Zod schema
(`server/lib/validation.ts`). Unknown keys are stripped, so a caller cannot
smuggle `status`, `amount` or `user_id` into a write. Lengths and numeric
ranges are capped in the schema and again as `CHECK` constraints in the
database.

**Integrity.** Money and availability are decided server-side only. Price
quotes are HMAC-SHA256 signed, bound to the account they were issued to, and
expire (default 15 minutes). A basket is priced in one call so a promo code is
applied once however many slots it covers. Booking confirmation runs inside a
single Postgres function so the hours checks, block checks, promo increment and
every insert either all commit or none do — a basket cannot half-book.

**Error handling.** Unexpected errors return a flat 500 with no detail;
messages and stack traces go to the server log. Database errors in particular
happily name tables and columns, and that is exactly the reconnaissance an
attacker wants.

**Secrets.** `.gitignore` covers `.env`, `.env.*` (except `.env.example`),
`*.pem` and `*.key` at the repo root and in both projects. The service-role
key is only ever read by `server/lib/supabase.ts`.

## Verified

These were tested against the live database (project `nudbgiikbquoqeccjaxh`) by
impersonating the `anon` role — the key that ships inside the JS bundle — not
merely reasoned about.

| Attack with the publishable key | Result |
|---|---|
| Insert a booking at a price of my choosing | permission denied |
| Read all bookings (names, phones, emails) | permission denied |
| Enumerate promo codes | permission denied |
| List staff accounts | permission denied |
| Grant myself admin | permission denied |
| Set all court rates to zero | permission denied |
| Call `create_bookings()` directly | permission denied |
| Read staff maintenance blocks | permission denied |
| Read active courts *(intended to be public)* | 3 rows returned |

Booking integrity, tested at the constraint level:

| Case | Expected | Result |
|---|---|---|
| Overlapping booking, same court and date | rejected | rejected |
| Adjacent booking (12:00 after a 10:00–12:00) | accepted | accepted |
| Same hours on a different court | accepted | accepted |
| Rebooking after a cancellation | accepted | accepted |
| Negative booking amount | rejected | rejected |

Also confirmed over real HTTP against the live PostgREST endpoint, using the
publishable key exactly as a browser would send it:

| Request with the publishable key | Result |
|---|---|
| `GET /rest/v1/courts` | 200 — 3 courts (intended: public) |
| `GET /rest/v1/bookings?select=name,email` | 401 — permission denied for table bookings |

**Not yet verified:** our own API. The endpoints under `server/api/` have never
run against this database. Everything above is enforced by Postgres, so it
holds no matter what the API does — but the handlers, the signed-quote flow and
the rate limits are still untested at runtime.

## Incident: service-role key committed (2026-08-18)

Worth recording, because the response is the part people get wrong.

A `service_role` key was pasted into `server/.env.example` — a *committed*
template — and pushed to a public repository. That key bypasses row level
security entirely: it could read every customer's contact details and grant
anyone admin.

What was done, in order of what actually mattered:

1. **Legacy API keys disabled in Supabase.** This is the fix. Verified by
   replaying the leaked key against the REST API and getting
   `401 Legacy API keys are disabled`.
2. The commit was purged from `main` and the template restored with blank
   values.
3. A `pre-commit` hook was added (`.githooks/pre-commit`) that refuses to
   commit JWTs, Supabase secret keys, a filled-in `SERVICE_ROLE_KEY`, or any
   real `.env` file. Enable it per clone with
   `git config core.hooksPath .githooks`.

**Purging the commit was not the fix, and on its own would have been useless.**
Force-pushing leaves dangling objects reachable by SHA, GitHub caches commit
views, and public repositories are scraped by credential bots within seconds.
Only rotation makes a leaked key worthless. Treat any secret that has touched a
remote — or a chat log, or an issue comment — as compromised, and rotate it.

## Rate limits

| Endpoint | Limit |
|---|---|
| `/api/availability` | 120 / min per IP |
| `/api/quote` | 30 / min per account |
| `POST /api/bookings` | 10 / min per account |
| basket size | 12 slots per quote |

Counters are in-instance memory, so on Vercel the real ceiling is roughly
limit × concurrent instances. That reliably stops one client hammering an
endpoint in a loop, which is the abuse this app faces. It is not a defence
against a distributed attack.

## Known gaps

Worth being explicit about, since "just for testing" tends to become
production:

1. **No real payment processing.** Bookings are recorded as `paid` on
   creation. `paymentMethod` and the fee are metadata. Wiring a processor
   means moving the paid/unpaid transition to a verified webhook.
2. **Rate limiting is per-instance.** Move it to Postgres or Upstash before
   real traffic.
3. **Turn on email confirmation** in Supabase Auth (Authentication →
   Providers → Email). Without it, anyone can sign up as any address.
4. **No audit log.** Admin actions record `created_by`/`updated_by` but there
   is no append-only history of who changed what.
5. **No account lockout or CAPTCHA** on repeated failed sign-ins beyond what
   Supabase applies by default. Supabase's built-in Attack Protection is worth
   enabling in the dashboard.
6. **Dependencies are unpinned** (`^` ranges). Commit the lockfiles — they are
   not ignored — and consider `npm audit` in CI.

## If a key leaks

Service-role key: Supabase dashboard → Settings → API → roll it, then update
the Vercel environment variable and redeploy. Treat any booking or profile
data as having been readable in the interim.

`QUOTE_SIGNING_SECRET`: replace it and redeploy. Outstanding quotes stop
verifying, which is the correct outcome — customers mid-booking just re-pick
their slot.
