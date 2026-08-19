/* =========================================================
   PickleBella Park — HTTP client for the server API.

   Mirrors the shape of store.ts so screens can move over one at a time,
   with two deliberate differences:

     1. Every call is async.
     2. Prices are never calculated here. quoteBooking() asks the server what
        a slot costs and createBooking() sends back the quote id. The client
        can display a total; it cannot decide one.
   ========================================================= */

import { API_URL } from './env'
import { getAccessToken } from './supabaseClient'
import type {
  Block,
  Booking,
  Court,
  DayHours,
  HoursConfig,
  MemberSummary,
  MonthlyReport,
  PaymentStart,
  PaymentStatus,
  PricingConfig,
  PromoCode,
  Quote,
  SlotStatus,
} from './types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Attach the signed-in user's access token. Required for anything non-public. */
  auth?: boolean
  signal?: AbortSignal
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal } = opts

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = await getAccessToken()
    if (!token) throw new ApiError('You need to be signed in.', 401, 'not_authenticated')
    headers.Authorization = 'Bearer ' + token
  }

  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      // The API authenticates with a bearer token, not cookies. Omitting
      // credentials means no ambient authority is ever sent cross-origin,
      // which makes CSRF against these endpoints structurally impossible.
      credentials: 'omit',
      mode: 'cors',
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiError('Could not reach the server. Check your connection.', 0, 'network_error')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let payload: any = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError('The server sent a malformed response.', res.status, 'bad_response')
    }
  }

  if (!res.ok) {
    throw new ApiError(
      payload?.error?.message ?? 'Request failed (' + res.status + ').',
      res.status,
      payload?.error?.code,
    )
  }

  return payload?.data as T
}

/* ---------------- Public reads ---------------- */

export function getCourts(signal?: AbortSignal): Promise<Court[]> {
  return request<Court[]>('/api/courts', { signal })
}

export function getConfig(signal?: AbortSignal): Promise<{ hours: HoursConfig; pricing: PricingConfig }> {
  return request('/api/config', { signal })
}

export type AvailabilityResponse = {
  date: string
  hours: DayHours
  /** hour -> status, for every hour in the widest bookable window */
  slots: Record<number, SlotStatus>
  /** hour -> price in pesos for a one-hour booking starting then */
  prices: Record<number, number>
}

export function getAvailability(courtId: string, date: string, signal?: AbortSignal): Promise<AvailabilityResponse> {
  const q = new URLSearchParams({ courtId, date })
  return request<AvailabilityResponse>('/api/availability?' + q.toString(), { signal })
}

type AllAvailabilityResponse = {
  date: string
  hours: DayHours
  courts: { courtId: string; slots: Record<number, SlotStatus>; prices: Record<number, number> }[]
}

/**
 * Availability for every active court on one date, in a single request.
 *
 * Asking per court meant one request — and on Vercel, one cold start — per
 * court for a grid that cannot draw until the last of them has landed.
 */
export async function getAvailabilityAll(
  date: string,
  signal?: AbortSignal,
): Promise<Record<string, AvailabilityResponse>> {
  const q = new URLSearchParams({ date })
  const res = await request<AllAvailabilityResponse>('/api/availability?' + q.toString(), { signal })
  return Object.fromEntries(
    res.courts.map((c) => [c.courtId, { date: res.date, hours: res.hours, slots: c.slots, prices: c.prices }]),
  )
}

/* ---------------- Booking ---------------- */

/** A slot the customer wants, as sent to the server for pricing. */
export type SlotRequest = {
  courtId: string
  date: string
  startHour: number
  duration: number
}

/**
 * Ask the server what a basket of slots costs. Returns a short-lived quote.
 *
 * The whole basket is priced in one call so a promo code is applied once,
 * however many slots it covers, and the returned quote carries a total for
 * every payment method rather than only the one currently selected.
 */
export function quoteBooking(input: {
  slots: SlotRequest[]
  promoCode?: string
}): Promise<Quote> {
  return request<Quote>('/api/quote', { method: 'POST', body: input, auth: true })
}

/**
 * Holds the basket and opens a real payment. Books all or nothing.
 *
 * This no longer confirms anything by itself: it writes the slots as a
 * PENDING hold and hands back where to send the customer to pay. The booking
 * becomes real when the gateway says the money arrived.
 */
