/* Reads and validates the build-time environment.

   Everything Vite exposes under `import.meta.env.VITE_*` is baked into the
   published bundle and readable by anyone. Only publishable values belong
   here — the service-role key and any other secret stay in server/. */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy client/.env.example to .env.local and fill it in, ` +
        `or set it in the Vercel project's Environment Variables.`,
    )
  }
  return value
}

export const API_URL = required('VITE_API_URL', import.meta.env.VITE_API_URL).replace(/\/+$/, '')
export const SUPABASE_URL = required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL)
export const SUPABASE_ANON_KEY = required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY)
