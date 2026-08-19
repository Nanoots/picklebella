/* =========================================================
   PickleBella Park — shared domain types.

   These mirror the Postgres schema in server/supabase/migrations one-for-one,
   and are the single definition the API client (api.ts) and every screen share.
   When a column changes, this file and the migration change together.
   ========================================================= */

export type Court = {
  id: string
  name: string
  type: 'Indoor' | 'Outdoor'
  surface: string
  rate: number
  emoji: string
  color: string
  feats: string[]
  lighting: boolean
  active: boolean
}

// 'closed' = outside the venue's operating hours for that date.
export type SlotStatus = 'available' | 'booked' | 'blocked' | 'closed'

export type DayHours = { open: number; close: number; closed: boolean }

export type Holiday = {
  id: string
  date: string // YYYY-MM-DD
  label: string
  open: number
  close: number
  closed: boolean
}

export type HoursConfig = {
  weekly: DayHours[] // index 0 = Sunday … 6 = Saturday
  holidays: Holiday[]
}

export type PricingConfig = {
  peakEnabled: boolean
  peakStartHour: number
  peakEndHour: number
  peakDays: number[] // 0 = Sunday … 6 = Saturday
  peakMultiplier: number
}

export type PromoCode = {
  id: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  active: boolean
  expiresAt: string // YYYY-MM-DD, '' = never
  maxUses: number // 0 = unlimited
  usedCount: number
}

export type Booking = {
  id: string
  courtId: string
  date: string // YYYY-MM-DD
  startHour: number
  duration: number // hours
  name: string
  phone: string
  email: string
  players: number
  notes: string
  paymentMethod: string
  amount: number
  /**
   * pending   — the customer is at the payment gateway; the slot is held
   * paid      — money received
   * failed    — the payment did not complete, or the hold lapsed
   * cancelled — called off after payment
   */
  status: 'pending' | 'paid' | 'failed' | 'cancelled'
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

export type CustomerUser = {
  name: string
  email: string
  phone: string
  banned?: boolean
  vip?: boolean
  notes?: string
}

export type MemberSummary = CustomerUser & {
  bookingsCount: number
  totalSpent: number
  lastBookingDate: string | null
}

export type MonthlyReport = {
  bookingsCount: number
  revenue: number
  bookedHours: number
  dailyRevenue: { date: string; amount: number; bookingsCount: number }[]
  revenueByPaymentMethod: { method: string; amount: number }[]
  occupancyByCourt: { courtId: string; courtName: string; bookedHours: number; pctOfOpenHours: number }[]
  hourlyBookingCounts: number[] // 24 buckets, index = hour of day
}

/** One priced line in a quote. `amount` is what this row will be charged
    once the discount and processor fee are spread across the basket. */
export type QuoteSlot = {
  courtId: string
  date: string
  startHour: number
  duration: number
  baseAmount: number
  peak: boolean
}

/** What one payment method costs for a quoted basket. Priced by the server. */
export type QuoteMethodPrice = {
  id: string
  label: string
  feeAmount: number
  totalAmount: number
}

// A price quote is always produced by the SERVER. The client displays it and
// echoes back the quote id; it never computes what a booking should cost.
//
// One quote carries a price for every enabled payment method, so switching
// between them is a local lookup rather than another request — and still not
// a calculation the browser is trusted with.
/** What the server hands back when a payment has been opened. */
export type PaymentStart = {
  bookings: Booking[]
  paymentIntentId: string
  /** Where to send the customer. Null for QR Ph, which returns an image. */
  redirectUrl: string | null
  qrImageUrl: string | null
  expiresAt: string
}

export type PaymentStatus = {
  status: 'paid' | 'pending' | 'failed'
  /** True when this request is what confirmed it (the webhook hadn't landed). */
  settledNow: boolean
  bookings: Booking[]
}

export type Quote = {
  quoteId: string
  slots: QuoteSlot[]
  baseAmount: number
  discount: number
  methods: QuoteMethodPrice[]
  promoApplied: boolean
  expiresAt: string // ISO timestamp
}

// Widest bookable window the UI ever offers. Actual per-day open/close comes
// from the hours config and is admin-configurable within these bounds.
export const OPEN_HOUR = 6 // 6:00 AM
export const CLOSE_HOUR = 22 // 10:00 PM

export const COURT_PALETTE = [
  'linear-gradient(135deg,#1b5236,#0f3324)',
  'linear-gradient(135deg,#256e46,#14432c)',
  'linear-gradient(135deg,#e63e8c,#d81c72)',
  'linear-gradient(135deg,#2563EB,#1E40AF)',
  'linear-gradient(135deg,#7AC231,#4D7C0F)',
]
