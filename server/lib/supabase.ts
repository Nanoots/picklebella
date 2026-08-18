/* Database access.

   `db` holds the service-role key, which BYPASSES ROW LEVEL SECURITY. Every
   query made through it is fully trusted by Postgres, so every handler that
   uses it must do its own authorisation first — see auth.ts. This module is
   never imported by anything under client/. */

import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } from './env.js'

export const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    // A serverless function has no user and no browser: it must not try to
    // persist or refresh a session, and it must not pick a session up out of
    // a URL it happens to be handed.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'X-Client-Info': 'picklebella-server' },
  },
})

/** Anon-key client, used only to validate a caller's access token. */
export const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
