import { useState } from 'react'
import { RefreshCw, CalendarCheck, Wallet, Clock3 } from 'lucide-react'
import * as api from '../../lib/api'
import type { MemberSummary, MonthlyReport } from '../../lib/types'
import { fmtMoney, fmtHour, todayStr } from '../../lib/format'
import { useAsync } from '../../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../../components/States'
import { G, LIME, FONT_BODY, FONT_DISPLAY } from '../../lib/theme'
import { useIsMobile } from '../../lib/useMediaQuery'
import { getPaymentMethod } from '../../lib/paymentMethods'
import { useAdminColors, useAdminTheme } from './adminTheme'
import { StatCard, SectionCard, MonthYearPicker } from './shared'
import { AreaChart, ColumnChart, HBarChart, VIZ } from './charts'

const EMPTY_REPORT: MonthlyReport = {
  bookingsCount: 0,
  revenue: 0,
  bookedHours: 0,
  dailyRevenue: [],
  revenueByPaymentMethod: [],
  occupancyByCourt: [],
  hourlyBookingCounts: new Array(24).fill(0),
}

type Tab = 'overview' | 'revenue' | 'occupancy' | 'peak' | 'leaderboard'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'occupancy', label: 'Court occupancy' },
  { key: 'peak', label: 'Peak hours' },
  { key: 'leaderboard', label: 'Leaderboard' },
]

