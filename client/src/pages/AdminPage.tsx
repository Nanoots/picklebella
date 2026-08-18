import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { Booking, Block, Court } from '../lib/types'
import { errorMessage } from '../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../components/States'
import { FONT_BODY, FONT_DISPLAY, G_DARK } from '../lib/theme'
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

export default function AdminPage({ onExit, onLogout }: Props) {
  const [section, setSection] = useState<AdminSection>('dashboard')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
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
    <div style={{ fontFamily: FONT_BODY, display: 'flex', minHeight: '100vh', backgroundColor: '#F6F7F5' }}>
      <AdminSidebar section={section} onSelect={selectSection} onLogout={onLogout} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ backgroundColor: 'white', borderBottom: '1px solid #EEF0ED', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.1rem 1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: '1.3rem', fontWeight: 700, color: G_DARK, margin: 0 }}>{meta.title}</h1>
              <p style={{ fontSize: '0.8rem', color: '#9CA3AF', margin: '2px 0 0' }}>{meta.subtitle}</p>
            </div>
            <button
              onClick={onExit}
              style={{ color: '#4B5563', background: 'white', border: '1px solid #E5E7EB', borderRadius: '999px', padding: '0.5rem 1.1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_BODY }}
            >
              View Site
            </button>
          </div>
        </div>

        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1.75rem 3rem' }}>
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