export function startPayment(input: {
  quoteId: string
  /** Looked up in the signed quote's price table; it cannot name an amount. */
  paymentMethod: string
  name: string
  phone: string
  players: number
  notes?: string
}): Promise<PaymentStart> {
  return request<PaymentStart>('/api/bookings', { method: 'POST', body: input, auth: true })
}

/**
 * What actually happened to a payment.
 *
 * The `?payment=` on the URL the customer returns with is not evidence of
 * anything — this asks the server, which asks the gateway.
 */
export function getPaymentStatus(intentId: string, signal?: AbortSignal): Promise<PaymentStatus> {
  const q = new URLSearchParams({ intentId })
  return request<PaymentStatus>('/api/payments/status?' + q.toString(), { auth: true, signal })
}

export function getMyBookings(signal?: AbortSignal): Promise<Booking[]> {
  return request<Booking[]>('/api/bookings', { auth: true, signal })
}

export function cancelMyBooking(id: string): Promise<Booking> {
  return request<Booking>('/api/bookings/' + encodeURIComponent(id), { method: 'DELETE', auth: true })
}

/* ---------------- Admin ----------------
   Every one of these is rejected with 403 unless the caller's account is
   listed in the admin_users table. Hiding the UI is not the control; the
   server check is. */

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))
  const q = new URLSearchParams(entries).toString()
  return q ? '?' + q : ''
}

export const admin = {
  listBookings: (params: { from?: string; to?: string; courtId?: string } = {}) =>
    request<Booking[]>('/api/admin/bookings' + qs(params), { auth: true }),
  createBooking: (input: Omit<Booking, 'id' | 'createdAt' | 'status'>) =>
    request<Booking>('/api/admin/bookings', { method: 'POST', body: input, auth: true }),
  updateBooking: (id: string, patch: Partial<Booking>) =>
    request<Booking>('/api/admin/bookings' + qs({ id }), { method: 'PATCH', body: patch, auth: true }),
  deleteBooking: (id: string) =>
    request<void>('/api/admin/bookings' + qs({ id }), { method: 'DELETE', auth: true }),

  listBlocks: (date?: string) =>
    request<Block[]>('/api/admin/blocks' + qs({ date }), { auth: true }),
  createBlock: (input: Omit<Block, 'id'>) =>
    request<Block>('/api/admin/blocks', { method: 'POST', body: input, auth: true }),
  deleteBlock: (id: string) =>
    request<void>('/api/admin/blocks' + qs({ id }), { method: 'DELETE', auth: true }),

  listCourts: () => request<Court[]>('/api/admin/courts', { auth: true }),
  saveCourt: (court: Court) =>
    request<Court>('/api/admin/courts', { method: 'POST', body: court, auth: true }),
  deleteCourt: (id: string) =>
    request<void>('/api/admin/courts' + qs({ id }), { method: 'DELETE', auth: true }),

  getHours: () => request<HoursConfig>('/api/admin/hours', { auth: true }),
  saveHours: (cfg: HoursConfig) =>
    request<HoursConfig>('/api/admin/hours', { method: 'POST', body: cfg, auth: true }),

  getPricing: () => request<PricingConfig>('/api/admin/pricing', { auth: true }),
  savePricing: (cfg: PricingConfig) =>
    request<PricingConfig>('/api/admin/pricing', { method: 'POST', body: cfg, auth: true }),

  listPromos: () => request<PromoCode[]>('/api/admin/promos', { auth: true }),
  savePromo: (promo: PromoCode) =>
    request<PromoCode>('/api/admin/promos', { method: 'POST', body: promo, auth: true }),
  deletePromo: (id: string) =>
    request<void>('/api/admin/promos' + qs({ id }), { method: 'DELETE', auth: true }),

  listMembers: () => request<MemberSummary[]>('/api/admin/members', { auth: true }),
  setMemberAccess: (email: string, patch: { banned?: boolean; vip?: boolean; notes?: string }) =>
    request<MemberSummary>('/api/admin/members', { method: 'PATCH', body: { email, ...patch }, auth: true }),

  getReport: (year: number, month: number) =>
    request<MonthlyReport>('/api/admin/reports' + qs({ year: String(year), month: String(month) }), { auth: true }),
}
