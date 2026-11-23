import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin, Navigation } from 'lucide-react'
import logoImg from '@/imports/opt/logo.webp'
import heroLogoImg from '@/imports/opt/logo-hero.webp'
import heroFallback1 from '@/imports/opt/Court123.webp'
import heroFallback2 from '@/imports/opt/Court_1_2_3.webp'
import type { User } from '../App'
import * as api from '../lib/api'
import type { Court, DayHours, HoursConfig, SiteImages, SlotStatus } from '../lib/types'
import { fmtHour, fmtMoney, todayStr } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useSiteImages } from '../lib/siteImages'
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery'
import { ErrorBlock, LoadingBlock } from '../components/States'
import { VENUE_ADDRESS, VENUE_MAPS_URL } from '../lib/venue'
import { G_DARK, PINK, LIME, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

// Leaflet is heavy — loaded only once the visit section renders.
const VenueMapCard = lazy(() => import('../components/VenueMap'))

// Used only until the admin uploads landing-page photos (Admin → Images →
// Landing page); uploaded photos replace these entirely.
const FALLBACK_HERO = [heroFallback1, heroFallback2]
const HOLD_MS = 7000
const FADE_MS = 1400

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

const INK = '#0E1A12'
const PAPER = '#F6F4EE'
const NIGHT = '#0A2413'

interface Props {
  user: User | null
  onReserve: (courtId?: string) => void
  onSignIn: () => void
  onSignOut: () => void
  onAdminSignIn: () => void
}

/** Cycles the hero photos. The current photo stays fully opaque underneath
 * while the next one fades in on top, so the dark overlay never shows
 * through mid-transition. */
function useSlideshow(count: number) {
  const [index, setIndex] = useState(0)
  const [incoming, setIncoming] = useState<number | null>(null)
  const [shown, setShown] = useState(false)
  const ref = useRef(0)
  ref.current = index

  useEffect(() => {
    setIndex(0)
    setIncoming(null)
    if (count < 2) return
    let raf = 0
    let settle = 0
    const tick = setInterval(() => {
      const next = (ref.current + 1) % count
      setShown(false)
      setIncoming(next)
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setShown(true)) })
      settle = window.setTimeout(() => { setIndex(next); setIncoming(null) }, FADE_MS)
    }, HOLD_MS)
    return () => { clearInterval(tick); cancelAnimationFrame(raf); clearTimeout(settle) }
  }, [count])

  return { index, incoming, shown }
}

function closeLabel(h: number) {
  return h === 24 || h === 0 ? 'midnight' : fmtHour(h)
}

function todaysHours(hours: HoursConfig, date: string): DayHours | undefined {
  const holiday = hours.holidays.find((h) => h.date === date)
  if (holiday) return holiday
  return hours.weekly[new Date().getDay()]
}

/** "Open now · until midnight", "Opens 6:00 AM", "Closed today". */
function liveStatus(day: DayHours | undefined) {
  if (!day || day.closed) return { open: false, text: 'Closed today' }
  const now = new Date().getHours()
  const close = day.close === 0 ? 24 : day.close
  if (now >= day.open && now < close) return { open: true, text: `Open now · until ${closeLabel(day.close)}` }
  if (now < day.open) return { open: false, text: `Opens today at ${fmtHour(day.open)}` }
  return { open: false, text: 'Closed for tonight' }
}

