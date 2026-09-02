import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import * as api from '../../lib/api'
import type { AvailabilityResponse } from '../../lib/api'
import type { Booking, Court } from '../../lib/types'
import { OPEN_HOUR, CLOSE_HOUR } from '../../lib/types'
import { fmtHour, fmtDate, fmtMoney, todayStr } from '../../lib/format'
import { useAsync, errorMessage } from '../../lib/useAsync'
import { PAYMENT_METHODS } from '../../lib/paymentMethods'
import { G_DARK, FONT_DISPLAY, FONT_BODY } from '../../lib/theme'
import { StatusBadge, PaymentMethodTag, SectionCard } from './shared'

interface Props {
  bookings: Booking[]
  courts: Court[]
  refresh: () => void | Promise<void>
  showToast: (msg: string) => void
}

export default function ReservationsView({ bookings, courts, refresh, showToast }: Props) {
  const [courtFilter, setCourtFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [search, setSearch] = useState('')
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const courtFor = (id: string) => courts.find((c) => c.id === id)

  async function cancelBooking(id: string) {
    if (busy) return
    setBusy(true)
    try {
      // Cancelled, not deleted: the row is the record of what happened, and it
      // frees the slot for someone else straight away.
      await api.admin.updateBooking(id, { status: 'cancelled' })
      showToast('Booking cancelled')
      setPendingCancelId(null)
      await refresh()
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Newest-made booking first — this is a list of reservations coming in, not
  // a schedule, so the thing staff want at the top is what just happened.
  let filtered = [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (courtFilter !== 'all') filtered = filtered.filter((b) => b.courtId === courtFilter)
  if (statusFilter !== 'all') filtered = filtered.filter((b) => b.status === statusFilter)
  if (dateFilter) filtered = filtered.filter((b) => b.date === dateFilter)
  const q = search.trim().toLowerCase()
  if (q) {
    filtered = filtered.filter((b) =>
      b.name.toLowerCase().includes(q) ||
      b.phone.toLowerCase().includes(q) ||
      b.email.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q),
    )
  }

  return (
    <>
      <SectionCard
        title="Reservations"
        subtitle={`${filtered.length} booking${filtered.length === 1 ? '' : 's'}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute top-1/2 -translate-y-1/2 text-gray-400" style={{ left: '9px' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email, ref…"
                className="text-sm border border-gray-200 rounded-lg py-1.5"
                style={{ paddingLeft: '30px', paddingRight: '10px', width: '210px' }}
              />
            </div>
            <select value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5">
              <option value="all">All Courts</option>
              {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5">
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            <button onClick={() => { setCourtFilter('all'); setStatusFilter('all'); setDateFilter(''); setSearch('') }} className="text-sm text-gray-500 bg-transparent border-none cursor-pointer">Clear</button>
            <button
              onClick={() => setAdding(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: G_DARK, color: 'white', border: 'none', borderRadius: '999px', padding: '0.4rem 0.9rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
            >
              <Plus size={14} /> New Booking
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[820px]">
            <thead>
              <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-3">Ref</th>
                <th className="py-2 pr-3">Court</th>
                <th className="py-2 pr-3">Date & Time</th>
                <th className="py-2 pr-3">Guest</th>
                <th className="py-2 pr-3">Payment</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const court = courtFor(b.courtId)
                return (
                  <tr key={b.id} className="border-b border-gray-50">
                    <td className="py-3 pr-3 font-bold text-gray-900">{b.id.toUpperCase()}</td>
                    <td className="py-3 pr-3">{court ? court.name : b.courtId}</td>
                    <td className="py-3 pr-3">
                      {fmtDate(b.date)}<br />
                      <span className="text-gray-400 text-xs">{fmtHour(b.startHour)} – {fmtHour(b.startHour + b.duration)}</span>
                    </td>
                    <td className="py-3 pr-3">
                      {b.name}<br /><span className="text-gray-400 text-xs">{b.phone}</span>
                    </td>
                    <td className="py-3 pr-3"><PaymentMethodTag methodId={b.paymentMethod} /></td>
                    <td className="py-3 pr-3">{fmtMoney(b.amount)}</td>
                    <td className="py-3 pr-3"><StatusBadge status={b.status} /></td>
                    <td className="py-3 pr-3">
                      {b.status !== 'cancelled' && (
                        <button
                          onClick={() => setPendingCancelId(b.id)}
                          style={{ fontFamily: FONT_BODY }}
                          className="text-xs font-semibold text-red-600 border border-red-200 bg-white rounded-full px-3 py-1.5 cursor-pointer whitespace-nowrap"
                        >
                          Cancel Reservation
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-10">No bookings match these filters.</div>
          )}
        </div>
      </SectionCard>

      {pendingCancelId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setPendingCancelId(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 style={{ fontFamily: FONT_DISPLAY }} className="text-lg font-bold text-gray-900 m-0 mb-2">Cancel this booking?</h3>
            <p className="text-sm text-gray-500 mb-5">This will free up the time slot and mark the booking as cancelled.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setPendingCancelId(null)} className="flex-1 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-600 cursor-pointer">Keep Booking</button>
              <button onClick={() => cancelBooking(pendingCancelId)} className="flex-1 py-2.5 rounded-full border-none bg-red-600 text-white text-sm font-semibold cursor-pointer">Cancel Booking</button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <ManualBookingModal
          courts={courts}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); refresh() }}
          showToast={showToast}
        />
      )}
    </>
  )
}

function ManualBookingModal({ courts, onClose, onSaved, showToast }: {
  courts: Court[]
  onClose: () => void
  onSaved: () => void
  showToast: (m: string) => void
}) {
  const bookable = courts.filter((c) => c.active)
  const [courtId, setCourtId] = useState(bookable[0]?.id ?? '')
  const [date, setDate] = useState(todayStr())
  const [startHour, setStartHour] = useState(OPEN_HOUR)
  const [duration, setDuration] = useState(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('instapay')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const [saving, setSaving] = useState(false)

  const hourOptions = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i)

  // Opening hours, current bookings and per-hour prices for the chosen court
  // and date — the same view the customer-facing grid uses.
  const slots = useAsync<AvailabilityResponse | null>(
    (signal) => (courtId ? api.getAvailability(courtId, date, signal) : Promise.resolve(null)),
    [courtId, date],
  )
  const hours = slots.data?.hours ?? { open: OPEN_HOUR, close: CLOSE_HOUR, closed: false }

  // Priced hour by hour so peak pricing applies per slot, from the server's
  // own figures rather than a second copy of the pricing rules.
  const amount = Array.from({ length: duration }, (_, i) => slots.data?.prices[startHour + i] ?? 0).reduce(
    (a, b) => a + b,
    0,
  )

  /** Local pre-check for a clearer message. The server re-checks regardless. */
  function rangeLooksFree() {
    if (!slots.data) return false
    for (let h = startHour; h < startHour + duration; h++) {
      if (slots.data.slots[h] !== 'available') return false
    }
    return true
  }

  async function submit() {
    setError('')
    if (saving) return
    if (!courtId) { setError('Pick a court.'); return }
    if (!name.trim()) { setError('Enter the guest name.'); return }
    if (hours.closed) { setError('The venue is closed on this date.'); return }
    if (!rangeLooksFree()) {
      setError('That time range is outside opening hours or already booked/blocked.')
      return
    }

    setSaving(true)
    try {
      await api.admin.createBooking({
        courtId,
        date,
        startHour,
        duration,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        players: 4,
        notes: notes.trim(),
        paymentMethod,
        amount,
      })
      showToast('Booking created')
      onSaved()
    } catch (err) {
      // A 409 here means the slot went while the form was open.
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl p-6 w-full" style={{ maxWidth: '440px', maxHeight: '88vh', overflowY: 'auto' }}>
        <h3 style={{ fontFamily: FONT_DISPLAY }} className="text-lg font-bold text-gray-900 m-0 mb-1">New booking</h3>
        <p className="text-sm text-gray-500 mb-4">Create a reservation on behalf of a guest (walk-in or phone booking).</p>

        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}

        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Court</label>
            <select value={courtId} onChange={(e) => setCourtId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {bookable.map((c) => <option key={c.id} value={c.id}>{c.name} · {fmtMoney(c.rate)}/hr</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs mt-1 m-0" style={{ color: hours.closed ? '#DC2626' : '#9CA3AF' }}>
              {hours.closed ? 'Venue is closed on this date' : `Open ${fmtHour(hours.open)} – ${fmtHour(hours.close)}`}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Start</label>
              <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {hourOptions.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Hours</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{d} hour{d > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Guest name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Santos" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@example.com" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Payment method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {PAYMENT_METHODS.filter((p) => !p.disabled).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value="cash">Cash (walk-in)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--pb-hover-bg)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-sm font-semibold text-gray-700">Total</span>
          <span style={{ fontFamily: FONT_DISPLAY }} className="text-lg font-extrabold text-gray-900">{fmtMoney(amount)}</span>
        </div>

        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-600 cursor-pointer">Cancel</button>
          <button onClick={submit} style={{ backgroundColor: G_DARK }} className="flex-1 py-2.5 rounded-full border-none text-white text-sm font-semibold cursor-pointer">Create Booking</button>
        </div>
      </div>
    </div>
  )
}
