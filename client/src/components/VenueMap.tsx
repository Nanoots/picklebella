/* =========================================================
   PickleBella Park — the interactive venue map.

   Uses Leaflet with CARTO's free raster tiles (no API key). Deliberately
   NOT MapLibre GL / any vector-tile-and-WebGL renderer: that approach ran
   into a real bundler gotcha (its worker script is loaded via a runtime
   `import.meta.url`-relative URL that Vite's static analysis can't see, so
   it never made it into the production build — see the fix history if this
   ever needs revisiting) on top of being categorically harder to verify,
   since WebGL rendering can't be screenshotted from this project's headless
   test tooling. Leaflet draws tiles as plain `<img>` tags on a 2D canvas —
   no worker, no WebGL, nothing that can silently fail to paint.
   ========================================================= */

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { Maximize2, X } from 'lucide-react'
import { FONT_BODY, FONT_DISPLAY } from '../lib/theme'
import { VENUE_COORDS, VENUE_ADDRESS } from '../lib/venue'

// The standard OSM tile server — CARTO's "free" basemaps (tried first) turned
// out to gate on an API key now, watermarking every tile "API KEY REQUIRED"
// for unregistered domains despite still returning 200s. This one needs no
// key or signup.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// Leaflet's default marker icon URLs are relative to leaflet.css's own
// location, which breaks once a bundler moves/hashes that file — pointing
// it at the actual imported (and therefore correctly hashed) asset URLs
// is the standard fix.
const markerIconInstance = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

/**
 * 'preview' — the card embedded in the page: pannable and pinch/double-click
 *   zoomable like a normal small map, but with the scroll wheel and
 *   keyboard left alone so this doesn't hijack the page's own scroll/tab
 *   order just because the cursor happens to be over it. No zoom buttons —
 *   there isn't room, and pinch/double-click already cover it.
 * 'full' — the modal: everything on, including scroll-zoom and the
 *   +/- buttons, since it's the only thing on screen at that point.
 */
type MapMode = 'preview' | 'full'

function useVenueMap(containerRef: React.RefObject<HTMLDivElement | null>, opts: { mode: MapMode; zoom: number }) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const full = opts.mode === 'full'
    const map = L.map(container, {
      center: [VENUE_COORDS.lat, VENUE_COORDS.lng],
      zoom: opts.zoom,
      // The default top-left position collides with FullscreenVenueMap's
      // location label, which sits there too — added separately below at
      // bottom-right instead, alongside the close button's own corner logic.
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: full,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: false,
      keyboard: false,
      attributionControl: true,
    })
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 20 }).addTo(map)
    L.marker([VENUE_COORDS.lat, VENUE_COORDS.lng], { icon: markerIconInstance }).addTo(map)
    if (full) L.control.zoom({ position: 'bottomright' }).addTo(map)

    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(container)

    return () => {
      ro.disconnect()
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounts once per element; opts is static per call site
  }, [])
}

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
  useVenueMap(containerRef, { mode: 'full', zoom: 16 })
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
          justifyContent: 'center', cursor: 'pointer', zIndex: 1000,
        }}
      >
        <X size={20} color="#111827" />
      </button>

      <div
        style={{
          position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'white', borderRadius: '12px',
          padding: '0.7rem 1rem', boxShadow: '0 2px 12px rgba(0,0,0,0.18)', fontFamily: FONT_BODY,
          maxWidth: 'calc(100vw - 6rem)', zIndex: 1000,
        }}
      >
        <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>PickleBella Park</p>
        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#6B7280' }}>{VENUE_ADDRESS}</p>
      </div>
    </div>
  )
}

/** Drop-in replacement for a static "map" placeholder: a small, pannable
 * preview with a pin. Only the corner button opens the same map
 * full-screen — the preview itself is a real (if modest) interactive map,
 * not a big "click anywhere" button, so dragging it around doesn't fight
 * with expanding it. */
export function VenueMapCard({ height = 130 }: { height?: number }) {
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useVenueMap(containerRef, { mode: 'preview', zoom: 15 })

  return (
    <>
      <div
        style={{
          height, position: 'relative',
          // `position: relative` alone doesn't create a new stacking
          // context — an explicit z-index does. Without one, Leaflet's own
          // internal panes (it uses z-index up to 700 for markers/popups,
          // meant to stay local to its own container) compare directly
          // against page-level z-indices, including the fullscreen
          // overlay's — which is how this card's pin used to end up
          // visually painting on top of a fullscreen view it's sitting
          // behind.
          zIndex: 0,
          // Hidden rather than unmounted while fullscreen is open: keeps
          // the same Leaflet instance alive (no reinitialization cost) but
          // guarantees nothing here can paint over the overlay, belt and
          // suspenders on top of the stacking-context fix above.
          visibility: fullscreen ? 'hidden' : 'visible',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        <button
          onClick={() => setFullscreen(true)}
          aria-label="Open full-screen map"
          style={{
            position: 'absolute', bottom: '8px', right: '8px', backgroundColor: 'white',
            border: 'none', borderRadius: '8px', padding: '5px', display: 'flex', alignItems: 'center',
            boxShadow: '0 1px 5px rgba(0,0,0,0.2)', cursor: 'pointer', zIndex: 1000,
          }}
        >
          <Maximize2 size={13} color="#374151" />
        </button>
      </div>

      {fullscreen && <FullscreenVenueMap onClose={() => setFullscreen(false)} />}
    </>
  )
}

export default VenueMapCard
