/* Domain types, row mapping, and the booking rules the server owns.

   The API speaks camelCase to the browser while Postgres uses snake_case, so
   every table gets an explicit mapper. Explicit mapping is not just tidiness:
   it means a column added to a table is never accidentally serialised out to
   a customer, and a field invented by a caller is never accidentally written
   in. */

export type CourtType = 'Indoor' | 'Outdoor'
export type SlotStatus = 'available' | 'booked' | 'blocked' | 'closed'
export type BookingStatus = 'paid' | 'cancelled'

export type Court = {
  id: string
  name: string
  type: CourtType
  surface: string
  rate: number
  emoji: string
  color: string
  feats: string[]
  lighting: boolean
  active: boolean
}

export type DayHours = { open: number; close: number; closed: boolean }

export type Holiday = {
  id: string
  date: string
  label: string
  open: number
  close: number
  closed: boolean
}

export type HoursConfig = { weekly: DayHours[]; holidays: Holiday[] }

export type PricingConfig = {
  peakEnabled: boolean
  peakStartHour: number
  peakEndHour: number
  peakDays: number[]
  peakMultiplier: number
}

export type PromoCode = {
  id: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  active: boolean
  expiresAt: string
  maxUses: number
  usedCount: number
}

export type Booking = {
  id: string
  courtId: string
  date: string
  startHour: number
  duration: number
  name: string
  phone: string
  email: string
  players: number
  notes: string
  paymentMethod: string
  amount: number
  status: BookingStatus
  createdAt: string
}

export type Block = {
  id: string
  courtId: string
  date: string
  startHour: number
  endHour: number
  reason: string
}

/* ---- Constants shared with the client ---- */

export const OPEN_HOUR = 6
export const CLOSE_HOUR = 22
export const MAX_DURATION_HOURS = 6
/** How far ahead a customer may book. Keeps the calendar (and abuse) bounded. */
export const MAX_ADVANCE_DAYS = 90

export const DEFAULT_HOURS: HoursConfig = {
  weekly: Array.from({ length: 7 }, () => ({ open: OPEN_HOUR, close: CLOSE_HOUR, closed: false })),
  holidays: [],
}

export const DEFAULT_PRICING: PricingConfig = {
  peakEnabled: false,
  peakStartHour: 17,
  peakEndHour: 21,
  peakDays: [1, 2, 3, 4, 5],
  peakMultiplier: 1.25,
}

/* Payment processor fees, charged per method and passed through to the guest.
   This lives on the server because it is an input to the price. The client has
   a copy for display only (lib/paymentMethods.ts); the total that gets charged
   is always the one computed here. */
export const PAYMENT_METHODS: Record<string, { label: string; feeRate: number; enabled: boolean }> = {
  instapay: { label: 'QR Ph (InstaPay)', feeRate: 0.0134, enabled: true },
  gcash: { label: 'GCash', feeRate: 0.0223, enabled: true },
  maya: { label: 'Maya', feeRate: 0.0179, enabled: true },
  card: { label: 'Credit / Debit Card', feeRate: 0, enabled: false },
}

/* ---- Row mappers ---- */

type Row = Record<string, any>

export const mapCourt = (r: Row): Court => ({
  id: r.id,
  name: r.name,
  type: r.type,
  surface: r.surface ?? '',
  rate: Number(r.rate),
  emoji: r.emoji ?? '',
  color: r.color ?? '',
  feats: Array.isArray(r.feats) ? r.feats : [],
  lighting: r.lighting !== false,
  active: r.active !== false,
})

export const mapBooking = (r: Row): Booking => ({
  id: r.id,
  courtId: r.court_id,
  date: r.date,
  startHour: Number(r.start_hour),
  duration: Number(r.duration),
  name: r.name ?? '',
  phone: r.phone ?? '',
  email: r.email ?? '',
  players: Number(r.players ?? 0),
  notes: r.notes ?? '',
  paymentMethod: r.payment_method ?? '',
  amount: Number(r.amount),
  status: r.status,
  createdAt: r.created_at,
})

export const mapBlock = (r: Row): Block => ({
  id: r.id,
  courtId: r.court_id,
  date: r.date,
  startHour: Number(r.start_hour),
  endHour: Number(r.end_hour),
  reason: r.reason ?? '',
})

export const mapPromo = (r: Row): PromoCode => ({
  id: r.id,
  code: r.code,
  type: r.type,
  value: Number(r.value),
  active: r.active !== false,
  expiresAt: r.expires_at ?? '',
  maxUses: Number(r.max_uses ?? 0),
  usedCount: Number(r.used_count ?? 0),
})

/* ---- Date and hour helpers ---- */

/** Today in Asia/Manila, as YYYY-MM-DD. The venue's day, not the server's. */
export function todayInManila(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Current hour (0-23) in Asia/Manila. */
export function currentHourInManila(): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hour12: false,
  }).format(new Date())
  return Number.parseInt(hour, 10)
}

export function dayOfWeek(date: string): number {
  // Parsed as UTC midnight and read back in UTC, so the weekday is a pure
  // function of the date string and never shifts with the server's zone.
  return new Date(date + 'T00:00:00Z').getUTCDay()
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z')
  const b = Date.parse(to + 'T00:00:00Z')
  return Math.round((b - a) / 86_400_000)
}

/** A holiday entry wins over the weekday's configured hours. */
export function hoursForDate(cfg: HoursConfig, date: string): DayHours {
  const holiday = cfg.holidays.find((h) => h.date === date)
  if (holiday) return { open: holiday.open, close: holiday.close, closed: holiday.closed }
  return cfg.weekly[dayOfWeek(date)] ?? { open: OPEN_HOUR, close: CLOSE_HOUR, closed: false }
}

export function isPeakSlot(pricing: PricingConfig, date: string, hour: number): boolean {
  if (!pricing.peakEnabled) return false
  return (
    pricing.peakDays.includes(dayOfWeek(date)) &&
    hour >= pricing.peakStartHour &&
    hour < pricing.peakEndHour
  )
}

/** What one hour on this court costs at this time. The only place that decides. */
export function slotPrice(court: Court, pricing: PricingConfig, date: string, hour: number): number {
  return isPeakSlot(pricing, date, hour) ? Math.round(court.rate * pricing.peakMultiplier) : court.rate
}

/** Sum of the per-hour prices across a booking's span. */
export function baseAmount(
  court: Court,
  pricing: PricingConfig,
  date: string,
  startHour: number,
  duration: number,
): number {
  let total = 0
  for (let h = startHour; h < startHour + duration; h++) {
    total += slotPrice(court, pricing, date, h)
  }
  return total
}

export function discountFor(promo: PromoCode, amount: number): number {
  const raw = promo.type === 'percent' ? (amount * promo.value) / 100 : promo.value
  return Math.min(Math.round(raw), amount)
}

/**
 * Rejects requests for slots that are in the past or too far out.
 *
 * Booking backwards in time is the kind of thing that never happens through
 * the UI and always happens the first time someone curls the endpoint.
 */
export function assertBookableWindow(date: string, startHour: number): string | null {
  const today = todayInManila()
  if (date < today) return 'That date has already passed.'
  if (date === today && startHour <= currentHourInManila()) {
    return 'That time has already passed today.'
  }
  if (daysBetween(today, date) > MAX_ADVANCE_DAYS) {
    return `Bookings open ${MAX_ADVANCE_DAYS} days in advance.`
  }
  return null
}
