import type { VercelRequest, VercelResponse } from '@vercel/node'
import { conflict, jsonBody, noContent, notFound, ok, requireMethod, withApi } from '../../lib/http.js'
import { requireAdmin } from '../../lib/auth.js'
import { db } from '../../lib/supabase.js'
import { mapPromo } from '../../lib/domain.js'
import { parse, promoInput } from '../../lib/validation.js'
import { z } from 'zod'

/* Promo codes. Staff-only for every operation including read — the codes
   table is invisible to the anon key, so a customer cannot list what discounts
   exist and try them. Redemption happens inside create_booking, which does the
   usage-count increment atomically. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST', 'DELETE')
  await requireAdmin(req)

  if (method === 'GET') {
    const { data, error } = await db.from('promo_codes').select('*').order('code')
    if (error) throw error
    ok(res, (data ?? []).map(mapPromo))
    return
  }

  if (method === 'POST') {
    const input = parse(promoInput, jsonBody(req))
    const { data, error } = await db
      .from('promo_codes')
      .upsert(
        {
          id: input.id,
          code: input.code.toUpperCase(),
          type: input.type,
          value: input.value,
          active: input.active,
          expires_at: input.expiresAt || null,
          max_uses: input.maxUses,
        },
        { onConflict: 'id' },
      )
      .select()
      .single()

    if (error) {
      // Two codes that differ only by case would make redemption ambiguous.
      if (error.code === '23505') throw conflict('That code already exists.', 'duplicate_code')
      throw error
    }
    ok(res, mapPromo(data))
    return
  }

  const id = parse(z.string().trim().min(1).max(64), req.query.id)
  const { error, count } = await db.from('promo_codes').delete({ count: 'exact' }).eq('id', id)
  if (error) throw error
  if (!count) throw notFound('Promo code not found.')
  noContent(res)
})
