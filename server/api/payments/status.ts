import type { VercelRequest, VercelResponse } from '@vercel/node'
import { forbidden, notFound, ok, queryParam, requireMethod, withApi } from '../../lib/http.js'
import { requireActiveUser } from '../../lib/auth.js'
import { rateLimit } from '../../lib/rateLimit.js'
import { db } from '../../lib/supabase.js'
import { mapBooking } from '../../lib/domain.js'
import { getPaymentIntent } from '../../lib/paymongo.js'

/**
 * What happened to one payment.
 *
 * The customer comes back from GCash to `/?payment=pi_…`. That query string is
 * just a string in a URL bar — it says nothing about whether money moved, and
 * anyone could type one. So this endpoint ignores it as evidence and does two
 * things instead:
 *
 *   1. checks the intent belongs to the signed-in caller's own bookings
 *   2. asks PayMongo what the intent's status actually is
 *
 * The webhook is what normally settles a basket. This is the belt to its
 * braces: on a slow webhook the customer is often back on the site first, and
 * refreshing the truth here means they see "confirmed" rather than a spinner
 * and a hold that looks like it failed.
 */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  const caller = await requireActiveUser(req)
  rateLimit(req, { bucket: 'payment-status', limit: 60, windowSeconds: 60, identity: caller.id })

  const intentId = queryParam(req, 'intentId')

  const { data: rows, error } = await db
    .from('bookings')
    .select('*')
    .eq('payment_intent_id', intentId)
    .order('date')
    .order('start_hour')

  if (error) throw error
  if (!rows || rows.length === 0) throw notFound('We could not find that payment.')

  // Scoped to the caller: knowing an intent id is not authorisation to read
  // somebody else's booking.
  if (rows.some((r) => r.user_id !== caller.id)) throw forbidden()

  let bookings = rows.map(mapBooking)
  let settledNow = false

  // Still pending? The webhook may not have landed yet — ask the gateway.
  if (bookings.some((b) => b.status === 'pending')) {
    const intent = await getPaymentIntent(intentId)

    if (intent.status === 'succeeded') {
      const { data: updated, error: settleError } = await db.rpc('settle_payment', {
        p_payment_intent_id: intentId,
        p_paid: true,
        p_payment_ref: intent.paymentId,
      })
      if (settleError) throw settleError
      if (Array.isArray(updated) && updated.length > 0) {
        bookings = updated.map(mapBooking)
        settledNow = true
      }
    }
  }

  const allPaid = bookings.every((b) => b.status === 'paid')
  const anyPending = bookings.some((b) => b.status === 'pending')

  ok(res, {
    status: allPaid ? 'paid' : anyPending ? 'pending' : 'failed',
    settledNow,
    bookings,
  })
})
