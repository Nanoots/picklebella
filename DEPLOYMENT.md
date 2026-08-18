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
| Client on Vercel | Not created |
| First staff account | Not created |

Project reference values, both safe to publish:

```
SUPABASE_URL   https://nudbgiikbquoqeccjaxh.supabase.co
ANON KEY       sb_publishable_O0F_djYNXDigdMk-9QtlLQ_KWZOJJIu
```

## 1. The one secret you need to add

`server/.env` has `SUPABASE_SERVICE_ROLE_KEY=` blank. Get it from
**Supabase → Settings → API Keys → `service_role` / secret key** and paste it
into that file.

This key bypasses row level security completely. Never put it in the client
project, never prefix it `VITE_`, never commit it, never paste it into a chat
or an issue. If it leaks, roll it in the same screen and redeploy.

`server/.env` already contains a generated `QUOTE_SIGNING_SECRET`. Copy that
same value into Vercel later — regenerating it invalidates any quote a
customer is holding mid-booking.

## 2. Database — already applied

All five migrations are live. **Do not run `supabase db push`** against this
project; the migration history was written directly and the CLI will report
drift. The files in `server/supabase/migrations/` are the source of truth for a
*fresh* project.

Two things to set in the dashboard:

- **Authentication → Providers → Email**: turn on *Confirm email*. Without it,
  anyone can sign up as any address, including one that looks like staff.
- **Authentication → URL Configuration**: set Site URL to the client's deployed
  URL and add it to Redirect URLs, so confirmation and password-reset links
  come back to the right place.

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

Deploy, then check `https://YOUR-SERVER.vercel.app/api/health`.

## 5. Client project on Vercel

New project → same repo → **Root Directory** `client`.

| Name | Value |
|---|---|
| `VITE_API_URL` | the server's URL, no trailing slash |
| `VITE_SUPABASE_URL` | `https://nudbgiikbquoqeccjaxh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_O0F_djYNXDigdMk-9QtlLQ_KWZOJJIu` |

**Before this deploy, edit `client/vercel.json`.** The Supabase host is already
correct; the API host is still a placeholder, and the browser will block every
API call until it is real:

```
connect-src 'self' https://picklebella-server-eight.vercel.app https://nudbgiikbquoqeccjaxh.supabase.co
```

## 6. Close the loop

Go back to the server project and set `ALLOWED_ORIGINS` to the client's real
URL, then redeploy. Preview deployments get a fresh URL each time, so add those
explicitly if you want CORS working on previews.

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
