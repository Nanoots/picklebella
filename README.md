# PickleBella Park

Court booking for a three-court pickleball venue. React front end, serverless
API, Postgres on Supabase.

```
PickleBella Park/
├── client/                 React 19 + Vite + Tailwind 4 (deploys as a static site)
│   ├── src/lib/api.ts      typed HTTP client — the only way the UI reads or writes data
│   ├── src/lib/auth.ts     Supabase Auth wrapper
│   ├── src/lib/types.ts    domain types, shared with the schema
│   └── vercel.json         SPA routing + security headers
│
└── server/                 Vercel serverless functions (Node 22, TypeScript)
    ├── api/                HTTP endpoints
    ├── lib/                auth, validation, pricing, quotes, rate limiting
    └── supabase/migrations SQL schema, RLS policies, booking function
```

The two directories deploy as **two separate Vercel projects** from the same
repository, each with its own root directory. They are kept apart so the
service-role key and the pricing rules live somewhere the browser can never
reach.

## Getting it running

Prerequisites: Node 20+, a Supabase project, and the Vercel CLI (`npm i -g vercel`).

**1. Database**

```bash
cd server
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push          # applies everything in supabase/migrations
```

Then create your first staff account — see [server/supabase/README.md](server/supabase/README.md).

**2. Server**

```bash
cd server
npm install
cp .env.example .env          # fill in every value
npm run dev                   # http://localhost:3000
```

Generate the quote signing secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**3. Client**

```bash
cd client
npm install
cp .env.example .env.local    # fill in every value
npm run dev                   # http://localhost:5173
```

## Deploying

Step-by-step, including the environment variables each project needs and the
two values in `client/vercel.json` that must be edited before the first
deploy: [DEPLOYMENT.md](DEPLOYMENT.md).

## Security

What is protected, how, and what is still open:
[SECURITY.md](SECURITY.md).

The short version of the important part: **never put a value from
`server/.env` into the client project.** Anything prefixed `VITE_` is compiled
into the JavaScript bundle and is readable by every visitor.

## How a booking works

Worth knowing before changing anything in the booking path, because the split
is deliberate:

1. The grid asks `GET /api/availability` per court and date. It gets hour
   statuses and prices back — **no names, phones, or emails**. A slot someone
   else holds is just `booked`.
2. Selecting slots and hitting Book asks `POST /api/quote` to price the whole
   basket at once. The server applies court rates, peak multipliers, the promo
   discount, and the processor fee, then returns an **HMAC-signed token**.
3. Confirming posts that token to `POST /api/bookings`. The server verifies the
   signature and books from the figures inside it.

So the browser never decides what anything costs, and a promo code is applied
once however many slots it covers. Confirmation runs inside one Postgres
function, so a basket either books completely or not at all — and a database
exclusion constraint makes double-booking impossible rather than unlikely.

## Notes

- **Payments are not real.** Bookings are recorded as `paid` on creation;
  `paymentMethod` and the fee are metadata. See the Known gaps section of
  SECURITY.md before taking money.
- **The admin reservation list caps at 2000 rows.** Pass the `from`/`to`
  filters on `api.admin.listBookings` rather than raising the cap.
- **Ban and VIP flags need a registered account.** A walk-in an admin typed in
  has no profile row to flag, and the server says so rather than inventing one.
