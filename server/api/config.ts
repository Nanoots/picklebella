import type { VercelRequest, VercelResponse } from '@vercel/node'
import { okCached, requireMethod, withApi } from '../lib/http.js'
import { getHoursConfig, getPricingConfig } from '../lib/settings.js'
import { getSiteImages } from '../lib/siteImages.js'

/* Opening hours and the peak-pricing rules, so the booking screen can label
   slots and show prices. Read-only, and the figures shown here are never what
   gets charged — /api/quote decides that.

   Also carries the admin-managed site photos. They ride along here rather
   than getting their own endpoint because the project is at Vercel Hobby's
   twelve-function ceiling (see api/admin/[...path].ts). */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  requireMethod(req, 'GET')
  const [hours, pricing, images] = await Promise.all([getHoursConfig(), getPricingConfig(), getSiteImages()])
  okCached(res, { hours, pricing, images }, { seconds: 60 })
})
