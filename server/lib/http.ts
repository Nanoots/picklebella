/* Request plumbing shared by every endpoint: CORS, method routing, uniform
   JSON envelopes, and an error boundary that never leaks internals. */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ALLOWED_ORIGINS, IS_PRODUCTION } from './env.js'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const badRequest = (msg: string, code = 'bad_request') => new HttpError(400, code, msg)
export const unauthorized = (msg = 'Sign in to continue.') => new HttpError(401, 'unauthorized', msg)
export const forbidden = (msg = 'You do not have access to this.') => new HttpError(403, 'forbidden', msg)
export const notFound = (msg = 'Not found.') => new HttpError(404, 'not_found', msg)
export const conflict = (msg: string, code = 'conflict') => new HttpError(409, code, msg)
export const tooManyRequests = (msg = 'Too many requests. Please slow down.') =>
  new HttpError(429, 'rate_limited', msg)

/** Echoes back the request origin only when it is on the allowlist. */
function applyCors(req: VercelRequest, res: VercelResponse): void {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/+$/, '') : ''

  // `Vary: Origin` keeps a CDN from caching one caller's CORS decision and
  // serving it to a different origin.
  res.setHeader('Vary', 'Origin')

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '600')
    // Deliberately no Access-Control-Allow-Credentials: this API authenticates
    // with bearer tokens, so browsers never need to attach cookies to it.
  }
}

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.send(JSON.stringify(body))
}

export const ok = (res: VercelResponse, data: unknown) => sendJson(res, 200, { data })

/**
 * A 200 that Vercel's edge cache is allowed to keep and re-serve.
 *
 * Only for responses that are identical for every caller and contain nothing
 * personal — the court list and the opening-hours config, which change when an
 * admin edits them and not otherwise. Anything scoped to a user, and
 * availability (which changes the moment somebody books), stays `no-store`.
 *
 * `s-maxage` applies to the shared CDN cache only; `max-age=0` keeps the
 * browser asking, so an admin's edit shows up on a refresh rather than being
 * pinned in one visitor's cache for a minute.
 */
export function okCached(res: VercelResponse, data: unknown, opts: { seconds: number; staleFor?: number }): void {
  const stale = opts.staleFor ?? opts.seconds * 5
  res.status(200)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader(
    'Cache-Control',
    `public, max-age=0, s-maxage=${opts.seconds}, stale-while-revalidate=${stale}`,
  )
  res.send(JSON.stringify({ data }))
}
export const created = (res: VercelResponse, data: unknown) => sendJson(res, 201, { data })
export const noContent = (res: VercelResponse) => {
  res.setHeader('Cache-Control', 'no-store')
  res.status(204).end()
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

/**
 * Wraps a handler with CORS, preflight handling, and error translation.
 *
 * Anything that isn't an HttpError becomes a flat 500 with no detail. Stack
 * traces and driver messages go to the server log, never to the caller —
 * database errors in particular are happy to name tables and columns.
 */
export function withApi(handler: Handler): Handler {
  return async (req, res) => {
    applyCors(req, res)

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    try {
      await handler(req, res)
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: { code: err.code, message: err.message } })
        return
      }

      console.error('[api] unhandled error', {
        path: req.url,
        method: req.method,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      })

      sendJson(res, 500, {
        error: {
          code: 'internal_error',
          message: IS_PRODUCTION
            ? 'Something went wrong on our end.'
            : `Something went wrong: ${err instanceof Error ? err.message : String(err)}`,
        },
      })
    }
  }
}

/** Restricts an endpoint to the listed methods. */
export function requireMethod(req: VercelRequest, ...methods: string[]): string {
  const method = req.method ?? 'GET'
  if (!methods.includes(method)) {
    throw new HttpError(405, 'method_not_allowed', `${method} is not supported here.`)
  }
  return method
}

/** Reads a required query-string parameter, rejecting repeated values. */
export function queryParam(req: VercelRequest, name: string): string {
  const raw = req.query[name]
  if (typeof raw !== 'string' || !raw.trim()) {
    throw badRequest(`Missing required parameter "${name}".`)
  }
  return raw.trim()
}

export function optionalQueryParam(req: VercelRequest, name: string): string | undefined {
  const raw = req.query[name]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

/**
 * Returns the parsed JSON body.
 *
 * Vercel parses `application/json` for us, but only up to its own size cap. We
 * reject anything that isn't a plain object so a handler never spreads an
 * array or a string into a database row.
 */
export function jsonBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body
  if (body === undefined || body === null || body === '') return {}
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object.')
  }
  return body as Record<string, unknown>
}
