import { useState } from 'react'
import { Pencil, Check, X, Plus, Trash2, Lightbulb } from 'lucide-react'
import * as api from '../../lib/api'
import type { Booking, Court, HoursConfig, Holiday } from '../../lib/types'
import { OPEN_HOUR, CLOSE_HOUR, COURT_PALETTE } from '../../lib/types'
import { fmtMoney, fmtHour, uid } from '../../lib/format'
import { useAsync, errorMessage } from '../../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../../components/States'
import { G_DARK, G, FONT_DISPLAY, FONT_BODY } from '../../lib/theme'
import { SectionCard } from './shared'

interface Props {
  courts: Court[]
  /** Used only to tell whether a court has history and so cannot be deleted. */
  bookings: Booking[]
  refresh: () => void | Promise<void>
  showToast: (msg: string) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px',
  border: '1.5px solid #E5E7EB', fontSize: '0.85rem', fontFamily: FONT_BODY, boxSizing: 'border-box',
}

function CourtForm({ court, onSave, onCancel }: { court: Court; onSave: (c: Court) => void; onCancel: () => void }) {
  const [name, setName] = useState(court.name)
  const [type, setType] = useState<Court['type']>(court.type)
  const [surface, setSurface] = useState(court.surface)
  const [rate, setRate] = useState(String(court.rate))
  const [feats, setFeats] = useState(court.feats.join(', '))
  const [lighting, setLighting] = useState(court.lighting)
  const [active, setActive] = useState(court.active)

  function submit() {
    const numRate = Number(rate)
    if (!name.trim() || !numRate || numRate <= 0) return
    onSave({
      ...court,
      name: name.trim(),
      type,
      surface: surface.trim() || 'Acrylic Hard Court',
      rate: numRate,
      feats: feats.split(',').map((f) => f.trim()).filter(Boolean),
      lighting,
      active,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: '3px' }}>Court name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: '3px' }}>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as Court['type'])} style={inputStyle}>
            <option value="Indoor">Indoor</option>
            <option value="Outdoor">Outdoor</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: '3px' }}>Base rate (₱/hr)</label>
          <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: '3px' }}>Surface</label>
        <input value={surface} onChange={(e) => setSurface(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#374151', marginBottom: '3px' }}>Features (comma-separated)</label>
        <input value={feats} onChange={(e) => setFeats(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={lighting} onChange={(e) => setLighting(e.target.checked)} />
          Night lighting
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Bookable by customers
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
        <button onClick={submit} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', backgroundColor: G, color: 'white', border: 'none', borderRadius: '999px', padding: '0.5rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}>
          <Check size={14} /> Save
        </button>
        <button onClick={onCancel} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', backgroundColor: 'white', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: '999px', padding: '0.5rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}>
          <X size={14} /> Cancel
        </button>
      </div>
    </div>
  )
}