/** A top-down pickleball court drawn to proportion (20ft × 44ft, 7ft kitchens). */
function CourtDiagram({ color }: { color: string }) {
  const W = 220, H = 100, P = 6
  const cw = W - P * 2, ch = H - P * 2
  const net = W / 2
  const kitchen = (7 / 44) * cw
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} aria-hidden="true">
      <rect x="0" y="0" width={W} height={H} rx="10" fill={color} opacity="0.35" />
      <rect x={P} y={P} width={cw} height={ch} fill={color} stroke="white" strokeWidth="1.6" />
      <rect x={net - kitchen} y={P} width={kitchen * 2} height={ch} fill="rgba(255,255,255,0.12)" stroke="white" strokeWidth="1.2" />
      <line x1={P} y1={H / 2} x2={net - kitchen} y2={H / 2} stroke="white" strokeWidth="1.2" />
      <line x1={net + kitchen} y1={H / 2} x2={W - P} y2={H / 2} stroke="white" strokeWidth="1.2" />
      <line x1={net} y1={P - 3} x2={net} y2={H - P + 3} stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const SLOT_COLOR: Record<SlotStatus | 'past', string> = {
  available: LIME,
  booked: PINK,
  blocked: 'rgba(255,255,255,0.14)',
  closed: 'rgba(255,255,255,0.08)',
  past: 'rgba(255,255,255,0.14)',
}

function Kicker({ children, color = PINK }: { children: React.ReactNode; color?: string }) {
  return (
    <p style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 0.9rem' }}>
      <span style={{ width: '22px', height: '2px', backgroundColor: color, borderRadius: '2px' }} />
      {children}
    </p>
  )
}

