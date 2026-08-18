/* Caller identity and authorisation.

   Two rules this module exists to enforce:

     1. Identity comes from a token Supabase signed, verified on every single
        request. Nothing in the request body is ever treated as identity — a
        caller cannot say "I am admin" or "this booking belongs to someone
        else" by editing JSON.

     2. Staff access is a row in `admin_users`, checked server-side. There is
        no admin password in this codebase, no admin flag in a JWT the client
        could tamper with, and no environment variable that grants it. */

import type { VercelRequest } from '@vercel/node'
import { authClient, db } from './supabase.js'
import { forbidden, unauthorized } from './http.js'

export type Caller = {
  id: string
  email: string
  name: string
  phone: string
  banned: boolean
}

function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || null
}

/**
 * Verifies the access token and returns who is calling.
 *
 * getUser() checks the token's signature and expiry against the auth server
 * rather than merely decoding it, so a forged or expired token fails here.
 */
export async function requireUser(req: VercelRequest): Promise<Caller> {
  const token = bearerToken(req)
  if (!token) throw unauthorized()

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) throw unauthorized('Your session has expired. Please sign in again.')

  const user = data.user
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>

  // The profile row carries the moderation flags. It is created by a trigger
  // on signup, but a missing row must not silently mean "not banned", so we
  // fail closed if the lookup itself errors.
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('name, phone, banned')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw unauthorized('Could not verify your account. Please try again.')

  return {
    id: user.id,
    email: user.email ?? '',
    name: (profile?.name || (typeof meta.name === 'string' ? meta.name : '') || '').trim(),
    phone: (profile?.phone || (typeof meta.phone === 'string' ? meta.phone : '') || '').trim(),
    banned: profile?.banned === true,
  }
}

/** Like requireUser, but also rejects accounts staff have banned. */
export async function requireActiveUser(req: VercelRequest): Promise<Caller> {
  const caller = await requireUser(req)
  if (caller.banned) {
    throw forbidden('This account cannot make bookings. Please contact the front desk.')
  }
  return caller
}

export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  // Fail closed: an unreadable admin table means "not an admin", never "sure".
  if (error) return false
  return Boolean(data)
}

/** Gate for every /api/admin/* endpoint. */
export async function requireAdmin(req: VercelRequest): Promise<Caller> {
  const caller = await requireUser(req)
  if (!(await isAdmin(caller.id))) {
    // Same 403 a signed-in customer gets, with no hint that the endpoint
    // exists for someone else.
    throw forbidden()
  }
  return caller
}
