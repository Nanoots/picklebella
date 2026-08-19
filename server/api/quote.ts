import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, conflict, jsonBody, ok, requireMethod, withApi } from '../lib/http.js'
import { requireActiveUser } from '../lib/auth.js'
import { rateLimit } from '../lib/rateLimit.js'
import { getCourtOrThrow, getHoursConfig, getPricingConfig } from '../lib/settings.js'
import { db } from '../lib/supabase.js'
import {
  PAYMENT_METHODS,
  assertBookableWindow,
  baseAmount,
  discountFor,
  hoursForDate,
  isPeakSlot,
  mapPromo,
  todayInManila,
  type Court,
} from '../lib/domain.js'
import { parse, quoteRequest } from '../lib/validation.js'
import { issueQuote, type QuoteSlot } from '../lib/quotes.js'

/**
 * Prices a basket of slots and returns one signed quote.
 *
 * Everything that determines the total — court rates, peak multiplier, promo
 * discount, processor fee — is read here from the database and applied here.
 * The client sends what it wants to book, never what it thinks that costs.
 *
 * The basket is priced as a unit so a promo code is applied once no matter how
 * many slots it covers, and EVERY enabled payment method is priced in the same
 * pass. The customer switching between GCash and Maya is then an instant local
 * re-render rather than another round trip, without the browser ever working
 * out a fee for itself.
 */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'POST')

  const caller = await requireActiveUser(req)

  // Per-account, not per-IP: promo guessing is the thing worth throttling and
  // an attacker rotating IPs still needs an account per attempt.
  rateLimit(req, { bucket: 'quote', limit: 30, windowSeconds: 60, identity: caller.id })

  const input = parse(quoteRequest, jsonBody(req))

  const [hoursCfg, pricing] = await Promise.all([getHoursConfig(), getPricingConfig()])

  // Court records are shared across slots on the same court, so fetch each once.
  const courtIds = [...new Set(input.slots.map((s) => s.courtId))]
  const courts = new Map<string, Court>(
    await Promise.all(
      courtIds.map(async (id): Promise<[string, Court]> => [id, await getCourtOrThrow(id, { activeOnly: true })]),
    ),
  )

  const dates = [...new Set(input.slots.map((s) => s.date))]

  // Existing bookings and blocks for every (court, date) the basket touches.
  // Fetched once up front rather than per slot.
  const [{ data: existing, error: existingError }, { data: blocks, error: blocksError }] = await Promise.all([
    db
      .from('bookings')
      .select('court_id, date, start_hour, duration')
      .in('court_id', courtIds)
      .in('date', dates)
      // Live payment holds count as taken, so a customer is told the slot has
      // gone before filling in the form rather than at the gateway.
      .in('status', ['paid', 'pending']),
    db.from('blocks').select('court_id, date, start_hour, end_hour').in('court_id', courtIds).in('date', dates),
  ])
  if (existingError) throw existingError
  if (blocksError) throw blocksError

  const priced: QuoteSlot[] = []

  for (const slot of input.slots) {
    const court = courts.get(slot.courtId)!
    const endHour = slot.startHour + slot.duration

    const windowError = assertBookableWindow(slot.date, slot.startHour)
    if (windowError) throw badRequest(windowError, 'outside_booking_window')

    const hours = hoursForDate(hoursCfg, slot.date)
    if (hours.closed) throw conflict(`The park is closed on ${slot.date}.`, 'venue_closed')
    if (slot.startHour < hours.open || endHour > hours.close) {
      throw conflict(`${court.name} is not open at that time on ${slot.date}.`, 'outside_hours')
    }

    // Cheap pre-check so the customer sees a clash before filling in the form.
    // It is NOT what prevents double booking — the database constraint at
    // confirmation time is (see the create_bookings migration).
    const clash = (existing ?? []).some(
      (b) =>
        b.court_id === slot.courtId &&
        b.date === slot.date &&
        slot.startHour < b.start_hour + b.duration &&
        b.start_hour < endHour,
    )
    if (clash) throw conflict(`${court.name} at that time has just been taken.`, 'slot_taken')

    const blocked = (blocks ?? []).some(
      (b) =>
        b.court_id === slot.courtId &&
        b.date === slot.date &&
        slot.startHour < b.end_hour &&
        b.start_hour < endHour,
    )
    if (blocked) throw conflict(`${court.name} is unavailable at that time.`, 'slot_blocked')

    priced.push({
      courtId: slot.courtId,
      date: slot.date,
      startHour: slot.startHour,
      duration: slot.duration,
      baseAmount: baseAmount(court, pricing, slot.date, slot.startHour, slot.duration),
      peak: isPeakSlot(pricing, slot.date, slot.startHour),
    })
  }

  const basketBase = priced.reduce((sum, s) => sum + s.baseAmount, 0)

  // Promo lookup is server-side and by exact code. The codes table is not
  // readable with the anon key, so codes cannot be enumerated from the client.
  let discount = 0
  let promoId: string | null = null
  if (input.promoCode) {
    const { data: promoRow, error: promoError } = await db
      .from('promo_codes')
      .select('*')
      .ilike('code', input.promoCode)
      .maybeSingle()
    if (promoError) throw promoError
    if (!promoRow) throw badRequest('Promo code not found.', 'promo_invalid')

    const promo = mapPromo(promoRow)
    const today = todayInManila()
    if (!promo.active) throw badRequest('This promo code is no longer active.', 'promo_inactive')
    if (promo.expiresAt && promo.expiresAt < today) {
      throw badRequest('This promo code has expired.', 'promo_expired')
    }
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
      throw badRequest('This promo code has reached its usage limit.', 'promo_exhausted')
    }

    discount = discountFor(promo, basketBase)
    promoId = promo.id
  }

  const { token, quote } = issueQuote({
    userId: caller.id,
    slots: priced,
    discount,
    promoId,
  })

  ok(res, {
    quoteId: token,
    slots: quote.slots,
    baseAmount: quote.baseAmount,
    discount: quote.discount,
    // One entry per enabled method, so the payment picker can label every row
    // with a real price the moment it opens.
    methods: Object.entries(quote.methods).map(([id, m]) => ({
      id,
      label: PAYMENT_METHODS[id]?.label ?? id,
      feeAmount: m.feeAmount,
      totalAmount: m.totalAmount,
    })),
    promoApplied: Boolean(quote.promoId),
    expiresAt: new Date(quote.exp * 1000).toISOString(),
  })
})
