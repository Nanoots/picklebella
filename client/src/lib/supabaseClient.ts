/* The browser's Supabase client — used ONLY for authentication.

   Reads and writes of business data go through the server API (api.ts), not
   through this client directly. That keeps one place where booking rules are
   enforced. Row level security still denies this key everything it shouldn't
   see, so a mistake here cannot leak other customers' bookings.

   Sessions are persisted by supabase-js in localStorage and refreshed
   automatically; the access token is a short-lived JWT that the API verifies
   on every request. */

import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

/** Current access token, or null when signed out. Refreshes if near expiry. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
