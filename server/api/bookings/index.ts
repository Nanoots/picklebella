import type { VercelRequest, VercelResponse } from '@vercel/node'
import { conflict, created, jsonBody, ok, requireMethod, withApi, HttpError } from '../../lib/http.js'
import { requireActiveUser } from '../../lib/auth.js'
import { rateLimit } from '../../lib/rateLimit.js'
import { db } from '../../lib/supabase.js'
import { PAYMENT_METHODS, mapBooking } from '../../lib/domain.js'
import { createBookingRequest, parse } from '../../lib/validation.js'
import { methodFromQuote, verifyQuote } from '../../lib/quotes.js'
import { attachPaymentMethod, createPaymentIntent, createPaymentMethod, isPaymentsConfigured } from '../../lib/paymongo.js'
import { PAYMENT_HOLD_SECONDS, PUBLIC_APP_URL } from '../../lib/env.js'

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST')
  const caller = await requireActiveUser(req)

  if (method === 'GET') {
    // Scoped by user_id from the verified token, not by any id in the request.
    // There is no shape of query string that returns someone else's bookings.
    //
    // Abandoned payment holds are swept first, so a customer who backed out of
    // GCash ten minutes ago doesn't see a "pending" booking they no longer
    // have.
    await db.rpc('expire_pending_bookings')

    const { data, error } = await db
      .from('bookings')
      .select('*')
      .eq('user_id', caller.id)
      .neq('status', 'failed')
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
  // The body names a payment method; the signed quote supplies its price.
  const priced = methodFromQuote(quote, input.paymentMethod)
  const gateway = PAYMENT_METHODS[input.paymentMethod]

  if (!gateway?.enabled) {
    throw new HttpError(400, 'payment_method_invalid', 'That payment method is not available.')
  }

  if (!isPaymentsConfigured()) {
    throw new HttpError(
      503,
      'payments_unconfigured',
      'Online payment is not set up yet. Please contact PickleBella Park to book.',
    )
  }

  /* Step 1 — hold the slots.

     The basket goes in as 'pending', which the exclusion constraint treats
     exactly like 'paid': for as long as this customer is away at GCash, the
     court is off sale. If the payment never completes the hold lapses and the
     slot returns by itself (see expire_pending_bookings).

     The whole confirmation runs inside one Postgres function: it re-checks
     opening hours and blocks for every slot, redeems the promo once with an
     atomic guarded increment, and inserts the basket. The table's exclusion
     constraint means two requests racing for the same slot cannot both win —
     one commits, the other raises and comes back here as a 409, with the rest
     of its basket rolled back rather than half-booked.

     Court, time and money all come from the signed quote, never from the
     request body. */
  const intentPlaceholder = `pending-${quote.jti}`
  // Follows the rows: the placeholder until they are renamed after the real
  // intent, so the cleanup path below always releases the right basket.
  let heldUnder = intentPlaceholder
  const holdExpiresAt = new Date(Date.now() + PAYMENT_HOLD_SECONDS * 1000).toISOString()

  const { data, error } = await db.rpc('create_bookings', {
    p_user_id: caller.id,
    p_slots: quote.slots.map((s, i) => ({
      courtId: s.courtId,
      date: s.date,
      startHour: s.startHour,
      duration: s.duration,
      amount: priced.shares[i] ?? 0,
    })),
    p_name: input.name,
    p_phone: input.phone,
    // A signed-in customer's email is their verified account's — never the
    // request body's. A guest (anonymous) caller has no account email at
    // all, so this is the only path where input.email is used.
    p_email: caller.email || input.email || '',
    p_players: input.players,
    p_notes: input.notes,
    p_payment_method: input.paymentMethod,
    p_promo_id: quote.promoId,
    p_status: 'pending',
    p_payment_intent_id: intentPlaceholder,
    p_hold_expires_at: holdExpiresAt,
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

  const bookings = (data ?? []).map(mapBooking)

  /* Step 2 — open the payment.

     If anything here fails the hold is released immediately rather than left
     to lapse, so a gateway hiccup doesn't take a court off sale for the next
     quarter of an hour. */
  try {
    const first = quote.slots[0]!
    const description = `PickleBella Park — ${quote.slots.length} slot${quote.slots.length === 1 ? '' : 's'} on ${first.date}`

    const intent = await createPaymentIntent({
      amountPesos: priced.totalAmount,
      description,
      gatewayType: gateway.gateway,
      metadata: { quoteId: quote.jti, userId: caller.id },
    })

    // The rows were inserted before the intent existed, so they carry a
    // placeholder. Naming them after the real intent is what lets the webhook
    // find this basket.
    const { error: linkError } = await db
      .from('bookings')
      .update({ payment_intent_id: intent.id })
      .eq('payment_intent_id', intentPlaceholder)
    if (linkError) throw linkError
    heldUnder = intent.id

    const paymentMethodId = await createPaymentMethod({
      gatewayType: gateway.gateway,
      name: input.name,
      email: caller.email || input.email || '',
      phone: input.phone,
    })

    const attached = await attachPaymentMethod({
      intentId: intent.id,
      clientKey: intent.clientKey,
      paymentMethodId,
      returnUrl: `${PUBLIC_APP_URL}/?payment=${encodeURIComponent(intent.id)}`,
    })

    created(res, {
      bookings,
      paymentIntentId: intent.id,
      /** Where to send the customer. Null for QR Ph, which shows an image instead. */
      redirectUrl: attached.redirectUrl,
      qrImageUrl: attached.qrImageUrl,
      expiresAt: holdExpiresAt,
    })
  } catch (err) {
    // settle_payment(false) puts the rows into 'failed', which frees the slots
    // and hands the promo redemption back.
    await db.rpc('settle_payment', { p_payment_intent_id: heldUnder, p_paid: false }).then(
      () => undefined,
      (cleanupError: unknown) => {
        // The hold still lapses on its own; log and let the original error win.
        console.error('[bookings] could not release hold after payment failure', cleanupError)
      },
    )
    throw err
  }
})
