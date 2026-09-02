import { LayoutDashboard, Building2, CalendarCheck, SlidersHorizontal, Users, Tag, BarChart3, LogOut, X } from 'lucide-react'
import logoImg from '@/imports/opt/logo.webp'
import { G_DARK, G, LIME, FONT_BODY, FONT_DISPLAY } from '../../lib/theme'
import { useIsNarrow } from '../../lib/useMediaQuery'
import { useAdminColors } from './adminTheme'
import type { AdminSection } from './types'

const NAV_ITEMS: { key: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'facilities', label: 'Facilities', icon: Building2 },
  { key: 'reservations', label: 'Reservations', icon: CalendarCheck },
  { key: 'availability', label: 'Manage Availability', icon: SlidersHorizontal },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'pricing', label: 'Pricing & Promos', icon: Tag },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
]

interface Props {
  section: AdminSection
  onSelect: (s: AdminSection) => void
  onLogout: () => void
  open: boolean
  onClose: () => void
}

export default function AdminSidebar({ section, onSelect, onLogout, open, onClose }: Props) {
  const isNarrow = useIsNarrow()
  const colors = useAdminColors()

  function selectAndClose(s: AdminSection) {
    onSelect(s)
    if (isNarrow) onClose()
  }

  return (
    <>
      {isNarrow && open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.45)', zIndex: 90 }}
        />
      )}

      <aside
        style={{
          width: '240px', flexShrink: 0, backgroundColor: colors.sidebarBg, borderRight: `1px solid ${colors.border}`,
          display: 'flex', flexDirection: 'column', height: '100dvh',
          ...(isNarrow
            ? {
                position: 'fixed', top: 0, left: 0, zIndex: 100,
                transform: open ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.25s ease', boxShadow: open ? '0 0 24px rgba(0,0,0,0.18)' : 'none',
              }
            : { position: 'sticky', top: 0 }),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '1.25rem 1.25rem 1rem' }}>
          <img src={logoImg} alt="PickleBella" style={{ height: '34px', width: '34px', borderRadius: '50%', objectFit: 'cover' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: FONT_DISPLAY, color: 'var(--pb-brand)', fontWeight: 700, fontSize: '0.95rem', margin: 0, lineHeight: 1.1 }}>PickleBella</p>
            <p style={{ color: colors.textMuted, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Admin</p>
          </div>
          {isNarrow && (
            <button
              onClick={onClose}
              aria-label="Close menu"
              style={{ border: 'none', background: 'transparent', color: colors.textFaint, cursor: 'pointer', padding: '0.35rem', display: 'flex' }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        <nav style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const active = section === key
            return (
              <button
                key={key}
                onClick={() => selectAndClose(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '0.65rem 0.75rem', borderRadius: '10px', border: 'none',
                  backgroundColor: active ? 'rgba(122,194,49,0.14)' : 'transparent',
                  color: active ? G : colors.textSoft,
                  fontFamily: FONT_BODY, fontSize: '0.85rem', fontWeight: active ? 700 : 500,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  borderLeft: active ? `3px solid ${LIME}` : '3px solid transparent',
                  transition: 'background-color 0.15s, color 0.15s',
                }}
              >
                <Icon size={17} strokeWidth={active ? 2.4 : 2} />
                {label}
              </button>
            )
          })}
        </nav>

        <div style={{ padding: '0.75rem', borderTop: `1px solid ${colors.borderSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0.5rem 0.75rem' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: G_DARK, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, fontFamily: FONT_DISPLAY, flexShrink: 0 }}>A</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 700, color: colors.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>PickleBella Park</p>
              <p style={{ fontSize: '0.68rem', color: colors.textMuted, margin: 0 }}>Signed in as admin</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '0.6rem 0.75rem', borderRadius: '10px', border: 'none',
              backgroundColor: 'transparent', color: '#DC2626',
              fontFamily: FONT_BODY, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </aside>
    </>
  )
}
