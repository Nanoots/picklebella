import { useState } from 'react'
import * as api from '../../lib/api'
import type { AvailabilityResponse } from '../../lib/api'
import type { Block, Court } from '../../lib/types'
import { OPEN_HOUR, CLOSE_HOUR } from '../../lib/types'
import { fmtHour, fmtDate, todayStr } from '../../lib/format'
import { useAsync, errorMessage } from '../../lib/useAsync'
import { ErrorBlock } from '../../components/States'
import { G_DARK, FONT_DISPLAY, FONT_BODY } from '../../lib/theme'
import { SectionCard } from './shared'

interface Props {
  blocks: Block[]
  courts: Court[]
  refresh: () => void | Promise<void>
  showToast: (msg: string) => void
}

export default function AvailabilityView({ blocks, courts, refresh, showToast }: Props) {
  const [gridCourt, setGridCourt] = useState(courts[0]?.id ?? '')
  const [gridDate, setGridDate] = useState(todayStr())
  const [busy, setBusy] = useState(false)
  const courtFor = (id: string) => courts.find((c) => c.id === id)

  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockCourt, setBlockCourt] = useState(courts[0]?.id ?? '')
  const [blockDate, setBlockDate] = useState(todayStr())
  const [blockStart, setBlockStart] = useState(OPEN_HOUR)
  const [blockEnd, setBlockEnd] = useState(OPEN_HOUR + 1)
  const [blockReason, setBlockReason] = useState('')

  const hourOptions = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i)

  const grid = useAsync<AvailabilityResponse | null>(
    (signal) => (gridCourt ? api.getAvailability(gridCourt, gridDate, signal) : Promise.resolve(null)),
    [gridCourt, gridDate],
  )
  const slotMap = grid.data?.slots ?? {}

  /** Runs a write, then re-reads both the grid and the page's shared lists. */
  async function mutate(action: () => Promise<unknown>, successMessage: string) {
    if (busy) return
    setBusy(true)
    try {
      await action()
      showToast(successMessage)
      grid.reload()
      await refresh()
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function toggleSlot(hour: number) {
    const status = slotMap[hour]
    if (status === 'booked' || status === 'closed') return

    if (status === 'available') {
      void mutate(
        () =>
          api.admin.createBlock({
            courtId: gridCourt,
            date: gridDate,
            startHour: hour,
            endHour: hour + 1,
            reason: 'Blocked from availability grid',
          }),
        `${fmtHour(hour)} blocked`,
      )
      return
    }

    if (status === 'blocked') {
      const covering = blocks.find(
        (b) => b.courtId === gridCourt && b.date === gridDate && hour >= b.startHour && hour < b.endHour,
      )
      if (covering) void mutate(() => api.admin.deleteBlock(covering.id), 'Slot unblocked')
    }
  }

  function removeBlock(id: string) {
    void mutate(() => api.admin.deleteBlock(id), 'Block removed')
  }

  function saveNewBlock() {
    if (!blockDate || blockEnd <= blockStart) {
      showToast('Please check the date/time range')
      return
    }
    void mutate(async () => {
      await api.admin.createBlock({
        courtId: blockCourt,
        date: blockDate,
        startHour: blockStart,
        endHour: blockEnd,
        reason: blockReason.trim() || 'Maintenance',
      })
      setBlockModalOpen(false)
      setBlockReason('')
    }, 'Time slot blocked')
  }

  const sortedBlocks = [...blocks].sort((a, b) => (a.date + a.startHour).localeCompare(b.date + String(b.startHour)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionCard
        title="Quick block"
        subtitle="Click an open slot to block it, or a blocked slot to clear it"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <select value={gridCourt} onChange={(e) => setGridCourt(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5">
              {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={gridDate} onChange={(e) => setGridDate(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
          </div>
        }
      >
        {grid.error && <ErrorBlock message={grid.error} onRetry={grid.reload} pad="1.25rem" />}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
            gap: '8px',
            // Dimmed rather than unmounted while a write is in flight, so the
            // grid does not jump and the layout stays put.
            opacity: grid.loading || busy ? 0.55 : 1,
            pointerEvents: busy ? 'none' : 'auto',
            transition: 'opacity 0.15s',
          }}
        >
          {hourOptions.map((h) => {
            const status = slotMap[h] ?? 'available'
            const clickable = status === 'available' || status === 'blocked'
            let style: React.CSSProperties = { backgroundColor: 'white', border: '1.5px solid #D1D5DB', color: '#16A34A' }
            let label = 'Open'
            if (status === 'booked') { style = { backgroundColor: '#E4E7EC', border: '1.5px solid #E4E7EC', color: '#64748B' }; label = 'Booked' }
            if (status === 'blocked') { style = { backgroundColor: '#FEE2E2', border: '1.5px solid #FCA5A5', color: '#B91C1C' }; label = 'Blocked' }
            if (status === 'closed') { style = { backgroundColor: '#FAFAFA', border: '1.5px solid #F3F4F6', color: '#D1D5DB' }; label = 'Closed' }
            return (
              <button
                key={h}
                onClick={() => toggleSlot(h)}
                disabled={!clickable}
                title={clickable ? (status === 'available' ? 'Click to block' : 'Click to unblock') : status === 'closed' ? 'Outside operating hours' : 'Already booked'}
                style={{
                  ...style, borderRadius: '10px', padding: '0.6rem 0.4rem', textAlign: 'center',
                  cursor: clickable ? 'pointer' : 'default', fontFamily: FONT_BODY,
                  display: 'flex', flexDirection: 'column', gap: '2px', transition: 'opacity 0.15s',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{fmtHour(h)}</span>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Blocked / Maintenance Slots"
        subtitle={`${sortedBlocks.length} active block${sortedBlocks.length === 1 ? '' : 's'}`}
        action={
          <button
            onClick={() => setBlockModalOpen(true)}
            style={{ backgroundColor: G_DARK, fontFamily: FONT_BODY }}
            className="text-white text-sm font-semibold rounded-full px-4 py-1.5 border-none cursor-pointer"
          >
            + Block Time Range
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[520px]">
            <thead>
              <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-3">Court</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Time Range</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedBlocks.map((b) => {
                const court = courtFor(b.courtId)
                return (
                  <tr key={b.id} className="border-b border-gray-50">
                    <td className="py-3 pr-3">{court ? court.name : b.courtId}</td>
                    <td className="py-3 pr-3">{fmtDate(b.date)}</td>
                    <td className="py-3 pr-3">{fmtHour(b.startHour)} – {fmtHour(b.endHour)}</td>
                    <td className="py-3 pr-3">{b.reason}</td>
                    <td className="py-3 pr-3">
                      <button onClick={() => removeBlock(b.id)} title="Remove" className="w-7 h-7 rounded-lg border border-gray-200 bg-white cursor-pointer">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {sortedBlocks.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-10">No blocked slots.</div>
          )}
        </div>
      </SectionCard>

      {blockModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setBlockModalOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 style={{ fontFamily: FONT_DISPLAY }} className="text-lg font-bold text-gray-900 m-0 mb-1">Block a time range</h3>
            <p className="text-sm text-gray-500 mb-4">Use this for maintenance, private events, or closures.</p>
            <div className="flex flex-col gap-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Court</label>
                <select value={blockCourt} onChange={(e) => setBlockCourt(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
                <input type="date" min={todayStr()} value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Start Hour</label>
                  <select value={blockStart} onChange={(e) => setBlockStart(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {hourOptions.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">End Hour</label>
                  <select value={blockEnd} onChange={(e) => setBlockEnd(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {hourOptions.map((h) => <option key={h + 1} value={h + 1}>{fmtHour(h + 1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Reason</label>
                <input type="text" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="e.g. Net maintenance" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setBlockModalOpen(false)} className="flex-1 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-600 cursor-pointer">Cancel</button>
              <button onClick={saveNewBlock} style={{ backgroundColor: G_DARK }} className="flex-1 py-2.5 rounded-full border-none text-white text-sm font-semibold cursor-pointer">Save Block</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
