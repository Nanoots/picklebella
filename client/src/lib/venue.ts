/** Split out from VenueMap.tsx so pages can use the address/link text without
 * pulling maplibre-gl into their bundle — only VenueMapCard itself needs
 * that, and it's lazy-loaded (see its usage in LandingPage/BookingPage). */
export const VENUE_COORDS = { lat: 6.628528, lng: 124.603528 }
export const VENUE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${VENUE_COORDS.lat},${VENUE_COORDS.lng}`
export const VENUE_ADDRESS = 'Jamison St., Isulan, Sultan Kudarat'
