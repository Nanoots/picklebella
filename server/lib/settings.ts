/* Reads of the venue's configuration, with sane fallbacks.

   Hours and pricing live as JSON blobs in the `settings` table rather than as
   columns, because the admin UI edits them as whole documents. They are
   re-validated on read: a blob written before a schema change, or edited
   directly in the Supabase dashboard, must not be able to produce a nonsense
   price. */

import { db } from './supabase.js'
import { notFound } from './http.js'
import {
  DEFAULT_HOURS,
  DEFAULT_PRICING,
  mapCourt,
  type Court,
  type HoursConfig,
  type PricingConfig,
} from './domain.js'
import { hoursInput, pricingInput } from './validation.js'

export async function getHoursConfig(): Promise<HoursConfig> {
  const { data, error } = await db.from('settings').select('value').eq('key', 'hours').maybeSingle()
  if (error || !data) return DEFAULT_HOURS
  const parsed = hoursInput.safeParse(data.value)
  return parsed.success ? parsed.data : DEFAULT_HOURS
}

export async function getPricingConfig(): Promise<PricingConfig> {
  const { data, error } = await db.from('settings').select('value').eq('key', 'pricing').maybeSingle()
  if (error || !data) return DEFAULT_PRICING
  const parsed = pricingInput.safeParse(data.value)
  return parsed.success ? parsed.data : DEFAULT_PRICING
}

export async function saveSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  const { error } = await db
    .from('settings')
    .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

export async function getCourts(opts: { activeOnly: boolean }): Promise<Court[]> {
  let query = db.from('courts').select('*').order('sort_order', { ascending: true }).order('id')
  if (opts.activeOnly) query = query.eq('active', true)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapCourt)
}

/** Fetches one court, rejecting deactivated ones on customer-facing paths. */
export async function getCourtOrThrow(id: string, opts: { activeOnly: boolean }): Promise<Court> {
  const { data, error } = await db.from('courts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw notFound('That court does not exist.')

  const court = mapCourt(data)
  if (opts.activeOnly && !court.active) throw notFound('That court is not available for booking.')
  return court
}
