import { useEffect, useRef, useState } from 'react'
import logoImg from '@/imports/opt/logo.webp'
import courtNoneImg from '@/imports/opt/Court123.webp'
import courtAllImg from '@/imports/opt/Court_1_2_3.webp'
import court1Img from '@/imports/opt/Court1.webp'
import court2Img from '@/imports/opt/Court2.webp'
import court3Img from '@/imports/opt/Court3.webp'
import court12Img from '@/imports/opt/Court1_2.webp'
import court13Img from '@/imports/opt/Court1_3.webp'
import court23Img from '@/imports/opt/Court2_3.webp'
import BookingModal from '../components/BookingModal'
import type { User } from '../App'
import * as api from '../lib/api'
import type { AvailabilityResponse } from '../lib/api'
import type { Booking, Court, HoursConfig } from '../lib/types'
import { OPEN_HOUR, CLOSE_HOUR } from '../lib/types'
import { fmtDateLong, fmtHour, fmtMoney, todayStr, toLocalDateStr } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery'
import { ErrorBlock, LoadingBlock } from '../components/States'
import { BLUE, AVAILABLE_GREEN, FONT_BODY, FONT_DISPLAY, G_DARK, PINK } from '../lib/theme'

export type SelectedSlot = {
  date: string
  startHour: number
  courtId: string
  price: number
}

const TABS = ['Book', 'Bookings', 'Coaches', 'Open Plays', 'Feed'] as const
type Tab = (typeof TABS)[number]

const COURT_PHOTOS: Record<string, string> = {
  '1': court1Img,
  '2': court2Img,
  '3': court3Img,
  '1,2': court12Img,
  '1,3': court13Img,
  '2,3': court23Img,
}

function photoForCourts(courtIds: string[]) {
  const nums = [...new Set(courtIds.map((id) => id.replace('court-', '')))].sort()
  if (nums.length === 0) return courtNoneImg
  if (nums.length >= 3) return courtAllImg
  return COURT_PHOTOS[nums.join(',')] ?? courtNoneImg
}

function dateStr(d: Date) {
  return toLocalDateStr(d)
}

