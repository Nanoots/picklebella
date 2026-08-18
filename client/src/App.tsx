import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import BookingPage from './pages/BookingPage'
import AdminPage from './pages/AdminPage'
import AuthModal from './components/AuthModal'
import AdminLoginModal from './components/AdminLoginModal'
import { getSession, onAuthChange, signOut } from './lib/auth'
import type { CustomerUser } from './lib/types'

export type User = CustomerUser
export type Page = 'home' | 'booking' | 'admin'

function pageFromPath(): Page {
  return window.location.pathname.replace(/\/+$/, '') === '/admin' ? 'admin' : 'home'
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromPath())
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  // Held until the stored session has been checked, so a signed-in visitor
  // landing on /admin isn't bounced to the landing page for a frame.
  const [authReady, setAuthReady] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showAdminAuth, setShowAdminAuth] = useState(false)
  const [pendingNav, setPendingNav] = useState(false)
  const [pendingCourtId, setPendingCourtId] = useState<string | null>(null)

  useEffect(() => {
    const onPop = () => setPage(pageFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    let cancelled = false
    void getSession().then((s) => {
      if (cancelled) return
      setUser(s?.user ?? null)
      setIsAdmin(s?.isAdmin ?? false)
      setAuthReady(true)
    })
    // Keeps this tab in step when the session is refreshed or ended elsewhere.
    const unsubscribe = onAuthChange((s) => {
      setUser(s?.user ?? null)
      setIsAdmin(s?.isAdmin ?? false)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  function navigate(next: Page) {
    setPage(next)
    const path = next === 'admin' ? '/admin' : '/'
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
    window.scrollTo(0, 0)
  }

  function handleReserve(courtId?: string) {
    setPendingCourtId(courtId ?? null)
    if (user) {
      navigate('booking')
    } else {
      setPendingNav(true)
      setShowAuth(true)
    }
  }

  function handleAuthSuccess(u: User) {
    setUser(u)
    setShowAuth(false)
    if (pendingNav) {
      navigate('booking')
      setPendingNav(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    setUser(null)
    setIsAdmin(false)
    navigate('home')
  }

  async function handleAdminSuccess() {
    const s = await getSession()
    setUser(s?.user ?? null)
    setIsAdmin(s?.isAdmin ?? false)
    setShowAdminAuth(false)
    navigate('admin')
  }

  async function handleAdminLogout() {
    await signOut()
    setUser(null)
    setIsAdmin(false)
    navigate('home')
  }

  if (!authReady) return null

  return (
    <>
      {page === 'admin' && isAdmin ? (
        <AdminPage onExit={() => navigate('home')} onLogout={() => { void handleAdminLogout() }} />
      ) : page === 'booking' && user ? (
        <BookingPage
          user={user}
          initialCourtId={pendingCourtId}
          onBack={() => { setPendingCourtId(null); navigate('home') }}
          onSignOut={() => { void handleSignOut() }}
        />
      ) : (
        <LandingPage
          user={user}
          onReserve={handleReserve}
          onSignIn={() => setShowAuth(true)}
          onSignOut={() => { void handleSignOut() }}
          onAdminSignIn={() => setShowAdminAuth(true)}
        />
      )}

      {showAuth && (
        <AuthModal
          onClose={() => {
            setShowAuth(false)
            setPendingNav(false)
          }}
          onSuccess={handleAuthSuccess}
        />
      )}

      {showAdminAuth && (
        <AdminLoginModal
          onClose={() => setShowAdminAuth(false)}
          onSuccess={() => { void handleAdminSuccess() }}
        />
      )}
    </>
  )
}
