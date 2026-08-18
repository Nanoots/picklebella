import type { VercelRequest, VercelResponse } from '@vercel/node'
import { notFound, withApi } from '../../lib/http.js'

import blocks from '../../lib/admin/blocks.js'
import bookings from '../../lib/admin/bookings.js'
import courts from '../../lib/admin/courts.js'
import hours from '../../lib/admin/hours.js'
import members from '../../lib/admin/members.js'
import pricing from '../../lib/admin/pricing.js'
import promos from '../../lib/admin/promos.js'
import reports from '../../lib/admin/reports.js'

/* =========================================================
   Every /api/admin/* route, served by one serverless function.

   Each of these was its own file under api/, which meant each became its own
   deployed function. Together with the customer-facing routes that came to
   sixteen — over the twelve-function ceiling on Vercel's Hobby plan, which is
   enforced when the deployment is assembled rather than when it is built. The
   build therefore passed and the deploy failed with nothing after
   "Deploying outputs..." in the log.

   The handlers are unchanged and still live one-per-file in lib/admin/; only
   the entry point is shared. The public URLs are identical, so nothing on the
   client side changes.

   Each handler still calls requireAdmin() for itself. Routing through a single
   file grants nobody anything — an unknown segment 404s, and a known one still
   has to get past its own authorisation check.
   ========================================================= */

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

/* A Map, not an object literal. Property lookup on an object would resolve
   inherited keys, so /api/admin/constructor would find Object.prototype's
   constructor — a truthy value this file would then happily call. A Map has
   no prototype chain to walk into. */
const routes = new Map<string, Handler>([
  ['blocks', blocks],
  ['bookings', bookings],
  ['courts', courts],
  ['hours', hours],
  ['members', members],
  ['pricing', pricing],
  ['promos', promos],
  ['reports', reports],
])

/**
 * The route name from the request path.
 *
 * Read from req.url rather than the catch-all's query parameter. How Vercel
 * populates that parameter varies between runtimes and framework presets — it
 * came through empty here, which 404'd every admin route — whereas the URL is
 * always exactly what the client asked for.
 */
function routeName(req: VercelRequest): string | null {
  // Base is irrelevant; it only makes the relative URL parseable.
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  const parts = pathname.split('/').filter(Boolean)

  const adminAt = parts.indexOf('admin')
  if (adminAt === -1) return null

  const rest = parts.slice(adminAt + 1)
  // Exactly one segment. Matching loosely would accept /api/admin/bookings/anything.
  return rest.length === 1 ? (rest[0] ?? null) : null
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const name = routeName(req)
  if (!name) throw notFound()

  const handler = routes.get(name)
  if (!handler) throw notFound()

  await handler(req, res)
})
