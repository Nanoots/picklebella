import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import logoImg from '@/imports/opt/logo.webp'
import type { User } from '../App'
import { continueAsGuest, requestPasswordReset, signIn, signInWithGoogle, signUp } from '../lib/auth'
import { G_DARK, G, PINK, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

/** The official Google "G" mark — not in lucide-react, which carries no
 * brand logos. Colors are Google's fixed brand colors, not theme tokens. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.79 2.73v2.27h2.9c1.7-1.56 2.69-3.87 2.69-6.64z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.27c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.34C2.46 15.98 5.48 18 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.69A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.69V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.46 2.02.98 4.97l2.97 2.34C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  )
}

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
  // Only a password field ever gets the reveal toggle — everything else
  // keeps rendering as whatever `type` it was given.
  const isPassword = type === 'password'
  const [revealed, setRevealed] = useState(false)
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: isPassword ? '0.85rem 2.75rem 0.85rem 1rem' : '0.85rem 1rem', borderRadius: '10px',
            border: `1.5px solid ${focused ? G : '#E5E7EB'}`,
            fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
            fontFamily: FONT_BODY, color: '#111827', backgroundColor: 'white',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            boxShadow: focused ? `0 0 0 3px ${G}1a` : 'none',
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed(v => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute', top: 0, right: 0, height: '100%', width: '2.75rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0,
            }}
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
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
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('') // sign-in: email or mobile number
  const [email, setEmail] = useState('') // sign-up: optional
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [forgotEmail, setForgotEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const busy = loading || guestLoading || googleLoading

  function switchMode(m: 'signin' | 'signup' | 'forgot') {
    setMode(m)
    setError('')
    setNotice('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setNotice('')

    if (mode === 'forgot') {
      if (!forgotEmail.trim()) { setError('Please enter your email address.'); return }
      setLoading(true)
      try {
        await requestPasswordReset(forgotEmail)
        // Supabase does not reveal whether the address has an account —
        // the same notice covers both, so this can't be used to check who
        // has signed up here.
        setNotice("If that email has an account, we've sent a link to reset the password.")
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
      return
    }

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

      const user = await signIn(identifier, password, rememberMe)
      onSuccess(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (busy) return
    setError('')
    setNotice('')
    setGoogleLoading(true)
    try {
      // Navigates away to Google on success — nothing left to do here. Only
      // an immediate failure (e.g. the provider isn't configured) reaches
      // the catch; a mid-flow cancel just returns the visitor to this page
      // with no session, which onAuthChange in App.tsx already handles.
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue with Google. Please try again.')
      setGoogleLoading(false)
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

        {/* Tabs — replaced by a back link once in the forgot-password view,
            since Sign In / Sign Up don't apply there. */}
        {mode === 'forgot' ? (
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #F3F4F6' }}>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '0.85rem', fontFamily: FONT_BODY, padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              ← Back to Sign In
            </button>
          </div>
        ) : (
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
        )}

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

          {mode === 'forgot' ? (
            <>
              <p style={{ fontSize: '0.88rem', color: '#6B7280', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
                Enter the email address on your account and we'll send you a link to reset your password.
              </p>
              <div style={{ marginBottom: '1.25rem' }}>
                <Field label="Email Address *" value={forgotEmail} onChange={setForgotEmail} type="email" placeholder="maria@example.com" />
              </div>
              <ActionButton type="submit" variant="primary" disabled={busy}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </ActionButton>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => { void handleGoogle() }}
                style={{
                  width: '100%', padding: '0.85rem', borderRadius: '999px', marginBottom: '1.25rem',
                  border: '1.5px solid #E5E7EB', backgroundColor: busy ? '#F9FAFB' : 'white',
                  color: '#374151', fontSize: '0.92rem', fontWeight: 600, fontFamily: FONT_BODY,
                  cursor: busy ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                }}
              >
                <GoogleIcon />
                {googleLoading ? 'Redirecting…' : 'Continue with Google'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#F0F1F3' }} />
                <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>or</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#F0F1F3' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: mode === 'signin' ? '0.75rem' : '1.25rem' }}>
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

              {mode === 'signin' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      style={{ width: '15px', height: '15px', accentColor: G, cursor: 'pointer' }}
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    style={{ background: 'none', border: 'none', color: PINK, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', fontFamily: FONT_BODY, padding: 0 }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

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
            </>
          )}
        </form>
      </div>
    </div>
  )
}
