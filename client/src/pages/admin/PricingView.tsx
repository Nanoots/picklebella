import { useState } from 'react'
import { Plus, Tag } from 'lucide-react'
import * as api from '../../lib/api'
import type { PricingConfig, PromoCode, Court } from '../../lib/types'
import { OPEN_HOUR, CLOSE_HOUR } from '../../lib/types'
import { fmtHour, fmtMoney, todayStr, uid } from '../../lib/format'
import { useAsync, errorMessage } from '../../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../../components/States'
import { G, G_DARK, FONT_DISPLAY, FONT_BODY } from '../../lib/theme'
import { SectionCard } from './shared'

interface Props {
  courts: Court[]
  refresh: () => void | Promise<void>
  showToast: (msg: string) => void
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function PricingView({ courts, refresh, showToast }: Props) {
  const loadedCfg = useAsync<PricingConfig>(() => api.admin.getPricing(), [])
  const promoList = useAsync<PromoCode[]>(() => api.admin.listPromos(), [])
  const [draft, setDraft] = useState<PricingConfig | null>(null)
  const [adding, setAdding] = useState(false)

  const cfg = draft ?? loadedCfg.data
  const promos = promoList.data ?? []

  const [code, setCode] = useState('')
  const [type, setType] = useState<PromoCode['type']>('percent')
  const [value, setValue] = useState('10')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxUses, setMaxUses] = useState('0')

  const hourOptions = Array.from({ length: CLOSE_HOUR - OPEN_HOUR + 1 }, (_, i) => OPEN_HOUR + i)

  if (loadedCfg.loading && !cfg) return <LoadingBlock label="Loading pricing…" />
  if (loadedCfg.error && !cfg) return <ErrorBlock message={loadedCfg.error} onRetry={loadedCfg.reload} />
  if (!cfg) return null

  const persistCfg = async (next: PricingConfig) => {
    // Optimistic, then reconciled with what the server stored — a rejected
    // change snaps back rather than lingering as a false success.
    setDraft(next)
    try {
      const saved = await api.admin.savePricing(next)
      setDraft(saved)
      await refresh()
    } catch (err) {
      setDraft(loadedCfg.data)
      showToast(errorMessage(err))
    }
  }

  const toggleDay = (d: number) => {
    const peakDays = cfg.peakDays.includes(d) ? cfg.peakDays.filter((x) => x !== d) : [...cfg.peakDays, d].sort()
    void persistCfg({ ...cfg, peakDays })
  }

