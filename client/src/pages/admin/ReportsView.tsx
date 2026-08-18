import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import * as api from '../../lib/api'
import type { MonthlyReport } from '../../lib/types'
import { fmtMoney, fmtHour, todayStr } from '../../lib/format'
import { useAsync } from '../../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../../components/States'
import { G, BLUE, PINK, FONT_BODY } from '../../lib/theme'
import { StatCard, SectionCard, MonthYearPicker, PaymentMethodTag } from './shared'
import { LineChart, BarChart } from './charts'

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
  const occupancyData = report.occupancyByCourt.map((c) => ({ label: c.courtName, value: Math.round(c.pctOfOpenHours * 10) / 10 }))
  const peakHoursData = report.hourlyBookingCounts
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.hour >= 0)
    .map((h) => ({ label: fmtHour(h.hour).replace(':00', ''), value: h.count }))

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
            <LineChart data={dailyRevenueData} color={G} valueFormatter={fmtMoney} labelEvery={3} renderTooltip={revenueTooltip} />
          </SectionCard>
        </>
      )}

      {state.data && tab === 'revenue' && (
        <>
          <SectionCard title="Daily revenue" subtitle="Paid court revenue by day this month">
            <LineChart data={dailyRevenueData} color={G} height={260} valueFormatter={fmtMoney} labelEvery={3} renderTooltip={revenueTooltip} />
          </SectionCard>
          <SectionCard title="Revenue by payment method" subtitle="Paid bookings this period">
            <div className="flex flex-col">
              {report.revenueByPaymentMethod.map((p) => (
                <div key={p.method} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700"><PaymentMethodTag methodId={p.method} /></span>
                  <span className="text-sm font-bold text-gray-900">{fmtMoney(p.amount)}</span>
                </div>
              ))}
              {report.revenueByPaymentMethod.length === 0 && <div className="text-center text-gray-400 text-sm py-8">No paid revenue this period.</div>}
            </div>
          </SectionCard>
        </>
      )}

      {state.data && tab === 'occupancy' && (
        <SectionCard title="Court occupancy" subtitle="Percent of open hours booked this period">
          <BarChart data={occupancyData} color={PINK} valueFormatter={(v) => `${v}%`} />
        </SectionCard>
      )}

      {state.data && tab === 'peak' && (
        <SectionCard title="Peak hours" subtitle="Bookings by hour of day this period">
          <BarChart data={peakHoursData} color={BLUE} valueFormatter={(v) => `${v} booking${v === 1 ? '' : 's'}`} />
        </SectionCard>
      )}
    </div>
  )
}
