import { useState, useEffect, useCallback, useRef } from 'react'
import type { User } from '../App'
import type { SelectedSlot } from '../pages/BookingPage'
import * as api from '../lib/api'
import type { Court, Quote } from '../lib/types'
import { fmtHour, fmtDateLong, fmtMoney } from '../lib/format'
import { errorMessage } from '../lib/useAsync'
import { PAYMENT_METHODS } from '../lib/paymentMethods'
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
      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#111827', marginBottom: '5px' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
          border: `1.5px solid ${focused ? G : '#E5E7EB'}`,
          fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
          fontFamily: FONT_BODY, color: '#111827', backgroundColor: 'white', transition: 'border-color 0.15s',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint && <p style={{ fontSize: '0.72rem', color: '#9CA3AF', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  )
}

interface Props {
  user: User
  slots: SelectedSlot[]
  /** Courts already loaded by the booking page, for names in the summary. */
  courts: Court[]
  onClose: () => void
  onSuccess: () => void
}

export default function BookingModal({ user, slots, courts, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2 | 'success'>(1)
  const [timeLeft, setTimeLeft] = useState(900)
  const [fullName, setFullName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone || '')
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

  const courtName = useCallback(
    (id: string) => courts.find((c) => c.id === id)?.name ?? id,
    [courts],
  )

  // Serialised so the effect below re-runs when the basket genuinely changes,
  // not on every render because the array is a new object.
  const slotKey = JSON.stringify(
    slots.map((s) => ({ courtId: s.courtId, date: s.date, startHour: s.startHour, duration: 1 })),
  )

  // Guards against an older quote response landing after a newer one — the
  // customer switching payment method twice quickly must not end up seeing the
  // price for the method they switched away from.
  const quoteSeq = useRef(0)

  const fetchQuote = useCallback(
    async (code: string): Promise<Quote | null> => {
      const seq = ++quoteSeq.current
      setQuoting(true)
      setQuoteError('')
      try {
        const q = await api.quoteBooking({
          slots: JSON.parse(slotKey),
          paymentMethod: payMethod,
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
    [slotKey, payMethod],
  )

  // Re-priced whenever the basket, the payment method, or the applied promo
  // changes, because each of those changes the total.
  useEffect(() => {
    if (step === 'success') return
    void fetchQuote(appliedCode)
  }, [fetchQuote, appliedCode, step])

  useEffect(() => {
    if (step === 'success') return
    if (timeLeft <= 0) { onClose(); return }
    const t = setTimeout(() => setTimeLeft(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [timeLeft, step])

  const baseTotal = quote?.baseAmount ?? 0
  const discount = quote?.discount ?? 0
  const finalTotal = quote?.totalAmount ?? 0
  const selPay = PAYMENT_METHODS.find(p => p.id === payMethod)
  const timerUrgent = timeLeft < 120
  const promoActive = Boolean(quote?.promoApplied && appliedCode)

  /** Price for one selected slot, taken from the server's quote. */
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
    if (!email.trim()) { setFormError('Please enter your email address.'); return }
    if (!phone.trim()) { setFormError('Please enter your mobile number.'); return }
    setStep(2)
  }

  async function handlePay() {
    if (!quote || paying) return
    setPaying(true)
    setPayError('')

    try {
      // The server books the whole basket from the figures inside the signed
      // quote. Court, time and amount all come from there — nothing this
      // component holds can change what gets charged.
      await api.createBooking({
        quoteId: quote.quoteId,
        name: fullName.trim(),
        phone: phone.trim(),
        players: 4,
        notes: appliedCode ? `Promo: ${appliedCode}` : '',
      })
      setStep('success')
    } catch (err) {
      // 409 means someone took one of these slots while the form was open, and
      // the whole basket was rolled back rather than half-booked. The customer
      // needs to go back and pick again — the grid behind the modal reloads on
      // close.
      setPayError(errorMessage(err))
    } finally {
      setPaying(false)
    }
  }

  if (step === 'success') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '20px', maxWidth: '480px', width: '100%', padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.25)' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '1.75rem', color: G }}>
            ✓
          </div>
          <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Booking Confirmed!
          </h2>
          <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 0.375rem' }}>
            {slots.length} slot{slots.length !== 1 ? 's' : ''} reserved · {fmtMoney(finalTotal)} paid via {selPay?.label}
          </p>
          <p style={{ color: '#9CA3AF', fontSize: '0.82rem', margin: '0 0 2rem', lineHeight: 1.6 }}>
            A confirmation has been sent to <strong style={{ color: '#374151' }}>{email}</strong>.<br />
            See you on the court, {fullName.split(' ')[0]}!
          </p>
          <button
            onClick={onSuccess}
            style={{ backgroundColor: G, color: 'white', border: 'none', borderRadius: '999px', padding: '0.9rem 2.75rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && requestClose()}
    >
      <div style={{ backgroundColor: 'white', borderRadius: '20px', maxWidth: '560px', width: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ padding: '1.625rem 1.75rem 0', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, borderRadius: '20px 20px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 3px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                <span style={{ color: G }}>STEP {step}</span>
                <span style={{ color: '#9CA3AF' }}> OF 2</span>
              </p>
              <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.45rem', fontWeight: 700, margin: 0 }}>
                {step === 1 ? 'Booking Details' : 'Payment & Confirmation'}
              </h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.78rem', margin: '3px 0 0' }}>
                {step === 1 ? 'Review your booking and enter your details' : 'Complete payment and confirm your reservation'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0, marginLeft: '1rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                backgroundColor: timerUrgent ? '#FEE2E2' : '#F3F4F6',
                color: timerUrgent ? '#DC2626' : '#374151',
                borderRadius: '999px', padding: '5px 12px', fontSize: '0.875rem', fontWeight: 700,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                {fmtTimer(timeLeft)}
              </div>
              <button
                onClick={requestClose}
                aria-label="Close"
                style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          </div>
          <div style={{ height: '3px', backgroundColor: '#F3F4F6', borderRadius: '99px', marginTop: '1.25rem', marginBottom: '0' }}>
            <div style={{ height: '100%', borderRadius: '99px', backgroundColor: G, width: step === 1 ? '50%' : '100%', transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ padding: '1.25rem 1.75rem 1.75rem' }}>
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
                <InputField label="Email Address *" value={email} onChange={setEmail} type="email" placeholder="john@example.com" hint="We'll send your booking confirmation to this email" />
                <InputField label="Mobile Number *" value={phone} onChange={setPhone} type="tel" placeholder="09123456789" hint="Used for verification and updates" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={requestClose}
                style={{ flex: 1, padding: '0.875rem', borderRadius: '999px', border: '1.5px solid #E5E7EB', backgroundColor: 'white', fontSize: '0.875rem', fontWeight: 600, color: '#6B7280', cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                Cancel
              </button>
              <button
                onClick={handleNext}
                disabled={!quote}
                style={{ flex: 2, padding: '0.875rem', borderRadius: '999px', border: 'none', backgroundColor: quote ? G_DARK : '#E5E7EB', color: quote ? 'white' : '#9CA3AF', fontSize: '0.875rem', fontWeight: 600, cursor: quote ? 'pointer' : 'default', fontFamily: FONT_BODY }}
              >
                {quoting && !quote ? 'Pricing…' : 'Next →'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={{ padding: '1.25rem 1.75rem 1.75rem' }}>
            {/* A banned account is refused by the server on both /api/quote and
                /api/bookings, so the block is not something this component has to
                know about in advance — it surfaces here as a plain error. */}
            {(payError || quoteError) && (
              <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.8rem', color: '#991B1B', margin: 0, lineHeight: 1.55 }}>{payError || quoteError}</p>
              </div>
            )}

            <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.16em', textTransform: 'uppercase', margin: '0 0 0.25rem' }}>PAY EXACTLY</p>
              <p style={{ fontFamily: FONT_DISPLAY, fontSize: '2.75rem', fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1 }}>
                {quote ? fmtMoney(finalTotal) : quoting ? '…' : '—'}
              </p>
              {promoActive && discount > 0 && (
                <p style={{ fontSize: '0.78rem', color: G, fontWeight: 600, margin: '6px 0 0' }}>
                  {appliedCode} applied — you saved {fmtMoney(discount)}
                </p>
              )}
              <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: '6px 0 0' }}>Confirmed by PickleBella Park, not your browser</p>
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
                  <button onClick={clearPromo} style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}>Remove</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      value={promoInput}
                      onChange={e => setPromoInput(e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === 'Enter') void applyPromo() }}
                      placeholder="Enter code"
                      style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_BODY, textTransform: 'uppercase' }}
                    />
                    <button
                      onClick={() => void applyPromo()}
                      disabled={quoting}
                      style={{ padding: '0.7rem 1.25rem', borderRadius: '10px', border: 'none', backgroundColor: quoting ? '#E5E7EB' : G_DARK, color: quoting ? '#9CA3AF' : 'white', fontSize: '0.82rem', fontWeight: 700, cursor: quoting ? 'default' : 'pointer', fontFamily: FONT_BODY }}
                    >
                      {quoting ? '…' : 'Apply'}
                    </button>
                  </div>
                  {promoError && <p style={{ fontSize: '0.75rem', color: '#DC2626', margin: '6px 0 0' }}>{promoError}</p>}
                </>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', margin: '0 0 0.875rem' }}>Select Payment Method</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {PAYMENT_METHODS.map(pm => {
                  const selected = payMethod === pm.id && !pm.disabled
                  // Only the selected method has a server-quoted total. Showing a
                  // locally-computed figure for the others would be exactly the
                  // "browser decides the price" habit this rewrite removes.
                  return (
                    <button
                      key={pm.id}
                      disabled={pm.disabled}
                      onClick={() => !pm.disabled && setPayMethod(pm.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.875rem',
                        padding: '0.875rem 1rem', borderRadius: '12px', textAlign: 'left',
                        border: `1.5px solid ${selected ? G : '#E5E7EB'}`,
                        backgroundColor: selected ? '#F0FDF4' : pm.disabled ? '#FAFAFA' : 'white',
                        cursor: pm.disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                      }}
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
                      <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: pm.disabled ? '#9CA3AF' : '#111827' }}>
                        {pm.label}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: pm.disabled ? '#D1D5DB' : '#111827' }}>
                        {pm.disabled ? (
                          <span style={{ fontSize: '0.65rem', letterSpacing: '0.08em', color: '#9CA3AF' }}>COMING SOON</span>
                        ) : selected ? (
                          quote ? fmtMoney(finalTotal) : '…'
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: '#9CA3AF', fontWeight: 500 }}>Select to price</span>
                        )}
                      </span>
                    </button>
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
                  <p style={{ fontSize: '0.8rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>{item.label}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setStep(1)}
                style={{ flex: 1, padding: '0.875rem', borderRadius: '999px', border: '1.5px solid #E5E7EB', backgroundColor: 'white', fontSize: '0.875rem', fontWeight: 600, color: '#6B7280', cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                ← Back
              </button>
              <button
                onClick={() => void handlePay()}
                disabled={!check1 || !check2 || paying || !quote || quoting}
                style={{
                  flex: 2, padding: '0.875rem', borderRadius: '999px', border: 'none',
                  backgroundColor: check1 && check2 && !paying && quote && !quoting ? G_DARK : '#E5E7EB',
                  color: check1 && check2 && !paying && quote && !quoting ? 'white' : '#9CA3AF',
                  fontSize: '0.875rem', fontWeight: 600,
                  cursor: check1 && check2 && !paying && quote && !quoting ? 'pointer' : 'default',
                  fontFamily: FONT_BODY, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                {paying ? (
                  <>Processing…</>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    Pay Now
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CANCEL CONFIRMATION */}
      {showCancelConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={e => e.target === e.currentTarget && setShowCancelConfirm(false)}
        >
          <div style={{ backgroundColor: 'white', borderRadius: '18px', maxWidth: '380px', width: '100%', padding: '1.75rem', textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Cancel this booking?</h3>
            <p style={{ color: '#6B7280', fontSize: '0.85rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
              Your selected slots and details will be discarded. This can't be undone.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{ padding: '0.8rem', borderRadius: '999px', border: 'none', backgroundColor: G_DARK, color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                Return to Payment
              </button>
              <button
                onClick={onClose}
                style={{ padding: '0.8rem', borderRadius: '999px', border: '1.5px solid #E5E7EB', backgroundColor: 'white', color: '#DC2626', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                Yes, Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WAIVER & TERMS */}
      {showWaiver && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={e => e.target === e.currentTarget && setShowWaiver(false)}
        >
          <div style={{ backgroundColor: 'white', borderRadius: '18px', maxWidth: '520px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>
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
              <button
                onClick={() => { setCheck2(false); setShowWaiver(false) }}
                style={{ flex: 1, padding: '0.8rem', borderRadius: '999px', border: '1.5px solid #E5E7EB', backgroundColor: 'white', fontSize: '0.85rem', fontWeight: 600, color: '#6B7280', cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setCheck2(true); setShowWaiver(false) }}
                style={{ flex: 2, padding: '0.8rem', borderRadius: '999px', border: 'none', backgroundColor: G_DARK, color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