  const addPromo = async () => {
    const trimmed = code.trim().toUpperCase()
    const numValue = Number(value)
    if (!trimmed) { showToast('Enter a promo code'); return }
    if (promos.some((p) => p.code.toUpperCase() === trimmed)) { showToast('That code already exists'); return }
    if (!numValue || numValue <= 0) { showToast('Enter a discount value'); return }
    if (type === 'percent' && numValue > 100) { showToast('Percent discount cannot exceed 100'); return }

    try {
      await api.admin.savePromo({
        id: uid('promo'),
        code: trimmed,
        type,
        value: numValue,
        active: true,
        expiresAt,
        maxUses: Number(maxUses) || 0,
        usedCount: 0,
      })
      promoList.reload()
      setCode(''); setValue('10'); setExpiresAt(''); setMaxUses('0'); setAdding(false)
      showToast(`Promo ${trimmed} created`)
      await refresh()
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  const toggleActive = async (p: PromoCode) => {
    try {
      await api.admin.savePromo({ ...p, active: !p.active })
      promoList.reload()
      showToast(p.active ? `${p.code} deactivated` : `${p.code} activated`)
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  const removePromo = async (id: string, promoCode: string) => {
    try {
      await api.admin.deletePromo(id)
      promoList.reload()
      showToast(`${promoCode} deleted`)
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  const sampleRate = courts[0]?.rate ?? 300

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionCard title="Peak pricing" subtitle="Charge a higher rate during busy hours. Off-peak uses each court's base rate.">
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={cfg.peakEnabled} onChange={(e) => persistCfg({ ...cfg, peakEnabled: e.target.checked })} />
          <span className="text-sm font-semibold text-gray-800">Enable peak pricing</span>
        </label>

        <div style={{ opacity: cfg.peakEnabled ? 1 : 0.45, pointerEvents: cfg.peakEnabled ? 'auto' : 'none' }}>
          <div className="flex gap-4 flex-wrap mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Peak starts</label>
              <select value={cfg.peakStartHour} onChange={(e) => persistCfg({ ...cfg, peakStartHour: Number(e.target.value) })} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5">
                {hourOptions.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Peak ends</label>
              <select value={cfg.peakEndHour} onChange={(e) => persistCfg({ ...cfg, peakEndHour: Number(e.target.value) })} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5">
                {hourOptions.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Peak multiplier</label>
              <input
                type="number" step="0.05" min="1" value={cfg.peakMultiplier}
                onChange={(e) => persistCfg({ ...cfg, peakMultiplier: Number(e.target.value) || 1 })}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" style={{ width: '90px' }}
              />
            </div>
          </div>

          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Peak days</label>
          <div className="flex gap-1.5 flex-wrap mb-4">
            {DAY_SHORT.map((d, i) => {
              const on = cfg.peakDays.includes(i)
              return (
                <button
                  key={d}
                  onClick={() => toggleDay(i)}
                  style={{ fontFamily: FONT_BODY, backgroundColor: on ? G : 'white', color: on ? 'white' : '#6B7280', borderColor: on ? G : '#E5E7EB' }}
                  className="text-xs font-semibold rounded-full px-3 py-1.5 border cursor-pointer"
                >
                  {d}
                </button>
              )
            })}
          </div>

          <div style={{ backgroundColor: '#F9FAFB', borderRadius: '10px', padding: '0.875rem 1rem' }}>
            <p className="text-xs text-gray-500 m-0">
              Example on a {fmtMoney(sampleRate)}/hr court —{' '}
              <strong className="text-gray-800">off-peak {fmtMoney(sampleRate)}</strong>,{' '}
              <strong style={{ color: G }}>peak {fmtMoney(Math.round(sampleRate * cfg.peakMultiplier))}</strong>
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Promo codes"
        subtitle={`${promos.filter((p) => p.active).length} active of ${promos.length} total`}
        action={
          <button
            onClick={() => setAdding(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: G_DARK, color: 'white', border: 'none', borderRadius: '999px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
          >
            <Plus size={14} /> New Code
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[680px]">
            <thead>
              <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Discount</th>
                <th className="py-2 pr-3">Expires</th>
                <th className="py-2 pr-3">Uses</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const expired = !!p.expiresAt && p.expiresAt < todayStr()
                const usedUp = p.maxUses > 0 && p.usedCount >= p.maxUses
                return (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1.5 font-bold text-gray-900">
                        <Tag size={13} className="text-gray-400" />{p.code}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{p.type === 'percent' ? `${p.value}% off` : `${fmtMoney(p.value)} off`}</td>
                    <td className="py-3 pr-3">{p.expiresAt || 'Never'}</td>
                    <td className="py-3 pr-3">{p.usedCount}{p.maxUses > 0 ? ` / ${p.maxUses}` : ''}</td>
                    <td className="py-3 pr-3">
                      {expired ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">Expired</span>
                        : usedUp ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">Used up</span>
                        : p.active ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Active</span>
                        : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => toggleActive(p)} style={{ fontFamily: FONT_BODY }} className="text-xs font-semibold text-gray-700 border border-gray-200 bg-white rounded-full px-3 py-1.5 cursor-pointer whitespace-nowrap">
                          {p.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => removePromo(p.id, p.code)} title="Delete" className="w-7 h-7 rounded-lg border border-gray-200 bg-white cursor-pointer">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {promoList.loading && !promoList.data && <LoadingBlock label="Loading promo codes…" />}
          {promoList.error && <ErrorBlock message={promoList.error} onRetry={promoList.reload} />}
          {!promoList.loading && !promoList.error && promos.length === 0 && <div className="text-center text-gray-400 text-sm py-10">No promo codes yet.</div>}
        </div>
      </SectionCard>

      {adding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setAdding(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 style={{ fontFamily: FONT_DISPLAY }} className="text-lg font-bold text-gray-900 m-0 mb-4">New promo code</h3>
            <div className="flex flex-col gap-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Code</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SUMMER25" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value as PromoCode['type'])} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="percent">Percent off</option>
                    <option value="fixed">Fixed ₱ off</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">{type === 'percent' ? 'Percent' : 'Amount (₱)'}</label>
                  <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Expires (optional)</label>
                  <input type="date" min={todayStr()} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Max uses (0 = ∞)</label>
                  <input type="number" min="0" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setAdding(false)} className="flex-1 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-600 cursor-pointer">Cancel</button>
              <button onClick={addPromo} style={{ backgroundColor: G_DARK }} className="flex-1 py-2.5 rounded-full border-none text-white text-sm font-semibold cursor-pointer">Create Code</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
