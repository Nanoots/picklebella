/* A small fixed-window rate limiter.

   Counters live in the function instance's memory. That is honest about what
   it is: on Vercel each concurrent instance keeps its own tally, so the real
   ceiling is roughly (limit x instances). It reliably stops a single client
   hammering an endpoint in a loop, which is the abuse this app actually
   faces, and it costs nothing to run.

   If this goes past testing into real traffic, move the counter to Postgres
   or Upstash so the limit is shared. See SECURITY.md. */

import type { VercelRequest } from '@vercel/node'
import { tooManyRequests } from './http.js'

type Window = { count: number; resetAt: number }

const windows = new Map<string, Window>()

/** Drops expired entries so a long-lived instance cannot grow without bound. */
function sweep(now: number): void {
  if (windows.size < 5000) return
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key)
  }
}

/**
 * Best-effort client identity.
 *
 * On Vercel, `x-forwarded-for` is set by the platform's own proxy, so the
 * left-most entry is the real client and cannot be spoofed by the caller
 * appending their own header. Reading it directly would be unsafe behind a
 * proxy you do not control.
 */
export function clientKey(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for']
  const raw = Array.isArray(fwd) ? fwd[0] : fwd
  const ip = raw?.split(',')[0]?.trim()
  return ip || 'unknown'
}

export type RateLimitOptions = {
  /** Distinguishes one endpoint's budget from another's. */
  bucket: string
  limit: number
  windowSeconds: number
  /** Defaults to the caller's IP; pass a user id to limit per account. */
  identity?: string
}

export function rateLimit(req: VercelRequest, opts: RateLimitOptions): void {
  const now = Date.now()
  sweep(now)

  const key = `${opts.bucket}:${opts.identity ?? clientKey(req)}`
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + opts.windowSeconds * 1000 })
    return
  }

  existing.count += 1
  if (existing.count > opts.limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    throw tooManyRequests(`Too many requests. Try again in ${retryAfter}s.`)
  }
}