export default function LandingPage({ user, onReserve, onSignIn, onSignOut, onAdminSignIn }: Props) {
  const today = todayStr()
  const isMobile = useIsMobile()
  const isNarrow = useIsNarrow()
  const gutter = isMobile ? '1.1rem' : '2rem'

  const venue = useAsync<{ courts: Court[]; hours: HoursConfig; images?: SiteImages }>(async (signal) => {
    const [courts, config] = await Promise.all([api.getCourts(signal), api.getConfig(signal)])
    return { courts, hours: config.hours, images: config.images }
  }, [])

  // Today's grid is decorative: if it fails the board still shows the courts.
  const todayGrid = useAsync<Record<string, api.AvailabilityResponse>>(
    (signal) => api.getAvailabilityAll(today, signal).catch(() => ({})),
    [today],
  )

  const siteImages = useSiteImages(venue.data?.images)
  const uploaded = siteImages.hero.map((i) => i.url)
  const slides = uploaded.length ? uploaded : FALLBACK_HERO
  const show = useSlideshow(slides.length)

  const courts = venue.data?.courts ?? []
  const minRate = courts.length ? Math.min(...courts.map((c) => c.rate)) : 0
  const status = venue.data ? liveStatus(todaysHours(venue.data.hours, today)) : null
  const nowHour = new Date().getHours()
  const todayDow = new Date().getDay()

  return (
    <div style={{ fontFamily: FONT_BODY, minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: PAPER, color: INK }}>

      {/* NAV — transparent over the hero photo */}
      <nav style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: `0 ${gutter}`, height: isMobile ? '64px' : '80px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <img src={logoImg} alt="PickleBella Park" style={{ height: isMobile ? '36px' : '42px', width: isMobile ? '36px' : '42px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 2px rgba(255,255,255,0.25)' }} />
            <span style={{ fontFamily: FONT_DISPLAY, color: 'white', fontWeight: 700, fontSize: isMobile ? '1.05rem' : '1.2rem', letterSpacing: '-0.01em' }}>PickleBella</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            {user && !isMobile && <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.88rem' }}>Hi, {user.name.split(' ')[0]}</span>}
            <button
              onClick={user ? onSignOut : onSignIn}
              style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '999px', padding: isMobile ? '0.45rem 1rem' : '0.55rem 1.3rem', fontSize: isMobile ? '0.8rem' : '0.88rem', fontWeight: 500, cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
            >
              {user ? 'Sign Out' : 'Sign In'}
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pb-hero" style={{ position: 'relative', overflow: 'hidden', backgroundColor: NIGHT, display: 'flex', alignItems: 'flex-end' }}>
        <img src={slides[show.index]} alt="PickleBella Park courts" fetchPriority="high" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        {show.incoming !== null && (
          <img
            src={slides[show.incoming]}
            alt=""
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: show.shown ? 1 : 0, transform: show.shown ? 'scale(1)' : 'scale(1.04)', transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease` }}
          />
        )}
        {/* Black from the left, fading out toward the right of the photo */}
        <div
          style={{
            position: 'absolute', inset: 0,
            background: isMobile
              ? 'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.35) 100%)'
              : 'linear-gradient(90deg, #000 0%, rgba(0,0,0,0.92) 22%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0) 100%)',
          }}
        />
        {/* Bottom fade so the hero blends into the dark court board below */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 65%, rgba(10,36,19,0.9) 100%)' }} />

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '1280px', margin: '0 auto', padding: isMobile ? `7rem ${gutter} 2rem` : `9rem ${gutter} 3rem`, boxSizing: 'border-box' }}>
          {status && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', padding: '0.4rem 0.9rem 0.4rem 0.75rem', borderRadius: '999px', backgroundColor: 'rgba(10,36,19,0.55)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.18)', color: 'white', fontSize: '0.82rem', fontWeight: 500, marginBottom: '1.4rem' }}>
              <span className={status.open ? 'pb-live-dot' : undefined} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: status.open ? LIME : '#F59E0B' }} />
              {status.text}
            </span>
          )}

          <h1 style={{ margin: 0, lineHeight: 0 }}>
            <img
              src={heroLogoImg}
              alt="PickleBella Park"
              decoding="async"
              style={{ display: 'block', width: isMobile ? 'min(62vw, 240px)' : 'clamp(260px, 26vw, 380px)', height: 'auto', filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.5))' }}
            />
          </h1>

          <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', alignItems: isNarrow ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: isMobile ? '1.5rem' : '2rem', marginTop: isMobile ? '1.25rem' : '1.75rem' }}>
            <div style={{ maxWidth: '520px' }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: isMobile ? '1rem' : '1.15rem', lineHeight: 1.6, margin: '0 0 1.6rem' }}>
                Three outdoor courts in Isulan, Sultan Kudarat. Grab a slot, pay with GCash or Maya, and just show up with your paddle.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  onClick={() => onReserve()}
                  className="pb-cta"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', backgroundColor: PINK, color: 'white', border: 'none', borderRadius: '999px', padding: isMobile ? '0.95rem 1.6rem' : '1.05rem 1.9rem', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, boxShadow: '0 10px 30px rgba(232,24,122,0.4)' }}
                >
                  Reserve a court <ArrowRight size={18} />
                </button>
                <a
                  href="#today"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: 'white', textDecoration: 'none', fontSize: '0.95rem', fontWeight: 500, padding: '0.9rem 0.5rem' }}
                >
                  See today's openings <ArrowDown size={16} />
                </a>
              </div>
            </div>

            {/* Fact strip */}
            <div style={{ display: 'flex', gap: isMobile ? '1.25rem' : '2.25rem', padding: isMobile ? '0.9rem 1.1rem' : '1.1rem 1.6rem', borderRadius: '18px', backgroundColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.14)' }}>
              {[
                { k: venue.data ? String(courts.length) : '—', v: 'Courts' },
                { k: venue.data ? fmtMoney(minRate) : '—', v: 'From / hour' },
              ].map((f) => (
                <div key={f.v}>
                  <div style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: isMobile ? '1.3rem' : '1.7rem', fontWeight: 700, lineHeight: 1.1 }}>{f.k}</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: '4px', whiteSpace: 'nowrap' }}>{f.v}</div>
                </div>
              ))}
            </div>
          </div>

          {slides.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: isMobile ? '1.75rem' : '2.5rem' }} aria-hidden="true">
              {slides.map((_, i) => (
                <span key={i} style={{ height: '3px', width: i === (show.incoming ?? show.index) ? '34px' : '14px', borderRadius: '3px', backgroundColor: i === (show.incoming ?? show.index) ? 'white' : 'rgba(255,255,255,0.35)', transition: 'all 0.6s ease' }} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TODAY'S COURT BOARD */}
      <section id="today" style={{ backgroundColor: NIGHT, padding: isMobile ? `3rem ${gutter} 3.25rem` : `4.5rem ${gutter} 5rem`, scrollMarginTop: '1rem' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem 2rem', marginBottom: '2rem' }}>
            <div>
              <Kicker color={LIME}>On court today</Kicker>
              <h2 style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0 }}>
                Pick your court.
              </h2>
            </div>
            <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap', color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
              {[['Open', LIME], ['Booked', PINK], ['Unavailable', 'rgba(255,255,255,0.18)']].map(([l, c]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: c }} />{l}
                </span>
              ))}
            </div>
          </div>

          {venue.loading && <LoadingBlock label="Loading courts…" />}
          {venue.error && <ErrorBlock message={venue.error} onRetry={venue.reload} />}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: isMobile ? '1rem' : '1.25rem' }}>
            {courts.map((c) => {
              const grid = todayGrid.data?.[c.id]
              const hours = grid ? Object.keys(grid.slots).map(Number).sort((a, b) => a - b) : []
              const next = hours.find((h) => h >= nowHour && grid!.slots[h] === 'available')
              return (
                <button
                  key={c.id}
                  onClick={() => onReserve(c.id)}
                  className="pb-court-card"
                  style={{ textAlign: 'left', cursor: 'pointer', fontFamily: FONT_BODY, color: 'white', backgroundColor: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '22px', padding: isMobile ? '1.1rem' : '1.35rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
                >
                  <CourtDiagram color={c.color} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.15 }}>{c.name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.82rem', marginTop: '3px' }}>{c.type} · {c.surface}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.15 }}>{fmtMoney(c.rate)}</div>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', marginTop: '3px' }}>per hour</div>
                    </div>
                  </div>

                  {/* Today's hour ribbon */}
                  <div>
                    {hours.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {hours.map((h) => {
                            const s = grid!.slots[h]!
                            const past = h < nowHour
                            return <span key={h} title={`${fmtHour(h)} · ${past ? 'past' : s}`} style={{ flex: 1, height: '22px', borderRadius: '4px', backgroundColor: SLOT_COLOR[past ? 'past' : s], opacity: past ? 0.6 : 1 }} />
                          })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem', marginTop: '6px' }}>
                          <span>{fmtHour(hours[0]!)}</span>
                          <span>{closeLabel(hours[hours.length - 1]! + 1)}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ height: '22px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.95rem' }}>
                    <span style={{ fontSize: '0.88rem', color: next !== undefined ? 'white' : 'rgba(255,255,255,0.55)' }}>
                      {todayGrid.loading ? 'Checking today…' : next !== undefined ? <>Next open · <strong style={{ color: LIME }}>{fmtHour(next)}</strong></> : hours.length ? 'Full for today' : 'Tap to see times'}
                    </span>
                    <span className="pb-court-arrow" style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'white', color: NIGHT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* WEEK + VISIT */}
      <section style={{ padding: isMobile ? `3rem ${gutter}` : `5rem ${gutter}` }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0,1fr)' : 'minmax(0,0.9fr) minmax(0,1.1fr)', gap: isMobile ? '2.5rem' : '3.5rem', alignItems: 'start' }}>

          <div>
            <Kicker>Court hours</Kicker>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 1.75rem' }}>
              Early rallies,<br />late-night games.
            </h2>
            {venue.loading && <LoadingBlock label="Loading hours…" pad="1.5rem" />}
            {venue.data && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: isMobile ? '4px' : '8px' }}>
                {MONDAY_FIRST.map((dow) => {
                  const d = venue.data!.hours.weekly[dow]
                  const isToday = dow === todayDow
                  const closed = !d || d.closed
                  return (
                    <div key={dow} style={{ borderRadius: isMobile ? '12px' : '16px', padding: isMobile ? '0.7rem 0.2rem' : '1rem 0.4rem', textAlign: 'center', backgroundColor: isToday ? INK : 'white', color: isToday ? 'white' : INK, border: isToday ? 'none' : '1px solid #E7E4DA' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? LIME : '#8A8F86' }}>{DAY_SHORT[dow]}</div>
                      {closed ? (
                        <div style={{ fontSize: isMobile ? '0.7rem' : '0.82rem', fontWeight: 600, marginTop: '0.6rem', color: '#DC2626' }}>Closed</div>
                      ) : (
                        <div style={{ fontSize: isMobile ? '0.66rem' : '0.8rem', fontWeight: 600, marginTop: '0.55rem', lineHeight: 1.35 }}>
                          {fmtHour(d.open).replace(':00 ', '')}
                          <div style={{ width: '1px', height: isMobile ? '8px' : '12px', backgroundColor: 'currentColor', opacity: 0.3, margin: '3px auto' }} />
                          {d.close === 24 || d.close === 0 ? '12MN' : fmtHour(d.close).replace(':00 ', '')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <p style={{ color: '#6B6F66', fontSize: '0.85rem', lineHeight: 1.6, margin: '1.25rem 0 0' }}>
              Holidays may run on different hours. The booking screen always shows what's actually open.
            </p>
          </div>

          <div>
            <Kicker>Find us</Kicker>
            <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden', border: '1px solid #E7E4DA', boxShadow: '0 20px 50px -20px rgba(14,26,18,0.25)' }}>
              <Suspense fallback={<div style={{ height: isMobile ? 260 : 360, backgroundColor: '#ECEAE2' }} />}>
                <VenueMapCard height={isMobile ? 260 : 360} />
              </Suspense>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginTop: '1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', minWidth: 0 }}>
                <MapPin size={20} color={PINK} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>PickleBella Park</div>
                  <div style={{ color: '#6B6F66', fontSize: '0.88rem' }}>{VENUE_ADDRESS}</div>
                </div>
              </div>
              <a href={VENUE_MAPS_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: INK, color: 'white', textDecoration: 'none', borderRadius: '999px', padding: '0.75rem 1.3rem', fontSize: '0.9rem', fontWeight: 600 }}>
                <Navigation size={16} /> Directions
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING BAND */}
      <section style={{ padding: `0 ${gutter} ${isMobile ? '3rem' : '5rem'}` }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', position: 'relative', overflow: 'hidden', borderRadius: isMobile ? '24px' : '32px', backgroundColor: PINK, padding: isMobile ? '2.25rem 1.5rem' : '3.25rem 3.5rem', display: 'flex', flexDirection: isNarrow ? 'column' : 'row', alignItems: isNarrow ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '1.5rem' }}>
          {/* Decorative ball */}
          <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', right: isMobile ? '-60px' : '-40px', top: isMobile ? '-50px' : '-70px', width: isMobile ? '180px' : '260px', opacity: 0.18 }}>
            <circle cx="50" cy="50" r="48" fill={LIME} />
            {[[30, 28], [55, 22], [72, 40], [40, 50], [64, 62], [30, 70], [50, 80]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill={PINK} />)}
          </svg>
          <h2 style={{ position: 'relative', fontFamily: FONT_DISPLAY, color: 'white', fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0, maxWidth: '18ch' }}>
            Your next rally is a few taps away.
          </h2>
          <button
            onClick={() => onReserve()}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.6rem', backgroundColor: 'white', color: PINK, border: 'none', borderRadius: '999px', padding: '1rem 1.8rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY, flexShrink: 0 }}
          >
            Reserve a court <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ marginTop: 'auto', borderTop: '1px solid #E7E4DA', padding: `1.5rem ${gutter}` }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', color: '#8A8F86', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src={logoImg} alt="" style={{ height: '26px', width: '26px', borderRadius: '50%', objectFit: 'cover' }} />
            © 2026 PickleBella Park
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <a href="mailto:hello@picklebella.ph" style={{ color: '#8A8F86', textDecoration: 'none' }}>hello@picklebella.ph</a>
            <button onClick={onAdminSignIn} style={{ color: '#8A8F86', fontSize: '0.8rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, padding: 0 }}>Admin</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
