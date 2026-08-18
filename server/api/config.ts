import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ok, requireMethod, withApi } from '../lib/http.js'
import { getHoursConfig, getPricingConfig } from '../lib/settings.js'

/* Opening hours and the peak-pricing rules, so the booking screen can label
   slots and show prices. Read-only, and the figures shown here are never what
   gets charged — /api/quote decides that. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  const [hours, pricing] = await Promise.all([getHoursConfig(), getPricingConfig()])
  ok(res, { hours, pricing })
})
