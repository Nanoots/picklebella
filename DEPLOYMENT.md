# Deployment

Two Vercel projects from one GitHub repository. Deploy the server first — the
client needs its URL.

## 1. Supabase

Create a project, then from `server/`:

```bash
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

Collect three values from **Settings → API**:

| Value | Where it goes |
|---|---|
| Project URL | both projects |
| `anon` / publishable key | both projects |
| `service_role` key | **server only** |

In **Authentication → Providers → Email**, turn on *Confirm email*. Without
it, anyone can sign up as any address, including one that looks like a staff
member's.

In **Authentication → URL Configuration**, set the Site URL to your client's
deployed URL and add it to Redirect URLs, so password-reset and confirmation
links come back to the right place.

Create your first staff account by signing up through the site normally, then
adding it to `admin_users` — see [server/supabase/README.md](server/supabase/README.md).

## 2. Push to GitHub

```bash
cd "PickleBella Park"
git init
git add .
git commit -m "PickleBella Park: client + server"
git branch -M main
git remote add origin git@github.com:YOU/picklebella-park.git
git push -u origin main
```

Before pushing, confirm no secrets are staged:

```bash
git ls-files | grep -E '\.env$|\.env\.' || echo "clean"
```

Only `.env.example` files should ever appear. If a real `.env` was committed,
rewriting history is not enough — roll the keys.

> GitHub repository names cannot contain spaces. The local folder is
> `PickleBella Park`; name the repo `picklebella-park`.

## 3. Server project

New Vercel project → import the repo → set **Root Directory** to `server`.

Environment variables (Production, Preview, and Development):

| Name | Value |
|---|---|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key |
| `SUPABASE_ANON_KEY` | the publishable key |
| `ALLOWED_ORIGINS` | the client's URL, comma-separated if several |
| `QUOTE_SIGNING_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `QUOTE_TTL_SECONDS` | `900` |

Deploy, then check `https://your-server.vercel.app/api/health` returns
`{"data":{"status":"ok"}}`.

`ALLOWED_ORIGINS` is a chicken-and-egg problem on the first pass: deploy the
server, deploy the client, then come back and set it to the client's real URL
and redeploy. Preview deployments get a fresh URL each time, so add them
explicitly if you need CORS to work on previews.

## 4. Client project

New Vercel project → same repo → **Root Directory** `client`.

| Name | Value |
|---|---|
| `VITE_API_URL` | the server's URL, no trailing slash |
| `VITE_SUPABASE_URL` | your project URL |
| `VITE_SUPABASE_ANON_KEY` | the publishable key |

**Before deploying, edit `client/vercel.json`.** The CSP contains two
placeholders that must become your real hosts, or the browser will block every
API call:

```
connect-src 'self' https://REPLACE-ME-API.vercel.app https://REPLACE-ME-PROJECT-REF.supabase.co;
```

## 5. Check it

- `/api/health` responds.
- The landing page loads with no CSP violations in the console.
- Sign-up sends a confirmation email.
- A signed-in non-staff account gets 403 from
  `https://your-server.vercel.app/api/admin/bookings`.
- `curl https://your-server.vercel.app/api/admin/members` with no token returns
  401, not data.
- Headers are present: `curl -sI https://your-client.vercel.app | grep -i "strict-transport\|content-security"`.

## Notes

**Deployment protection.** For a test deployment that should not be publicly
reachable at all, turn on Vercel Authentication in the client project's
settings. Note that it also gates the API, so protect both projects or neither.

**Custom domains.** Adding one means updating `ALLOWED_ORIGINS`, the CSP
`connect-src`, and Supabase's Site URL and Redirect URLs.

**Rollback.** Both projects keep previous deployments; promote an older one
from the Vercel dashboard. Database migrations do not roll back with them —
write a new migration instead.
