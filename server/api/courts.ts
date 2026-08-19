import type { VercelRequest, VercelResponse } from '@vercel/node'
import { okCached, requireMethod, withApi } from '../lib/http.js'
import { getCourts } from '../lib/settings.js'

/* Public court list. Only active courts: a deactivated court is an internal
   fact, and the admin list at /api/admin/courts is where staff see them all. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  okCached(res, await getCourts({ activeOnly: true }), { seconds: 60 })
})