function formatDateLabel(d: Date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// Only shows hours the venue is actually open on that date (admin-configurable
// weekly schedule + holiday overrides).
function timeGroups(openHour: number, closeHour: number) {
  const groups = [
    { label: 'Morning', hours: [] as number[] },
    { label: 'Afternoon', hours: [] as number[] },
    { label: 'Evening', hours: [] as number[] },
  ]
  for (let h = Math.max(openHour, OPEN_HOUR); h < Math.min(closeHour, CLOSE_HOUR); h++) {
    if (h < 12) groups[0]!.hours.push(h)
    else if (h < 17) groups[1]!.hours.push(h)
    else groups[2]!.hours.push(h)
  }
  return groups.filter((g) => g.hours.length > 0)
}

function isPastSlot(dateStr: string, hour: number) {
  const now = new Date()
  const slotDate = new Date(dateStr + 'T00:00:00')
  if (slotDate.toDateString() !== now.toDateString()) return slotDate < now
  return hour <= now.getHours()
}

interface Props {
  /** Null for a visitor who hasn't signed in or continued as a guest yet —
   * browsing and picking slots never required an account. BookingModal is
   * what asks for one, right before payment. */
  user: User | null
  initialCourtId?: string | null
  /** Lands on the Bookings tab instead of Book — used when arriving here
   * fresh off a payment confirmation. */
  initialTab?: Tab
  onBack: () => void
  onSignIn: () => void
  onSignOut: () => void
}

export default function BookingPage({ user, initialCourtId, initialTab, onBack, onSignIn, onSignOut }: Props) {
  const [curDate, setCurDate] = useState(new Date())
  const [selected, setSelected] = useState<SelectedSlot[]>([])
  const [showModal, setShowModal] = useState(false)
  // Set when "Book Now" is pressed signed out — pricing a basket needs a
  // session (real or guest), so the sign-in modal opens instead of the
  // booking modal, and this remembers to open the booking modal once one
  // exists rather than making them press "Book Now" a second time.
  const [pendingBookingOpen, setPendingBookingOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'Book')
  const gridWrapRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const isNarrow = useIsNarrow()

  useEffect(() => {
    if (user && pendingBookingOpen) {
      setPendingBookingOpen(false)
      setShowModal(true)
    }
  }, [user, pendingBookingOpen])

  const ds = dateStr(curDate)
  const isToday = ds === todayStr()

  const venue = useAsync<{ courts: Court[]; hours: HoursConfig }>(async (signal) => {
    const [courts, config] = await Promise.all([api.getCourts(signal), api.getConfig(signal)])
    return { courts, hours: config.hours }
  }, [])

  const COURTS = venue.data?.courts ?? []

  // Re-fetched whenever the date changes, so the grid always reflects what the
  // server currently believes rather than a snapshot from page load.
  const availability = useAsync<Record<string, AvailabilityResponse>>(
    (signal) => api.getAvailabilityAll(ds, signal),
    [ds],
  )

  // The availability endpoint deliberately returns no personal data — a slot
  // someone else holds is just 'booked'. To label the customer's OWN slots we
  // ask for their bookings separately, which is the only list they may read.
  // Skipped entirely while browsing signed out, rather than firing a request
  // that can only 401.
  const myBookings = useAsync<Booking[]>(
    (signal) => (user ? api.getMyBookings(signal) : Promise.resolve([])),
    [Boolean(user)],
  )

  const dayHours = availability.data
    ? (Object.values(availability.data)[0]?.hours ?? { open: OPEN_HOUR, close: CLOSE_HOUR, closed: false })
    : { open: OPEN_HOUR, close: CLOSE_HOUR, closed: false }
  const holiday = venue.data?.hours.holidays.find((h) => h.date === ds)
  const gridReady = Boolean(venue.data && availability.data)
  const groups = dayHours.closed || !gridReady ? [] : timeGroups(dayHours.open, dayHours.close)

  useEffect(() => {
    if (!initialCourtId || !gridWrapRef.current || !gridReady) return
    const colIndex = COURTS.findIndex((c) => c.id === initialCourtId)
    if (colIndex <= 0) return
    const th = gridWrapRef.current.querySelectorAll('thead th')[colIndex + 1] as HTMLElement | undefined
    if (th) gridWrapRef.current.scrollLeft = th.offsetLeft - 100
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCourtId, gridReady])

  function prevDay() {
    if (isToday) return
    const d = new Date(curDate)
    d.setDate(d.getDate() - 1)
    setCurDate(d)
  }
  function nextDay() {
    const d = new Date(curDate)
    d.setDate(d.getDate() + 1)
    setCurDate(d)
  }
  function goToDate(value: string) {
    if (!value) return
    setCurDate(new Date(value + 'T00:00:00'))
  }

  function slotStatus(hour: number, courtId: string) {
    if (isPastSlot(ds, hour)) return 'past' as const
    return availability.data?.[courtId]?.slots[hour]
  }
  function slotPriceFor(hour: number, courtId: string) {
    return availability.data?.[courtId]?.prices[hour] ?? 0
  }
  /** True when this hour is priced above the court's standard rate. Derived from
      the server's own numbers rather than re-implementing the peak rules here. */
  function isPeakHour(hour: number, court: Court) {
    return slotPriceFor(hour, court.id) > court.rate
  }
  function isOwnBooking(hour: number, courtId: string) {
    return (myBookings.data ?? []).some(
      (b) =>
        b.courtId === courtId &&
        b.date === ds &&
        b.status !== 'cancelled' &&
        hour >= b.startHour &&
        hour < b.startHour + b.duration,
    )
  }
  function isSelected(hour: number, courtId: string) {
    return selected.some((s) => s.date === ds && s.startHour === hour && s.courtId === courtId)
  }
  function toggleSlot(hour: number, courtId: string, price: number) {
    const match = (s: SelectedSlot) => s.date === ds && s.startHour === hour && s.courtId === courtId
    if (selected.some(match)) {
      setSelected((p) => p.filter((s) => !match(s)))
    } else {
      setSelected((p) => [...p, { date: ds, startHour: hour, courtId, price }])
    }
  }

  const total = selected.reduce((s, sl) => s + sl.price, 0)
  const hasSelection = selected.length > 0
  const selectedCourtIds = [...new Set(selected.map((s) => s.courtId))]
  const courtCount = selectedCourtIds.length
  const heroPhoto = photoForCourts(selectedCourtIds)

  function courtName(id: string) {
    return COURTS.find((c) => c.id === id)?.name ?? id
  }

  const amenities = ['Free Parking', 'Restrooms', 'Equipment Rental', 'Seating Area', 'Night Lighting', 'Café']

  return (
    <div style={{ fontFamily: FONT_BODY, backgroundColor: '#F3F4F6', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ backgroundColor: 'white', borderBottom: '1px solid #F0F1F3', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto', padding: isMobile ? '0 1rem' : '0 1.5rem', height: isMobile ? '56px' : '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <img src={logoImg} alt="PickleBella" style={{ height: '30px', width: '30px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <span style={{ fontFamily: FONT_DISPLAY, color: '#111827', fontWeight: 700, fontSize: isMobile ? '0.98rem' : '1.05rem' }}>PickleBella</span>
          </button>
          {/* The two placeholder links and the greeting are inert text. On a
              phone they are the difference between a nav bar that fits and one
              that wraps onto a second line, so they are the first to go. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isNarrow ? '0.6rem' : '1.75rem', flexShrink: 0 }}>
            <button onClick={onBack} style={{ color: '#374151', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontFamily: FONT_BODY }}>Home</button>
            {!isNarrow && (
              <>
                <span style={{ color: '#9CA3AF', fontSize: '0.85rem', cursor: 'default' }}>Community</span>
                <span style={{ color: '#9CA3AF', fontSize: '0.85rem', cursor: 'default' }}>Tournaments</span>
                <span style={{ width: '1px', height: '18px', backgroundColor: '#E5E7EB' }} />
                {user?.name && (
                  <span style={{ color: '#9CA3AF', fontSize: '0.82rem' }}>Hi, {user.name.split(' ')[0]}</span>
                )}
              </>
            )}
            {user ? (
              <button
                onClick={onSignOut}
                style={{ color: '#6B7280', background: 'none', border: '1px solid #E5E7EB', borderRadius: '999px', padding: '0.35rem 0.875rem', fontSize: '0.75rem', cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={onSignIn}
                style={{ color: 'white', background: G_DARK, border: `1px solid ${G_DARK}`, borderRadius: '999px', padding: '0.35rem 0.875rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* PAGE BODY */}
      <div style={{ maxWidth: '1120px', margin: '0 auto', padding: isMobile ? '1rem 0.85rem 7.5rem' : '1.5rem 1.5rem 6rem', display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0,1fr)' : 'minmax(0,1fr) 320px', gap: isMobile ? '0.85rem' : '1.5rem', alignItems: 'start' }}>

        {/* LEFT: BOOKING GRID */}
        <div style={{ backgroundColor: 'white', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

          <div style={{ height: isMobile ? '120px' : '160px', overflow: 'hidden' }}>
            <img
              src={heroPhoto}
              alt="PickleBella courts"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: isMobile ? '1.1rem' : '1.5rem', padding: isMobile ? '0 0.9rem' : '0 1.25rem', borderBottom: '1px solid #F3F4F6', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY,
                  padding: '0.75rem 0', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  color: activeTab === tab ? BLUE : '#9CA3AF',
                  borderBottom: `2px solid ${activeTab === tab ? BLUE : 'transparent'}`,
                  marginBottom: '-1px', transition: 'color 0.15s',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Bookings' ? (
            <div style={{ padding: isMobile ? '1.1rem' : '1.5rem' }}>
              {!user ? (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '2rem', margin: '0 0 0.75rem' }}>🔒</p>
                  <h3 style={{ fontFamily: FONT_DISPLAY, color: '#111827', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Sign in to see your bookings</h3>
                  <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>Your reservations show up here once you're signed in.</p>
                  <button
                    onClick={onSignIn}
                    style={{ backgroundColor: G_DARK, color: 'white', border: 'none', borderRadius: '999px', padding: '0.75rem 1.75rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
                  >
                    Sign In
                  </button>
                </div>
              ) : myBookings.loading ? (
                <LoadingBlock label="Loading your bookings…" />
              ) : myBookings.error ? (
                <ErrorBlock message={myBookings.error} onRetry={myBookings.reload} />
              ) : (myBookings.data ?? []).length === 0 ? (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '2rem', margin: '0 0 0.75rem' }}>📭</p>
                  <h3 style={{ fontFamily: FONT_DISPLAY, color: '#111827', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>No bookings yet</h3>
                  <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: 0 }}>Reserve a court from the Book tab and it'll show up here.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(myBookings.data ?? []).map((b) => {
                    const statusStyle = b.status === 'paid'
                      ? { bg: '#DCFCE7', fg: '#15803D', label: 'Paid' }
                      : b.status === 'pending'
                        ? { bg: '#FEF3C7', fg: '#92400E', label: 'Pending' }
                        : { bg: '#F3F4F6', fg: '#6B7280', label: 'Cancelled' }
                    return (
                      <div key={b.id} style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: isMobile ? '0.9rem' : '1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#111827' }}>{courtName(b.courtId)}</span>
                            <span style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase' }}>{statusStyle.label}</span>
                          </div>
                          <p style={{ color: '#6B7280', fontSize: '0.82rem', margin: 0 }}>
                            {fmtDateLong(b.date)} · {fmtHour(b.startHour)} – {fmtHour(b.startHour + b.duration)}
                          </p>
                        </div>
                        <span style={{ fontFamily: FONT_DISPLAY, fontSize: '1rem', fontWeight: 700, color: '#111827', flexShrink: 0 }}>{fmtMoney(b.amount)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : activeTab !== 'Book' ? (
            <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', margin: '0 0 0.75rem' }}>🚧</p>
              <h3 style={{ fontFamily: FONT_DISPLAY, color: '#111827', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{activeTab} is coming soon</h3>
              <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: 0 }}>We're working on this. Check back later!</p>
            </div>
          ) : (
            <>
              {/* Date navigation */}
              <div style={{ padding: isMobile ? '0.7rem 0.9rem' : '0.75rem 1.25rem', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer' }} title="Pick a date">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <input
                    type="date"
                    value={ds}
                    min={todayStr()}
                    onChange={(e) => goToDate(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', border: 'none', padding: 0 }}
                  />
                </div>
                <span style={{ fontSize: isMobile ? '0.82rem' : '0.9rem', fontWeight: 700, color: '#111827' }}>
                  {isMobile ? formatDateLabel(curDate).replace(/, \d{4}$/, '') : formatDateLabel(curDate)}
                </span>
                {gridReady && availability.loading && (
                  <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>refreshing…</span>
                )}
                {isToday && (
                  <span style={{ backgroundColor: '#DBEAFE', color: BLUE, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>Today</span>
                )}
                {holiday && (
                  <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>{holiday.label}</span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                  {[{ fn: prevDay, icon: '‹', disabled: isToday }, { fn: nextDay, icon: '›', disabled: false }].map((btn, i) => (
                    <button
                      key={i}
                      onClick={btn.fn}
                      disabled={btn.disabled}
                      style={{ width: '28px', height: '28px', borderRadius: '7px', border: '1px solid #E5E7EB', background: btn.disabled ? '#F9FAFB' : 'white', color: btn.disabled ? '#D1D5DB' : '#374151', cursor: btn.disabled ? 'default' : 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500 }}
                    >
                      {btn.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid table */}
              {venue.error ? (
                <div style={{ padding: '1.25rem' }}>
                  <ErrorBlock message={venue.error} onRetry={venue.reload} />
                </div>
              ) : availability.error ? (
                <div style={{ padding: '1.25rem' }}>
                  <ErrorBlock message={availability.error} onRetry={availability.reload} />
                </div>
              ) : !gridReady ? (
                <LoadingBlock label="Loading availability…" pad="4rem" />
              ) : dayHours.closed ? (
                <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '2rem', margin: '0 0 0.75rem' }}>🚪</p>
                  <h3 style={{ fontFamily: FONT_DISPLAY, color: '#111827', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
                    We're closed {holiday ? `for ${holiday.label}` : 'on this day'}
                  </h3>
                  <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: 0 }}>Pick another date to see available courts.</p>
                </div>
              ) : (
              <div ref={gridWrapRef} style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? `${80 + COURTS.length * 86}px` : '480px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F9FAFB' }}>
                      <th style={{ padding: isMobile ? '0.65rem 0.75rem' : '0.75rem 1.25rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid #F3F4F6', width: isMobile ? '80px' : '155px' }}>TIME</th>
                      {COURTS.map((c) => (
                        <th key={c.id} style={{ padding: isMobile ? '0.65rem 0.35rem' : '0.75rem', textAlign: 'center', fontSize: isMobile ? '0.66rem' : '0.72rem', fontWeight: 700, color: c.id === initialCourtId ? BLUE : '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: c.id === initialCourtId ? `2px solid ${BLUE}` : '1px solid #F3F4F6' }}>
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.flatMap((group) => [
                      <tr key={`g-${group.label}`}>
                        <td colSpan={COURTS.length + 1} style={{ padding: isMobile ? '0.45rem 0.75rem' : '0.5rem 1.25rem', backgroundColor: '#FAFAFA', fontSize: '0.68rem', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', borderTop: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6' }}>
                          {group.label}
                        </td>
                      </tr>,
                      ...group.hours.map((hour) => (
                        <tr key={`s-${hour}`} style={{ borderTop: '1px solid #F9FAFB' }}>
                          <td style={{ padding: isMobile ? '0.7rem 0.75rem' : '0.875rem 1.25rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <p style={{ fontSize: isMobile ? '0.72rem' : '0.8rem', fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.35 }}>
                              {isMobile ? (
                                <>
                                  {fmtHour(hour)}
                                  <span style={{ display: 'block', color: '#9CA3AF', fontWeight: 500 }}>{fmtHour(hour + 1)}</span>
                                </>
                              ) : (
                                <>{fmtHour(hour)} – {fmtHour(hour + 1)}</>
                              )}
                            </p>
                          </td>
                          {COURTS.map((court) => {
                            const status = slotStatus(hour, court.id)
                            const sel = isSelected(hour, court.id)
                            const own = status === 'booked' && isOwnBooking(hour, court.id)
                            const clickable = status === 'available'
                            const slotPrice = slotPriceFor(hour, court.id)
                            const peak = isPeakHour(hour, court)

                            let badgeStyle: React.CSSProperties = { backgroundColor: 'white', border: '1.5px solid #E5E7EB' }
                            let content: React.ReactNode = null

                            if (sel) {
                              badgeStyle = { backgroundColor: G_DARK, border: `1.5px solid ${G_DARK}` }
                              content = (
                                <span style={{ color: 'white', fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>
                                  <span style={{ display: 'block', fontSize: '0.8rem' }}>✓</span>
                                  <span style={{ display: 'block', fontSize: '0.75rem' }}>Selected</span>
                                </span>
                              )
                            } else if (status === 'past') {
                              badgeStyle = { backgroundColor: '#FAFAFA', border: '1.5px solid #F3F4F6' }
                              content = <span style={{ color: '#D1D5DB', fontSize: '0.78rem' }}>—</span>
                            } else if (status === 'blocked') {
                              badgeStyle = { backgroundColor: '#E4E7EC', border: '1.5px solid #E4E7EC' }
                              content = <span style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: 600 }}>Blocked</span>
                            } else if (status === 'booked' && own) {
                              badgeStyle = { backgroundColor: '#E0ECFF', border: `1.5px solid #BFDBFE` }
                              content = <span style={{ color: BLUE, fontSize: '0.72rem', fontWeight: 700 }}>Your Booking</span>
                            } else if (status === 'booked') {
                              badgeStyle = { backgroundColor: '#E4E7EC', border: '1.5px solid #E4E7EC' }
                              content = <span style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: 600 }}>Booked</span>
                            } else if (status === 'closed') {
                              badgeStyle = { backgroundColor: '#FAFAFA', border: '1.5px solid #F3F4F6' }
                              content = <span style={{ color: '#D1D5DB', fontSize: '0.72rem', fontWeight: 600 }}>Closed</span>
                            } else {
                              content = (
                                <span style={{ textAlign: 'center', lineHeight: 1.3 }}>
                                  <span style={{ display: 'block', color: AVAILABLE_GREEN, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em' }}>AVAILABLE</span>
                                  <span style={{ display: 'block', color: '#9CA3AF', fontSize: '0.65rem' }}>
                                    {fmtMoney(slotPrice)}
                                    {peak && <span style={{ color: PINK, fontWeight: 700 }}> · PEAK</span>}
                                  </span>
                                </span>
                              )
                            }

                            return (
                              <td key={court.id} style={{ padding: isMobile ? '5px 4px' : '6px 8px', textAlign: 'center', verticalAlign: 'middle', backgroundColor: 'white' }}>
                                <button
                                  type="button"
                                  disabled={!clickable && !sel}
                                  onClick={() => (clickable || sel) && toggleSlot(hour, court.id, slotPrice)}
                                  style={{
                                    ...badgeStyle,
                                    width: '100%', minHeight: isMobile ? '52px' : '48px', borderRadius: '10px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: clickable || sel ? 'pointer' : 'default',
                                    fontFamily: FONT_BODY, transition: 'background-color 0.15s ease, border-color 0.15s ease',
                                    boxSizing: 'border-box', padding: 0,
                                  }}
                                  onMouseEnter={(e) => { if (clickable) e.currentTarget.style.backgroundColor = '#F0FDF4' }}
                                  onMouseLeave={(e) => { if (clickable) e.currentTarget.style.backgroundColor = badgeStyle.backgroundColor as string }}
                                >
                                  {content}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              </div>
              )}

              {/* Legend */}
              <div style={{ padding: isMobile ? '0.8rem 0.9rem' : '0.875rem 1.25rem', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: isMobile ? '0.75rem' : '1.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Legend</span>
                {[
                  { label: 'Available', style: { border: '1.5px solid #D1D5DB', backgroundColor: 'white' } },
                  { label: 'Selected', style: { backgroundColor: G_DARK } },
                  { label: 'Your Booking', style: { border: `1.5px solid ${BLUE}`, backgroundColor: '#E0ECFF' } },
                  { label: 'Booked', style: { backgroundColor: '#E4E7EC' } },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', boxSizing: 'border-box', ...item.style }} />
                    <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: INFO PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.85rem' : '1rem' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: isMobile ? '1rem' : '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 0.625rem' }}>About PickleBella Park</h3>
            <p style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.65, margin: 0 }}>
              PickleBella Park is the community's premier pickleball destination — 3 professional courts with tournament-grade surfaces, night lighting, and a vibrant atmosphere for all skill levels.
            </p>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: isMobile ? '1rem' : '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: '0 0 0.75rem' }}>Amenities</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {amenities.map((a) => (
                <span key={a} style={{ backgroundColor: '#F3F4F6', color: '#374151', fontSize: '0.72rem', fontWeight: 500, padding: '4px 10px', borderRadius: '999px' }}>{a}</span>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: isMobile ? '1rem' : '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: '0 0 0.75rem' }}>Operating Hours</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>{holiday ? holiday.label : formatDateLabel(curDate).split(',')[0]}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: dayHours.closed ? '#DC2626' : AVAILABLE_GREEN }}>
                {dayHours.closed ? 'Closed' : `${fmtHour(dayHours.open)} – ${fmtHour(dayHours.close)}`}
              </span>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: isMobile ? '1rem' : '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: '0 0 0.75rem' }}>Contact Information</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.37a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9c1.3 2.37 3.22 4.3 5.59 5.59l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                <span style={{ fontSize: '0.8rem', color: '#374151' }}>(0917) 123-4567</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                <a href="mailto:hello@picklebella.ph" style={{ fontSize: '0.8rem', color: BLUE, textDecoration: 'none' }}>hello@picklebella.ph</a>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <span style={{ fontSize: '0.8rem', color: '#374151' }}>123 Rally Street, Quezon City</span>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: 0 }}>Location</h3>
              <a href="#" style={{ fontSize: '0.75rem', color: BLUE, textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                Get Directions
              </a>
            </div>
            <div style={{ height: '130px', background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 50%, #93C5FD 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#1E3A8A', fontWeight: 600, margin: 0 }}>PickleBella Park</p>
                <p style={{ fontSize: '0.65rem', color: '#6B7280', margin: '2px 0 0' }}>123 Rally Street</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'white',
          borderTop: '1px solid #E5E7EB', zIndex: 40, boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div style={{ maxWidth: '1120px', margin: '0 auto', padding: isMobile ? '0.7rem 0.85rem' : '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: isMobile ? '0.68rem' : '0.72rem', color: '#9CA3AF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.length === 0 ? 'No slots selected' : `${courtCount} court${courtCount !== 1 ? 's' : ''} · ${selected.length} slot${selected.length !== 1 ? 's' : ''}`}
            </p>
            <p style={{ margin: '2px 0 0', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: isMobile ? '1.15rem' : '1.3rem', fontWeight: 800, color: '#111827' }}>{fmtMoney(total)}</span>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>/ total</span>
            </p>
          </div>
          <button
            onClick={() => {
              if (!hasSelection) return
              // Pricing the basket needs a session — real or guest. Browsing
              // and picking slots never did, so this is the first point a
              // signed-out visitor is asked for one; see the effect above
              // for what happens once they have it.
              if (!user) { setPendingBookingOpen(true); onSignIn(); return }
              setShowModal(true)
            }}
            disabled={!hasSelection}
            style={{
              backgroundColor: hasSelection ? '#111827' : '#E5E7EB',
              color: hasSelection ? 'white' : '#9CA3AF',
              border: 'none', borderRadius: '999px',
              padding: isMobile ? '0.8rem 1.5rem' : '0.875rem 2rem',
              fontSize: isMobile ? '0.85rem' : '0.9rem', fontWeight: 700,
              cursor: hasSelection ? 'pointer' : 'default',
              fontFamily: FONT_BODY, transition: 'all 0.15s', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            Book Now
          </button>
        </div>
      </div>

      {showModal && user && (
        <BookingModal
          user={user}
          slots={selected}
          courts={COURTS}
          onClose={() => {
            setShowModal(false)
            // Opening the modal quotes the basket, and quoting can reveal that
            // a slot went while the grid sat idle. Re-read on the way out so
            // what's on screen matches what the server will actually sell.
            availability.reload()
          }}
        />
      )}
    </div>
  )
}
