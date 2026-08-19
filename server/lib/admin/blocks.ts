import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  conflict,
  created,
  jsonBody,
  noContent,
  notFound,
  ok,
  optionalQueryParam,
  requireMethod,
  withApi,
} from '../http.js'
import { requireAdmin } from '../auth.js'
import { db } from '../supabase.js'
import { mapBlock } from '../domain.js'
import { blockInput, dateString, parse, uuid } from '../validation.js'

/* Maintenance / private-hire holds that take a court off sale. */
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const method = requireMethod(req, 'GET', 'POST', 'DELETE')
  const admin = await requireAdmin(req)

  if (method === 'GET') {
    const date = optionalQueryParam(req, 'date')
    let query = db.from('blocks').select('*').order('date').order('start_hour')
    if (date) query = query.eq('date', parse(dateString, date))

    const { data, error } = await query.limit(2000)
    if (error) throw error
    ok(res, (data ?? []).map(mapBlock))
    return
  }

  if (method === 'POST') {
    const input = parse(blockInput, jsonBody(req))

    // A block over a sold slot would strand a paying customer, so it is
    // refused rather than silently layered on top.
    const { data: clashes, error: clashError } = await db
      .from('bookings')
      .select('start_hour, duration')
      .eq('court_id', input.courtId)
      .eq('date', input.date)
      .in('status', ['paid', 'pending'])
    if (clashError) throw clashError

    const overlaps = (clashes ?? []).some(
      (b) => input.startHour < b.start_hour + b.duration && b.start_hour < input.endHour,
    )
    if (overlaps) {
      throw conflict('There is already a booking in that range. Cancel it first.', 'booking_exists')
    }

    const { data, error } = await db
      .from('blocks')
      .insert({
        court_id: input.courtId,
        date: input.date,
        start_hour: input.startHour,
        end_hour: input.endHour,
        reason: input.reason,
        created_by: admin.id,
      })
      .select()
      .single()

    if (error) throw error
    created(res, mapBlock(data))
    return
  }

  const id = parse(uuid, req.query.id)
  const { error, count } = await db.from('blocks').delete({ count: 'exact' }).eq('id', id)
  if (error) throw error
  if (!count) throw notFound('Block not found.')
  noContent(res)
})
