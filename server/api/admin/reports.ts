import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ok, requireMethod, withApi } from '../../lib/http.js'
import { requireAdmin } from '../../lib/auth.js'
import { db } from '../../lib/supabase.js'
import { getCourts, getHoursConfig } from '../../lib/settings.js'
import { hoursForDate, mapBooking } from '../../lib/domain.js'
import { parse, reportQuery } from '../../lib/validation.js'

/**
 * Monthly revenue and occupancy figures.
 *
 * Every booking is paid at the moment it is made, so "paid" and "not
 * cancelled" describe the same set — bookings here always means paid ones.
 */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  await requireAdmin(req)

  const { year, month } = parse(reportQuery, { year: req.query.year, month: req.query.month })

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const prefix = `${year}-${pad(month)}-`
  const firstDay = `${prefix}01`
  const lastDay = `${prefix}${pad(daysInMonth)}`

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
  for (let d = 1; d <= daysInMonth; d++) dailyMap.set(`${prefix}${pad(d)}`, { amount: 0, count: 0 })
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
  for (let d = 1; d <= daysInMonth; d++) {
    const h = hoursForDate(hoursCfg, `${prefix}${pad(d)}`)
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
