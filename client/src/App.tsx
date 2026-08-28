import { lazy, Suspense, useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import AuthModal from './components/AuthModal'
import AdminLoginModal from './components/AdminLoginModal'
import PaymentReturn from './components/PaymentReturn'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { LoadingBlock } from './components/States'

/* The landing page is what a first-time visitor loads, and it needs neither of
   these. Split out, the admin dashboard (which pulls in every admin view and
   the icon set) and the booking grid are fetched only by the people who
   actually open them, instead of riding along in everyone's first download. */
const BookingPage = lazy(() => import('./pages/BookingPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
import { getSession, onAuthChange, signOut } from './lib/auth'
import type { CustomerUser } from './lib/types'

export type User = CustomerUser
export type Page = 'home' | 'booking' | 'admin' | 'reset-password'

function pageFromPath(): Page {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path === '/admin') return 'admin'
  if (path === '/reset-password') return 'reset-password'
  return 'home'
}

/**
 * The payment intent the wallet sent the customer back with, if any.
 *
 * Only ever used as a lookup key — PaymentReturn asks the server what actually
 * happened rather than believing the query string.
 */
function paymentFromQuery(): string | null {
  const value = new URLSearchParams(window.location.search).get('payment')
  return value && value.trim() ? value.trim() : null
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromPath())
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(paymentFromQuery)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  // Held until the stored session has been checked, so a signed-in visitor
  // landing on /admin isn't bounced to the landing page for a frame.
  const [authReady, setAuthReady] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showAdminAuth, setShowAdminAuth] = useState(false)
  const [pendingCourtId, setPendingCourtId] = useState<string | null>(null)

  useEffect(() => {
    const onPop = () => {
      setPage(pageFromPath())
      setPaymentIntentId(paymentFromQuery())
    }
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
    // Any navigation leaves the payment result behind, query string included —
    // a stale ?payment= would otherwise re-open the receipt on every visit.
    setPaymentIntentId(null)
    const path = next === 'admin' ? '/admin' : '/'
    // Compared against pathname + search, not pathname alone: returning home
    // from `/?payment=pi_123` is a real navigation even though the path itself
    // has not changed, and leaving the query behind would bring the receipt
    // back on the next render.
    if (window.location.pathname + window.location.search !== path) {
      window.history.pushState({}, '', path)
    }
    window.scrollTo(0, 0)
  }

  /* Browsing the booking grid never required an account — the sign-in
     prompt only used to fire here, before the visitor had seen a single
     court or time slot. It now waits until they actually try to pay (see
     BookingModal's onRequireAuth), so someone can look around the site
     first and decide. */
  function handleReserve(courtId?: string) {
    setPendingCourtId(courtId ?? null)
    navigate('booking')
  }

  function handleAuthSuccess(u: User) {
    setUser(u)
    setShowAuth(false)
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

  // Reached only via the link in a password-reset email, so it bypasses
  // every other page state — there is nothing else a fresh click on that
  // link could sensibly mean.
  if (page === 'reset-password') {
    return <ResetPasswordPage onDone={() => navigate('home')} />
  }

  /* Back from GCash / Maya / QR Ph.

     A fresh page load lands here with `page` still computed from the bare
     pathname (pageFromPath ignores the query string), so this is checked
     independently of `page` rather than as another branch of it — otherwise
     the very first render after a payment redirect would show the landing
     page underneath instead of the booking page. Gated on being signed in:
     the status endpoint only answers for the account that owns the booking,
     and a signed-out visitor has nothing here to poll for anyway. */
  const showPaymentReturn = Boolean(paymentIntentId && user)

  return (
    <>
      {page === 'admin' && isAdmin ? (
        <Suspense fallback={<LoadingBlock label="Loading admin…" pad="6rem" />}>
          <AdminPage onExit={() => navigate('home')} onLogout={() => { void handleAdminLogout() }} />
        </Suspense>
      ) : page === 'booking' || showPaymentReturn ? (
        <Suspense fallback={<LoadingBlock label="Loading courts…" pad="6rem" />}>
          <BookingPage
            user={user}
            initialCourtId={pendingCourtId}
            // Landing here fresh off a payment confirmation should show the
            // booking it just made, not the empty court grid.
            initialTab={showPaymentReturn ? 'Bookings' : undefined}
            onBack={() => { setPendingCourtId(null); navigate('home') }}
            onSignIn={() => setShowAuth(true)}
            onSignOut={() => { void handleSignOut() }}
          />
        </Suspense>
      ) : (
        <LandingPage
          user={user}
          onReserve={handleReserve}
          onSignIn={() => setShowAuth(true)}
          onSignOut={() => { void handleSignOut() }}
          onAdminSignIn={() => setShowAdminAuth(true)}
        />
      )}

      {/* Rendered on top of the booking page above, not in place of it — the
          site's own nav and grid stay visible behind the confirmation. */}
      {showPaymentReturn && paymentIntentId && (
        <PaymentReturn
          intentId={paymentIntentId}
          onDone={() => navigate('booking')}
        />
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
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
