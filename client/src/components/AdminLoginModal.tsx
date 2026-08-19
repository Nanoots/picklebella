import { useState } from 'react'
import logoImg from '@/imports/logo.jpg'
import { signIn, getSession, signOut } from '../lib/auth'
import { G_DARK, G, PINK, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function AdminLoginModal({ onClose, onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      // Signing in proves who you are, not that you are staff. The server
      // decides that, and a non-staff account gets signed straight back out
      // rather than being left holding a session it can do nothing with here.
      const session = await getSession()
      if (!session?.isAdmin) {
        await signOut()
        setError('This account does not have staff access.')
        return
      }
      onSuccess()
    } catch {
      // One message for every failure mode, so a wrong address and a wrong
      // password are indistinguishable to someone probing for staff accounts.
      setError('Incorrect email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="pb-sheet" style={{ backgroundColor: 'white', borderRadius: '24px', maxWidth: '380px', width: '100%', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ backgroundColor: G_DARK, padding: '2rem 2rem 1.75rem', textAlign: 'center' }}>
          <img src={logoImg} alt="PickleBella Park" style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.75rem', display: 'block', border: '2px solid rgba(255,255,255,0.15)' }} />
          <p style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Admin Sign In</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: '0.1em', margin: '4px 0 0' }}>STAFF ACCESS ONLY</p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {error && (
            <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontSize: '0.8rem', padding: '0.625rem 0.875rem', borderRadius: '8px', marginBottom: '1rem', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="staff@picklebellapark.com"
                autoComplete="username"
                autoFocus
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_BODY, color: '#111827' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_BODY, color: '#111827' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.9rem', borderRadius: '999px', border: 'none', backgroundColor: G, color: 'white', fontSize: '0.9rem', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: FONT_BODY }}
          >
            {loading ? 'Signing in…' : 'Log In'}
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{ display: 'block', margin: '1rem auto 0', color: PINK, fontSize: '0.78rem', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY }}
          >
            ← Back to site
          </button>
        </form>
      </div>
    </div>
  )
}
