/* Display formatting. Pure functions, no data access — they used to live in
   store.ts, which meant a screen needing only `fmtMoney` had to import the
   whole localStorage layer. */

export function fmtHour(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM'
  let hr = h % 12
  if (hr === 0) hr = 12
  return `${hr}:00 ${ampm}`
}

export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function fmtDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function fmtMoney(n: number): string {
  return '₱' + Number(n).toLocaleString('en-PH')
}

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return toLocalDateStr(new Date())
}

/** Stable id for client-only rows (holiday entries, draft promo codes). Anything
    the database owns gets its id from Postgres instead. */
export function uid(prefix: string): string {
  return prefix + '-' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6)
}
