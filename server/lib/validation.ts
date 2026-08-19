/* Input schemas.

   Every request body and query string is parsed through one of these before a
   handler touches it. Anything not declared is stripped rather than passed
   through, so a caller cannot smuggle extra columns (`status`, `amount`,
   `user_id`) into an insert or update. */

import { z } from 'zod'
import { badRequest } from './http.js'
import { CLOSE_HOUR, MAX_DURATION_HOURS, OPEN_HOUR, PAYMENT_METHODS } from './domain.js'

/** Parses with a schema, turning a failure into a 400 the client can show. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join('.')
    throw badRequest(
      path ? `${path}: ${issue?.message}` : (issue?.message ?? 'Invalid request.'),
      'validation_failed',
    )
  }
  return result.data
}

/* ---- Primitives ---- */

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD form.')
  .refine((s) => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Not a real date.')

export const hour = z.number().int().min(0).max(23)
export const bookableHour = z.number().int().min(OPEN_HOUR).max(CLOSE_HOUR)

/** Trimmed, length-capped free text. Caps exist so no field can be used as storage. */
const text = (max: number) => z.string().trim().max(max)

export const courtId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, 'Invalid court id.')

export const uuid = z.string().uuid('Invalid id.')

export const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254)

export const phone = z
  .string()
  .trim()
  .max(32)
  .regex(/^[0-9+()\-\s]*$/, 'Phone number contains unexpected characters.')

export const paymentMethod = z
  .string()
  .trim()
  .refine((id) => PAYMENT_METHODS[id]?.enabled === true, 'That payment method is not available.')

/* ---- Requests ---- */

export const availabilityQuery = z.object({
  // Optional: omitted means "every active court on this date", which is what
  // the booking grid and the landing strip both need. See api/availability.ts.
  courtId: courtId.optional(),
  date: dateString,
})

/** One court-hour span within a booking basket. */
export const quoteSlot = z.object({
  courtId,
  date: dateString,
  startHour: bookableHour,
  duration: z.number().int().min(1).max(MAX_DURATION_HOURS),
})

export const quoteRequest = z.object({
  // The booking grid lets a customer pick several slots and pay once, so a
  // quote covers the whole basket. Capped: a basket is a handful of courts for
  // an evening, and an unbounded array is an unbounded amount of work per
  // request.
  slots: z.array(quoteSlot).min(1, 'Pick at least one slot.').max(12, 'You can book up to 12 slots at once.'),
  // No paymentMethod: a quote prices every enabled method at once, and the
  // customer names the one they used when they confirm.
  promoCode: text(40).optional(),
})
  .refine(
    (v) => {
      // Two selections covering the same hour on the same court would insert
      // two rows that violate the exclusion constraint — caught here so the
      // customer gets a sentence instead of a 409.
      const keys = v.slots.flatMap((s) =>
        Array.from({ length: s.duration }, (_, i) => `${s.courtId}|${s.date}|${s.startHour + i}`),
      )
      return new Set(keys).size === keys.length
    },
    { message: 'The same court-hour is selected twice.', path: ['slots'] },
  )

export const createBookingRequest = z.object({
  // Roomier than it looks: the token carries a per-method price table, so it
  // grows with the size of the basket.
  quoteId: z.string().min(1).max(8192),
  paymentMethod,
  name: text(120).min(1, 'Please enter a name.'),
  phone,
  players: z.number().int().min(1).max(20),
  notes: text(500).default(''),
})

export const adminBookingQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  courtId: courtId.optional(),
})

export const adminCreateBooking = z.object({
  courtId,
  date: dateString,
  startHour: bookableHour,
  duration: z.number().int().min(1).max(MAX_DURATION_HOURS),
  name: text(120).min(1),
  phone,
  email: email.or(z.literal('')),
  players: z.number().int().min(1).max(20),
  notes: text(500).default(''),
  paymentMethod: z.string().trim().max(40),
  amount: z.number().int().min(0).max(1_000_000),
})

export const adminUpdateBooking = z
  .object({
    date: dateString.optional(),
    startHour: bookableHour.optional(),
    duration: z.number().int().min(1).max(MAX_DURATION_HOURS).optional(),
    courtId: courtId.optional(),
    name: text(120).optional(),
    phone: phone.optional(),
    players: z.number().int().min(1).max(20).optional(),
    notes: text(500).optional(),
    status: z.enum(['paid', 'cancelled']).optional(),
    amount: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.')

export const blockInput = z
  .object({
    courtId,
    date: dateString,
    startHour: hour,
    endHour: hour,
    reason: text(200).default(''),
  })
  .refine((v) => v.endHour > v.startHour, { message: 'End hour must be after start hour.', path: ['endHour'] })

export const courtInput = z.object({
  id: courtId,
  name: text(80).min(1),
  type: z.enum(['Indoor', 'Outdoor']),
  surface: text(80).default(''),
  rate: z.number().int().min(0).max(100_000),
  emoji: text(16).default(''),
  color: text(200).default(''),
  feats: z.array(text(40)).max(12).default([]),
  lighting: z.boolean().default(true),
  active: z.boolean().default(true),
})

const dayHours = z
  .object({
    open: z.number().int().min(OPEN_HOUR).max(CLOSE_HOUR),
    close: z.number().int().min(OPEN_HOUR).max(CLOSE_HOUR),
    closed: z.boolean(),
  })
  .refine((v) => v.closed || v.close > v.open, {
    message: 'Closing time must be after opening time.',
  })

export const hoursInput = z.object({
  weekly: z.array(dayHours).length(7, 'Need one entry per weekday.'),
  holidays: z
    .array(
      z
        .object({
          id: text(64).min(1),
          date: dateString,
          label: text(80).default(''),
          open: z.number().int().min(OPEN_HOUR).max(CLOSE_HOUR),
          close: z.number().int().min(OPEN_HOUR).max(CLOSE_HOUR),
          closed: z.boolean(),
        })
        .refine((v) => v.closed || v.close > v.open, {
          message: 'Closing time must be after opening time.',
        }),
    )
    .max(200)
    .default([]),
})

export const pricingInput = z
  .object({
    peakEnabled: z.boolean(),
    peakStartHour: hour,
    peakEndHour: hour,
    peakDays: z.array(z.number().int().min(0).max(6)).max(7),
    // Capped so a typo cannot produce a 100x charge.
    peakMultiplier: z.number().min(0.1).max(5),
  })
  .refine((v) => v.peakEndHour > v.peakStartHour, {
    message: 'Peak end hour must be after the start hour.',
    path: ['peakEndHour'],
  })

export const promoInput = z
  .object({
    id: text(64).min(1),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, 'Codes may use letters, numbers, dashes and underscores.'),
    type: z.enum(['percent', 'fixed']),
    value: z.number().min(0).max(100_000),
    active: z.boolean(),
    expiresAt: dateString.or(z.literal('')).default(''),
    maxUses: z.number().int().min(0).max(1_000_000),
  })
  .refine((v) => v.type !== 'percent' || v.value <= 100, {
    message: 'A percentage discount cannot exceed 100.',
    path: ['value'],
  })

export const memberAccessInput = z.object({
  email,
  banned: z.boolean().optional(),
  vip: z.boolean().optional(),
  notes: text(1000).optional(),
})

export const reportQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})
