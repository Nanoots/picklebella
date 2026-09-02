/* =========================================================
   PickleBella Park — the interactive venue map.

   Tiles come from OpenFreeMap (no API key, no usage cap — see
   https://openfreemap.org), rendered client-side with MapLibre GL. Two
   independent Map instances are used (mini card + fullscreen overlay)
   rather than one moved between containers: WebGL contexts don't take
   kindly to being reparented, and mounting a fresh one on open is simpler
   and fast enough that the extra tile fetch isn't noticeable.
   ========================================================= */

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Maximize2, X } from 'lucide-react'
import { BLUE, FONT_BODY, FONT_DISPLAY } from '../lib/theme'
import { VENUE_COORDS, VENUE_ADDRESS } from '../lib/venue'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

/** Mounts a MapLibre map with a pin at the venue into `containerRef`, and
 * tears it down on unmount. `interactive` gates panning/scroll-zoom/touch —
 * off for the card preview (a click there should open the fullscreen view,
 * not nudge the map), on for the fullscreen one. */
function useVenueMap(containerRef: RefObject<HTMLDivElement | null>, opts: { interactive: boolean; zoom: number }) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      center: [VENUE_COORDS.lng, VENUE_COORDS.lat],
      zoom: opts.zoom,
      interactive: opts.interactive,
      attributionControl: { compact: true },
    })
    new Marker({ color: BLUE }).setLngLat([VENUE_COORDS.lng, VENUE_COORDS.lat]).addTo(map)
    if (opts.interactive) {
      // bottom-right, not top-right — that's where the custom close button
      // in FullscreenVenueMap sits, and MapLibre's own control would
      // otherwise overlap it.
      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    }

    // The card version starts at a size the flex/grid layout hasn't
    // finished settling into yet on first paint; the fullscreen version's
    // container only exists once the modal is already full-viewport, but
    // resizing again after fonts/tiles finish costs nothing and guards
    // against both.
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(container)

    return () => {
      ro.disconnect()
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounts once per element; opts is static per call site
  }, [])
}

/** Closes on Escape and locks background scroll while open — same pattern
 * as every other full-screen overlay in this app (AuthModal, admin modals). */
function useModalEscapeAndScrollLock(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [active, onClose])
}

function FullscreenVenueMap({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  useVenueMap(containerRef, { interactive: true, zoom: 16 })
  useModalEscapeAndScrollLock(true, onClose)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: '#E5E7EB' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <button
        onClick={onClose}
        aria-label="Close map"
        style={{
          position: 'absolute', top: '1rem', right: '1rem', width: '2.75rem', height: '2.75rem',
          borderRadius: '50%', backgroundColor: 'white', border: 'none',
          boxShadow: '0 2px 12px rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <X size={20} color="#111827" />
      </button>

      <div
        style={{
          position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'white', borderRadius: '12px',
          padding: '0.7rem 1rem', boxShadow: '0 2px 12px rgba(0,0,0,0.18)', fontFamily: FONT_BODY, maxWidth: 'calc(100vw - 6rem)',
        }}
      >
        <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>PickleBella Park</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#6B7280' }}>{VENUE_ADDRESS}</p>
      </div>
    </div>
  )
}

/** Drop-in replacement for a static "map" placeholder: a small preview with
 * a pin, click/tap (or Enter/Space) to open the same map full-screen.
 *
 * Also the default export — maplibre-gl is a heavy (~250KB gzipped)
 * dependency, so every call site lazy-loads this via React.lazy() rather
 * than importing it eagerly, keeping it out of the landing page's initial
 * bundle. See LandingPage.tsx / BookingPage.tsx. */
export function VenueMapCard({ height = 130 }: { height?: number }) {
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useVenueMap(containerRef, { interactive: false, zoom: 15 })

  return (
    <>
      <div
        onClick={() => setFullscreen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFullscreen(true) } }}
        role="button"
        tabIndex={0}
        aria-label="Open full-screen map"
        style={{ height, position: 'relative', cursor: 'pointer' }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        <span
          style={{
            position: 'absolute', bottom: '8px', right: '8px', backgroundColor: 'white',
            borderRadius: '8px', padding: '5px', display: 'flex', alignItems: 'center',
            boxShadow: '0 1px 5px rgba(0,0,0,0.2)', pointerEvents: 'none',
          }}
        >
          <Maximize2 size={13} color="#374151" />
        </span>
      </div>

      {fullscreen && <FullscreenVenueMap onClose={() => setFullscreen(false)} />}
    </>
  )
}

export default VenueMapCard
