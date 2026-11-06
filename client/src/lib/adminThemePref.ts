/* The admin's stored light/dark choice, readable without loading the admin
   chunk — the loaders shown *before* that chunk arrives need it too. */

export const ADMIN_THEME_KEY = 'pb-admin-theme'

/** Defaults to the OS/browser preference the first time the admin is opened;
 * after that, whatever the toggle was last set to wins. */
export function adminThemeIsDark(): boolean {
  if (typeof window === 'undefined') return false
  let stored: string | null = null
  try {
    stored = localStorage.getItem(ADMIN_THEME_KEY)
  } catch {
    // Storage blocked (private mode, site data disabled) — fall through.
  }
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}
