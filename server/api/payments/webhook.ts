import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../../lib/supabase.js'
import { parseWebhook } from '../../lib/paymongo.js'

/* PayMongo's callback — the only thing that turns a hold into a booking.

   This endpoint is PUBLIC by necessity: PayMongo cannot present a bearer
   token. Its authentication is the signature, which is why the raw body
   matters so much (see below) and why a failed check is answered with 400 and
   nothing else.

   Two rules this handler is built around:

   1. Never trust the body before the signature. The HMAC covers the exact
      bytes PayMongo sent, so the body is read as a raw string and only parsed
      after the check passes. Vercel would otherwise parse it into an object
      for us and re-serialising that object produces different bytes — the
      single most common reason these integrations "randomly" fail to verify.

   2. Always answer 200 once the signature is good. A non-2xx makes PayMongo
      retry, and retrying does not help with a bug in our own settlement code —
      it just repeats it every few minutes. Real problems are logged and
      chased from the log, not from the retry queue. */

export const config = {
  api: {
    // Hands us the untouched bytes rather than a parsed object.
    bodyParser: false,
  },
}

function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      // A webhook body is a few kilobytes. Anything wildly bigger is not one.
      if (size > 1_000_000) {
        reject(new Error('webhook body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  let event
  try {
    const raw = await readRawBody(req)
    const signature = req.headers['paymongo-signature']
    event = parseWebhook(raw, typeof signature === 'string' ? signature : undefined)
  } catch (err) {
    // Deliberately terse. An unverified caller learns nothing about why.
    console.warn('[webhook] rejected', err instanceof Error ? err.message : err)
    res.status(400).json({ error: 'invalid_signature' })
    return
  }

  // Everything past here is a genuine PayMongo event, so the answer is 200
  // whatever happens next.
  try {
    if (event.type !== 'payment.paid' && event.type !== 'payment.failed') {
      // Subscribed to more than we act on, or PayMongo added an event type.
      res.status(200).json({ received: true, ignored: event.type })
      return
    }

    if (!event.paymentIntentId) {
      console.error('[webhook] event carried no payment intent id', { type: event.type })
      res.status(200).json({ received: true })
      return
    }

    // Idempotent: settle_payment only moves rows OUT of 'pending', so a
    // redelivered event finds nothing to do and reports zero rows.
    const { data, error } = await db.rpc('settle_payment', {
      p_payment_intent_id: event.paymentIntentId,
      p_paid: event.paid,
      p_payment_ref: event.paymentId,
    })

    if (error) throw error

    const settled = Array.isArray(data) ? data.length : 0
    console.log('[webhook] settled', {
      type: event.type,
      intent: event.paymentIntentId,
      rows: settled,
    })

    res.status(200).json({ received: true, settled })
  } catch (err) {
    // A 500 here would have PayMongo retry a bug on a timer. Log loudly, take
    // the event off their hands, and fix it from the log.
    console.error('[webhook] settlement failed', {
      type: event.type,
      intent: event.paymentIntentId,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    })
    res.status(200).json({ received: true, settled: 0 })
  }
}
