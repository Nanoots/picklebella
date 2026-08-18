/* =========================================================
   PickleBella Park — authentication.

   Replaces the prototype's mocked sign-in (which accepted any password) and
   its hardcoded admin/admin123 pair. Passwords are verified by Supabase Auth
   and never touch our own code or storage.

   Admin status is a SERVER fact. isAdmin() reports what the server says so
   the UI can hide staff screens, but hiding is only cosmetic — every admin
   endpoint re-checks the caller independently. A visitor who flips this to
   true in their console sees an empty shell and 403s.
   ========================================================= */

import { supabase } from './supabaseClient'
import { API_URL } from './env'
import { ApiError } from './api'
import type { CustomerUser } from './types'

export type Session = {
  user: CustomerUser
  isAdmin: boolean
}

/** Maps a Supabase auth user onto the app's customer shape. */
function toCustomer(user: { email?: string; user_metadata?: Record<string, unknown> }): CustomerUser {
  const meta = user.user_metadata ?? {}
  const email = user.email ?? ''
  return {
    name: typeof meta.name === 'string' && meta.name ? meta.name : email.split('@')[0].replace(/[._]/g, ' '),
    email,
    phone: typeof meta.phone === 'string' ? meta.phone : '',
  }
}

export async function signUp(input: {
  name: string
  email: string
  phone: string
  password: string
}): Promise<{ user: CustomerUser | null; needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { name: input.name.trim(), phone: input.phone.trim() } },
  })
  if (error) throw new ApiError(error.message, error.status ?? 400, 'signup_failed')

  // With "Confirm email" on (recommended, and the Supabase default), signUp
  // returns a user but no session until the emailed link is clicked.
  const needsEmailConfirmation = !data.session
  return {
    user: data.user ? toCustomer(data.user) : null,
    needsEmailConfirmation,
  }
}

export async function signIn(email: string, password: string): Promise<CustomerUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) {
    // Supabase deliberately returns the same message for "no such account" and
    // "wrong password" so the endpoint can't be used to enumerate who has an
    // account here. Pass it through rather than trying to be more specific.
    throw new ApiError(error.message, error.status ?? 400, 'signin_failed')
  }
  if (!data.user) throw new ApiError('Sign in failed.', 400, 'signin_failed')
  return toCustomer(data.user)
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin + '/reset-password',
  })
  if (error) throw new ApiError(error.message, error.status ?? 400, 'reset_failed')
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/** Current session, or null when signed out. Asks the server whether this account is staff. */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  const authUser = data.session?.user
  if (!authUser) return null

  let isAdmin = false
  try {
    const res = await fetch(API_URL + '/api/me', {
      headers: { Authorization: 'Bearer ' + data.session!.access_token },
      credentials: 'omit',
    })
    if (res.ok) {
      const body = await res.json()
      isAdmin = body?.data?.isAdmin === true
    }
  } catch {
    // Server unreachable — treat as a normal customer rather than failing the
    // whole sign-in. Staff screens simply stay hidden.
    isAdmin = false
  }

  return { user: toCustomer(authUser), isAdmin }
}

/** Subscribes to sign-in/sign-out, including token refreshes in other tabs. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      cb(null)
      return
    }
    void getSession().then(cb)
  })
  return () => data.subscription.unsubscribe()
}
