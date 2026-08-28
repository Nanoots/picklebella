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

/* "Remember me" toggles WHERE the session is written, not whether it is —
   supabase-js always persists one. Checked: localStorage, so it survives
   closing the browser. Unchecked: sessionStorage, so it's gone the moment
   this tab/window closes. setRememberMe must be called before the auth call
   that writes the session (signIn), since the write happens synchronously as
   part of handling that call's response — auth.ts does this. It stays at
   whatever it was last set to for the rest of that session, which is exactly
   right: a background token refresh should keep landing in the same place a
   plain reload would look for it. */
let rememberMe = true

export function setRememberMe(remember: boolean): void {
  rememberMe = remember
}

const dynamicStorage = {
  getItem: (key: string) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (rememberMe) {
      localStorage.setItem(key, value)
      sessionStorage.removeItem(key)
    } else {
      sessionStorage.setItem(key, value)
      localStorage.removeItem(key)
    }
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: dynamicStorage,
  },
})

/** Current access token, or null when signed out. Refreshes if near expiry. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
