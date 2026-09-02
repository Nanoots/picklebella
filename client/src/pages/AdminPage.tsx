import { useCallback, useEffect, useState } from 'react'
import { Menu, Moon, Sun } from 'lucide-react'
import * as api from '../lib/api'
import type { Booking, Block, Court } from '../lib/types'
import { errorMessage } from '../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../components/States'
import { FONT_BODY, FONT_DISPLAY } from '../lib/theme'
import { useIsNarrow } from '../lib/useMediaQuery'
import { AdminThemeProvider, useAdminColors, useAdminTheme } from './admin/adminTheme'
import AdminSidebar from './admin/AdminSidebar'
import DashboardView from './admin/DashboardView'
import FacilitiesView from './admin/FacilitiesView'
import ReservationsView from './admin/ReservationsView'
import AvailabilityView from './admin/AvailabilityView'
import MembersView from './admin/MembersView'
import PricingView from './admin/PricingView'
import ReportsView from './admin/ReportsView'
import { Toast } from './admin/shared'
import type { AdminSection } from './admin/types'

interface Props {
  onExit: () => void
  onLogout: () => void
}

const SECTION_META: Record<AdminSection, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: "Overview of today's activity" },
  facilities: { title: 'Facilities', subtitle: 'Manage courts, rates & features' },
  reservations: { title: 'Reservations', subtitle: 'View, confirm & cancel bookings' },
  availability: { title: 'Manage Availability', subtitle: 'Block or open up court time' },
  members: { title: 'Members', subtitle: 'Customer profiles, history & access' },
  pricing: { title: 'Pricing & Promos', subtitle: 'Peak rates and discount codes' },
  reports: { title: 'Reports', subtitle: 'Revenue, occupancy & peak hours' },
}

export default function AdminPage(props: Props) {
  return (
    <AdminThemeProvider>
      <AdminPageInner {...props} />
    </AdminThemeProvider>
  )
}

function AdminPageInner({ onExit, onLogout }: Props) {
  const isNarrow = useIsNarrow()
  const { dark, toggle: toggleDark } = useAdminTheme()
  const colors = useAdminColors()
  const [section, setSection] = useState<AdminSection>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // A resize past the tablet breakpoint should drop the mobile drawer state
  // rather than leave it open (or transformed off-screen) once the layout
  // switches back to the fixed sidebar.
  useEffect(() => { if (!isNarrow) setNavOpen(false) }, [isNarrow])

  // Prevent the page behind the drawer from scrolling while it's open.
  useEffect(() => {
    if (!navOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [navOpen])
  // Bumped on every refresh so views that fetch their own data (Members) know
  // to re-read instead of showing figures from before the last write.
  const [dataVersion, setDataVersion] = useState(0)

  /* One load for the three lists every view shares. The reservations endpoint
     caps at 2000 rows; a venue that outgrows that should start passing the
     from/to filters rather than raising the cap. */
  const refresh = useCallback(async () => {
    setLoadError('')
    try {
      const [b, bl, c] = await Promise.all([
        api.admin.listBookings(),
        api.admin.listBlocks(),
        api.admin.listCourts(),
      ])
      setBookings(b)
      setBlocks(bl)
      setCourts(c)
      setDataVersion((v) => v + 1)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  function selectSection(s: AdminSection) {
    setSection(s)
    window.scrollTo(0, 0)
  }

  const meta = SECTION_META[section]

  return (
    <div className={dark ? 'dark' : undefined} style={{ fontFamily: FONT_BODY, display: 'flex', minHeight: '100vh', backgroundColor: colors.bg }}>
      <AdminSidebar section={section} onSelect={selectSection} onLogout={onLogout} open={navOpen} onClose={() => setNavOpen(false)} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ backgroundColor: colors.card, borderBottom: `1px solid ${colors.border}`, position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: isNarrow ? '0.9rem 1rem' : '1.1rem 1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
              {isNarrow && (
                <button
                  onClick={() => setNavOpen(true)}
                  aria-label="Open menu"
                  style={{ border: `1px solid ${colors.border}`, background: colors.card, borderRadius: '8px', padding: '0.45rem', cursor: 'pointer', display: 'flex', flexShrink: 0, color: 'var(--pb-brand)' }}
                >
                  <Menu size={19} />
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: isNarrow ? '1.1rem' : '1.3rem', fontWeight: 700, color: 'var(--pb-brand)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.title}</h1>
                {!isNarrow && <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: '2px 0 0' }}>{meta.subtitle}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <button
                onClick={toggleDark}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{ color: colors.textSoft, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: '999px', width: isNarrow ? '2.1rem' : '2.3rem', height: isNarrow ? '2.1rem' : '2.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={onExit}
                style={{ color: colors.textSoft, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: '999px', padding: isNarrow ? '0.45rem 0.85rem' : '0.5rem 1.1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}
              >
                View Site
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: isNarrow ? '1.1rem 1rem 2.5rem' : '1.5rem 1.75rem 3rem' }}>
          {loading ? (
            <LoadingBlock label="Loading admin data…" pad="4rem" />
          ) : loadError ? (
            <ErrorBlock message={loadError} onRetry={() => void refresh()} />
          ) : (
            <>
              {section === 'dashboard' && <DashboardView bookings={bookings} blocks={blocks} courts={courts} />}
              {section === 'facilities' && <FacilitiesView courts={courts} bookings={bookings} refresh={refresh} showToast={showToast} />}
              {section === 'reservations' && <ReservationsView bookings={bookings} courts={courts} refresh={refresh} showToast={showToast} />}
              {section === 'availability' && <AvailabilityView blocks={blocks} courts={courts} refresh={refresh} showToast={showToast} />}
              {section === 'members' && <MembersView refreshKey={dataVersion} bookings={bookings} courts={courts} refresh={refresh} showToast={showToast} />}
              {section === 'pricing' && <PricingView courts={courts} refresh={refresh} showToast={showToast} />}
              {section === 'reports' && <ReportsView />}
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  )
}
