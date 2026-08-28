import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '../App'
import type { SelectedSlot } from '../pages/BookingPage'
import * as api from '../lib/api'
import type { Court, Quote } from '../lib/types'
import { fmtHour, fmtDateLong, fmtMoney } from '../lib/format'
import { errorMessage } from '../lib/useAsync'
import { PAYMENT_METHODS } from '../lib/paymentMethods'
import { useIsMobile } from '../lib/useMediaQuery'
import { G_DARK, G, PINK, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

const WAIVER_SECTIONS = [
  {
    title: '1. Cancellation Policy',
    body: 'All confirmed bookings are considered final and are non-cancellable and non-refundable.',
  },
  {
    title: '2. Rescheduling Policy',
    body: "Rescheduling requests may be accommodated depending on court availability and must be submitted within the allowed timeframe. Approval of rescheduling requests is subject to the discretion of PickleBella management.\n\nRescheduling is free of charge when requested at least 48 hours before the scheduled booking. Changes made less than 48 hours before the booking may be subject to a minimal rescheduling fee. Rescheduling is not permitted within 12 hours of the scheduled booking to ensure fair court availability.",
  },
  {
    title: '3. No-Show Policy',
    body: 'Failure to arrive at the scheduled booking time will be considered a no-show. The reservation will be forfeited, and no refund or rescheduling will be provided.',
  },
  {
    title: '4. Late Arrivals',
    body: 'Guests who arrive late may still use the court for the remaining time of their reservation. The booking period will not be extended to compensate for time missed due to late arrival.',
  },
  {
    title: '5. Court Use and Conduct',
    body: "All players are expected to use the court and facilities responsibly and follow PickleBella's rules and regulations. Management reserves the right to refuse service or remove any player who engages in inappropriate, unsafe, or disruptive behavior. No refund will be provided in such cases.",
  },
  {
    title: '6. Assumption of Risk',
    body: 'By making a booking, you acknowledge that playing pickleball involves inherent risks, including the possibility of injury. You voluntarily assume all risks associated with participating in activities and using the facilities at PickleBella.',
  },
  {
    title: '7. Liability Waiver',
    body: 'PickleBella, including its owners, management, employees, and staff, shall not be held responsible for injuries, accidents, loss of personal belongings, or damage to personal property that may occur while using the facilities, except where liability cannot legally be waived.',
  },
  {
    title: '8. Unforeseen Circumstances',
    body: 'Bookings may be affected by circumstances beyond the control of PickleBella, including severe weather, power interruptions, facility issues, or other unforeseen events. In such cases, PickleBella may offer alternatives such as rescheduling or account credit, subject to availability and management approval.',
  },
]

function fmtTimer(s: number) {
  const m = String(Math.floor(s / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return `${m}:${sec}`
}

function InputField({ label, value, onChange, type = 'text', placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder: string; hint?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#111827', marginBottom: '6px' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '0.85rem 1rem', borderRadius: '10px',
          border: `1.5px solid ${focused ? G : '#E5E7EB'}`,
          fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
          fontFamily: FONT_BODY, color: '#111827', backgroundColor: 'white',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: focused ? `0 0 0 3px ${G}1a` : 'none',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint && <p style={{ fontSize: '0.78rem', color: '#9CA3AF', margin: '5px 0 0' }}>{hint}</p>}
    </div>
  )
}

/** A pill button with a hover/press lift, shared by every action in this
 * modal (Next, Back, Pay, cancel/waiver confirmations) so they read as one
 * consistent set rather than each having its own static state. */
function PillButton({
  onClick, disabled, flex, bg, hoverBg, color, border, type = 'button', children,
}: {
  onClick?: () => void
  disabled?: boolean
  flex?: number
  bg: string
  hoverBg: string
  color: string
  border?: string
  type?: 'button' | 'submit'
  children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex, padding: '0.9rem', borderRadius: '999px',
        border: border ?? 'none',
        backgroundColor: disabled ? '#E5E7EB' : hover ? hoverBg : bg,
        color: disabled ? '#9CA3AF' : color,
        fontSize: '0.92rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
        fontFamily: FONT_BODY, transition: 'background-color 0.15s, transform 0.15s',
        transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
      }}
    >
      {children}
    </button>
  )
}

