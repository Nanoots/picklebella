import type { VercelRequest, VercelResponse } from '@vercel/node'
import { conflict, created, jsonBody, ok, requireMethod, withApi } from '../../lib/http.js'
import { requireActiveUser } from '../../lib/auth.js'
import { rateLimit } from '../../lib/rateLimit.js'
import { db } from '../../lib/supabase.js'
import { mapBooking } from '../../lib/domain.js'
import { createBookingRequest, parse } from '../../lib/validation.js'
import { verifyQuote } from '../../lib/quotes.js'

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST')
  const caller = await requireActiveUser(req)

  if (method === 'GET') {
    // Scoped by user_id from the verified token, not by any id in the request.
    // There is no shape of query string that returns someone else's bookings.
    const { data, error } = await db
      .from('bookings')
      .select('*')
      .eq('user_id', caller.id)
      .order('date', { ascending: false })
      .order('start_hour', { ascending: false })
      .limit(200)

    if (error) throw error
    ok(res, (data ?? []).map(mapBooking))
    return
  }

  rateLimit(req, { bucket: 'booking-create', limit: 10, windowSeconds: 60, identity: caller.id })

  const input = parse(createBookingRequest, jsonBody(req))
  const quote = verifyQuote(input.quoteId, caller.id)

  /* The whole confirmation runs inside one Postgres function: it re-checks
     opening hours and blocks for every slot, redeems the promo once with an
     atomic guarded increment, and inserts the basket. The table's exclusion
     constraint means two requests racing for the same slot cannot both win —
     one commits, the other raises and comes back here as a 409, with the rest
     of its basket rolled back rather than half-booked.

     Court, time and money all come from the signed quote, never from the
     request body. */
  const { data, error } = await db.rpc('create_bookings', {
    p_user_id: caller.id,
    p_slots: quote.slots.map((s) => ({
      courtId: s.courtId,
      date: s.date,
      startHour: s.startHour,
      duration: s.duration,
      amount: s.amount,
    })),
    p_name: input.name,
    p_phone: input.phone,
    p_email: caller.email,
    p_players: input.players,
    p_notes: input.notes,
    p_payment_method: quote.paymentMethod,
    p_promo_id: quote.promoId,
  })

  if (error) {
    // The function raises these with a known SQLSTATE so a real conflict reads
    // as a 409 the customer can act on, rather than a blanket 500.
    const conflictCodes: Record<string, string> = {
      P0101: 'One of those slots has just been taken. Please pick another time.',
      P0102: 'One of those slots is unavailable.',
      P0103: 'One of those slots is outside opening hours.',
      P0104: 'That promo code can no longer be used.',
      '23P01': 'One of those slots has just been taken. Please pick another time.',
    }
    const message = conflictCodes[error.code ?? '']
    if (message) throw conflict(message, 'slot_unavailable')
    throw error
  }

  created(res, (data ?? []).map(mapBooking))
})