function CourtCard({ court, hasBookings, refresh, showToast }: {
  court: Court
  hasBookings: boolean
  refresh: () => void | Promise<void>
  showToast: (m: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSave(c: Court) {
    if (busy) return
    setBusy(true)
    try {
      await api.admin.saveCourt(c)
      showToast(`${c.name} updated`)
      setEditing(false)
      await refresh()
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (busy) return
    setBusy(true)
    try {
      await api.admin.deleteCourt(court.id)
      showToast(`${court.name} removed`)
      setConfirmDelete(false)
      await refresh()
    } catch (err) {
      // The server refuses to delete a court with history and says to
      // deactivate instead — pass that message straight through.
      showToast(errorMessage(err))
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6', opacity: court.active ? 1 : 0.65 }}>
      <div style={{ background: court.color, height: '110px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', backgroundColor: 'rgba(255,255,255,0.18)', color: 'white', fontSize: '0.62rem', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', textTransform: 'uppercase' }}>{court.type}</span>
        <span style={{ fontSize: '2.2rem' }}>{court.emoji}</span>
        {!editing && (
          <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', gap: '5px' }}>
            <button onClick={() => setEditing(true)} title="Edit" style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(255,255,255,0.22)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pencil size={13} />
            </button>
            <button onClick={() => setConfirmDelete(true)} title="Remove" style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(255,255,255,0.22)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
        {!court.active && (
          <span style={{ position: 'absolute', bottom: '0.6rem', left: '0.75rem', backgroundColor: 'rgba(0,0,0,0.45)', color: 'white', fontSize: '0.6rem', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', textTransform: 'uppercase' }}>Not bookable</span>
        )}
      </div>
      <div style={{ padding: '1.1rem' }}>
        {editing ? (
          <CourtForm court={court} onSave={handleSave} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: '0 0 0.2rem' }}>{court.name}</h3>
            <p style={{ color: '#9CA3AF', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>{court.surface}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.9rem' }}>
              {court.feats.map((f) => (
                <span key={f} style={{ backgroundColor: '#F3F4F6', color: '#374151', fontSize: '0.68rem', fontWeight: 500, padding: '3px 9px', borderRadius: '999px' }}>{f}</span>
              ))}
              {court.lighting && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#FEF9C3', color: '#854D0E', fontSize: '0.68rem', fontWeight: 600, padding: '3px 9px', borderRadius: '999px' }}>
                  <Lightbulb size={11} /> Lighting
                </span>
              )}
            </div>
            <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: '1.2rem', fontWeight: 800, color: G_DARK }}>{fmtMoney(court.rate)}</span>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>/ hour</span>
            </p>
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 style={{ fontFamily: FONT_DISPLAY }} className="text-lg font-bold text-gray-900 m-0 mb-2">Remove {court.name}?</h3>
            <p className="text-sm text-gray-500 mb-5">
              {hasBookings
                ? 'This court has booking history. Removing it will leave those bookings without a court. Consider unchecking "Bookable by customers" instead.'
                : 'This court will be permanently removed.'}
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-600 cursor-pointer">Keep Court</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-full border-none bg-red-600 text-white text-sm font-semibold cursor-pointer">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function FacilitiesView({ courts, bookings, refresh, showToast }: Props) {
  const [adding, setAdding] = useState(false)
  const hourOptions = Array.from({ length: CLOSE_HOUR - OPEN_HOUR + 1 }, (_, i) => OPEN_HOUR + i)
  const bookedCourtIds = new Set(bookings.map((b) => b.courtId))

  function blankCourt(): Court {
    return {
      id: uid('court').toLowerCase(),
      name: `Court ${courts.length + 1}`,
      type: 'Outdoor',
      surface: 'Acrylic Hard Court',
      rate: 300,
      emoji: '🎾',
      color: COURT_PALETTE[courts.length % COURT_PALETTE.length],
      feats: [],
      lighting: true,
      active: true,
    }
  }

  async function handleAdd(c: Court) {
    try {
      await api.admin.saveCourt(c)
      showToast(`${c.name} added`)
      setAdding(false)
      await refresh()
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionCard
        title="Courts"
        subtitle={`${courts.filter((c) => c.active).length} bookable of ${courts.length} total`}
        action={
          <button
            onClick={() => setAdding(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: G_DARK, color: 'white', border: 'none', borderRadius: '999px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
          >
            <Plus size={14} /> Add Court
          </button>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
          {courts.map((c) => (
            <CourtCard key={c.id} court={c} hasBookings={bookedCourtIds.has(c.id)} refresh={refresh} showToast={showToast} />
          ))}
        </div>
        {courts.length === 0 && <div className="text-center text-gray-400 text-sm py-10">No courts yet — add one to start taking bookings.</div>}
      </SectionCard>

      <HoursSection hourOptions={hourOptions} showToast={showToast} refresh={refresh} />

      {adding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setAdding(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 style={{ fontFamily: FONT_DISPLAY }} className="text-lg font-bold text-gray-900 m-0 mb-4">Add a court</h3>
            <CourtForm court={blankCourt()} onSave={handleAdd} onCancel={() => setAdding(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

function HoursSection({ hourOptions, showToast, refresh }: {
  hourOptions: number[]
  showToast: (m: string) => void
  refresh: () => void | Promise<void>
}) {
  const loaded = useAsync<HoursConfig>(() => api.admin.getHours(), [])
  const [draft, setDraft] = useState<HoursConfig | null>(null)
  const [newHoliday, setNewHoliday] = useState<Holiday>({ id: '', date: '', label: '', open: OPEN_HOUR, close: CLOSE_HOUR, closed: true })

  // The draft is what the controls edit; it starts as whatever the server has.
  const cfg = draft ?? loaded.data

  async function persist(next: HoursConfig) {
    // Shown immediately, then reconciled with what the server accepted — so a
    // rejected change snaps back rather than lingering as a false success.
    setDraft(next)
    try {
      const saved = await api.admin.saveHours(next)
      setDraft(saved)
      await refresh()
    } catch (err) {
      setDraft(loaded.data)
      showToast(errorMessage(err))
    }
  }

  if (loaded.loading && !cfg) return <LoadingBlock label="Loading hours…" />
  if (loaded.error && !cfg) return <ErrorBlock message={loaded.error} onRetry={loaded.reload} />
  if (!cfg) return null

  const setDay = (dow: number, patch: Partial<HoursConfig['weekly'][number]>) => {
    const weekly = cfg.weekly.map((d, i) => (i === dow ? { ...d, ...patch } : d))
    void persist({ ...cfg, weekly })
    showToast(`${DAY_NAMES[dow]} hours updated`)
  }

  const addHoliday = () => {
    if (!newHoliday.date) { showToast('Pick a date for the holiday'); return }
    const holiday: Holiday = { ...newHoliday, id: uid('hol'), label: newHoliday.label.trim() || 'Holiday' }
    void persist({ ...cfg, holidays: [...cfg.holidays, holiday] })
    setNewHoliday({ id: '', date: '', label: '', open: OPEN_HOUR, close: CLOSE_HOUR, closed: true })
    showToast('Special hours added')
  }

  const removeHoliday = (id: string) => {
    void persist({ ...cfg, holidays: cfg.holidays.filter((h) => h.id !== id) })
    showToast('Special hours removed')
  }

  return (
    <>
      <SectionCard title="Operating hours" subtitle="Applies to every court. Customers can only book inside these hours.">
        <div className="flex flex-col">
          {cfg.weekly.map((d, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0 flex-wrap">
              <span className="text-sm font-semibold text-gray-800" style={{ minWidth: '90px' }}>{DAY_NAMES[i]}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={d.closed} onChange={(e) => setDay(i, { closed: e.target.checked })} />
                  Closed
                </label>
                <select disabled={d.closed} value={d.open} onChange={(e) => setDay(i, { open: Number(e.target.value) })} className="text-sm border border-gray-200 rounded-lg px-2 py-1 disabled:opacity-40">
                  {hourOptions.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                </select>
                <span className="text-gray-400 text-xs">to</span>
                <select disabled={d.closed} value={d.close} onChange={(e) => setDay(i, { close: Number(e.target.value) })} className="text-sm border border-gray-200 rounded-lg px-2 py-1 disabled:opacity-40">
                  {hourOptions.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Holiday & special hours" subtitle="Overrides the weekly schedule on specific dates">
        <div className="flex flex-col mb-4">
          {cfg.holidays.sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-gray-800 m-0">{h.label}</p>
                <p className="text-xs text-gray-400 m-0">{h.date} · {h.closed ? 'Closed all day' : `${fmtHour(h.open)} – ${fmtHour(h.close)}`}</p>
              </div>
              <button onClick={() => removeHoliday(h.id)} title="Remove" className="w-7 h-7 rounded-lg border border-gray-200 bg-white cursor-pointer">✕</button>
            </div>
          ))}
          {cfg.holidays.length === 0 && <div className="text-center text-gray-400 text-sm py-6">No special hours set.</div>}
        </div>

        <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
            <input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Label</label>
            <input type="text" placeholder="e.g. Christmas Day" value={newHoliday.label} onChange={(e) => setNewHoliday({ ...newHoliday, label: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pb-2">
            <input type="checkbox" checked={newHoliday.closed} onChange={(e) => setNewHoliday({ ...newHoliday, closed: e.target.checked })} />
            Closed all day
          </label>
          {!newHoliday.closed && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Open</label>
                <select value={newHoliday.open} onChange={(e) => setNewHoliday({ ...newHoliday, open: Number(e.target.value) })} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
                  {hourOptions.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Close</label>
                <select value={newHoliday.close} onChange={(e) => setNewHoliday({ ...newHoliday, close: Number(e.target.value) })} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
                  {hourOptions.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                </select>
              </div>
            </>
          )}
          <button onClick={addHoliday} style={{ backgroundColor: G, color: 'white', border: 'none', borderRadius: '999px', padding: '0.5rem 1.1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}>
            Add
          </button>
        </div>
      </SectionCard>
    </>
  )
}
