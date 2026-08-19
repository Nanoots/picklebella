import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import * as api from '../../lib/api'
import type { MonthlyReport } from '../../lib/types'
import { fmtMoney, fmtHour, todayStr } from '../../lib/format'
import { useAsync } from '../../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../../components/States'
import { G, FONT_BODY } from '../../lib/theme'
import { getPaymentMethod } from '../../lib/paymentMethods'
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

type Tab = 'overview' | 'revenue' | 'occupancy' | 'peak'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'occupancy', label: 'Court occupancy' },
  { key: 'peak', label: 'Peak hours' },
]

export default function ReportsView() {
  const today = new Date(todayStr() + 'T00:00:00')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [tab, setTab] = useState<Tab>('overview')

  // Aggregated server-side: the browser never sees the underlying bookings,
  // which is the difference between a revenue figure and a customer list.
  const state = useAsync<MonthlyReport>(() => api.admin.getReport(year, month), [year, month])
  const report = state.data ?? EMPTY_REPORT

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.4rem', backgroundColor: '#F3F4F6', borderRadius: '12px', padding: '4px' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                border: 'none', borderRadius: '9px', padding: '0.5rem 0.9rem', fontSize: '0.82rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT_BODY,
                backgroundColor: tab === t.key ? 'white' : 'transparent',
                color: tab === t.key ? G : '#6B7280',
                boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <MonthYearPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
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
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <StatCard label="Bookings" value={report.bookingsCount} sub="active this period" />
            <StatCard label="Court Revenue" value={fmtMoney(report.revenue)} sub="paid bookings" accent={G} />
            <StatCard label="Booked Hours" value={report.bookedHours.toFixed(1)} sub="across all courts" />
          </div>
          <SectionCard title="Daily revenue" subtitle="Paid court revenue by day this month">
            <AreaChart
              data={dailyRevenueData}
              color={VIZ.green}
              valueFormatter={fmtMoney}
              labelEvery={3}
              renderTooltip={revenueTooltip}
              categoryHeading="Day of month"
              valueHeading="Revenue"
              emptyMessage="No paid bookings this month."
            />
          </SectionCard>
        </>
      )}

      {state.data && tab === 'revenue' && (
        <>
          <SectionCard title="Daily revenue" subtitle="Paid court revenue by day this month">
            <AreaChart
              data={dailyRevenueData}
              color={VIZ.green}
              height={270}
              valueFormatter={fmtMoney}
              labelEvery={3}
              renderTooltip={revenueTooltip}
              categoryHeading="Day of month"
              valueHeading="Revenue"
              emptyMessage="No paid bookings this month."
            />
          </SectionCard>
          <SectionCard title="Revenue by payment method" subtitle="Paid bookings this period">
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
        <SectionCard title="Court occupancy" subtitle="Percent of open hours booked this period">
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
        <SectionCard title="Peak hours" subtitle="Bookings by hour of day this period">
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
    </div>
  )
}
