/* PayMongo — the payment gateway.

   Everything in here talks to https://api.paymongo.com with the SECRET key,
   which never leaves the server. The browser is only ever handed the URL it
   should be sent to.

   The flow for an e-wallet (GCash, Maya) or QR Ph is three calls:

     1. POST /v1/payment_intents      — open an intent for the amount
     2. POST /v1/payment_methods      — describe how the customer will pay
     3. POST /v1/payment_intents/:id/attach — join the two; the response
                                        carries the URL to redirect to

   Card payments are deliberately not wired up: those need the payment method
   created in the browser with the PUBLIC key so card numbers never touch this
   server. The picker marks card as "coming soon" for that reason.

   Amounts are in CENTAVOS. Every amount elsewhere in this codebase is in whole
   pesos, so the conversion happens here, once, rather than being sprinkled
   through the callers. */

import { PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET } from './env.js'
import { HttpError, badRequest } from './http.js'
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.paymongo.com/v1'

/** Whether the gateway is configured. Without a key there is no way to pay. */
export const isPaymentsConfigured = (): boolean => Boolean(PAYMONGO_SECRET_KEY)

/** A live key charges real money. A test key does not. */
export const isLiveKey = (): boolean => PAYMONGO_SECRET_KEY.startsWith('sk_live')

function authHeader(): string {
  // PayMongo uses HTTP basic auth with the secret key as the username and an
  // empty password.
  return 'Basic ' + Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')
}

type PayMongoError = { detail?: string; code?: string }

async function call<T>(path: string, body: unknown): Promise<T> {
  if (!isPaymentsConfigured()) {
    throw new HttpError(
      503,
      'payments_unconfigured',
      'Online payment is not set up yet. Please contact PickleBella Park to book.',
    )
  }

  let res: Response
  try {
    res = await fetch(API + path, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (cause) {
    console.error('[paymongo] network failure', { path, cause })
    throw new HttpError(502, 'gateway_unreachable', 'We could not reach the payment provider. Please try again.')
  }

  const text = await res.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!res.ok) {
    const errors: PayMongoError[] = payload?.errors ?? []
    // Logged in full for us; the customer gets the gateway's own sentence when
    // it is safe to show (these are things like "amount below the minimum"),
    // and nothing internal ever leaks.
    console.error('[paymongo] request failed', { path, status: res.status, errors })

    const detail = errors[0]?.detail
    throw new HttpError(
      res.status === 400 || res.status === 422 ? 400 : 502,
      'gateway_error',
      detail && res.status < 500 ? detail : 'The payment provider rejected this payment. Please try again.',
    )
  }

  return payload?.data as T
}

type IntentAttributes = {
  status: 'awaiting_payment_method' | 'awaiting_next_action' | 'processing' | 'succeeded' | string
  amount: number
  currency: string
  client_key: string
  last_payment_error?: unknown
  next_action?: {
    type?: string
    redirect?: { url?: string; return_url?: string }
    code?: { image_url?: string }
  }
  payments?: { id: string; attributes?: { status?: string } }[]
}

type Resource<A> = { id: string; type: string; attributes: A }

/**
 * Opens a payment intent for one basket.
 *
 * `amountPesos` is what the signed quote said this basket costs; nothing the
 * browser sent reaches this function.
 */
export async function createPaymentIntent(input: {
  amountPesos: number
  description: string
  /** The gateway's own name for the method, e.g. 'gcash'. */
  gatewayType: string
  /** Echoed back on the webhook, so we can find the basket again. */
  metadata: Record<string, string>
}): Promise<{ id: string; clientKey: string }> {
  const data = await call<Resource<IntentAttributes>>('/payment_intents', {
    data: {
      attributes: {
        amount: Math.round(input.amountPesos * 100),
        currency: 'PHP',
        description: input.description,
        // Restricted to the one method the customer picked: this intent is not
        // a generic checkout the payer can redirect into something else.
        payment_method_allowed: [input.gatewayType],
        capture_type: 'automatic',
        metadata: input.metadata,
      },
    },
  })

  return { id: data.id, clientKey: data.attributes.client_key }
}

export async function createPaymentMethod(input: {
  gatewayType: string
  name: string
  email: string
  phone: string
}): Promise<string> {
  const data = await call<Resource<Record<string, unknown>>>('/payment_methods', {
    data: {
      attributes: {
        type: input.gatewayType,
        billing: {
          name: input.name.slice(0, 255),
          email: input.email.slice(0, 255),
          phone: input.phone.slice(0, 32),
        },
      },
    },
  })

  return data.id
}

/**
 * Joins the two and returns where to send the customer.
 *
 * For GCash and Maya that is the wallet's own authorisation page. For QR Ph
 * there is no redirect — the response carries a QR image instead, which the
 * caller shows rather than navigating to.
 */
export async function attachPaymentMethod(input: {
  intentId: string
  clientKey: string
  paymentMethodId: string
  returnUrl: string
}): Promise<{ redirectUrl: string | null; qrImageUrl: string | null; status: string }> {
  const data = await call<Resource<IntentAttributes>>(
    `/payment_intents/${encodeURIComponent(input.intentId)}/attach`,
    {
      data: {
        attributes: {
          payment_method: input.paymentMethodId,
          client_key: input.clientKey,
          return_url: input.returnUrl,
        },
      },
    },
  )

  const next = data.attributes.next_action
  return {
    redirectUrl: next?.redirect?.url ?? null,
    qrImageUrl: next?.code?.image_url ?? null,
    status: data.attributes.status,
  }
}

/** Reads an intent back — used by the return page, which cannot trust a query string. */
export async function getPaymentIntent(intentId: string): Promise<{
  status: string
  paymentId: string | null
}> {
  if (!isPaymentsConfigured()) {
    throw new HttpError(503, 'payments_unconfigured', 'Online payment is not set up yet.')
  }

  let res: Response
  try {
    res = await fetch(`${API}/payment_intents/${encodeURIComponent(intentId)}`, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    })
  } catch (cause) {
    console.error('[paymongo] network failure reading intent', { intentId, cause })
    throw new HttpError(502, 'gateway_unreachable', 'We could not reach the payment provider.')
  }

  if (!res.ok) {
    console.error('[paymongo] intent read failed', { intentId, status: res.status })
    throw new HttpError(502, 'gateway_error', 'We could not check that payment.')
  }

  const payload = (await res.json()) as { data?: Resource<IntentAttributes> }
  const attrs = payload.data?.attributes
  const succeeded = attrs?.payments?.find((p) => p.attributes?.status === 'paid')

  return { status: attrs?.status ?? 'unknown', paymentId: succeeded?.id ?? null }
}

