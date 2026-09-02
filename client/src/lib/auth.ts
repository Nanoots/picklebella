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

import { supabase, setRememberMe } from './supabaseClient'
import { API_URL } from './env'
import { ApiError, resolveLoginIdentifier } from './api'
import { looksLikeEmail, normalizePhone } from './phone'
import type { CustomerUser } from './types'

/** A syntactically valid but never-registrable address, so a phone number
 * that doesn't resolve to any account still reaches Supabase's own generic
 * "invalid credentials" error rather than this module inventing a distinct
 * "no such account" message that would let a caller test phone numbers for
 * existence. */
const UNRESOLVED_LOGIN_EMAIL = 'no-such-account@picklebella.invalid'

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
    // Stored normalized so a later sign-in by phone number matches regardless
    // of how this one happened to be formatted — see resolveLoginIdentifier.
    options: { data: { name: input.name.trim(), phone: normalizePhone(input.phone) } },
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

/**
 * Signs in with either an email address or a mobile number.
 *
 * A phone number isn't something Supabase's password grant accepts directly
 * here (this project's accounts are keyed by email — see DEPLOYMENT.md), so
 * it is first resolved server-side to the matching account's email. A phone
 * that doesn't resolve — wrong number, or one shared by more than one
 * account — still reaches signInWithPassword with SOME email, so it fails
 * exactly the way a wrong password does rather than with a different,
 * information-revealing error.
 *
 * `remember` chooses where supabase-js's own session write lands — see
 * setRememberMe in supabaseClient.ts. Must be set before the call below,
 * since that's what actually persists the session.
 */
export async function signIn(identifier: string, password: string, remember = true): Promise<CustomerUser> {
  const trimmed = identifier.trim()
  let email = trimmed
  if (!looksLikeEmail(trimmed)) {
    const resolved = await resolveLoginIdentifier(trimmed)
    email = resolved.email ?? UNRESOLVED_LOGIN_EMAIL
  }

  setRememberMe(remember)
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
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

/**
 * Starts Google's OAuth sign-in/sign-up. There's no separate "sign up with
 * Google" — the account is created automatically on first callback, same as
 * clicking this while already registered just signs in. This navigates the
 * whole page away to Google and back, so nothing about the outcome can be
 * returned here; the redirect lands back on this same origin with a session
 * already in the URL, which supabase-js's `detectSessionInUrl` picks up on
 * its own (see supabaseClient.ts) — App.tsx's onAuthChange subscriber is what
 * actually notices the new session, not a caller of this function.
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/' },
  })
  if (error) throw new ApiError(error.message, error.status ?? 400, 'google_signin_failed')
}

/**
 * Anonymous sign-in for guest checkout: a real, if disposable, Supabase
 * session with no email, password, or personal information required. It
 * uses the `authenticated` role like any other account, so the booking and
 * payment endpoints work unchanged — see server/api/bookings/index.ts for
 * the one place that treats a guest differently (there is no account email
 * to fall back to).
 */
export async function continueAsGuest(): Promise<CustomerUser> {
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw new ApiError(error.message, error.status ?? 400, 'guest_signin_failed')
  if (!data.user) throw new ApiError('Could not continue as guest.', 400, 'guest_signin_failed')
  return toCustomer(data.user)
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin + '/reset-password',
  })
  if (error) throw new ApiError(error.message, error.status ?? 400, 'reset_failed')
}

/** Sets a new password for the session created by clicking a reset-password
 * email link. Supabase treats that link's session as fully signed in — this
 * is the same call an already-signed-in user would use to change theirs. */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new ApiError(error.message, error.status ?? 400, 'update_password_failed')
}

/** Fires once when a reset-password email link has just been opened and
 * Supabase has turned it into a signed-in session — the cue ResetPasswordPage
 * uses to show the "set a new password" form instead of treating this as an
 * ordinary sign-in. */
export function onPasswordRecovery(cb: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') cb()
  })
  return () => data.subscription.unsubscribe()
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
