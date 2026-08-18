import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ok, requireMethod, withApi } from '../lib/http.js'
import { getCourts } from '../lib/settings.js'

/* Public court list. Only active courts: a deactivated court is an internal
   fact, and the admin list at /api/admin/courts is where staff see them all. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  ok(res, await getCourts({ activeOnly: true }))
})
