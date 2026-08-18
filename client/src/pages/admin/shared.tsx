import type { Booking } from '../../lib/types'
import { getPaymentMethod } from '../../lib/paymentMethods'
import { FONT_DISPLAY, FONT_BODY } from '../../lib/theme'

export function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg">
      {message}
    </div>
  )
}

export function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider m-0">{label}</p>
      <p className="text-2xl font-extrabold m-0 mt-1" style={{ fontFamily: FONT_DISPLAY, color: accent ?? '#111827' }}>{value}</p>
      <p className="text-xs text-gray-400 m-0 mt-0.5">{sub}</p>
    </div>
  )
}

export function StatusBadge({ status }: { status: Booking['status'] }) {
  const styles: Record<Booking['status'], string> = {
    paid: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }
  const labels: Record<Booking['status'], string> = {
    paid: 'Paid',
    cancelled: 'Cancelled',
  }
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${styles[status]}`}>{labels[status]}</span>
}

export function PaymentMethodTag({ methodId }: { methodId: string }) {
  const method = getPaymentMethod(methodId)
  return (
    <span className="inline-flex items-center gap-1.5">
      {method?.logo && <img src={method.logo} alt="" className="w-4 h-4 rounded object-contain" />}
      <span>{method?.label ?? methodId}</span>
    </span>
  )
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function MonthYearPicker({
  year, month, onChange,
}: { year: number; month: number; onChange: (year: number, month: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
        style={{ fontFamily: FONT_BODY }}
      >
        {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <input
        type="number"
        value={year}
        onChange={(e) => onChange(Number(e.target.value) || year, month)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
        style={{ fontFamily: FONT_BODY, width: '90px' }}
      />
    </div>
  )
}

export function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 style={{ fontFamily: FONT_DISPLAY }} className="text-base font-bold text-gray-900 m-0">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 m-0 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
