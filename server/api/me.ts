import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ok, requireMethod, withApi } from '../lib/http.js'
import { isAdmin, requireUser } from '../lib/auth.js'

/* Who the caller is, according to their token. The client uses `isAdmin` to
   decide whether to show staff navigation; it is a hint for the UI, not a
   permission. Every admin endpoint checks for itself. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  const caller = await requireUser(req)
  ok(res, {
    email: caller.email,
    name: caller.name,
    phone: caller.phone,
    banned: caller.banned,
    isAdmin: await isAdmin(caller.id),
  })
})
