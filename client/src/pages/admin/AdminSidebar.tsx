import { LayoutDashboard, Building2, CalendarCheck, SlidersHorizontal, Users, Tag, BarChart3, LogOut } from 'lucide-react'
import logoImg from '@/imports/logo.jpg'
import { G_DARK, G, LIME, FONT_BODY, FONT_DISPLAY } from '../../lib/theme'
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
}

export default function AdminSidebar({ section, onSelect, onLogout }: Props) {
  return (
    <aside style={{ width: '240px', flexShrink: 0, backgroundColor: 'white', borderRight: '1px solid #EEF0ED', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '1.25rem 1.25rem 1rem' }}>
        <img src={logoImg} alt="PickleBella" style={{ height: '34px', width: '34px', borderRadius: '50%', objectFit: 'cover' }} />
        <div>
          <p style={{ fontFamily: FONT_DISPLAY, color: G_DARK, fontWeight: 700, fontSize: '0.95rem', margin: 0, lineHeight: 1.1 }}>PickleBella</p>
          <p style={{ color: '#9CA3AF', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Admin</p>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const active = section === key
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '0.65rem 0.75rem', borderRadius: '10px', border: 'none',
                backgroundColor: active ? 'rgba(122,194,49,0.14)' : 'transparent',
                color: active ? G : '#4B5563',
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

      <div style={{ padding: '0.75rem', borderTop: '1px solid #F3F4F6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0.5rem 0.75rem' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: G_DARK, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, fontFamily: FONT_DISPLAY, flexShrink: 0 }}>A</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>PickleBella Park</p>
            <p style={{ fontSize: '0.68rem', color: '#9CA3AF', margin: 0 }}>Signed in as admin</p>
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
  )
}