const MEDALS = ['🥇', '🥈', '🥉']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ReportsView() {
  const colors = useAdminColors()
  const { dark } = useAdminTheme()
  const isMobile = useIsMobile()
  const today = new Date(todayStr() + 'T00:00:00')
  const [fromYear, setFromYear] = useState(today.getFullYear())
  const [fromMonth, setFromMonth] = useState(today.getMonth() + 1)
  const [toYear, setToYear] = useState(today.getFullYear())
  const [toMonth, setToMonth] = useState(today.getMonth() + 1)
  const [tab, setTab] = useState<Tab>('overview')
  const singleMonth = fromYear === toYear && fromMonth === toMonth

  // Aggregated server-side: the browser never sees the underlying bookings,
  // which is the difference between a revenue figure and a customer list.
  const state = useAsync<MonthlyReport>(
    () => api.admin.getReport(fromYear, fromMonth, { year: toYear, month: toMonth }),
    [fromYear, fromMonth, toYear, toMonth],
  )
  const report = state.data ?? EMPTY_REPORT

  // Only fetched once the tab is actually opened — this is the one report
  // that names customers rather than aggregating them away. All-time, not
  // scoped to the month picker above: a leaderboard that resets every month
  // would rank last month's top spender as a stranger.
  const membersState = useAsync<MemberSummary[]>(
    () => (tab === 'leaderboard' ? api.admin.listMembers() : Promise.resolve([])),
    [tab === 'leaderboard'],
  )
  function onFromChange(y: number, m: number) {
    setFromYear(y); setFromMonth(m)
    if (y > toYear || (y === toYear && m > toMonth)) { setToYear(y); setToMonth(m) }
  }
  function onToChange(y: number, m: number) {
    setToYear(y); setToMonth(m)
    if (y < fromYear || (y === fromYear && m < fromMonth)) { setFromYear(y); setFromMonth(m) }
  }

  const leaderboard = [...(membersState.data ?? [])].sort((a, b) =>
    b.bookingsCount - a.bookingsCount || b.totalSpent - a.totalSpent,
  )

  const dailyRevenueData = report.dailyRevenue.map((d) => ({
    label: new Date(d.date + 'T00:00:00').getDate().toString(),
    value: d.amount,
    bookingsCount: d.bookingsCount,
    fullDate: new Date(d.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
  }))
  const revenueTooltip = (d: { value: number; bookingsCount: number; fullDate: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <strong>{fmtMoney(d.value)}</strong>
      <span>{d.bookingsCount} booking{d.bookingsCount === 1 ? '' : 's'}</span>
      <span style={{ opacity: 0.7 }}>{d.fullDate}</span>
    </div>
  )
  const occupancyData = report.occupancyByCourt.map((c) => ({
    label: c.courtName,
    value: Math.round(c.pctOfOpenHours * 10) / 10,
  }))

  // Sorted biggest-first: with named categories the ranking is the story, and
  // an alphabetical or id order hides it.
  const paymentData = [...report.revenueByPaymentMethod]
    .sort((a, b) => b.amount - a.amount)
    .map((p) => ({ label: getPaymentMethod(p.method)?.label ?? p.method, value: p.amount }))

  // Trimmed to the hours the venue is actually open. Plotting midnight to 5am
  // as a run of empty columns is a third of the chart carrying no information.
  const firstOpen = report.hourlyBookingCounts.findIndex((c) => c > 0)
  const lastOpen = report.hourlyBookingCounts.reduce((last, c, i) => (c > 0 ? i : last), -1)
  const peakHoursData = (firstOpen === -1
    ? []
    : report.hourlyBookingCounts.slice(Math.max(firstOpen - 1, 0), Math.min(lastOpen + 2, 24)).map((count, i) => ({
        hour: Math.max(firstOpen - 1, 0) + i,
        count,
      }))
  ).map((h) => ({ label: fmtHour(h.hour).replace(':00', ''), value: h.count }))

  const periodLabel = singleMonth
    ? `${MONTH_SHORT[fromMonth - 1]} ${fromYear}`
    : `${MONTH_SHORT[fromMonth - 1]} ${fromYear} – ${MONTH_SHORT[toMonth - 1]} ${toYear}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div
          style={{
            display: 'flex', gap: '0.4rem', backgroundColor: colors.borderSoft, borderRadius: '12px', padding: '4px',
            overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch',
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                border: 'none', borderRadius: '9px', padding: '0.5rem 0.9rem', fontSize: '0.82rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap', flexShrink: 0,
                backgroundColor: tab === t.key ? (dark ? colors.hoverBg : colors.card) : 'transparent',
                color: tab === t.key ? (dark ? LIME : G) : colors.textFaint,
                boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <MonthYearPicker year={fromYear} month={fromMonth} onChange={onFromChange} />
          <span style={{ fontSize: '0.8rem', color: colors.textFaint, fontFamily: FONT_BODY }}>to</span>
          <MonthYearPicker year={toYear} month={toMonth} onChange={onToChange} />
          <button
            onClick={state.reload}
            disabled={state.loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: state.loading ? '#9CA3AF' : G, color: 'white', border: 'none', borderRadius: '999px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: state.loading ? 'default' : 'pointer', fontFamily: FONT_BODY }}
          >
            <RefreshCw size={14} /> {state.loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {state.error && <ErrorBlock message={state.error} onRetry={state.reload} />}
      {state.loading && !state.data && <LoadingBlock label="Building report…" />}

      {state.data && tab === 'overview' && (
        <>
          <div className="grid" style={{ gap: isMobile ? '0.6rem' : '1rem', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <StatCard label="Bookings" value={report.bookingsCount} sub="active this period" accent={VIZ.blue} icon={CalendarCheck} />
            <StatCard label="Court Revenue" value={fmtMoney(report.revenue)} sub="paid bookings" accent={VIZ.green} icon={Wallet} />
            <div style={isMobile ? { gridColumn: '1 / -1' } : undefined}>
              <StatCard label="Booked Hours" value={report.bookedHours.toFixed(1)} sub="across all courts" accent={VIZ.amber} icon={Clock3} />
            </div>
          </div>
          <SectionCard title="Daily revenue" subtitle={`Paid court revenue by day · ${periodLabel}`}>
            <AreaChart
              data={dailyRevenueData}
              color={VIZ.green}
              valueFormatter={fmtMoney}
              labelEvery={3}
              renderTooltip={revenueTooltip}
              categoryHeading="Day of month"
              valueHeading="Revenue"
              emptyMessage="No paid bookings this period."
            />
          </SectionCard>
        </>
      )}

      {state.data && tab === 'revenue' && (
        <>
          <SectionCard title="Daily revenue" subtitle={`Paid court revenue by day · ${periodLabel}`}>
            <AreaChart
              data={dailyRevenueData}
              color={VIZ.green}
              height={270}
              valueFormatter={fmtMoney}
              labelEvery={3}
              renderTooltip={revenueTooltip}
              categoryHeading="Day of month"
              valueHeading="Revenue"
              emptyMessage="No paid bookings this period."
            />
          </SectionCard>
          <SectionCard title="Revenue by payment method" subtitle={`Paid bookings · ${periodLabel}`}>
            <HBarChart
              data={paymentData}
              color={VIZ.blue}
              valueFormatter={fmtMoney}
              categoryHeading="Method"
              valueHeading="Revenue"
              emptyMessage="No paid revenue this period."
            />
          </SectionCard>
        </>
      )}

      {state.data && tab === 'occupancy' && (
        <SectionCard title="Court occupancy" subtitle={`Percent of open hours booked · ${periodLabel}`}>
          {/* Fixed 0–100 scale: occupancy is a share, so a court at 12% must
              look like a court at 12% rather than filling the bar because it
              happens to be the busiest one this month. */}
          <HBarChart
            data={occupancyData}
            color={VIZ.pink}
            max={100}
            valueFormatter={(v) => `${v}%`}
            categoryHeading="Court"
            valueHeading="Occupancy"
            emptyMessage="No court activity this period."
          />
        </SectionCard>
      )}

      {state.data && tab === 'peak' && (
        <SectionCard title="Peak hours" subtitle={`Bookings by hour of day · ${periodLabel}`}>
          <ColumnChart
            data={peakHoursData}
            color={VIZ.amber}
            height={240}
            valueFormatter={(v) => `${v} booking${v === 1 ? '' : 's'}`}
            categoryHeading="Hour"
            valueHeading="Bookings"
            emptyMessage="No bookings this period."
          />
        </SectionCard>
      )}

      {tab === 'leaderboard' && (
        <SectionCard title="Leaderboard" subtitle="Most active accounts, all time — ranked by bookings, then by spend">
          {membersState.loading && !membersState.data && <LoadingBlock label="Loading leaderboard…" />}
          {membersState.error && <ErrorBlock message={membersState.error} onRetry={membersState.reload} />}
          {membersState.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="py-2 pr-3">Rank</th>
                    <th className="py-2 pr-3">Member</th>
                    <th className="py-2 pr-3">Bookings</th>
                    <th className="py-2 pr-3">Total Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((m, i) => (
                    <tr key={m.email} className="border-b border-gray-50">
                      <td className="py-3 pr-3 font-bold text-gray-900" style={{ fontFamily: FONT_DISPLAY }}>
                        {MEDALS[i] ?? `#${i + 1}`}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="font-semibold text-gray-900">{m.name || 'Unnamed'}</span><br />
                        <span className="text-gray-400 text-xs">{m.email}</span>
                      </td>
                      <td className="py-3 pr-3">{m.bookingsCount}</td>
                      <td className="py-3 pr-3 font-semibold" style={{ color: G }}>{fmtMoney(m.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leaderboard.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-10">No paid bookings yet.</div>
              )}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
