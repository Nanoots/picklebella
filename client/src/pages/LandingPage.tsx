import { lazy, Suspense } from 'react'
import {
  ArrowRight, CalendarCheck, Clock, Coffee, LayoutGrid, Lightbulb, MapPin, Navigation,
  ParkingSquare, ShoppingBag, Sun, Wallet, Bath,
} from 'lucide-react'
import logoImg from '@/imports/opt/logo.webp'
import heroImg from '@/imports/landingimage.jpg'
import type { User } from '../App'
import * as api from '../lib/api'
import type { Court, DayHours, HoursConfig } from '../lib/types'
import { fmtHour, fmtMoney } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery'
import { ErrorBlock, LoadingBlock } from '../components/States'
import { VENUE_ADDRESS, VENUE_MAPS_URL } from '../lib/venue'
import { G_DARK, PINK, LIME, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

// Leaflet is heavy — loaded only once the location card actually renders,
// not folded into the landing page's initial bundle.
const VenueMapCard = lazy(() => import('../components/VenueMap'))

interface Props {
  user: User | null
  onReserve: (courtId?: string) => void
  onSignIn: () => void
  onSignOut: () => void
  onAdminSignIn: () => void
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

const AMENITIES = [
  { icon: ParkingSquare, label: 'Free Parking' },
  { icon: Lightbulb, label: 'Night Lighting' },
  { icon: Bath, label: 'Restrooms' },
  { icon: ShoppingBag, label: 'Paddle Rental' },
  { icon: Coffee, label: 'Refreshments' },
]

const INK = '#111827'
const MUTED = '#6B7280'
const LINE = '#EEF0EC'
const TINT = '#F1F8EA' // soft lime wash for highlight panels

function fmtClose(h: number) {
  return h === 24 || h === 0 ? 'Midnight' : fmtHour(h)
}

function dayValue(d: DayHours | undefined) {
  if (!d || d.closed) return 'Closed'
  return `${fmtHour(d.open)} – ${fmtClose(d.close)}`
}

function Card({ children, pad }: { children: React.ReactNode; pad: string }) {
  return (
    <div style={{ backgroundColor: 'white', border: `1px solid ${LINE}`, borderRadius: '18px', padding: pad, boxShadow: '0 1px 3px rgba(15,58,28,0.04)' }}>
      {children}
    </div>
  )
}

function CardHead({ icon: Icon, title, sub }: { icon: typeof Clock; title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
      <Icon size={24} strokeWidth={1.75} color={G_DARK} style={{ flexShrink: 0, marginTop: '2px' }} />
      <div style={{ minWidth: 0 }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, color: INK, fontSize: '1.35rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{title}</h2>
        {sub && <p style={{ color: MUTED, fontSize: '0.88rem', lineHeight: 1.55, margin: '0.3rem 0 0' }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function LandingPage({ user, onReserve, onSignIn, onSignOut, onAdminSignIn }: Props) {
  const isMobile = useIsMobile()
  const isNarrow = useIsNarrow()

  const venue = useAsync<{ courts: Court[]; hours: HoursConfig }>(async (signal) => {
    const [courts, config] = await Promise.all([api.getCourts(signal), api.getConfig(signal)])
    return { courts, hours: config.hours }
  }, [])

  const COURTS = venue.data?.courts ?? []
  const MIN_RATE = COURTS.length ? Math.min(...COURTS.map((c) => c.rate)) : 0
  const MAX_RATE = COURTS.length ? Math.max(...COURTS.map((c) => c.rate)) : 0
  const rateText = !venue.data ? '—' : MIN_RATE === MAX_RATE ? fmtMoney(MIN_RATE) : `${fmtMoney(MIN_RATE)} – ${fmtMoney(MAX_RATE)}`
  const allOutdoor = COURTS.length > 0 && COURTS.every((c) => c.type === 'Outdoor')
  const allIndoor = COURTS.length > 0 && COURTS.every((c) => c.type === 'Indoor')
  const envLabel = allOutdoor ? 'Outdoor' : allIndoor ? 'Indoor' : 'Indoor & Outdoor'
  const weekly = venue.data?.hours.weekly

  const gutter = isMobile ? '1rem' : '1.5rem'
  const cardPad = isMobile ? '1.25rem' : '1.75rem'

  const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem',
    borderRadius: '12px', fontFamily: FONT_BODY, fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
    fontSize: isMobile ? '0.95rem' : '1.02rem', padding: isMobile ? '0.85rem 1.25rem' : '0.95rem 1.6rem',
  }

  return (
    <div style={{ fontFamily: FONT_BODY, minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F7F8F5' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, backgroundColor: G_DARK, boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: `0 ${gutter}`, height: isMobile ? '58px' : '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <img src={logoImg} alt="PickleBella Park" style={{ height: isMobile ? '32px' : '40px', width: isMobile ? '32px' : '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <span style={{ fontFamily: FONT_DISPLAY, color: 'white', fontWeight: 700, fontSize: isMobile ? '1rem' : '1.1rem', letterSpacing: '-0.01em' }}>PickleBella</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.4rem' : '0.75rem', flexShrink: 0 }}>
            {user ? (
              <>
                {!isMobile && <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.85rem' }}>Hi, {user.name.split(' ')[0]}</span>}
                <button
                  onClick={onSignOut}
                  style={{ color: 'rgba(255,255,255,0.75)', background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '999px', padding: isMobile ? '0.4rem 0.7rem' : '0.4rem 1rem', fontSize: isMobile ? '0.75rem' : '0.8rem', cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={onSignIn}
                style={{ backgroundColor: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '999px', padding: isMobile ? '0.45rem 1rem' : '0.5rem 1.25rem', fontSize: isMobile ? '0.8rem' : '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
              >
                Sign In
              </button>
            )}
            <button
              onClick={() => onReserve()}
              style={{ backgroundColor: PINK, color: 'white', border: 'none', borderRadius: '999px', padding: isMobile ? '0.45rem 0.9rem' : '0.5rem 1.25rem', fontSize: isMobile ? '0.78rem' : '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
            >
              Book Now
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', overflow: 'hidden', backgroundColor: G_DARK, marginTop: isMobile ? '58px' : '64px' }}>
        <img
          src={heroImg}
          alt="Players rallying on an outdoor pickleball court"
          fetchPriority="high"
          decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: isMobile ? '62% center' : 'center 40%' }}
        />
        <div
          style={{
            position: 'absolute', inset: 0,
            background: isMobile
              ? 'linear-gradient(180deg, rgba(8,24,12,0.55) 0%, rgba(8,24,12,0.88) 100%)'
              : 'linear-gradient(90deg, rgba(8,24,12,0.94) 0%, rgba(8,24,12,0.78) 38%, rgba(8,24,12,0.25) 75%, rgba(8,24,12,0.1) 100%)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: isMobile ? `3.25rem ${gutter} 2.75rem` : `5rem ${gutter} 4.5rem` }}>
          <h1 style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: 'clamp(2.2rem, 6vw, 3.6rem)', fontWeight: 700, margin: 0, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            PickleBella Park
          </h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'rgba(255,255,255,0.85)', fontSize: isMobile ? '1rem' : '1.15rem', margin: '0.8rem 0 1.4rem' }}>
            <MapPin size={20} fill="white" color={G_DARK} style={{ flexShrink: 0 }} />
            Isulan, Sultan Kudarat
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: isMobile ? '1.75rem' : '2.25rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.95rem', borderRadius: '999px', border: `1px solid ${LIME}`, backgroundColor: 'rgba(122,194,49,0.14)', color: 'white', fontSize: '0.88rem', fontWeight: 500 }}>
              <Sun size={16} color={LIME} /> {venue.data ? envLabel : 'Outdoor'} Pickleball
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.95rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.35)', color: 'white', fontSize: '0.88rem', fontWeight: 500 }}>
              <LayoutGrid size={16} /> {venue.data ? `${COURTS.length} Court${COURTS.length === 1 ? '' : 's'}` : 'Courts'}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              onClick={() => onReserve()}
              style={{ ...btnBase, backgroundColor: PINK, color: 'white', border: 'none', boxShadow: '0 8px 24px rgba(232,24,122,0.35)' }}
            >
              <CalendarCheck size={20} /> Book a Court <ArrowRight size={18} />
            </button>
            <a
              href={VENUE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btnBase, backgroundColor: 'rgba(255,255,255,0.06)', color: 'white', border: '1.5px solid rgba(255,255,255,0.6)' }}
            >
              <Navigation size={18} /> Get Directions
            </a>
          </div>
        </div>
      </section>

      {/* BODY */}
      <main style={{ flex: 1, width: '100%', maxWidth: '1200px', margin: '0 auto', padding: isMobile ? `1.5rem ${gutter} 2.5rem` : `2.5rem ${gutter} 4rem`, boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0,1fr)' : 'minmax(0,1.75fr) minmax(0,1fr)', gap: isMobile ? '1rem' : '1.5rem', alignItems: 'start' }}>

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1rem' : '1.5rem', minWidth: 0 }}>
            <Card pad={cardPad}>
              <CardHead icon={LayoutGrid} title="Courts & Rates" sub="Standard hourly rate per court. Peak hours may be priced differently — the booking screen always shows the exact amount." />
              {venue.loading && <LoadingBlock label="Loading courts…" pad="1.5rem" />}
              {venue.error && <ErrorBlock message={venue.error} onRetry={venue.reload} pad="1.25rem" />}
              {venue.data && (
                <div style={{ border: `1px solid ${LINE}`, borderRadius: '12px', overflow: 'hidden' }}>
                  {!isMobile && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.3fr auto', gap: '1rem', padding: '0.75rem 1.1rem', backgroundColor: '#FAFBF8', color: MUTED, fontSize: '0.8rem', fontWeight: 500 }}>
                      <span>Court</span><span>Setting</span><span>Surface</span><span>Rate</span>
                    </div>
                  )}
                  {COURTS.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => onReserve(c.id)}
                      title={`Book ${c.name}`}
                      style={{
                        display: 'grid', width: '100%', textAlign: 'left', background: 'white', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY,
                        borderTop: i === 0 && isMobile ? 'none' : `1px solid ${LINE}`,
                        gridTemplateColumns: isMobile ? '1fr auto' : '1.1fr 1fr 1.3fr auto',
                        gap: isMobile ? '0.2rem 1rem' : '1rem', alignItems: 'center',
                        padding: isMobile ? '0.9rem 1rem' : '1rem 1.1rem',
                      }}
                    >
                      <span style={{ color: INK, fontWeight: 700, fontSize: '0.95rem' }}>{c.name}</span>
                      {isMobile ? (
                        <>
                          <span style={{ color: INK, fontWeight: 700, fontSize: '0.92rem', textAlign: 'right' }}>{fmtMoney(c.rate)} / hour</span>
                          <span style={{ color: MUTED, fontSize: '0.8rem', gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Sun size={14} /> {c.type} · {c.surface}
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: MUTED, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><Sun size={16} /> {c.type}</span>
                          <span style={{ color: MUTED, fontSize: '0.92rem' }}>{c.surface}</span>
                          <span style={{ color: INK, fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>{fmtMoney(c.rate)} / hour</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card pad={cardPad}>
              <CardHead icon={Lightbulb} title="Amenities" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.5rem' }}>
                {AMENITIES.map(({ icon: Icon, label }) => (
                  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', color: INK, fontSize: '0.95rem' }}>
                    <span style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: TINT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={18} color={G_DARK} />
                    </span>
                    {label}
                  </span>
                ))}
              </div>
            </Card>

            <Card pad={cardPad}>
              <CardHead icon={MapPin} title="Location" sub={VENUE_ADDRESS} />
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${LINE}`, marginBottom: '1.1rem' }}>
                <Suspense fallback={<div style={{ height: isMobile ? 200 : 260, backgroundColor: '#F3F4F6' }} />}>
                  <VenueMapCard height={isMobile ? 200 : 260} />
                </Suspense>
              </div>
              <a
                href={VENUE_MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btnBase, fontSize: '0.92rem', padding: '0.7rem 1.2rem', backgroundColor: 'white', color: INK, border: '1.5px solid #E2E5DE' }}
              >
                <Navigation size={16} /> Get Directions <ArrowRight size={16} />
              </a>
            </Card>
          </div>

          {/* RIGHT COLUMN */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1rem' : '1.5rem', minWidth: 0, position: isNarrow ? 'static' : 'sticky', top: '88px' }}>
            <Card pad={cardPad}>
              <CardHead icon={CalendarCheck} title="Ready to Play?" sub="Pick a time, pay online, and your court is locked in." />
              <div style={{ backgroundColor: TINT, borderRadius: '12px', padding: '0.25rem 1.1rem', marginBottom: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 0', borderBottom: '1px solid rgba(15,58,28,0.08)', color: INK, fontWeight: 600 }}>
                  <LayoutGrid size={20} color={G_DARK} />
                  {venue.data ? `${COURTS.length} ${envLabel} Court${COURTS.length === 1 ? '' : 's'}` : '—'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 0', color: INK, fontWeight: 600 }}>
                  <Wallet size={20} color={G_DARK} />
                  {rateText} / hour
                </div>
              </div>
              <button
                onClick={() => onReserve()}
                style={{ ...btnBase, width: '100%', backgroundColor: PINK, color: 'white', border: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#C31468' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = PINK }}
              >
                Check Availability &amp; Book <ArrowRight size={18} />
              </button>
              <p style={{ color: MUTED, fontSize: '0.8rem', textAlign: 'center', margin: '0.85rem 0 0', lineHeight: 1.5 }}>
                Pay with GCash, Maya or QR Ph.
              </p>
            </Card>

            <Card pad={cardPad}>
              <CardHead icon={Clock} title="Opening Hours" />
              {venue.loading && <LoadingBlock label="Loading hours…" pad="1.25rem" />}
              {weekly && (
                <div>
                  {MONDAY_FIRST.map((dow, i) => {
                    const value = dayValue(weekly[dow])
                    return (
                      <div key={dow} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.65rem 0', borderTop: i === 0 ? 'none' : `1px solid ${LINE}`, fontSize: '0.92rem' }}>
                        <span style={{ color: INK, fontWeight: 500 }}>{DAY_NAMES[dow]}</span>
                        <span style={{ color: value === 'Closed' ? '#DC2626' : MUTED, whiteSpace: 'nowrap' }}>{value}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ backgroundColor: '#081810', padding: isMobile ? `1.5rem ${gutter}` : `1.75rem ${gutter}` }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src={logoImg} alt="" style={{ height: '28px', width: '28px', borderRadius: '50%', objectFit: 'cover' }} />
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem' }}>© 2026 PickleBella Park</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <a href="mailto:hello@picklebella.ph" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', textDecoration: 'none' }}>hello@picklebella.ph</a>
            <button onClick={onAdminSignIn} style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, padding: 0 }}>Admin</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
