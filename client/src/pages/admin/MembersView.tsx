import { useState } from 'react'
import { Ban, Star, X } from 'lucide-react'
import * as api from '../../lib/api'
import type { Booking, Court, MemberSummary } from '../../lib/types'
import { fmtDate, fmtHour, fmtMoney } from '../../lib/format'
import { useAsync, errorMessage } from '../../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../../components/States'
import { G, FONT_DISPLAY, FONT_BODY } from '../../lib/theme'
import { SectionCard, StatusBadge } from './shared'

interface Props {
  refreshKey: number
  /** Already loaded by the admin shell; used for each member's booking history. */
  bookings: Booking[]
  courts: Court[]
  refresh: () => void | Promise<void>
  showToast: (msg: string) => void
}

function MemberDetail({ member, bookings, courts, onClose, onChanged, showToast }: {
  member: MemberSummary
  bookings: Booking[]
  courts: Court[]
  onClose: () => void
  onChanged: () => void | Promise<void>
  showToast: (m: string) => void
}) {
  const [busy, setBusy] = useState(false)

  const history = bookings
    .filter((b) => b.email.toLowerCase() === member.email.toLowerCase())
    .sort((a, b) => (b.date + String(b.startHour)).localeCompare(a.date + String(a.startHour)))

  const courtFor = (id: string) => courts.find((c) => c.id === id)

  /* Ban and VIP live on the profile row, which exists only for registered
     accounts. A walk-in guest an admin typed in has no account to flag — the
     server returns 404 and that message is shown as-is rather than silently
     conjuring a profile with no login behind it. */
  async function setAccess(patch: { banned?: boolean; vip?: boolean }, message: string) {
    if (busy) return
    setBusy(true)
    try {
      await api.admin.setMemberAccess(member.email, patch)
      showToast(message)
      await onChanged()
      onClose()
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function toggleBan() {
    const next = !member.banned
    void setAccess(
      { banned: next },
      next ? `${member.name} is banned from booking` : `Ban lifted for ${member.name}`,
    )
  }

  function toggleVip() {
    const next = !member.vip
    void setAccess(
      { vip: next },
      next ? `${member.name} marked as VIP` : `VIP removed for ${member.name}`,
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full" style={{ maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-gray-100">
          <div>
            <h3 style={{ fontFamily: FONT_DISPLAY }} className="text-lg font-bold text-gray-900 m-0">{member.name}</h3>
            <p className="text-sm text-gray-500 m-0 mt-0.5">{member.email}</p>
            <p className="text-sm text-gray-500 m-0">{member.phone || 'No phone on file'}</p>
            <div className="flex gap-1.5 mt-2">
              {member.vip && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">VIP</span>}
              {member.banned && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Banned</span>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full border-none bg-gray-50 cursor-pointer flex items-center justify-center flex-shrink-0"><X size={15} /></button>
        </div>

        <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 m-0 uppercase tracking-wide font-semibold">Bookings</p>
            <p className="text-lg font-bold text-gray-900 m-0" style={{ fontFamily: FONT_DISPLAY }}>{member.bookingsCount}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 m-0 uppercase tracking-wide font-semibold">Total spent</p>
            <p className="text-lg font-bold m-0" style={{ fontFamily: FONT_DISPLAY, color: G }}>{fmtMoney(member.totalSpent)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 m-0 uppercase tracking-wide font-semibold">Last booking</p>
            <p className="text-lg font-bold text-gray-900 m-0" style={{ fontFamily: FONT_DISPLAY }}>{member.lastBookingDate ? fmtDate(member.lastBookingDate) : '—'}</p>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide m-0 mb-2">Booking history</p>
          {history.map((b) => {
            const court = courtFor(b.courtId)
            return (
              <div key={b.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-gray-800 m-0">{court ? court.name : b.courtId} · {fmtMoney(b.amount)}</p>
                  <p className="text-xs text-gray-400 m-0">{fmtDate(b.date)} · {fmtHour(b.startHour)}–{fmtHour(b.startHour + b.duration)}</p>
                </div>
                <StatusBadge status={b.status} />
              </div>
            )
          })}
          {history.length === 0 && <div className="text-center text-gray-400 text-sm py-6">No bookings yet.</div>}
        </div>

        <div className="flex gap-2.5 p-5 border-t border-gray-100">
          <button
            onClick={toggleVip}
            style={{ fontFamily: FONT_BODY }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-semibold cursor-pointer border ${member.vip ? 'border-gray-200 bg-white text-gray-600' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
          >
            <Star size={14} /> {member.vip ? 'Remove VIP' : 'Mark as VIP'}
          </button>
          <button
            onClick={toggleBan}
            style={{ fontFamily: FONT_BODY }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-semibold cursor-pointer border ${member.banned ? 'border-gray-200 bg-white text-gray-600' : 'border-red-200 bg-white text-red-600'}`}
          >
            <Ban size={14} /> {member.banned ? 'Lift ban' : 'Ban from booking'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MembersView({ refreshKey, bookings, courts, refresh, showToast }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  // Re-fetched whenever the admin shell refreshes, so a ban applied here is
  // reflected in the list without a full page reload.
  const state = useAsync<MemberSummary[]>(() => api.admin.listMembers(), [refreshKey])
  const members = state.data ?? []

  const filtered = members
    .filter((m) =>
      !query.trim() ||
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.email.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  const selectedMember = members.find((m) => m.email === selected)

  return (
    <>
      <SectionCard
        title="Members"
        subtitle={`${members.length} customer${members.length === 1 ? '' : 's'} · ${members.filter((m) => m.vip).length} VIP · ${members.filter((m) => m.banned).length} banned`}
        action={
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
            style={{ fontFamily: FONT_BODY, minWidth: '220px' }}
          />
        }
      >
        {state.loading && !state.data && <LoadingBlock label="Loading members…" />}
        {state.error && <ErrorBlock message={state.error} onRetry={state.reload} />}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[700px]">
            <thead>
              <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-3">Member</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Bookings</th>
                <th className="py-2 pr-3">Total Spent</th>
                <th className="py-2 pr-3">Last Booking</th>
                <th className="py-2 pr-3">Access</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.email} className="border-b border-gray-50">
                  <td className="py-3 pr-3 font-semibold text-gray-900">{m.name}</td>
                  <td className="py-3 pr-3">
                    <span className="text-gray-700">{m.email}</span><br />
                    <span className="text-gray-400 text-xs">{m.phone || '—'}</span>
                  </td>
                  <td className="py-3 pr-3">{m.bookingsCount}</td>
                  <td className="py-3 pr-3 font-semibold">{fmtMoney(m.totalSpent)}</td>
                  <td className="py-3 pr-3">{m.lastBookingDate ? fmtDate(m.lastBookingDate) : '—'}</td>
                  <td className="py-3 pr-3">
                    <div className="flex gap-1.5">
                      {m.vip && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">VIP</span>}
                      {m.banned && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Banned</span>}
                      {!m.vip && !m.banned && <span className="text-xs text-gray-400">Standard</span>}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <button
                      onClick={() => setSelected(m.email)}
                      style={{ fontFamily: FONT_BODY }}
                      className="text-xs font-semibold text-gray-700 border border-gray-200 bg-white rounded-full px-3 py-1.5 cursor-pointer whitespace-nowrap"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center text-gray-400 text-sm py-10">No members match this search.</div>}
        </div>
      </SectionCard>

      {selectedMember && (
        <MemberDetail
          member={selectedMember}
          bookings={bookings}
          courts={courts}
          onClose={() => setSelected(null)}
          onChanged={refresh}
          showToast={showToast}
        />
      )}
    </>
  )
}
