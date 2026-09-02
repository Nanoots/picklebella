import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'pb-admin-theme'

/** Defaults to the OS/browser preference the first time the admin is opened;
 * after that, whatever the toggle was last set to wins. */
function initialDark(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface AdminThemeValue {
  dark: boolean
  toggle: () => void
}

const AdminThemeContext = createContext<AdminThemeValue | null>(null)

/** Scopes dark mode to the admin dashboard only — the rest of the site (the
 * public booking flow) has no theme toggle and isn't touched by this. */
export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(initialDark)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  }, [dark])

  return (
    <AdminThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>
      {children}
    </AdminThemeContext.Provider>
  )
}

export function useAdminTheme(): AdminThemeValue {
  const ctx = useContext(AdminThemeContext)
  if (!ctx) throw new Error('useAdminTheme must be used within AdminThemeProvider')
  return ctx
}

export interface AdminColors {
  bg: string
  card: string
  border: string
  borderSoft: string
  hoverBg: string
  text: string
  textSoft: string
  textFaint: string
  textMuted: string
  sidebarBg: string
}

const LIGHT_COLORS: AdminColors = {
  bg: '#F6F7F5',
  card: '#FFFFFF',
  border: '#E5E7EB',
  borderSoft: '#F3F4F6',
  hoverBg: '#F9FAFB',
  text: '#111827',
  textSoft: '#374151',
  textFaint: '#6B7280',
  textMuted: '#9CA3AF',
  sidebarBg: '#FFFFFF',
}

const DARK_COLORS: AdminColors = {
  bg: '#0F1216',
  card: '#1A1F26',
  border: '#2E3440',
  borderSoft: '#262B33',
  hoverBg: '#20252D',
  text: '#F3F4F6',
  textSoft: '#D1D5DB',
  textFaint: '#9CA3AF',
  textMuted: '#7B8494',
  sidebarBg: '#161A20',
}

/** Colour tokens for the handful of places that can't just pick up a `.dark`
 * class override from index.css — inline-styled surfaces (the sidebar, tab
 * bars, chart SVG text) that sit outside Tailwind's utility classes. */
export function useAdminColors(): AdminColors {
  const { dark } = useAdminTheme()
  return dark ? DARK_COLORS : LIGHT_COLORS
}