/** One row in the payment method list. Selected and disabled both have their
 * own static look already (see the border/background passed in); hover only
 * needs to add feedback for the remaining case — an unselected, clickable
 * row someone is about to pick. */
function PaymentMethodRow({
  selected, disabled, onClick, children,
}: {
  selected: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  const isMobile = useIsMobile()
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? '0.6rem' : '0.875rem',
        padding: isMobile ? '0.85rem 0.8rem' : '0.95rem 1.1rem', borderRadius: '12px', textAlign: 'left',
        border: `1.5px solid ${selected ? G : hover && !disabled ? '#C7D2CC' : '#E5E7EB'}`,
        backgroundColor: selected ? '#F0FDF4' : disabled ? '#FAFAFA' : hover ? '#FAFBFA' : 'white',
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '30px', height: '30px', borderRadius: '50%', border: 'none',
        background: hover ? '#F3F4F6' : 'none', color: hover ? '#374151' : '#9CA3AF',
        cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'background-color 0.15s, color 0.15s',
      }}
    >
      ✕
    </button>
  )
}

interface Props {
  /** BookingPage only ever mounts this once a session — real or guest —
   * exists, since pricing the basket (below) needs one; see the "Book Now"
   * handler there for where sign-in is actually asked for. */
  user: User
  slots: SelectedSlot[]
  /** Courts already loaded by the booking page, for names in the summary. */
  courts: Court[]
  onClose: () => void
}

