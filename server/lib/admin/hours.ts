import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jsonBody, ok, requireMethod, withApi } from '../http.js'
import { requireAdmin } from '../auth.js'
import { getHoursConfig, saveSetting } from '../settings.js'
import { hoursInput, parse } from '../validation.js'

/* Weekly opening hours plus holiday overrides. These feed straight into
   availability and into whether a booking is allowed at all, so the schema
   check on write is doing real work — a weekly array of the wrong length
   would make hoursForDate fall back to defaults for some days. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST')
  const admin = await requireAdmin(req)

  if (method === 'GET') {
    ok(res, await getHoursConfig())
    return
  }

  const cfg = parse(hoursInput, jsonBody(req))
  await saveSetting('hours', cfg, admin.id)
  ok(res, cfg)
})
