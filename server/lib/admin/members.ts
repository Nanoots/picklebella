import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jsonBody, notFound, ok, requireMethod, withApi } from '../http.js'
import { requireAdmin } from '../auth.js'
import { db } from '../supabase.js'
import { memberAccessInput, parse } from '../validation.js'

type Member = {
  name: string
  email: string
  phone: string
  banned: boolean
  vip: boolean
  notes: string
  bookingsCount: number
  totalSpent: number
  lastBookingDate: string | null
}

/**
 * The member list: registered accounts, plus anyone who has ever been booked
 * in by staff without signing up.
 *
 * This is the most sensitive read in the API — it is every customer's contact
 * details and spend. It exists behind requireAdmin and nowhere else; no part
 * of the customer-facing API returns another person's row.
 */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'PATCH')
  await requireAdmin(req)

  if (method === 'PATCH') {
    const input = parse(memberAccessInput, jsonBody(req))

    const patch: Record<string, unknown> = {}
    if (input.banned !== undefined) patch.banned = input.banned
    if (input.vip !== undefined) patch.vip = input.vip
    if (input.notes !== undefined) patch.notes = input.notes

    const { data, error } = await db
      .from('profiles')
      .update(patch)
      .eq('email', input.email)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('No account with that email address.')

    ok(res, {
      name: data.name,
      email: data.email,
      phone: data.phone,
      banned: data.banned,
      vip: data.vip,
      notes: data.notes,
      bookingsCount: 0,
      totalSpent: 0,
      lastBookingDate: null,
    })
    return
  }

  const [{ data: profiles, error: profileError }, { data: bookings, error: bookingError }] =
    await Promise.all([
      db.from('profiles').select('name, email, phone, banned, vip, notes'),
      db.from('bookings').select('name, email, phone, amount, date, status').eq('status', 'paid'),
    ])

  if (profileError) throw profileError
  if (bookingError) throw bookingError

  const byEmail = new Map<string, Member>()

  for (const p of profiles ?? []) {
    // A guest (anonymous sign-in) account has no email — profiles.email is
    // nullable for exactly that reason (see migration
    // 20250101000008_guest_and_phone_login.sql). This whole screen keys
    // members by email (the PATCH handler above looks one up by it too), so
    // an account with none isn't a "member" this view can show or manage;
    // any paid booking it made under a typed contact email still surfaces
    // below as a walk-in-style entry.
    if (!p.email) continue
    byEmail.set(p.email.toLowerCase(), {
      name: p.name ?? '',
      email: p.email,
      phone: p.phone ?? '',
      banned: p.banned === true,
      vip: p.vip === true,
      notes: p.notes ?? '',
      bookingsCount: 0,
      totalSpent: 0,
      lastBookingDate: null,
    })
  }

  for (const b of bookings ?? []) {
    const key = (b.email ?? '').toLowerCase()
    if (!key) continue

    let member = byEmail.get(key)
    if (!member) {
      // A walk-in guest with no account: still a member for reporting purposes.
      member = {
        name: b.name ?? '',
        email: b.email,
        phone: b.phone ?? '',
        banned: false,
        vip: false,
        notes: '',
        bookingsCount: 0,
        totalSpent: 0,
        lastBookingDate: null,
      }
      byEmail.set(key, member)
    }

    member.bookingsCount += 1
    member.totalSpent += Number(b.amount)
    if (!member.lastBookingDate || b.date > member.lastBookingDate) member.lastBookingDate = b.date
  }

  ok(res, [...byEmail.values()].sort((a, b) => b.totalSpent - a.totalSpent))
})
