import type { VercelRequest, VercelResponse } from '@vercel/node'
import { conflict, forbidden, notFound, ok, requireMethod, withApi } from '../../lib/http.js'
import { requireUser } from '../../lib/auth.js'
import { db } from '../../lib/supabase.js'
import { mapBooking, todayInManila, currentHourInManila } from '../../lib/domain.js'
import { parse, uuid } from '../../lib/validation.js'

/** How close to the start time a customer may still cancel themselves. */
const CANCEL_CUTOFF_HOURS = 2

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'DELETE')
  const caller = await requireUser(req)
  const id = parse(uuid, req.query.id)

  const { data: row, error } = await db.from('bookings').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!row) throw notFound('Booking not found.')

  // Ownership is checked after the fetch but before anything is disclosed:
  // the 403 body says nothing about the booking.
  if (row.user_id !== caller.id) throw forbidden()

  const booking = mapBooking(row)
  if (booking.status === 'cancelled') {
    ok(res, booking)
    return
  }

  const today = todayInManila()
  const hoursUntilStart =
    booking.date === today
      ? booking.startHour - currentHourInManila()
      : booking.date > today
        ? Number.POSITIVE_INFINITY
        : Number.NEGATIVE_INFINITY

  if (hoursUntilStart < CANCEL_CUTOFF_HOURS) {
    throw conflict(
      `Bookings can only be cancelled more than ${CANCEL_CUTOFF_HOURS} hours before the start time. Please call the front desk.`,
      'cancel_window_closed',
    )
  }

  // Cancelled rather than deleted: the row is the record of what happened, and
  // reports need it. The partial exclusion constraint only covers status =
  // 'paid', so cancelling frees the slot for someone else immediately.
  const { data: updated, error: updateError } = await db
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', caller.id)
    .eq('status', 'paid')
    .select()
    .maybeSingle()

  if (updateError) throw updateError
  if (!updated) throw conflict('That booking could not be cancelled.', 'cancel_failed')

  ok(res, mapBooking(updated))
})
