import type { VercelRequest, VercelResponse } from '@vercel/node'
import { jsonBody, ok, requireMethod, withApi } from '../http.js'
import { requireAdmin } from '../auth.js'
import { addGalleryImage, deleteImage, getSiteImages, setCourtImage, updateCaption } from '../siteImages.js'
import { imageCaption, imageUpload, parse, uuid } from '../validation.js'

/* Photos on the public site — see siteImages.ts. Every write returns the
   whole manifest so the admin screen can redraw from what was actually saved. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST', 'PATCH', 'DELETE')
  await requireAdmin(req)

  if (method === 'GET') {
    ok(res, await getSiteImages())
    return
  }

  if (method === 'POST') {
    const input = parse(imageUpload, jsonBody(req))
    ok(res, input.slot === 'court'
      ? await setCourtImage(input.key, input.data)
      : await addGalleryImage(input.slot, input.data, input.caption))
    return
  }

  if (method === 'PATCH') {
    const input = parse(imageCaption, jsonBody(req))
    ok(res, await updateCaption(input.id, input.caption))
    return
  }

  ok(res, await deleteImage(parse(uuid, req.query.id)))
})
