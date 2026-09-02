import { CalendarCheck, CalendarClock, Wallet } from 'lucide-react'
import type { Booking, Block, Court } from '../../lib/types'
import { fmtDate, fmtHour, fmtMoney, todayStr, toLocalDateStr } from '../../lib/format'
import { useIsMobile } from '../../lib/useMediaQuery'
import { StatCard, StatusBadge, SectionCard } from './shared'
import { AreaChart, VIZ } from './charts'

interface Props {
  bookings: Booking[]
  blocks: Block[]
  courts: Court[]
}

function last14DaysRevenue(bookings: Booking[]) {
  const days: { label: string; value: number; bookingsCount: number; fullDate: string }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = toLocalDateStr(d)
    const dayBookings = bookings.filter((b) => b.date === ds && b.status === 'paid')
    const amount = dayBookings.reduce((sum, b) => sum + Number(b.amount), 0)
    days.push({
      label: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      value: amount,
      bookingsCount: dayBookings.length,
      fullDate: d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
    })
  }
  return days
}

export default function DashboardView({ bookings, blocks, courts }: Props) {
  const isMobile = useIsMobile()
  const courtFor = (id: string) => courts.find((c) => c.id === id)
  const today = todayStr()
  const todays = bookings.filter((b) => b.date === today && b.status === 'paid')
  const upcoming = bookings.filter((b) => b.date >= today && b.status === 'paid')
  const revenue = bookings.filter((b) => b.status === 'paid').reduce((sum, b) => sum + Number(b.amount), 0)

  const recent = [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
  const trend = last14DaysRevenue(bookings)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div
        className="grid"
        style={{
          gap: isMobile ? '0.6rem' : '1rem',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))',
        }}
      >
        <StatCard label="Today's Bookings" value={todays.length} sub={`for ${fmtDate(today)}`} accent={VIZ.blue} icon={CalendarCheck} />
        <StatCard label="Upcoming Bookings" value={upcoming.length} sub="paid & active" accent={VIZ.pink} icon={CalendarClock} />
        <div style={isMobile ? { gridColumn: '1 / -1' } : undefined}>
          <StatCard label="Total Revenue" value={fmtMoney(revenue)} sub="all paid bookings" accent={VIZ.green} icon={Wallet} />
        </div>
      </div>

      <SectionCard title="Revenue — last 14 days" subtitle="Paid court revenue by day">
        <AreaChart
          data={trend}
          color={VIZ.green}
          height={210}
          valueFormatter={fmtMoney}
          categoryHeading="Day"
          valueHeading="Revenue"
          emptyMessage="No paid bookings in the last 14 days."
          renderTooltip={(d) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <strong style={{ fontSize: '0.82rem' }}>{fmtMoney(d.value)}</strong>
              <span style={{ opacity: 0.85 }}>{d.bookingsCount} booking{d.bookingsCount === 1 ? '' : 's'}</span>
              <span style={{ opacity: 0.6 }}>{d.fullDate}</span>
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Recent Bookings" subtitle={`${blocks.length} maintenance block${blocks.length === 1 ? '' : 's'} active`}>
        <div className="flex flex-col">
          {recent.map((b) => {
            const court = courtFor(b.courtId)
            return (
              <div key={b.id} className="flex items-center justify-between gap-3 py-3 border-b border-gray-50 last:border-0 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">
                    {court?.emoji ?? '🥒'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 m-0 truncate">{b.name} · {court ? court.name : b.courtId}</p>
                    <p className="text-xs text-gray-400 m-0">{fmtDate(b.date)} · {fmtHour(b.startHour)}–{fmtHour(b.startHour + b.duration)} · {fmtMoney(b.amount)}</p>
                  </div>
                </div>
                <StatusBadge status={b.status} />
              </div>
            )
          })}
          {recent.length === 0 && <div className="text-center text-gray-400 text-sm py-10">No bookings yet.</div>}
        </div>
      </SectionCard>
    </div>
  )
}
