import type { ComponentType } from 'react'
import type { Booking } from '../../lib/types'
import { getPaymentMethod } from '../../lib/paymentMethods'
import { FONT_DISPLAY, FONT_BODY } from '../../lib/theme'
import { useIsMobile } from '../../lib/useMediaQuery'
import { useAdminColors } from './adminTheme'

export function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg">
      {message}
    </div>
  )
}

export function StatCard({
  label, value, sub, accent, icon: Icon,
}: {
  label: string
  value: string | number
  sub: string
  /** Colours both the value and the icon chip — pick one per card so the row
   * reads as distinct metrics at a glance rather than one undifferentiated
   * block of numbers. */
  accent?: string
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>
}) {
  const colors = useAdminColors()
  const isMobile = useIsMobile()
  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-gray-100"
      style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.4rem' : '0.6rem', padding: isMobile ? '0.85rem' : '1.25rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <p className="font-semibold text-gray-400 uppercase tracking-wider m-0" style={{ minWidth: 0, fontSize: isMobile ? '0.62rem' : '0.75rem' }}>{label}</p>
        {Icon && (
          <span
            style={{
              width: isMobile ? '1.6rem' : '2rem', height: isMobile ? '1.6rem' : '2rem', borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: accent ? `${accent}1F` : colors.borderSoft,
              color: accent ?? colors.textFaint,
            }}
          >
            <Icon size={isMobile ? 13 : 16} strokeWidth={2.4} />
          </span>
        )}
      </div>
      <div>
        <p className="font-extrabold m-0" style={{ fontFamily: FONT_DISPLAY, color: accent ?? colors.text, fontSize: isMobile ? '1.3rem' : '1.5rem' }}>{value}</p>
        <p className="text-gray-400 m-0 mt-0.5" style={{ fontSize: isMobile ? '0.68rem' : '0.75rem' }}>{sub}</p>
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: Booking['status'] }) {
  const styles: Record<Booking['status'], string> = {
    pending: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }
  const labels: Record<Booking['status'], string> = {
    // "Awaiting payment" rather than "Pending": staff need to know the court
    // is held but the money has not arrived, which "pending" alone doesn't say.
    pending: 'Awaiting payment',
    paid: 'Paid',
    failed: 'Payment failed',
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

/** A bare month dropdown — pairs with a single shared YearInput rather than
 * carrying its own year, for pickers like a From/To range where one year
 * applies to both ends. */
export function MonthSelect({
  month, onChange, label,
}: { month: number; onChange: (month: number) => void; label?: string }) {
  return (
    <select
      value={month}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
      style={{ fontFamily: FONT_BODY }}
    >
      {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </select>
  )
}

export function YearInput({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  return (
    <input
      type="number"
      value={year}
      onChange={(e) => onChange(Number(e.target.value) || year)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
      style={{ fontFamily: FONT_BODY, width: '90px' }}
    />
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
