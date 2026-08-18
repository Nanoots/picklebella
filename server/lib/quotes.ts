/* Signed price quotes.

   The original prototype let the browser decide what a booking cost and post
   that number back. Anyone with dev tools could book a court for one peso.

   The fix, without adding a table: the server prices the basket, HMAC-signs
   the result with a secret only it holds, and hands back an opaque string. At
   confirmation time the server verifies the signature and books from the
   figures inside the token. A tampered token fails verification; an old one
   fails on expiry.

   Replaying a valid quote is harmless — it can only try to book the same slots
   again, and the database's exclusion constraint rejects that as a conflict. */

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { QUOTE_SIGNING_SECRET, QUOTE_TTL_SECONDS } from './env.js'
import { badRequest } from './http.js'

export type QuoteSlot = {
  courtId: string
  date: string
  startHour: number
  duration: number
  /** List price for this slot before any discount or fee. */
  baseAmount: number
  /** What this row is actually charged, once discount and fee are spread. */
  amount: number
  peak: boolean
}

export type QuotePayload = {
  /** Unique per issue, so quotes are traceable in logs. */
  jti: string
  /** The account the quote was issued to. Someone else's quote is not usable. */
  userId: string
  paymentMethod: string
  slots: QuoteSlot[]
  baseAmount: number
  discount: number
  feeAmount: number
  totalAmount: number
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
  paymentMethod: string
  slots: Omit<QuoteSlot, 'amount'>[]
  discount: number
  feeRate: number
  promoId: string | null
}): { token: string; quote: QuotePayload } {
  const baseAmount = input.slots.reduce((sum, s) => sum + s.baseAmount, 0)
  const discount = Math.min(input.discount, baseAmount)
  const discounted = baseAmount - discount
  const feeAmount = Math.round(discounted * input.feeRate)
  const totalAmount = discounted + feeAmount

  const shares = distribute(
    input.slots.map((s) => s.baseAmount),
    totalAmount,
  )

  const quote: QuotePayload = {
    jti: randomUUID(),
    userId: input.userId,
    paymentMethod: input.paymentMethod,
    slots: input.slots.map((s, i) => ({ ...s, amount: shares[i] ?? 0 })),
    baseAmount,
    discount,
    feeAmount,
    totalAmount,
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

  return payload
}
