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
