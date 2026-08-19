import { useEffect, useState } from 'react'

/* Breakpoints for the layout switches the pages make.

   These pages are styled with inline `style` objects rather than classes, and
   an inline style always beats a class rule — so a plain CSS media query can't
   override, say, a hard-coded two-column `gridTemplateColumns`. Layout that
   has to change on a phone is therefore driven from here instead. */

export const MOBILE_MAX = 640
export const TABLET_MAX = 900

function useMediaQuery(query: string): boolean {
  // Guarded for the first render: `matchMedia` exists in every browser this
  // app supports, but reading it in the initialiser keeps the very first paint
  // at the right size rather than flashing the desktop layout.
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Phone-sized: single column, compact nav, larger tap targets. */
export const useIsMobile = () => useMediaQuery(`(max-width: ${MOBILE_MAX}px)`)

/** Phone or small tablet: the point where side-by-side columns stop fitting. */
export const useIsNarrow = () => useMediaQuery(`(max-width: ${TABLET_MAX}px)`)
