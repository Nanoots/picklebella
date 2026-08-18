import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  conflict,
  created,
  jsonBody,
  noContent,
  notFound,
  ok,
  optionalQueryParam,
  requireMethod,
  withApi,
} from '../../lib/http.js'
import { requireAdmin } from '../../lib/auth.js'
import { db } from '../../lib/supabase.js'
import { mapBooking } from '../../lib/domain.js'
import { adminBookingQuery, adminCreateBooking, adminUpdateBooking, parse, uuid } from '../../lib/validation.js'

/* Staff view of the reservation book: list, walk-in create, edit, delete.
   requireAdmin runs before the method is even dispatched, so there is no path
   through this file that a non-staff token reaches. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST', 'PATCH', 'DELETE')
  const admin = await requireAdmin(req)

  if (method === 'GET') {
    const filters = parse(adminBookingQuery, {
      from: optionalQueryParam(req, 'from'),
      to: optionalQueryParam(req, 'to'),
      courtId: optionalQueryParam(req, 'courtId'),
    })

    let query = db.from('bookings').select('*').order('date', { ascending: false }).order('start_hour')
    if (filters.from) query = query.gte('date', filters.from)
    if (filters.to) query = query.lte('date', filters.to)
    if (filters.courtId) query = query.eq('court_id', filters.courtId)

    const { data, error } = await query.limit(2000)
    if (error) throw error
    ok(res, (data ?? []).map(mapBooking))
    return
  }

  if (method === 'POST') {
    const input = parse(adminCreateBooking, jsonBody(req))

    // Walk-ins are entered by staff who can see the physical court, so this
    // path trusts the amount they type — but it still goes through the same
    // constraint, so it cannot double-book a slot sold online a second ago.
    const { data, error } = await db
      .from('bookings')
      .insert({
        court_id: input.courtId,
        user_id: null,
        date: input.date,
        start_hour: input.startHour,
        duration: input.duration,
        name: input.name,
        phone: input.phone,
        email: input.email,
        players: input.players,
        notes: input.notes,
        payment_method: input.paymentMethod,
        amount: input.amount,
        status: 'paid',
        created_by: admin.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23P01') throw conflict('That slot is already booked.', 'slot_taken')
      throw error
    }
    created(res, mapBooking(data))
    return
  }

  const id = parse(uuid, req.query.id)

  if (method === 'PATCH') {
    const patch = parse(adminUpdateBooking, jsonBody(req))

    // Built key by key from the validated object. Spreading the request body
    // straight into an update is how `user_id` or `created_at` gets rewritten
    // by a caller who guessed a column name.
    const update: Record<string, unknown> = {}
    if (patch.date !== undefined) update.date = patch.date
    if (patch.startHour !== undefined) update.start_hour = patch.startHour
    if (patch.duration !== undefined) update.duration = patch.duration
    if (patch.courtId !== undefined) update.court_id = patch.courtId
    if (patch.name !== undefined) update.name = patch.name
    if (patch.phone !== undefined) update.phone = patch.phone
    if (patch.players !== undefined) update.players = patch.players
    if (patch.notes !== undefined) update.notes = patch.notes
    if (patch.amount !== undefined) update.amount = patch.amount
    if (patch.status !== undefined) {
      update.status = patch.status
      update.cancelled_at = patch.status === 'cancelled' ? new Date().toISOString() : null
    }

    const { data, error } = await db.from('bookings').update(update).eq('id', id).select().maybeSingle()
    if (error) {
      if (error.code === '23P01') throw conflict('That change would clash with another booking.', 'slot_taken')
      throw error
    }
    if (!data) throw notFound('Booking not found.')
    ok(res, mapBooking(data))
    return
  }

  const { error: deleteError, count } = await db
    .from('bookings')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (deleteError) throw deleteError
  if (!count) throw notFound('Booking not found.')
  noContent(res)
})
