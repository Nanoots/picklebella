import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ok, requireMethod, withApi, badRequest } from '../http.js'
import { requireAdmin } from '../auth.js'
import { db } from '../supabase.js'
import { getCourts, getHoursConfig } from '../settings.js'
import { hoursForDate, mapBooking } from '../domain.js'
import { parse, reportQuery } from '../validation.js'

const pad = (n: number) => String(n).padStart(2, '0')

/** Every date string (YYYY-MM-DD) from `first` to `last`, inclusive. */
function* dateRange(first: string, last: string): Generator<string> {
  const [fy, fm, fd] = first.split('-').map(Number)
  const [ly, lm, ld] = last.split('-').map(Number)
  // Date.UTC's month is 0-based (0 = January) — both ends need the -1.
  const end = Date.UTC(ly!, lm! - 1, ld!)
  let cursor = Date.UTC(fy!, fm! - 1, fd!)
  while (cursor <= end) {
    const d = new Date(cursor)
    yield `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    cursor += 24 * 60 * 60 * 1000
  }
}

/**
 * Revenue and occupancy figures for a month, or a From/To range of months.
 *
 * Every booking is paid at the moment it is made, so "paid" and "not
 * cancelled" describe the same set — bookings here always means paid ones.
 */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  await requireAdmin(req)

  const { year, month, toYear, toMonth } = parse(reportQuery, {
    year: req.query.year,
    month: req.query.month,
    toYear: req.query.toYear,
    toMonth: req.query.toMonth,
  })
  const endYear = toYear ?? year
  const endMonth = toMonth ?? month

  const firstDay = `${year}-${pad(month)}-01`
  const daysInEndMonth = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate()
  const lastDay = `${endYear}-${pad(endMonth)}-${pad(daysInEndMonth)}`
  if (lastDay < firstDay) throw badRequest('The "to" month must be on or after the "from" month.', 'invalid_range')
  // 25 months caps a "this month back to a year ago" query with room to
  // spare, while still keeping a single request from scanning years of rows.
  const spanMonths = (endYear - year) * 12 + (endMonth - month) + 1
  if (spanMonths > 25) throw badRequest('That date range is too wide — pick 25 months or fewer.', 'range_too_wide')

  const [{ data: rows, error }, courts, hoursCfg] = await Promise.all([
    db
      .from('bookings')
      .select('*')
      .gte('date', firstDay)
      .lte('date', lastDay)
      .eq('status', 'paid'),
    getCourts({ activeOnly: true }),
    getHoursConfig(),
  ])
  if (error) throw error

  const bookings = (rows ?? []).map(mapBooking)

  const revenue = bookings.reduce((sum, b) => sum + b.amount, 0)
  const bookedHours = bookings.reduce((sum, b) => sum + b.duration, 0)

  const dailyMap = new Map<string, { amount: number; count: number }>()
  for (const date of dateRange(firstDay, lastDay)) dailyMap.set(date, { amount: 0, count: 0 })
  for (const b of bookings) {
    const entry = dailyMap.get(b.date)
    if (entry) {
      entry.amount += b.amount
      entry.count += 1
    }
  }
  const dailyRevenue = [...dailyMap].map(([date, v]) => ({
    date,
    amount: v.amount,
    bookingsCount: v.count,
  }))

  const paymentMap = new Map<string, number>()
  for (const b of bookings) {
    paymentMap.set(b.paymentMethod, (paymentMap.get(b.paymentMethod) ?? 0) + b.amount)
  }
  const revenueByPaymentMethod = [...paymentMap].map(([method, amount]) => ({ method, amount }))

  // Occupancy is measured against hours the venue was actually open, so
  // closures and holiday hours don't drag the percentage down.
  let totalOpenHours = 0
  for (const date of dateRange(firstDay, lastDay)) {
    const h = hoursForDate(hoursCfg, date)
    if (!h.closed) totalOpenHours += Math.max(0, h.close - h.open)
  }

  const occupancyByCourt = courts.map((c) => {
    const hours = bookings.filter((b) => b.courtId === c.id).reduce((sum, b) => sum + b.duration, 0)
    return {
      courtId: c.id,
      courtName: c.name,
      bookedHours: hours,
      pctOfOpenHours: totalOpenHours > 0 ? (hours / totalOpenHours) * 100 : 0,
    }
  })

  const hourlyBookingCounts = new Array<number>(24).fill(0)
  for (const b of bookings) {
    for (let h = b.startHour; h < b.startHour + b.duration; h++) {
      if (h >= 0 && h < 24) hourlyBookingCounts[h] = (hourlyBookingCounts[h] ?? 0) + 1
    }
  }

  ok(res, {
    bookingsCount: bookings.length,
    revenue,
    bookedHours,
    dailyRevenue,
    revenueByPaymentMethod,
    occupancyByCourt,
    hourlyBookingCounts,
  })
})
