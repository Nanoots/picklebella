import { useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import type { PaymentStatus } from '../lib/types'
import { errorMessage } from '../lib/useAsync'
import { fmtDateLong, fmtHour, fmtMoney } from '../lib/format'
import { useIsMobile } from '../lib/useMediaQuery'
import { G, G_DARK, PINK, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

/* Where the wallet drops the customer after they pay.

   The `?payment=pi_…` on the URL is not evidence of anything — it is a string
   in an address bar, and typing one by hand must not conjure a booking. So
   this screen treats it purely as a lookup key and asks the server what
   actually happened; the server in turn asks PayMongo.

   It polls because there is a genuine race: the customer's phone often gets
   back here before PayMongo's webhook reaches our server. Rather than tell
   someone who has just paid that nothing happened, this waits a few seconds
   for the truth to catch up. */

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 30_000

interface Props {
  intentId: string
  onDone: () => void
}

export default function PaymentReturn({ intentId, onDone }: Props) {
  const isMobile = useIsMobile()
  const [result, setResult] = useState<PaymentStatus | null>(null)
  const [error, setError] = useState('')
  const [timedOut, setTimedOut] = useState(false)
  const startedAt = useRef(Date.now())

  const settled = result && result.status !== 'pending'

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const tick = async () => {
      let status: PaymentStatus | null = null

      try {
        status = await api.getPaymentStatus(intentId, controller.signal)
        if (controller.signal.aborted) return
        setResult(status)
        setError('')
      } catch (err) {
        if (controller.signal.aborted) return
        // Not retried: the things that go wrong here — an unknown intent, a
        // signed-out session — do not fix themselves on a second attempt, and
        // hammering the endpoint would only get the caller rate limited.
        setError(errorMessage(err))
        return
      }

      if (stopped) return
      // Final answer: nothing left to wait for.
      if (status.status !== 'pending') return
      // A basket still pending after half a minute needs a person, not another
      // poll — the customer gets a reference number to quote instead.
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS)
    }

    void tick()

    return () => {
      stopped = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [intentId])

  const bookings = result?.bookings ?? []
  const total = bookings.reduce((sum, b) => sum + Number(b.amount), 0)

  // A modal over the booking page rather than a standalone screen: the site's
  // own nav and grid stay visible behind it, so paying doesn't feel like it
  // dropped the customer somewhere outside the app.
  const shell = (children: React.ReactNode) => (
    <div
      className="pb-modal-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 120, backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem',
      }}
    >
      <div
        className="pb-modal-panel"
        style={{
          backgroundColor: 'white', borderRadius: '20px', maxWidth: '480px', width: '100%',
          padding: isMobile ? '2rem 1.25rem' : '2.75rem 2rem', textAlign: 'center',
          boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
        }}
      >
        {children}
      </div>
    </div>
  )

  /* ---- Still waiting ---- */
  if (!settled && !timedOut && !error) {
    return shell(
      <>
        <div
          style={{
            width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 1.5rem',
            border: `3px solid #E5E7EB`, borderTopColor: G, animation: 'pb-spin 0.9s linear infinite',
          }}
        />
        <style>{`@keyframes pb-spin { to { transform: rotate(360deg) } }`}</style>
        <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
          Confirming your payment…
        </h2>
        <p style={{ color: '#6B7280', fontSize: '0.88rem', margin: 0, lineHeight: 1.6 }}>
          This usually takes a few seconds. Please don't close this page.
        </p>
      </>,
    )
  }

  /* ---- Paid ---- */
  if (result?.status === 'paid') {
    return shell(
      <>
        <div
          style={{
            width: '72px', height: '72px', borderRadius: '50%', backgroundColor: '#DCFCE7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', fontSize: '1.75rem', color: G,
          }}
        >
          ✓
        </div>
        <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: isMobile ? '1.5rem' : '1.75rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
          Booking Confirmed!
        </h2>
        <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
          {bookings.length} slot{bookings.length === 1 ? '' : 's'} reserved · {fmtMoney(total)} paid
        </p>

        <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
          {bookings.map((b) => (
            <div
              key={b.id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.4rem 0', fontSize: '0.82rem' }}
            >
              <span style={{ color: '#374151' }}>
                {fmtDateLong(b.date)} · {fmtHour(b.startHour)}–{fmtHour(b.startHour + b.duration)}
              </span>
              <span style={{ color: '#111827', fontWeight: 700, flexShrink: 0 }}>{fmtMoney(b.amount)}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onDone}
          style={{ backgroundColor: G, color: 'white', border: 'none', borderRadius: '999px', padding: '0.9rem 2.75rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, width: '100%' }}
        >
          View My Bookings
        </button>
      </>,
    )
  }

  /* ---- Failed, or we gave up waiting ---- */
  const stillPending = result?.status === 'pending'
  return shell(
    <>
      <div
        style={{
          width: '72px', height: '72px', borderRadius: '50%',
          backgroundColor: stillPending ? '#FEF3C7' : '#FEE2E2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.5rem', fontSize: '1.75rem', color: stillPending ? '#B45309' : '#DC2626',
        }}
      >
        {stillPending ? '⏳' : '✕'}
      </div>
      <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: isMobile ? '1.35rem' : '1.6rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
        {stillPending ? 'Still waiting on your bank' : 'Payment not completed'}
      </h2>
      <p style={{ color: '#6B7280', fontSize: '0.88rem', margin: '0 0 1.75rem', lineHeight: 1.65 }}>
        {error
          ? error
          : stillPending
            ? 'Your courts are still held. If you have paid, it should confirm shortly — check "My bookings" in a minute, or contact us and quote your payment reference.'
            : 'No money was taken and your slots have been released. You can pick your times again and retry.'}
      </p>

      {stillPending && (
        <p style={{ color: '#9CA3AF', fontSize: '0.72rem', margin: '-1.25rem 0 1.75rem', wordBreak: 'break-all' }}>
          Reference: {intentId}
        </p>
      )}

      <button
        onClick={onDone}
        style={{ backgroundColor: PINK, color: 'white', border: 'none', borderRadius: '999px', padding: '0.9rem 2.75rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, width: '100%' }}
      >
        Back to Booking
      </button>
    </>,
  )
}
