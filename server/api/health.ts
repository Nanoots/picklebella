import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ok, requireMethod, withApi } from '../lib/http.js'

/* Liveness probe. Deliberately returns nothing about versions, environment,
   or database state — an unauthenticated endpoint should not describe the
   system it belongs to. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  ok(res, { status: 'ok' })
})
