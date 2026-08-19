import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ok, requireMethod, withApi } from '../lib/http.js'
import { rateLimit } from '../lib/rateLimit.js'
import { getCourtOrThrow, getCourts, getHoursConfig, getPricingConfig } from '../lib/settings.js'
import { db } from '../lib/supabase.js'
import {
  CLOSE_HOUR,
  OPEN_HOUR,
  currentHourInManila,
  hoursForDate,
  slotPrice,
  todayInManila,
  type Court,
  type DayHours,
  type SlotStatus,
} from '../lib/domain.js'
import { availabilityQuery, parse } from '../lib/validation.js'

/**
 * Hour-by-hour status and price for a date.
 *
 * With `courtId`, that one court. Without it, every active court in a single
 * response — which is what both the booking grid and the landing page's
 * "today" strip actually want. Asking per court meant three requests, three
 * cold starts and three copies of the same hours/pricing lookup for a screen
 * that cannot render until the last of them lands.
 *
 * This is the authoritative view: the calendar the browser draws is only ever
 * a rendering of what this returns. Note what it does NOT return — no names,
 * no phone numbers, no booking ids. A slot someone else has booked is simply
 * 'booked'. The prototype's version read the whole booking list into the
 * browser, which would have published every customer's contact details to
 * anyone who opened the page.
 */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  rateLimit(req, { bucket: 'availability', limit: 120, windowSeconds: 60 })

  const { courtId, date } = parse(availabilityQuery, {
    courtId: req.query.courtId,
    date: req.query.date,
  })

  const [courts, hoursCfg, pricing] = await Promise.all([
    courtId
      ? getCourtOrThrow(courtId, { activeOnly: true }).then((c) => [c])
      : getCourts({ activeOnly: true }),
    getHoursConfig(),
    getPricingConfig(),
  ])

  const hours = hoursForDate(hoursCfg, date)
  const courtIds = courts.map((c) => c.id)

  // One query for the whole set rather than one per court.
  const [{ data: bookings, error: bookingsError }, { data: blocks, error: blocksError }] =
    await Promise.all([
      db
        .from('bookings')
        .select('court_id, start_hour, duration')
        .in('court_id', courtIds)
        .eq('date', date)
        // A slot someone is mid-payment for is not available. To everyone
        // else it looks exactly like a sold one — which it is about to be.
        .in('status', ['paid', 'pending']),
      db
        .from('blocks')
        .select('court_id, start_hour, end_hour')
        .in('court_id', courtIds)
        .eq('date', date),
    ])

  if (bookingsError) throw bookingsError
  if (blocksError) throw blocksError

  const nowHour = date === todayInManila() ? currentHourInManila() : -1

  function forCourt(court: Court) {
    const slots: Record<number, SlotStatus> = {}
    const prices: Record<number, number> = {}

    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
      slots[h] = hours.closed || h < hours.open || h >= hours.close ? 'closed' : 'available'
      prices[h] = slotPrice(court, pricing, date, h)
    }

    // Hours that have already gone by today can't be booked, so they are shown
    // as closed rather than dangling as available until someone clicks one.
    for (let h = OPEN_HOUR; h <= nowHour && h < CLOSE_HOUR; h++) slots[h] = 'closed'

    for (const b of bookings ?? []) {
      if (b.court_id !== court.id) continue
      for (let h = b.start_hour; h < b.start_hour + b.duration; h++) {
        if (slots[h] !== undefined) slots[h] = 'booked'
      }
    }

    // A block never overwrites a booking: staff need to see that the slot is
    // sold, not merely unavailable.
    for (const b of blocks ?? []) {
      if (b.court_id !== court.id) continue
      for (let h = b.start_hour; h < b.end_hour; h++) {
        if (slots[h] !== undefined && slots[h] !== 'booked') slots[h] = 'blocked'
      }
    }

    return { slots, prices }
  }

  type CourtAvailability = { courtId: string; slots: Record<number, SlotStatus>; prices: Record<number, number> }

  const perCourt: CourtAvailability[] = courts.map((c) => ({ courtId: c.id, ...forCourt(c) }))

  // The single-court response keeps its original flat shape so nothing that
  // already calls it with a courtId has to change.
  if (courtId) {
    const only = perCourt[0]!
    ok(res, { date, hours, slots: only.slots, prices: only.prices } satisfies {
      date: string
      hours: DayHours
      slots: Record<number, SlotStatus>
      prices: Record<number, number>
    })
    return
  }

  ok(res, { date, hours, courts: perCourt })
})
