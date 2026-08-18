import type { VercelRequest, VercelResponse } from '@vercel/node'
import { conflict, jsonBody, noContent, notFound, ok, requireMethod, withApi } from '../../lib/http.js'
import { requireAdmin } from '../../lib/auth.js'
import { db } from '../../lib/supabase.js'
import { mapCourt } from '../../lib/domain.js'
import { getCourts } from '../../lib/settings.js'
import { courtId as courtIdSchema, courtInput, parse } from '../../lib/validation.js'

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST', 'DELETE')
  await requireAdmin(req)

  if (method === 'GET') {
    // Staff see deactivated courts too — that is the point of this list.
    ok(res, await getCourts({ activeOnly: false }))
    return
  }

  if (method === 'POST') {
    const input = parse(courtInput, jsonBody(req))
    const { data, error } = await db
      .from('courts')
      .upsert(
        {
          id: input.id,
          name: input.name,
          type: input.type,
          surface: input.surface,
          rate: input.rate,
          emoji: input.emoji,
          color: input.color,
          feats: input.feats,
          lighting: input.lighting,
          active: input.active,
        },
        { onConflict: 'id' },
      )
      .select()
      .single()

    if (error) throw error
    ok(res, mapCourt(data))
    return
  }

  const id = parse(courtIdSchema, req.query.id)

  // Deleting a court that has history would orphan those bookings, and the
  // foreign key is ON DELETE RESTRICT so the database would refuse anyway.
  // Checking here turns that into a message about what to do instead.
  const { count, error: countError } = await db
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('court_id', id)
  if (countError) throw countError

  if (count && count > 0) {
    throw conflict(
      'This court has booking history and cannot be deleted. Deactivate it instead — it will disappear from the booking page but its records stay intact.',
      'court_has_bookings',
    )
  }

  const { error, count: deleted } = await db.from('courts').delete({ count: 'exact' }).eq('id', id)
  if (error) throw error
  if (!deleted) throw notFound('Court not found.')
  noContent(res)
})
