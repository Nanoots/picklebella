import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jsonBody, ok, requireMethod, withApi } from '../lib/http.js'
import { rateLimit, clientKey } from '../lib/rateLimit.js'
import { db } from '../lib/supabase.js'
import { parse, resolveLoginIdentifier } from '../lib/validation.js'
import { normalizePhone } from '../lib/phone.js'

/**
 * Turns whatever a customer typed into the sign-in field into the email
 * Supabase actually needs for signInWithPassword.
 *
 * An email is passed straight through — no lookup, no information disclosed
 * beyond what the caller already typed. A phone number needs translating: it
 * is looked up against profiles.phone (unauthenticated, so this must not
 * become a way to test which phone numbers have accounts). Two things keep
 * that closed:
 *
 *   - No match, and more than one match (profiles.phone is not unique — see
 *     migration 8), both come back as `email: null`. The caller cannot tell
 *     "no such account" from "ambiguous account" from each other.
 *   - The client is expected to attempt signInWithPassword with SOME email
 *     either way (falling back to a placeholder that can never match a real
 *     account on a null result), so a wrong phone number and a wrong
 *     password both end up at Supabase's own generic "invalid credentials" —
 *     never a distinct response from this endpoint.
 */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'POST')
  rateLimit(req, { bucket: 'resolve-login-identifier', limit: 20, windowSeconds: 60, identity: clientKey(req) })

  const input = parse(resolveLoginIdentifier, jsonBody(req))
  const identifier = input.identifier.trim()

  if (identifier.includes('@')) {
    ok(res, { email: identifier.toLowerCase() })
    return
  }

  const normalized = normalizePhone(identifier)
  if (!normalized) {
    ok(res, { email: null })
    return
  }

  const { data, error } = await db
    .from('profiles')
    .select('email')
    .eq('phone', normalized)
    .limit(2)

  if (error) throw error

  const email = data?.length === 1 ? data[0]!.email : null
  ok(res, { email: email || null })
})
