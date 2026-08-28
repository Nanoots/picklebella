import { useEffect, useState } from 'react'
import logoImg from '@/imports/opt/logo.webp'
import { getSession, onPasswordRecovery, updatePassword } from '../lib/auth'
import { G_DARK, G, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

interface Props {
  onDone: () => void
}

/* Where a "reset your password" email link lands. Supabase's own redirect
   processing (detectSessionInUrl) turns the link's token into a real signed-in
   session before this component can do anything about it — the PASSWORD_RECOVERY
   event is the cue that happened, checked here rather than assumed, since the
   same route with no token (or an expired one) has no session to work with. */
export default function ResetPasswordPage({ onDone }: Props) {
  const [checked, setChecked] = useState(false)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    const unsubscribe = onPasswordRecovery(() => { if (!cancelled) setReady(true) })
    // Belt and suspenders: if the event already fired before this effect
    // subscribed, a session will already exist.
    void getSession().then((s) => {
      if (cancelled) return
      if (s) setReady(true)
      setChecked(true)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: FONT_BODY, minHeight: '100vh', backgroundColor: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '24px', maxWidth: '420px', width: '100%', overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.1)' }}>
        <div style={{ backgroundColor: G_DARK, padding: '2rem 2rem 1.75rem', textAlign: 'center' }}>
          <img src={logoImg} alt="PickleBella Park" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.75rem', display: 'block', border: '2px solid rgba(255,255,255,0.15)' }} />
          <p style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>PickleBella Park</p>
        </div>

        <div style={{ padding: '2rem' }}>
          {!checked ? (
            <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '0.9rem' }}>Checking your link…</p>
          ) : done ? (
            <>
              <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', textAlign: 'center' }}>Password updated</h2>
              <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1.5rem', textAlign: 'center', lineHeight: 1.6 }}>
                You're signed in with your new password.
              </p>
              <button
                onClick={onDone}
                style={{ width: '100%', padding: '0.95rem', borderRadius: '999px', border: 'none', backgroundColor: G_DARK, color: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                Continue to PickleBella
              </button>
            </>
          ) : !ready ? (
            <>
              <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', textAlign: 'center' }}>Link expired</h2>
              <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1.5rem', textAlign: 'center', lineHeight: 1.6 }}>
                This password reset link is invalid or has already been used. Request a new one from the sign-in screen.
              </p>
              <button
                onClick={onDone}
                style={{ width: '100%', padding: '0.95rem', borderRadius: '999px', border: 'none', backgroundColor: G_DARK, color: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
              >
                Back to PickleBella
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', textAlign: 'center' }}>Set a new password</h2>
              <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1.5rem', textAlign: 'center' }}>Choose a new password for your account.</p>

              {error && (
                <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontSize: '0.85rem', padding: '0.7rem 0.9rem', borderRadius: '8px', marginBottom: '1rem', lineHeight: 1.55 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>New Password *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_BODY, color: '#111827' }}
                  />
                  <p style={{ fontSize: '0.78rem', color: '#9CA3AF', margin: '5px 0 0' }}>Minimum 8 characters</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Confirm Password *</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_BODY, color: '#111827' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '0.95rem', borderRadius: '999px', border: 'none', backgroundColor: loading ? '#D1D5DB' : G, color: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: FONT_BODY }}
              >
                {loading ? 'Saving…' : 'Save New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