// There is no onSuccess: paying navigates away to the wallet, and the booking
// is confirmed on the return page (see PaymentReturn), not here. A modal
// cannot show a receipt for a payment that happens after it is gone.
export default function BookingModal({ user, slots, courts, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [timeLeft, setTimeLeft] = useState(900)
  const [fullName, setFullName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone)
  const [payMethod, setPayMethod] = useState('instapay')
  const [check1, setCheck1] = useState(false)
  const [check2, setCheck2] = useState(false)
  const [paying, setPaying] = useState(false)
  const [formError, setFormError] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showWaiver, setShowWaiver] = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [promoError, setPromoError] = useState('')
  const [appliedCode, setAppliedCode] = useState('')

  // The server's price for this basket. Until it arrives there is no total to
  // show — the browser is not allowed to work one out.
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoting, setQuoting] = useState(false)
  const [payError, setPayError] = useState('')
  // QR Ph does not redirect anywhere — the gateway returns a QR image for the
  // customer to scan with their own banking app, so it is shown in place.
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [qrIntentId, setQrIntentId] = useState('')
  const isMobile = useIsMobile()

  const courtName = useCallback(
    (id: string) => courts.find((c) => c.id === id)?.name ?? id,
    [courts],
  )

  // Serialised so the effect below re-runs when the basket genuinely changes,
  // not on every render because the array is a new object.
  const slotKey = JSON.stringify(
    slots.map((s) => ({ courtId: s.courtId, date: s.date, startHour: s.startHour, duration: 1 })),
  )

  // Guards against an older quote response landing after a newer one — two
  // promo codes tried in quick succession must not leave the modal showing the
  // total for the one that was typed first.
  const quoteSeq = useRef(0)

  const fetchQuote = useCallback(
    async (code: string): Promise<Quote | null> => {
      const seq = ++quoteSeq.current
      setQuoting(true)
      setQuoteError('')
      try {
        const q = await api.quoteBooking({
          slots: JSON.parse(slotKey),
          promoCode: code || undefined,
        })
        if (seq !== quoteSeq.current) return null
        setQuote(q)
        return q
      } catch (err) {
        if (seq !== quoteSeq.current) return null
        setQuote(null)
        setQuoteError(errorMessage(err))
        return null
      } finally {
        if (seq === quoteSeq.current) setQuoting(false)
      }
    },
    [slotKey],
  )

  // Re-priced when the basket or the applied promo changes. NOT when the
  // payment method changes: one quote already carries a total for each method,
  // so switching is a lookup below rather than another round trip.
  useEffect(() => {
    void fetchQuote(appliedCode)
  }, [fetchQuote, appliedCode])

  useEffect(() => {
    if (timeLeft <= 0) { onClose(); return }
    const t = setTimeout(() => setTimeLeft(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [timeLeft, step])

  const baseTotal = quote?.baseAmount ?? 0
  const discount = quote?.discount ?? 0
  const selPay = PAYMENT_METHODS.find(p => p.id === payMethod)

  /** The server's total for one method, or undefined if it didn't quote one. */
  const totalFor = (methodId: string) =>
    quote?.methods.find((m) => m.id === methodId)?.totalAmount

  const finalTotal = totalFor(payMethod) ?? 0
  const timerUrgent = timeLeft < 120
  const promoActive = Boolean(quote?.promoApplied && appliedCode)

  /** List price and peak flag for one selected slot, from the server's quote. */
  function quotedSlot(s: SelectedSlot) {
    return quote?.slots.find(
      (q) => q.courtId === s.courtId && q.date === s.date && q.startHour === s.startHour,
    )
  }

  async function applyPromo() {
    const code = promoInput.trim()
    if (!code) return
    setPromoError('')
    const result = await fetchQuote(code)
    if (result?.promoApplied) {
      setAppliedCode(code)
      return
    }
    // The server rejects an unusable code outright, so the failure message is
    // already in quoteError. Re-price without it so the modal still has a total.
    setPromoError(quoteError || 'That code could not be applied.')
    void fetchQuote('')
  }

  function clearPromo() {
    setAppliedCode('')
    setPromoInput('')
    setPromoError('')
  }

  function requestClose() {
    setShowCancelConfirm(true)
  }

  const byDate = slots.reduce<Record<string, SelectedSlot[]>>((acc, s) => {
    acc[s.date] = acc[s.date] || []
    acc[s.date].push(s)
    return acc
  }, {})

  function handleNext() {
    setFormError('')
    if (!fullName.trim()) { setFormError('Please enter your full name.'); return }
    if (!phone.trim()) { setFormError('Please enter your mobile number.'); return }
    setStep(2)
  }

  async function handlePay() {
    if (!quote || paying) return
    setPaying(true)
    setPayError('')

    try {
      // The server holds the whole basket and opens a payment from the figures
      // inside the signed quote. Court, time and amount all come from there —
      // nothing this component holds can change what gets charged.
      //
      // Nothing is booked yet. The slots are held while the customer is at the
      // wallet, and the booking only becomes real once the money arrives.
      const started = await api.startPayment({
        quoteId: quote.quoteId,
        paymentMethod: payMethod,
        name: fullName.trim(),
        phone: phone.trim(),
        // Only actually used for a guest session, which has no account email
        // of its own — see server/api/bookings/index.ts.
        email: email.trim(),
        players: 4,
        notes: appliedCode ? `Promo: ${appliedCode}` : '',
      })

      if (started.redirectUrl) {
        // Off to GCash or Maya. `replace` rather than `assign` so the back
        // button doesn't land the customer on a dead payment form.
        window.location.replace(started.redirectUrl)
        return
      }

      if (started.qrImageUrl) {
        setQrImage(started.qrImageUrl)
        setQrIntentId(started.paymentIntentId)
        setPaying(false)
        return
      }

      // No redirect and no QR: the gateway accepted it outright. The return
      // page is still the thing that confirms it.
      window.location.replace(`/?payment=${encodeURIComponent(started.paymentIntentId)}`)
    } catch (err) {
      // 409 means someone took one of these slots while the form was open, and
      // the whole basket was rolled back rather than half-booked. The customer
      // needs to go back and pick again — the grid behind the modal reloads on
      // close.
      setPayError(errorMessage(err))
      setPaying(false)
    }
  }

  // QR Ph: the customer scans this with their own banking app, then comes back.
  if (qrImage) {
    return (
      <div className="pb-modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0.75rem' : '1rem', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
        <div className="pb-sheet pb-modal-panel" style={{ backgroundColor: 'white', borderRadius: '20px', maxWidth: '420px', width: '100%', overflowY: 'auto', padding: isMobile ? '1.75rem 1.25rem' : '2.25rem 2rem', textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.25)' }}>
          <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: isMobile ? '1.35rem' : '1.55rem', fontWeight: 700, margin: '0 0 0.4rem' }}>
            Scan to pay {fmtMoney(finalTotal)}
          </h2>
          <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
            Open any bank or e-wallet app that supports QR Ph and scan this code.
          </p>

          <img
            src={qrImage}
            alt="QR Ph payment code"
            style={{ width: '100%', maxWidth: '260px', margin: '0 auto 1.25rem', display: 'block', borderRadius: '12px' }}
          />

          <p style={{ color: '#9CA3AF', fontSize: '0.82rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
            Your courts are held until the timer runs out. This page updates once
            the payment clears.
          </p>

          <PillButton
            onClick={() => window.location.replace(`/?payment=${encodeURIComponent(qrIntentId)}`)}
            bg={G} hoverBg={G_DARK} color="white"
          >
            I've paid — check now
          </PillButton>
        </div>
      </div>
    )
  }

  return (
    <div
      className="pb-modal-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && requestClose()}
    >
      {/* On a phone this is a bottom sheet pinned to the bottom edge: the
          reachable half of the screen, and no wasted side gutters on a form
          that already has to scroll. The max-height lives in a class because
          it needs a `dvh` value (which tracks the viewport as the mobile URL
          bar slides away) with a `vh` fallback under it. */}
      <div
        className="pb-sheet pb-modal-panel"
        style={{
          backgroundColor: 'white',
          borderRadius: isMobile ? '20px 20px 0 0' : '20px',
          maxWidth: '560px', width: '100%',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
          paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : undefined,
        }}
      >

        {/* Header */}
        <div style={{ padding: isMobile ? '1.1rem 1.1rem 0' : '1.625rem 1.75rem 0', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, borderRadius: '20px 20px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                <span style={{ color: G }}>STEP {step}</span>
                <span style={{ color: '#9CA3AF' }}> OF 2</span>
              </p>
              <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: isMobile ? '1.3rem' : '1.55rem', fontWeight: 700, margin: 0 }}>
                {step === 1 ? 'Booking Details' : 'Payment & Confirmation'}
              </h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: '4px 0 0' }}>
                {step === 1 ? 'Review your booking and enter your details' : 'Complete payment and confirm your reservation'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.35rem' : '0.625rem', flexShrink: 0, marginLeft: isMobile ? '0.5rem' : '1rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                backgroundColor: timerUrgent ? '#FEE2E2' : '#F3F4F6',
                color: timerUrgent ? '#DC2626' : '#374151',
                borderRadius: '999px', padding: isMobile ? '5px 10px' : '6px 13px', fontSize: isMobile ? '0.82rem' : '0.92rem', fontWeight: 700,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                {fmtTimer(timeLeft)}
              </div>
              <CloseButton onClick={requestClose} />
            </div>
          </div>
          <div style={{ height: '3px', backgroundColor: '#F3F4F6', borderRadius: '99px', marginTop: '1.25rem', marginBottom: '0' }}>
            <div style={{ height: '100%', borderRadius: '99px', backgroundColor: G, width: step === 1 ? '50%' : '100%', transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ padding: isMobile ? '1rem 1.1rem 1.5rem' : '1.25rem 1.75rem 1.75rem' }}>
            <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.95rem', flexShrink: 0, marginTop: '1px' }}>⚠</span>
              <p style={{ fontSize: '0.78rem', color: '#78350F', margin: 0, lineHeight: 1.55 }}>
                <strong style={{ color: '#92400E' }}>Review before continuing:</strong> Bookings cannot be modified once submitted.
              </p>
            </div>

            <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '1.125rem', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 0.875rem' }}>BOOKING SUMMARY</p>

              {Object.entries(byDate).map(([date, ds], di) => (
                <div key={date} style={{ marginBottom: di < Object.keys(byDate).length - 1 ? '1rem' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>Date</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>{fmtDateLong(date)}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '0.75rem' }}>
                    <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>BOOKINGS</p>
                    {ds.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: i < ds.length - 1 ? '0.5rem' : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>{courtName(s.courtId)}</span>
                          <span style={{ color: '#9CA3AF', fontSize: '0.78rem' }}>· {fmtHour(s.startHour)} – {fmtHour(s.startHour + 1)}</span>
                          <span style={{ backgroundColor: '#EFF6FF', color: '#2563EB', fontSize: '0.62rem', fontWeight: 600, padding: '2px 7px', borderRadius: '999px', whiteSpace: 'nowrap' }}>60 min</span>
                          {quotedSlot(s)?.peak && (
                            <span style={{ backgroundColor: '#FCE7F3', color: PINK, fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px', whiteSpace: 'nowrap' }}>PEAK</span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', flexShrink: 0, marginLeft: '0.5rem' }}>
                          {fmtMoney(quotedSlot(s)?.baseAmount ?? s.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ borderTop: '1px solid #E5E7EB', marginTop: '0.875rem', paddingTop: '0.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>Total Amount</span>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: '1.2rem', fontWeight: 800, color: G }}>
                  {quote ? fmtMoney(baseTotal) : quoting ? '…' : '—'}
                </span>
              </div>
              {quoteError && (
                <p style={{ fontSize: '0.75rem', color: '#DC2626', margin: '0.5rem 0 0', lineHeight: 1.55 }}>{quoteError}</p>
              )}
              <p style={{ fontSize: '0.68rem', color: '#9CA3AF', margin: '0.5rem 0 0', lineHeight: 1.55 }}>
                * Final amount may vary slightly depending on payment method.
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                Your Details
              </h3>
              {formError && (
                <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontSize: '0.78rem', padding: '0.625rem 0.875rem', borderRadius: '8px', marginBottom: '0.875rem' }}>
                  {formError}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <InputField label="Full Name *" value={fullName} onChange={setFullName} placeholder="John Doe" />
                <InputField label="Mobile Number *" value={phone} onChange={setPhone} type="tel" placeholder="09123456789" hint="Used for verification and updates" />
                <InputField label="Email Address" value={email} onChange={setEmail} type="email" placeholder="john@example.com" hint="Optional — we'll send your booking confirmation here if given" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <PillButton onClick={requestClose} flex={1} bg="white" hoverBg="#F9FAFB" color="#6B7280" border="1.5px solid #E5E7EB">
                Cancel
              </PillButton>
              <PillButton onClick={handleNext} disabled={!quote} flex={2} bg={G_DARK} hoverBg="#0B2A14" color="white">
                {quoting && !quote ? 'Pricing…' : 'Next →'}
              </PillButton>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={{ padding: isMobile ? '1rem 1.1rem 1.5rem' : '1.25rem 1.75rem 1.75rem' }}>
            {/* A banned account is refused by the server on both /api/quote and
                /api/bookings, so the block is not something this component has to
                know about in advance — it surfaces here as a plain error. */}
            {(payError || quoteError) && (
              <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.8rem', color: '#991B1B', margin: 0, lineHeight: 1.55 }}>{payError || quoteError}</p>
              </div>
            )}

            <div style={{ background: `linear-gradient(155deg, ${G_DARK} 0%, #0B2A14 100%)`, borderRadius: '14px', padding: '1.75rem 1.5rem', textAlign: 'center', marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.16em', textTransform: 'uppercase', margin: '0 0 0.3rem' }}>PAY EXACTLY</p>
              <p style={{ fontFamily: FONT_DISPLAY, fontSize: isMobile ? '2.25rem' : '2.85rem', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1 }}>
                {quote ? fmtMoney(finalTotal) : quoting ? '…' : '—'}
              </p>
              {promoActive && discount > 0 && (
                <p style={{ fontSize: '0.82rem', color: '#7AC231', fontWeight: 600, margin: '8px 0 0' }}>
                  {appliedCode} applied — you saved {fmtMoney(discount)}
                </p>
              )}
              <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', margin: '8px 0 0' }}>Confirmed by PickleBella Park, not your browser</p>
            </div>

            {/* Promo code */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', margin: '0 0 0.625rem' }}>Promo code</h3>
              {promoActive ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', border: `1.5px solid ${G}`, backgroundColor: '#F0FDF4', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: G_DARK }}>
                    {appliedCode}
                    <span style={{ fontWeight: 500, color: '#4B5563' }}>
                      {' '}· {fmtMoney(discount)} off
                    </span>
                  </span>
                  <button onClick={clearPromo} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}>Remove</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      value={promoInput}
                      onChange={e => setPromoInput(e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === 'Enter') void applyPromo() }}
                      placeholder="Enter code"
                      style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_BODY, textTransform: 'uppercase' }}
                    />
                    <PillButton onClick={() => void applyPromo()} disabled={quoting} bg={G_DARK} hoverBg="#0B2A14" color="white">
                      {quoting ? '…' : 'Apply'}
                    </PillButton>
                  </div>
                  {promoError && <p style={{ fontSize: '0.8rem', color: '#DC2626', margin: '6px 0 0' }}>{promoError}</p>}
                </>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 0.875rem' }}>Select Payment Method</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {PAYMENT_METHODS.map(pm => {
                  const selected = payMethod === pm.id && !pm.disabled
                  // Every row shows a real total, because the quote priced all
                  // of them. The figure is still the server's — this reads it
                  // out of the signed quote rather than working out a fee here.
                  const rowTotal = totalFor(pm.id)
                  return (
                    <PaymentMethodRow
                      key={pm.id}
                      selected={selected}
                      disabled={Boolean(pm.disabled)}
                      onClick={() => !pm.disabled && setPayMethod(pm.id)}
                    >
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${selected ? G : '#D1D5DB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.15s' }}>
                        {selected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: G }} />}
                      </div>
                      {pm.logo ? (
                        <img src={pm.logo} alt="" style={{ width: '24px', height: '24px', borderRadius: '6px', objectFit: 'contain', flexShrink: 0, opacity: pm.disabled ? 0.4 : 1 }} />
                      ) : (
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                        </div>
                      )}
                      <span style={{ flex: 1, minWidth: 0, fontSize: isMobile ? '0.88rem' : '0.92rem', fontWeight: 600, color: pm.disabled ? '#9CA3AF' : '#111827' }}>
                        {pm.label}
                      </span>
                      <span style={{ fontSize: isMobile ? '0.85rem' : '0.9rem', fontWeight: 700, color: pm.disabled ? '#D1D5DB' : '#111827', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {pm.disabled ? (
                          <span style={{ fontSize: '0.68rem', letterSpacing: '0.08em', color: '#9CA3AF' }}>COMING SOON</span>
                        ) : rowTotal !== undefined ? (
                          fmtMoney(rowTotal)
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500 }}>…</span>
                        )}
                      </span>
                    </PaymentMethodRow>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {[
                {
                  v: check1, onClick: () => setCheck1(v => !v),
                  label: <>I have reviewed my booking details and confirm they are correct. I understand this booking is <strong>final</strong> and cannot be modified.</>,
                },
                {
                  v: check2, onClick: () => setShowWaiver(true),
                  label: <>I agree to the club's <span style={{ color: '#3B82F6', textDecoration: 'underline', cursor: 'pointer' }}>waiver & terms</span>. Tap to review.</>,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  onClick={item.onClick}
                  style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.875rem', borderRadius: '10px', border: `1px solid ${item.v ? '#BBF7D0' : '#E5E7EB'}`, cursor: 'pointer', backgroundColor: item.v ? '#F0FDF4' : 'white', transition: 'all 0.15s' }}
                >
                  <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${item.v ? G : '#D1D5DB'}`, backgroundColor: item.v ? G : 'transparent', flexShrink: 0, marginTop: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                    {item.v && <span style={{ color: 'white', fontSize: '0.65rem', fontWeight: 700 }}>✓</span>}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>{item.label}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <PillButton onClick={() => setStep(1)} flex={1} bg="white" hoverBg="#F9FAFB" color="#6B7280" border="1.5px solid #E5E7EB">
                ← Back
              </PillButton>
              <PillButton
                onClick={() => void handlePay()}
                disabled={!check1 || !check2 || paying || !quote || quoting}
                flex={2} bg={G_DARK} hoverBg="#0B2A14" color="white"
              >
                {paying ? (
                  <>Opening {selPay?.label ?? 'payment'}…</>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    {payMethod === 'instapay' ? 'Show QR Ph code' : `Pay with ${selPay?.label ?? 'wallet'}`}
                  </>
                )}
              </PillButton>
            </div>
          </div>
        )}
      </div>

      {/* CANCEL CONFIRMATION */}
      {showCancelConfirm && (
        <div
          className="pb-modal-backdrop"
          style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={e => e.target === e.currentTarget && setShowCancelConfirm(false)}
        >
          <div className="pb-modal-panel" style={{ backgroundColor: 'white', borderRadius: '18px', maxWidth: '380px', width: '100%', padding: '1.75rem', textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Cancel this booking?</h3>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
              Your selected slots and details will be discarded. This can't be undone.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <PillButton onClick={() => setShowCancelConfirm(false)} bg={G_DARK} hoverBg="#0B2A14" color="white">
                Return to Payment
              </PillButton>
              <PillButton onClick={onClose} bg="white" hoverBg="#FEF2F2" color="#DC2626" border="1.5px solid #E5E7EB">
                Yes, Cancel Booking
              </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* WAIVER & TERMS */}
      {showWaiver && (
        <div
          className="pb-modal-backdrop"
          style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={e => e.target === e.currentTarget && setShowWaiver(false)}
        >
          <div className="pb-modal-panel" style={{ backgroundColor: 'white', borderRadius: '18px', maxWidth: '520px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '1.5rem 1.75rem 1rem', borderBottom: '1px solid #F3F4F6' }}>
              <h3 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.375rem' }}>
                PickleBella Booking Waiver & Terms
              </h3>
              <p style={{ color: '#9CA3AF', fontSize: '0.78rem', margin: 0, lineHeight: 1.55 }}>
                Please read the following waiver and terms carefully before confirming your booking.
              </p>
            </div>
            <div style={{ padding: '1.25rem 1.75rem', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.65, margin: '0 0 1.25rem' }}>
                By completing a booking with PickleBella, you acknowledge and agree to the following terms and conditions:
              </p>
              {WAIVER_SECTIONS.map((s) => (
                <div key={s.title} style={{ marginBottom: '1.125rem' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: '0 0 0.375rem' }}>{s.title}</h4>
                  {s.body.split('\n\n').map((para, i) => (
                    <p key={i} style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.65, margin: i === 0 ? 0 : '0.625rem 0 0' }}>{para}</p>
                  ))}
                </div>
              ))}
              <p style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.65, margin: '1.25rem 0 0', fontWeight: 600 }}>
                By confirming your booking, you acknowledge that you have read, understood, and voluntarily agreed to all of the terms and conditions stated above.
              </p>
            </div>
            <div style={{ padding: '1.125rem 1.75rem', borderTop: '1px solid #F3F4F6', display: 'flex', gap: '0.75rem' }}>
              <PillButton onClick={() => { setCheck2(false); setShowWaiver(false) }} flex={1} bg="white" hoverBg="#F9FAFB" color="#6B7280" border="1.5px solid #E5E7EB">
                Cancel
              </PillButton>
              <PillButton onClick={() => { setCheck2(true); setShowWaiver(false) }} flex={2} bg={G_DARK} hoverBg="#0B2A14" color="white">
                I Agree
              </PillButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
