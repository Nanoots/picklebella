import logoImg from '@/imports/opt/logo.webp'
import heroBadgeImg from '@/imports/opt/logo-hero.webp'
import heroImg from '@/imports/opt/Court_1_2_3.webp'
import type { User } from '../App'
import * as api from '../lib/api'
import type { Court, DayHours, HoursConfig } from '../lib/types'
import { fmtHour, fmtMoney, todayStr } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery'
import { ErrorBlock, LoadingBlock } from '../components/States'
import { G_DARK, PINK, LIME, FONT_BODY, FONT_DISPLAY } from '../lib/theme'

interface Props {
  user: User | null
  onReserve: (courtId?: string) => void
  onSignIn: () => void
  onSignOut: () => void
  onAdminSignIn: () => void
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Collapses the weekly schedule into display rows, grouping consecutive days that
// share the same hours (e.g. "Monday – Friday · 6:00 AM – 10:00 PM").
function hoursSummary(weekly: DayHours[]) {
  const order = [1, 2, 3, 4, 5, 6, 0] // Monday-first
  const rows: { label: string; value: string }[] = []
  let runStart = 0

  const valueFor = (dow: number) => {
    const d = weekly[dow]
    if (!d) return 'Closed'
    return d.closed ? 'Closed' : `${fmtHour(d.open)} – ${fmtHour(d.close)}`
  }

  for (let i = 0; i < order.length; i++) {
    const dow = order[i]!
    const isLast = i === order.length - 1
    const sameAsNext = !isLast && valueFor(dow) === valueFor(order[i + 1]!)
    if (!sameAsNext) {
      const label = runStart === i
        ? DAY_NAMES[dow]!
        : `${DAY_NAMES[order[runStart]!]} – ${DAY_NAMES[dow]!}`
      rows.push({ label, value: valueFor(dow) })
      runStart = i + 1
    }
  }
  return rows
}

/** Today's headline figures for one court, shown in the "Live This Week" strip. */
type CourtToday = { bookedCount: number; nextOpenHour: number | undefined }

async function loadToday(date: string, signal: AbortSignal) {
  const nowHour = new Date().getHours()

  // One request for all three courts. This strip is decorative — the page is
  // perfectly usable without it — so a failure resolves to nothing rather than
  // surfacing an error over the whole section.
  try {
    const byCourt = await api.getAvailabilityAll(date, signal)
    return Object.fromEntries(
      Object.entries(byCourt).map(([courtId, { slots }]) => {
        const hours = Object.keys(slots).map(Number).sort((a, b) => a - b)
        return [
          courtId,
          {
            bookedCount: hours.filter((h) => slots[h] === 'booked').length,
            nextOpenHour: hours.find((h) => slots[h] === 'available' && h > nowHour),
          },
        ]
      }),
    ) as Record<string, CourtToday>
  } catch {
    return {}
  }
}

function SectionHead({ kicker, title, align = 'center' }: { kicker: string; title: React.ReactNode; align?: 'center' | 'left' }) {
  return (
    <div style={{ textAlign: align, marginBottom: '2.5rem', maxWidth: align === 'left' ? undefined : '640px', marginLeft: align === 'left' ? undefined : 'auto', marginRight: align === 'left' ? undefined : 'auto' }}>
      <p style={{ color: PINK, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 0.6rem' }}>{kicker}</p>
      <h2 style={{ fontFamily: FONT_DISPLAY, color: '#111827', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 700, margin: 0, lineHeight: 1.15 }}>{title}</h2>
    </div>
  )
}

export default function LandingPage({ user, onReserve, onSignIn, onSignOut, onAdminSignIn }: Props) {
  const today = todayStr()
  const isMobile = useIsMobile()
  const isNarrow = useIsNarrow()

  const venue = useAsync<{ courts: Court[]; hours: HoursConfig }>(async (signal) => {
    const [courts, config] = await Promise.all([api.getCourts(signal), api.getConfig(signal)])
    return { courts, hours: config.hours }
  }, [])

  const COURTS = venue.data?.courts ?? []

  // Loaded separately so the page renders as soon as the courts are known —
  // today's occupancy is a nice-to-have, not something worth blocking on.
  const todayStats = useAsync<Record<string, CourtToday>>(
    (signal) => loadToday(today, signal),
    [today],
  )

  const MIN_RATE = COURTS.length ? Math.min(...COURTS.map((c) => c.rate)) : 0
  const MAX_RATE = COURTS.length ? Math.max(...COURTS.map((c) => c.rate)) : 0
  const hourRows = venue.data ? hoursSummary(venue.data.hours.weekly) : []
  const openRow = hourRows.find((r) => r.value !== 'Closed')

  return (
    <div style={{ fontFamily: FONT_BODY, minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#FAFAF8' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, backgroundColor: G_DARK }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '0 1rem' : '0 1.5rem', height: isMobile ? '58px' : '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <img src={logoImg} alt="PickleBella Park" style={{ height: isMobile ? '32px' : '40px', width: isMobile ? '32px' : '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <span style={{ fontFamily: FONT_DISPLAY, color: 'white', fontWeight: 700, fontSize: isMobile ? '1rem' : '1.1rem', letterSpacing: '-0.01em' }}>
              PickleBella
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.4rem' : '0.75rem', flexShrink: 0 }}>
            {user ? (
              <>
                {!isMobile && (
                  <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.85rem' }}>
                    Hi, {user.name.split(' ')[0]}
                  </span>
                )}
                <button
                  onClick={onSignOut}
                  style={{ color: 'rgba(255,255,255,0.7)', background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '999px', padding: isMobile ? '0.4rem 0.7rem' : '0.4rem 1rem', fontSize: isMobile ? '0.75rem' : '0.8rem', cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
                >
                  Sign Out
                </button>
                <button
                  onClick={() => onReserve()}
                  style={{ backgroundColor: PINK, color: 'white', border: 'none', borderRadius: '999px', padding: isMobile ? '0.45rem 0.9rem' : '0.5rem 1.25rem', fontSize: isMobile ? '0.78rem' : '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
                >
                  Book Now
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
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pb-hero" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Bundled, not hot-linked. The CSP this site ships with is
            `img-src 'self' data: blob:`, so a remote image URL is blocked
            outright in production and the hero renders as a bare gradient. */}
        <img
          src={heroImg}
          alt="PickleBella Park pickleball courts"
          fetchPriority="high"
          decoding="async"
          className="pb-hero-bg"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', willChange: 'transform' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(155deg, rgba(8,24,12,0.65) 0%, rgba(8,24,12,0.82) 100%)' }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: isMobile ? '4rem 1.25rem 3.5rem' : '4.5rem 1.5rem 3rem', maxWidth: '700px', margin: '0 auto', width: '100%' }}>
          <p className="pb-hero-fade" style={{ animationDelay: '0.05s', color: LIME, fontSize: isMobile ? '0.6rem' : '0.68rem', fontWeight: 700, letterSpacing: isMobile ? '0.16em' : '0.22em', textTransform: 'uppercase', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
            <span style={{ display: 'inline-block', width: isMobile ? '14px' : '24px', height: '1px', backgroundColor: LIME, flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}>PickleBella Park · 3 Courts</span>
            <span style={{ display: 'inline-block', width: isMobile ? '14px' : '24px', height: '1px', backgroundColor: LIME, flexShrink: 0 }} />
          </p>

          <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
            PickleBella Park — Dink. Smash. Enjoy.
          </h1>

          <div className="pb-hero-badge-float" style={{ position: 'relative', display: 'inline-block', margin: '0 0 1.75rem' }} aria-hidden="true">
            <div className="pb-hero-glow" style={{ position: 'absolute', inset: '8%', borderRadius: '50%', background: `radial-gradient(circle, ${PINK}55 0%, ${LIME}33 55%, transparent 75%)`, filter: 'blur(18px)', zIndex: 0 }} />
            <img
              src={heroBadgeImg}
              alt=""
              className="pb-hero-badge-in"
              decoding="async"
              style={{ position: 'relative', zIndex: 1, width: isMobile ? '150px' : 'clamp(170px, 16vw, 230px)', height: isMobile ? '150px' : 'clamp(170px, 16vw, 230px)', display: 'block', filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.35))' }}
            />
          </div>

          <p className="pb-hero-fade" style={{ animationDelay: '0.3s', color: 'rgba(255,255,255,0.62)', fontSize: 'clamp(0.88rem, 2.5vw, 1.05rem)', lineHeight: 1.7, margin: '0 auto 2.25rem', maxWidth: '420px' }}>
            Book your court at PickleBella Park — 3 professional pickleball courts nestled in one beautiful outdoor venue.
          </p>

          <div className="pb-hero-fade" style={{ animationDelay: '0.45s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => onReserve()}
              className="pb-cta-pulse"
              style={{ backgroundColor: PINK, color: 'white', border: 'none', borderRadius: '999px', padding: isMobile ? '0.95rem 2.25rem' : '1rem 2.75rem', fontSize: isMobile ? '0.95rem' : '1rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, letterSpacing: '0.01em', maxWidth: '100%', transition: 'transform 0.2s, opacity 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              Reserve a Court
            </button>
            {!user && (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>
                <button onClick={onSignIn} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.78rem', fontFamily: FONT_BODY, padding: 0 }}>
                  Sign in
                </button>
                {' '}required to complete a booking
              </p>
            )}
          </div>
        </div>

        <div className="pb-scroll-cue" style={{ position: 'absolute', bottom: '2.5rem', left: '50%', display: isMobile ? 'none' : 'block' }}>
          <div style={{ width: '1px', height: '40px', background: 'linear-gradient(to bottom, transparent, white)', margin: '0 auto' }} />
        </div>
      </section>

      {/* STATS STRIP */}
      <div style={{ backgroundColor: G_DARK, padding: isMobile ? '1.5rem 1rem' : '1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'center', gap: isMobile ? '1.5rem 1.25rem' : 'clamp(2rem, 8vw, 6rem)', flexWrap: 'wrap' }}>
          {[
            { num: venue.data ? String(COURTS.length) : '—', label: 'Professional Courts' },
            {
              num: !venue.data
                ? '—'
                : MIN_RATE === MAX_RATE
                  ? fmtMoney(MIN_RATE)
                  : `${fmtMoney(MIN_RATE)}–${fmtMoney(MAX_RATE)}`,
              label: 'Per Hour · Per Court',
            },
            { num: !venue.data ? '—' : openRow ? openRow.value : 'Closed', label: hourRows.length === 1 ? 'Open Everyday' : 'Typical Hours' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center', flex: isMobile ? '1 1 30%' : '0 0 auto', minWidth: 0 }}>
              <p style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: isMobile ? '1.15rem' : '1.5rem', fontWeight: 700, margin: 0, overflowWrap: 'break-word' }}>{stat.num}</p>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: isMobile ? '0.6rem' : '0.68rem', fontWeight: 500, letterSpacing: '0.08em', margin: '3px 0 0', textTransform: 'uppercase' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* LIVE THIS WEEK */}
      <section style={{ padding: isMobile ? '2.75rem 1.1rem' : '4rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <SectionHead kicker="Live This Week" align="left" title={<>Court highlights at <span style={{ color: PINK }}>PickleBella</span></>} />
          {venue.loading && <LoadingBlock label="Loading courts…" />}
          {venue.error && <ErrorBlock message={venue.error} onRetry={venue.reload} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {COURTS.map((c) => {
              const stats = todayStats.data?.[c.id]
              const bookedCount = stats?.bookedCount ?? 0
              const nextOpenHour = stats?.nextOpenHour
              return (
                <div key={c.id} style={{ background: c.color, borderRadius: '16px', padding: '1.5rem', color: 'white' }}>
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', fontSize: '0.65rem', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.type}</span>
                  <h4 style={{ fontFamily: FONT_DISPLAY, fontSize: '1.1rem', fontWeight: 700, margin: '0.75rem 0 0.5rem' }}>{c.name} · {fmtMoney(c.rate)}/hr</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
                    {todayStats.loading ? (
                      <span>Checking today…</span>
                    ) : (
                      <>
                        <span>{bookedCount} booking{bookedCount === 1 ? '' : 's'} today</span>
                        <span>{nextOpenHour !== undefined ? `Next: ${fmtHour(nextOpenHour)}` : 'Fully booked'}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            <div style={{ background: `linear-gradient(160deg, ${PINK}, #B8135F)`, borderRadius: '16px', padding: '1.5rem', color: 'white' }}>
              <span style={{ backgroundColor: 'rgba(255,255,255,0.18)', fontSize: '0.65rem', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>This Weekend</span>
              <h4 style={{ fontFamily: FONT_DISPLAY, fontSize: '1.1rem', fontWeight: 700, margin: '0.75rem 0 0.5rem' }}>Open Play Saturdays</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>
                <span>All levels welcome</span>
                <span>9:00 AM</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MADE FOR EVERY PLAYER */}
      <section style={{ backgroundColor: G_DARK, padding: isMobile ? '2.75rem 1.1rem' : '4rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: LIME, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center', margin: '0 0 0.6rem' }}>Made For Every Player</p>
          <h2 style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 700, textAlign: 'center', margin: '0 0 2.5rem', lineHeight: 1.15 }}>
            However you play — <span style={{ color: LIME }}>there's a court for you</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            {[
              { ic: '🥒', h: 'Book a Court', p: 'Reserve any of our 3 courts online in seconds — pick your date, time, and go.' },
              { ic: '👥', h: 'Bring Your Crew', p: 'Rally up to 8 players per booking. Great for casual games, birthdays, or team nights.' },
              { ic: '🏆', h: 'All Skill Levels', p: 'Beginner or pro, our courts and gear rentals are built to welcome every level of play.' },
            ].map((v) => (
              <div key={v.h} style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.75rem' }}>
                <div style={{ fontSize: '1.6rem', marginBottom: '0.75rem' }}>{v.ic}</div>
                <h4 style={{ color: 'white', fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{v.h}</h4>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>{v.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: isMobile ? '3rem 1.1rem' : '4.5rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <SectionHead kicker="Simple Booking" title="How booking works" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2rem' }}>
            {[
              { n: '01', ic: '📍', tag: 'Discover', h: 'Pick a court & time', p: 'See live availability across all 3 courts on one grid — pick whatever fits your schedule.' },
              { n: '02', ic: '🔐', tag: 'Sign In', h: 'Create your account', p: 'Quick sign up with your name, phone, and email — takes under a minute.' },
              { n: '03', ic: '🏓', tag: 'Play', h: 'Pay & show up', p: 'Pay securely online via GCash, Maya, or QR Ph, then just grab your paddle and play.' },
            ].map((s) => (
              <div key={s.n}>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: '2.5rem', fontWeight: 700, color: '#E5E7EB' }}>{s.n}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                  <span>{s.ic}</span>
                  <span style={{ color: PINK, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.tag}</span>
                </div>
                <h4 style={{ fontFamily: FONT_DISPLAY, color: '#111827', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{s.h}</h4>
                <p style={{ color: '#6B7280', fontSize: '0.85rem', lineHeight: 1.65, margin: 0 }}>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COURTS */}
      <section id="courts" style={{ backgroundColor: '#F3F4F6', padding: isMobile ? '3rem 1.1rem' : '4.5rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <SectionHead
            kicker="Our Courts"
            title={venue.data ? `${COURTS.length} courts, every style of play` : 'Every style of play'}
          />
          {venue.loading && <LoadingBlock label="Loading courts…" />}
          {venue.error && <ErrorBlock message={venue.error} onRetry={venue.reload} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
            {COURTS.map((c) => (
              <div key={c.id} style={{ backgroundColor: 'white', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ background: c.color, height: '140px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ position: 'absolute', top: '0.875rem', left: '0.875rem', backgroundColor: 'rgba(255,255,255,0.18)', color: 'white', fontSize: '0.65rem', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', textTransform: 'uppercase' }}>{c.type}</span>
                  <span style={{ fontSize: '2.5rem' }}>{c.emoji}</span>
                  <span style={{ position: 'absolute', bottom: '0.875rem', right: '0.875rem', backgroundColor: 'white', color: G_DARK, fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px' }}>{fmtMoney(c.rate)}/hr</span>
                </div>
                <div style={{ padding: '1.25rem' }}>
                  <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 0.25rem' }}>{c.name}</h3>
                  <p style={{ color: '#9CA3AF', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>{c.surface}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
                    {c.feats.map((f) => (
                      <span key={f} style={{ backgroundColor: '#F3F4F6', color: '#374151', fontSize: '0.7rem', fontWeight: 500, padding: '3px 9px', borderRadius: '999px' }}>{f}</span>
                    ))}
                  </div>
                  <button
                    onClick={() => onReserve(c.id)}
                    style={{ width: '100%', backgroundColor: G_DARK, color: 'white', border: 'none', borderRadius: '999px', padding: '0.75rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
                  >
                    Book {c.name} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AMENITIES */}
      <section id="amenities" style={{ backgroundColor: G_DARK, padding: isMobile ? '3rem 1.1rem' : '4.5rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ color: LIME, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center', margin: '0 0 0.6rem' }}>What We Offer</p>
          <h2 style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 700, textAlign: 'center', margin: '0 0 2.5rem' }}>Everything you need for a great game</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
            {[
              { ic: '💡', h: 'Pro Lighting', p: 'Bright, even lighting for day and night games.' },
              { ic: '🚻', h: 'Restrooms', p: 'Clean restrooms and shower area on site.' },
              { ic: '🅿️', h: 'Free Parking', p: 'Plenty of parking space right outside the courts.' },
              { ic: '🛍️', h: 'Pro Shop', p: 'Paddles, balls, and gear available for rent or sale.' },
            ].map((v) => (
              <div key={v.h} style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.5rem' }}>
                <div style={{ fontSize: '1.4rem', marginBottom: '0.625rem' }}>{v.ic}</div>
                <h4 style={{ color: 'white', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.4rem' }}>{v.h}</h4>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', lineHeight: 1.6, margin: 0 }}>{v.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VISIT US */}
      <section id="visit" style={{ padding: isMobile ? '3rem 1.1rem' : '4.5rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <SectionHead kicker="Visit Us" title="Location & operating hours" />
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0,1fr)' : 'minmax(0,1.1fr) minmax(0,1fr)', gap: '2rem', alignItems: 'center' }}>
            <div style={{ height: isMobile ? '190px' : '260px', borderRadius: '18px', background: 'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 50%, #6EE7B7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1.5rem', color: G_DARK, fontWeight: 600, fontSize: isMobile ? '0.85rem' : '1rem', lineHeight: 1.6 }}>
              📍 123 Rally Street, Barangay Match Point<br />Quezon City, Metro Manila
            </div>
            <div>
              {venue.loading && <LoadingBlock label="Loading hours…" pad="1.5rem" />}
              {venue.error && <ErrorBlock message={venue.error} onRetry={venue.reload} pad="1.25rem" />}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
                <tbody>
                  {hourRows.map((row) => (
                    <tr key={row.label} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '0.75rem 0', color: '#6B7280', fontSize: '0.85rem' }}>{row.label}</td>
                      <td style={{ padding: '0.75rem 0', color: row.value === 'Closed' ? '#DC2626' : '#111827', fontWeight: 700, fontSize: '0.85rem', textAlign: 'right' }}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button onClick={() => onReserve()} style={{ backgroundColor: PINK, color: 'white', border: 'none', borderRadius: '999px', padding: '0.75rem 1.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}>Book a Court →</button>
                <a href="tel:+639171234567" style={{ backgroundColor: 'white', color: '#111827', border: '1.5px solid #E5E7EB', borderRadius: '999px', padding: '0.75rem 1.5rem', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>📞 (0917) 123-4567</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ backgroundColor: G_DARK, padding: isMobile ? '3rem 1.1rem' : '4.5rem 1.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, color: 'white', fontSize: 'clamp(1.7rem, 4.5vw, 2.6rem)', fontWeight: 700, margin: '0 0 1.75rem', lineHeight: 1.2 }}>
          More games. Less waiting.<br /><span style={{ color: LIME }}>Book your court now.</span>
        </h2>
        <button
          onClick={() => onReserve()}
          style={{ backgroundColor: LIME, color: G_DARK, border: 'none', borderRadius: '999px', padding: '1rem 2.75rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY }}
        >
          Book a Court →
        </button>
      </section>

      {/* FOOTER */}
      <footer style={{ backgroundColor: '#081810', padding: isMobile ? '2.25rem 1.1rem 1.25rem' : '3rem 1.5rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.875rem' }}>
                <img src={logoImg} alt="logo" style={{ height: '32px', width: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                <span style={{ fontFamily: FONT_DISPLAY, color: 'white', fontWeight: 700, fontSize: '1rem' }}>PickleBella Park</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.8rem', lineHeight: 1.6 }}>Dink. Smash. Enjoy. Manila's friendliest pickleball courts — book online in seconds.</p>
            </div>
            {[
              { h: 'Explore', links: [['Courts', '#courts'], ['How it Works', '#how'], ['Amenities', '#amenities'], ['Book Now', '#']] },
              { h: 'Support', links: [['FAQs', '#'], ['Cancellation Policy', '#'], ['Contact Us', '#']] },
              { h: 'Contact', links: [['123 Rally St, Quezon City', '#'], ['(0917) 123-4567', 'tel:+639171234567'], ['hello@picklebella.ph', 'mailto:hello@picklebella.ph']] },
            ].map((col) => (
              <div key={col.h}>
                <h4 style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.875rem' }}>{col.h}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {col.links.map(([label, href]) => (
                    <a
                      key={label}
                      href={href}
                      onClick={label === 'Book Now' ? (e) => { e.preventDefault(); onReserve() } : undefined}
                      style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textDecoration: 'none' }}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>© 2026 PickleBella Park. All rights reserved.</span>
            <button onClick={onAdminSignIn} style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, padding: 0 }}>Admin</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
