import { useState } from 'react'
import logoImg from '@/imports/opt/logo.webp'
import type { User } from '../App'
import { continueAsGuest, signIn, signUp } from '../lib/auth'
import { G_DARK, G, PINK, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

interface Props {
  onClose: () => void
  onSuccess: (user: User) => void
}

function Field({
  label, value, onChange, type = 'text', placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder: string; hint?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>{label}</label>
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

/** A full-width pill button with a hover/press lift, used for every primary
 * and secondary action in this modal so they read as one consistent set. */
function ActionButton({
  onClick, disabled, variant, children, type = 'button',
}: {
  onClick?: () => void
  disabled?: boolean
  variant: 'primary' | 'secondary'
  children: React.ReactNode
  type?: 'button' | 'submit'
}) {
  const [hover, setHover] = useState(false)
  const primary = variant === 'primary'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', padding: '0.95rem', borderRadius: '999px',
        border: primary ? 'none' : '1.5px solid #E5E7EB',
        backgroundColor: disabled ? '#D1D5DB' : primary ? (hover ? '#0B2A14' : G_DARK) : (hover ? '#F9FAFB' : 'white'),
        color: primary ? 'white' : '#374151',
        fontSize: '0.95rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
        fontFamily: FONT_BODY, transition: 'background-color 0.15s, transform 0.15s',
        transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {children}
    </button>
  )
}

export default function AuthModal({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('') // sign-in: email or mobile number
  const [email, setEmail] = useState('') // sign-up: optional
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const busy = loading || guestLoading

  function switchMode(m: 'signin' | 'signup') {
    setMode(m)
    setError('')
    setNotice('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setNotice('')

    if (mode === 'signup') {
      if (!name.trim()) { setError('Please enter your full name.'); return }
      if (!email.trim()) { setError('Please enter your email address.'); return }
      if (!phone.trim()) { setError('Please enter your mobile number.'); return }
      // Matches the minimum enforced by Supabase Auth. The real strength check
      // happens there — this only saves a round trip on obvious cases.
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    } else {
      if (!identifier.trim() || !password.trim()) { setError('Please fill in all fields.'); return }
    }

    setLoading(true)
    try {
      if (mode === 'signup') {
        const { user, needsEmailConfirmation } = await signUp({ name, email, phone, password })
        if (needsEmailConfirmation) {
          setNotice('Check your inbox — we sent a link to confirm your email address. You can sign in once it is confirmed.')
          setMode('signin')
          setPassword('')
          return
        }
        if (user) onSuccess(user)
        return
      }

      const user = await signIn(identifier, password)
      onSuccess(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGuest() {
    if (busy) return
    setError('')
    setNotice('')
    setGuestLoading(true)
    try {
      const user = await continueAsGuest()
      onSuccess(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue as guest. Please try again.')
    } finally {
      setGuestLoading(false)
    }
  }

  return (
    <div
      className="pb-modal-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="pb-sheet pb-modal-panel" style={{ backgroundColor: 'white', borderRadius: '24px', maxWidth: '420px', width: '100%', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>

        {/* Brand Header */}
        <div style={{ backgroundColor: G_DARK, padding: '2rem 2rem 1.75rem', textAlign: 'center' }}>
          <img src={logoImg} alt="PickleBella Park" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.75rem', display: 'block', border: '2px solid rgba(255,255,255,0.15)' }} />
          <p style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>PickleBella Park</p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', letterSpacing: '0.12em', margin: '5px 0 0' }}>DINK · SMASH · ENJOY</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6' }}>
          {(['signin', 'signup'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => switchMode(tab)}
              style={{
                flex: 1, padding: '1rem', fontSize: '0.95rem', fontWeight: 600, border: 'none',
                background: 'white', cursor: 'pointer', fontFamily: FONT_BODY,
                color: mode === tab ? G : '#9CA3AF',
                borderBottom: `2px solid ${mode === tab ? G : 'transparent'}`,
                marginBottom: '-1px', transition: 'color 0.15s',
              }}
            >
              {tab === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontSize: '0.85rem', padding: '0.7rem 0.9rem', borderRadius: '8px', marginBottom: '1rem', lineHeight: 1.55 }}>
              {error}
            </div>
          )}

          {notice && (
            <div style={{ backgroundColor: '#DCFCE7', color: '#15803D', fontSize: '0.85rem', padding: '0.7rem 0.9rem', borderRadius: '8px', marginBottom: '1rem', lineHeight: 1.55 }}>
              {notice}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
            {mode === 'signup' ? (
              <>
                <Field label="Full Name *" value={name} onChange={setName} placeholder="Maria Santos" />
                <Field label="Mobile Number *" value={phone} onChange={setPhone} type="tel" placeholder="09123456789" hint="You can sign in with this instead of your email" />
                <Field label="Email Address *" value={email} onChange={setEmail} type="email" placeholder="maria@example.com" />
              </>
            ) : (
              <Field label="Email or Mobile Number *" value={identifier} onChange={setIdentifier} placeholder="maria@example.com or 09123456789" />
            )}
            <Field label="Password *" value={password} onChange={setPassword} type="password" placeholder="••••••••" hint={mode === 'signup' ? 'Minimum 8 characters' : undefined} />
          </div>

          <ActionButton type="submit" variant="primary" disabled={busy}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </ActionButton>

          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#9CA3AF', margin: '1rem 0 0' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              style={{ background: 'none', border: 'none', color: PINK, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', fontFamily: FONT_BODY, padding: 0 }}
            >
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#F0F1F3' }} />
            <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>or</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#F0F1F3' }} />
          </div>

          <ActionButton variant="secondary" disabled={busy} onClick={() => { void handleGuest() }}>
            {guestLoading ? 'Please wait…' : 'Continue as Guest'}
          </ActionButton>
          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#9CA3AF', margin: '0.625rem 0 0', lineHeight: 1.5 }}>
            No account needed — just enough to complete this booking.
          </p>
        </form>
      </div>
    </div>
  )
}
