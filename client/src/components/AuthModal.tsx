import { useState } from 'react'
import logoImg from '@/imports/logo.jpg'
import type { User } from '../App'
import { signIn, signUp } from '../lib/auth'
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
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
          border: `1.5px solid ${focused ? G : '#E5E7EB'}`,
          fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
          fontFamily: FONT_BODY, color: '#111827', backgroundColor: 'white',
          transition: 'border-color 0.15s',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint && <p style={{ fontSize: '0.72rem', color: '#9CA3AF', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  )
}

export default function AuthModal({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  function switchMode(m: 'signin' | 'signup') {
    setMode(m)
    setError('')
    setNotice('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
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
      if (!email.trim() || !password.trim()) { setError('Please fill in all fields.'); return }
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

      const user = await signIn(email, password)
      onSuccess(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ backgroundColor: 'white', borderRadius: '24px', maxWidth: '420px', width: '100%', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>

        {/* Brand Header */}
        <div style={{ backgroundColor: G_DARK, padding: '2rem 2rem 1.75rem', textAlign: 'center' }}>
          <img src={logoImg} alt="PickleBella Park" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.75rem', display: 'block', border: '2px solid rgba(255,255,255,0.15)' }} />
          <p style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>PickleBella Park</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: '0.12em', margin: '4px 0 0' }}>DINK · SMASH · ENJOY</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6' }}>
          {(['signin', 'signup'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => switchMode(tab)}
              style={{
                flex: 1, padding: '0.9rem', fontSize: '0.875rem', fontWeight: 600, border: 'none',
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
            <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontSize: '0.8rem', padding: '0.625rem 0.875rem', borderRadius: '8px', marginBottom: '1rem', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {notice && (
            <div style={{ backgroundColor: '#DCFCE7', color: '#15803D', fontSize: '0.8rem', padding: '0.625rem 0.875rem', borderRadius: '8px', marginBottom: '1rem', lineHeight: 1.5 }}>
              {notice}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.25rem' }}>
            {mode === 'signup' && (
              <Field label="Full Name *" value={name} onChange={setName} placeholder="Maria Santos" />
            )}
            <Field label="Email Address *" value={email} onChange={setEmail} type="email" placeholder="maria@example.com" />
            {mode === 'signup' && (
              <Field label="Mobile Number *" value={phone} onChange={setPhone} type="tel" placeholder="09123456789" hint="Used for booking confirmations" />
            )}
            <Field label="Password *" value={password} onChange={setPassword} type="password" placeholder="••••••••" hint={mode === 'signup' ? 'Minimum 8 characters' : undefined} />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.9rem', borderRadius: '999px', border: 'none',
              backgroundColor: loading ? '#D1D5DB' : G, color: 'white',
              fontSize: '0.9rem', fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              fontFamily: FONT_BODY, transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#9CA3AF', margin: '1rem 0 0' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              style={{ background: 'none', border: 'none', color: PINK, fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem', fontFamily: FONT_BODY, padding: 0 }}
            >
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
