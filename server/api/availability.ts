import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ok, requireMethod, withApi } from '../lib/http.js'
import { rateLimit } from '../lib/rateLimit.js'
import { getCourtOrThrow, getHoursConfig, getPricingConfig } from '../lib/settings.js'
import { db } from '../lib/supabase.js'
import {
  CLOSE_HOUR,
  OPEN_HOUR,
  currentHourInManila,
  hoursForDate,
  slotPrice,
  todayInManila,
  type SlotStatus,
} from '../lib/domain.js'
import { availabilityQuery, parse } from '../lib/validation.js'

/**
 * Hour-by-hour status and price for one court on one date.
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

  const [court, hoursCfg, pricing] = await Promise.all([
    getCourtOrThrow(courtId, { activeOnly: true }),
    getHoursConfig(),
    getPricingConfig(),
  ])

  const hours = hoursForDate(hoursCfg, date)

  const slots: Record<number, SlotStatus> = {}
  const prices: Record<number, number> = {}
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    slots[h] = hours.closed || h < hours.open || h >= hours.close ? 'closed' : 'available'
    prices[h] = slotPrice(court, pricing, date, h)
  }

  // Hours that have already gone by today can't be booked, so they are shown
  // as closed rather than dangling as available until someone clicks one.
  if (date === todayInManila()) {
    const nowHour = currentHourInManila()
    for (let h = OPEN_HOUR; h <= nowHour && h < CLOSE_HOUR; h++) slots[h] = 'closed'
  }

  const [{ data: bookings, error: bookingsError }, { data: blocks, error: blocksError }] =
    await Promise.all([
      db
        .from('bookings')
        .select('start_hour, duration')
        .eq('court_id', courtId)
        .eq('date', date)
        .eq('status', 'paid'),
      db.from('blocks').select('start_hour, end_hour').eq('court_id', courtId).eq('date', date),
    ])

  if (bookingsError) throw bookingsError
  if (blocksError) throw blocksError

  for (const b of bookings ?? []) {
    for (let h = b.start_hour; h < b.start_hour + b.duration; h++) {
      if (slots[h] !== undefined) slots[h] = 'booked'
    }
  }

  // A block never overwrites a booking: staff need to see that the slot is
  // sold, not merely unavailable.
  for (const b of blocks ?? []) {
    for (let h = b.start_hour; h < b.end_hour; h++) {
      if (slots[h] !== undefined && slots[h] !== 'booked') slots[h] = 'blocked'
    }
  }

  ok(res, { date, hours, slots, prices })
})
