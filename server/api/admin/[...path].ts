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
   deployed function. Together with the eight customer-facing routes that came
   to sixteen — over the twelve-function ceiling on Vercel's Hobby plan, which
   is enforced when the deployment is assembled rather than when it is built.
   The build therefore passed and the deploy failed with nothing useful in the
   build log.

   The handlers themselves are unchanged and still live one-per-file in
   lib/admin/; only the entry point is shared. The public URLs are identical,
   so nothing on the client side changes.

   Each handler still calls requireAdmin() for itself. Routing through a single
   file does not grant anyone anything — an unknown segment 404s, and a known
   one still has to get past its own authorisation check.
   ========================================================= */

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

const routes: Record<string, Handler> = {
  blocks,
  bookings,
  courts,
  hours,
  members,
  pricing,
  promos,
  reports,
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  // `path` is the catch-all segment list from the filename: /api/admin/bookings
  // arrives as ['bookings'].
  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []

  // Exactly one segment. Anything deeper is not a route we serve, and matching
  // loosely here would let /api/admin/bookings/../../something odd through.
  if (segments.length !== 1) throw notFound()

  const handler = routes[segments[0]!]
  if (!handler) throw notFound()

  await handler(req, res)
})
