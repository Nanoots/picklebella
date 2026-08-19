/* Server environment, validated once at cold start.

   Failing loudly here beats failing quietly at request time: a missing
   QUOTE_SIGNING_SECRET, for instance, would otherwise let unsigned quotes
   through if someone wrote a lazy fallback. There are no fallbacks. */

function required(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in server/.env for local dev, or in the Vercel project's Environment Variables.`,
    )
  }
  return value.trim()
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const SUPABASE_URL = required('SUPABASE_URL')
export const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
export const SUPABASE_ANON_KEY = required('SUPABASE_ANON_KEY')

/** Exact origins permitted to call this API. Empty means "same-origin only". */
export const ALLOWED_ORIGINS: readonly string[] = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)

export const QUOTE_SIGNING_SECRET = required('QUOTE_SIGNING_SECRET')
export const QUOTE_TTL_SECONDS = optionalInt('QUOTE_TTL_SECONDS', 900)

/* PayMongo.

   Deliberately OPTIONAL rather than required(): a missing key must not stop
   the whole API booting, because everything except taking payment still works
   without it. The payment endpoints answer 503 with a sentence the customer
   can act on, which is a far better failure than every request 500ing.

   PAYMONGO_SECRET_KEY  — sk_test_… or sk_live_…, from Developers → API Keys.
                          Server-side only; it can move money.
   PAYMONGO_WEBHOOK_SECRET — whsk_…, issued when the webhook is registered.
                          Without it a webhook cannot be trusted, so payments
                          would never be confirmed.
   PUBLIC_APP_URL       — where the wallet sends the customer back to. Must be
                          the client origin, e.g. https://picklebella-client.vercel.app */
export const PAYMONGO_SECRET_KEY = (process.env.PAYMONGO_SECRET_KEY ?? '').trim()
export const PAYMONGO_WEBHOOK_SECRET = (process.env.PAYMONGO_WEBHOOK_SECRET ?? '').trim()
export const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL ?? ALLOWED_ORIGINS[0] ?? '').replace(/\/+$/, '')

/** How long a slot is held while the customer is away paying. */
export const PAYMENT_HOLD_SECONDS = optionalInt('PAYMENT_HOLD_SECONDS', 900)

export const IS_PRODUCTION = process.env.VERCEL_ENV === 'production'

if (QUOTE_SIGNING_SECRET.length < 32) {
  throw new Error(
    'QUOTE_SIGNING_SECRET is too short. Generate one with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  )
}

if (IS_PRODUCTION && ALLOWED_ORIGINS.length === 0) {
  throw new Error('ALLOWED_ORIGINS must list the client origin in production.')
}

if (PAYMONGO_SECRET_KEY && !/^sk_(test|live)_/.test(PAYMONGO_SECRET_KEY)) {
  throw new Error(
    'PAYMONGO_SECRET_KEY does not look like a PayMongo secret key (expected sk_test_… or sk_live_…). ' +
      'A wallet or merchant account number is not an API key — copy the secret key from ' +
      'the PayMongo dashboard under Developers → API Keys.',
  )
}

if (PAYMONGO_SECRET_KEY && !PAYMONGO_WEBHOOK_SECRET) {
  // Not fatal: the redirect still works and the return page polls the intent
  // directly. But without the webhook a customer who pays and closes the tab
  // before being redirected back leaves a hold that lapses instead of a
  // booking, so this is worth shouting about in the log.
  console.warn(
    '[env] PAYMONGO_SECRET_KEY is set but PAYMONGO_WEBHOOK_SECRET is not. ' +
      'Payments will only be confirmed when the customer returns to the site.',
  )
}
