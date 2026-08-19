/* Signed price quotes.

   The original prototype let the browser decide what a booking cost and post
   that number back. Anyone with dev tools could book a court for one peso.

   The fix, without adding a table: the server prices the basket, HMAC-signs
   the result with a secret only it holds, and hands back an opaque string. At
   confirmation time the server verifies the signature and books from the
   figures inside the token. A tampered token fails verification; an old one
   fails on expiry.

   Replaying a valid quote is harmless — it can only try to book the same slots
   again, and the database's exclusion constraint rejects that as a conflict.

   One quote prices EVERY enabled payment method, not just one. Each method
   carries a different processor fee, so an earlier version re-quoted against
   the server every time the customer touched a different radio button — three
   round trips to answer "what would GCash cost?", with the figure for every
   unselected method showing as "Select to price" in the meantime. Pricing them
   all at once is the same amount of arithmetic and one request. The browser
   still decides nothing: every figure it displays was signed here, and the
   method it later picks is looked up in this table rather than trusted. */

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { QUOTE_SIGNING_SECRET, QUOTE_TTL_SECONDS } from './env.js'
import { badRequest } from './http.js'
import { PAYMENT_METHODS } from './domain.js'

export type QuoteSlot = {
  courtId: string
  date: string
  startHour: number
  duration: number
  /** List price for this slot before any discount or fee. */
  baseAmount: number
  peak: boolean
}

/** What one payment method would cost for this basket. */
export type QuoteMethod = {
  feeRate: number
  feeAmount: number
  totalAmount: number
  /**
   * `totalAmount` split across the basket's rows, same order as `slots`.
   * Each booking row stores what it was charged and reports sum that column,
   * so these must add up to the total exactly.
   */
  shares: number[]
}

export type QuotePayload = {
  /** Unique per issue, so quotes are traceable in logs. */
  jti: string
  /** The account the quote was issued to. Someone else's quote is not usable. */
  userId: string
  slots: QuoteSlot[]
  baseAmount: number
  discount: number
  /** methodId -> the signed figures for that method. */
  methods: Record<string, QuoteMethod>
  promoId: string | null
  /** Unix seconds. */
  exp: number
}

const b64url = (buf: Buffer): string => buf.toString('base64url')

function sign(body: string): string {
  return createHmac('sha256', QUOTE_SIGNING_SECRET).update(body).digest('base64url')
}

/**
 * Splits the charged total across the basket's rows in proportion to each
 * slot's list price.
 *
 * Each booking row stores what it was charged, and reports sum that column, so
 * the parts must add up to the total EXACTLY. Rounding each share
 * independently would drift by a peso or two, so the last row absorbs the
 * remainder.
 */
function distribute(slotBases: number[], total: number): number[] {
  const base = slotBases.reduce((a, b) => a + b, 0)
  if (base <= 0) return slotBases.map(() => 0)

  const shares = slotBases.map((b) => Math.round((b / base) * total))
  const drift = total - shares.reduce((a, b) => a + b, 0)
  const last = shares.length - 1
  shares[last] = (shares[last] ?? 0) + drift
  return shares
}

export function issueQuote(input: {
  userId: string
  slots: QuoteSlot[]
  discount: number
  promoId: string | null
}): { token: string; quote: QuotePayload } {
  const baseAmount = input.slots.reduce((sum, s) => sum + s.baseAmount, 0)
  const discount = Math.min(input.discount, baseAmount)
  const discounted = baseAmount - discount
  const slotBases = input.slots.map((s) => s.baseAmount)

  const methods: Record<string, QuoteMethod> = {}
  for (const [id, method] of Object.entries(PAYMENT_METHODS)) {
    if (!method.enabled) continue
    const feeAmount = Math.round(discounted * method.feeRate)
    const totalAmount = discounted + feeAmount
    methods[id] = {
      feeRate: method.feeRate,
      feeAmount,
      totalAmount,
      shares: distribute(slotBases, totalAmount),
    }
  }

  const quote: QuotePayload = {
    jti: randomUUID(),
    userId: input.userId,
    slots: input.slots,
    baseAmount,
    discount,
    methods,
    promoId: input.promoId,
    exp: Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS,
  }

  const body = b64url(Buffer.from(JSON.stringify(quote), 'utf8'))
  return { token: `${body}.${sign(body)}`, quote }
}

/**
 * Verifies a quote token and returns its contents.
 *
 * @param userId the caller redeeming it — must match the account it was issued to.
 */
export function verifyQuote(token: string, userId: string): QuotePayload {
  const parts = token.split('.')
  if (parts.length !== 2) throw badRequest('That price quote is not valid.', 'invalid_quote')

  const [body, signature] = parts as [string, string]
  const expected = sign(body)

  // Compare in constant time. Buffers must match in length first, since
  // timingSafeEqual throws on a mismatch and that throw is itself a signal.
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw badRequest('That price quote is not valid.', 'invalid_quote')
  }

  let payload: QuotePayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    throw badRequest('That price quote is not valid.', 'invalid_quote')
  }

  if (payload.exp * 1000 < Date.now()) {
    throw badRequest('That price quote has expired. Please pick your slots again.', 'quote_expired')
  }

  if (payload.userId !== userId) {
    throw badRequest('That price quote is not valid.', 'invalid_quote')
  }

  if (!Array.isArray(payload.slots) || payload.slots.length === 0) {
    throw badRequest('That price quote is not valid.', 'invalid_quote')
  }

  if (!payload.methods || typeof payload.methods !== 'object') {
    throw badRequest('That price quote is not valid.', 'invalid_quote')
  }

  return payload
}

/**
 * Resolves the method the customer picked against the signed table.
 *
 * The method arrives in the request body, so it is the one part of the
 * transaction the browser still names. It cannot name a *price*: an id that
 * isn't in the quote is refused, and one that is comes back with the figures
 * this server computed when it issued the quote.
 */
export function methodFromQuote(quote: QuotePayload, paymentMethod: string): QuoteMethod {
  const method = quote.methods[paymentMethod]
  if (!method) throw badRequest('That payment method is not available.', 'payment_method_invalid')
  if (method.shares.length !== quote.slots.length) {
    throw badRequest('That price quote is not valid.', 'invalid_quote')
  }
  return method
}