/* ---------------- Webhooks ---------------- */

export type WebhookEvent = {
  type: string
  /** The intent this event concerns, when it concerns one. */
  paymentIntentId: string | null
  paymentId: string | null
  paid: boolean
}

/**
 * Verifies a webhook came from PayMongo, then reads it.
 *
 * The signature is an HMAC over `"<timestamp>.<raw body>"`, so the RAW bytes
 * are what must be hashed — re-serialising a parsed body produces different
 * bytes and the check fails for reasons that look like a configuration
 * problem. The caller is responsible for handing this the untouched body.
 *
 * Header shape: `t=<unix seconds>,te=<test signature>,li=<live signature>`.
 * A test key signs `te`; a live key signs `li`.
 */
export function parseWebhook(rawBody: string, signatureHeader: string | undefined): WebhookEvent {
  if (!PAYMONGO_WEBHOOK_SECRET) {
    throw new HttpError(503, 'webhook_unconfigured', 'Webhook secret is not configured.')
  }
  if (!signatureHeader) throw badRequest('Missing signature.', 'bad_signature')

  const parts = new Map<string, string>()
  for (const piece of signatureHeader.split(',')) {
    const idx = piece.indexOf('=')
    if (idx > 0) parts.set(piece.slice(0, idx).trim(), piece.slice(idx + 1).trim())
  }

  const timestamp = parts.get('t')
  const provided = isLiveKey() ? parts.get('li') : parts.get('te')
  if (!timestamp || !provided) throw badRequest('Malformed signature.', 'bad_signature')

  // Rejects a captured request being replayed later. Five minutes is enough
  // slack for clock drift and a slow delivery.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw badRequest('Signature timestamp is out of range.', 'bad_signature')
  }

  const expected = createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw badRequest('Signature did not match.', 'bad_signature')
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw badRequest('Malformed webhook body.', 'bad_webhook')
  }

  const attrs = payload?.data?.attributes ?? {}
  const type: string = attrs.type ?? ''
  const resource = attrs.data?.attributes ?? {}

  return {
    type,
    // On a payment.* event the intent id hangs off the payment resource.
    paymentIntentId: resource.payment_intent_id ?? payload?.data?.attributes?.data?.id ?? null,
    paymentId: attrs.data?.id ?? null,
    paid: type === 'payment.paid',
  }
}
