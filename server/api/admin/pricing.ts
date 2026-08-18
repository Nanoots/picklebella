import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jsonBody, ok, requireMethod, withApi } from '../../lib/http.js'
import { requireAdmin } from '../../lib/auth.js'
import { getPricingConfig, saveSetting } from '../../lib/settings.js'
import { parse, pricingInput } from '../../lib/validation.js'

/* Peak-hour pricing rules. The multiplier is bounded by the schema so a
   mistyped value cannot multiply every booking on the calendar. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST')
  const admin = await requireAdmin(req)

  if (method === 'GET') {
    ok(res, await getPricingConfig())
    return
  }

  const cfg = parse(pricingInput, jsonBody(req))
  await saveSetting('pricing', cfg, admin.id)
  ok(res, cfg)
})
