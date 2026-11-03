/* Admin-uploaded site photos, as delivered by /api/config.

   The last manifest seen is remembered in localStorage so a returning visitor
   gets the custom hero on first paint, instead of the bundled photo flashing
   up and being swapped out once the config request lands. */

import { useEffect, useState } from 'react'
import type { SiteImages } from './types'

const CACHE_KEY = 'pb-site-images'

export const EMPTY_SITE_IMAGES: SiteImages = { hero: [], openPlay: [], feed: [], courts: {} }

function readCache(): SiteImages | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as SiteImages) : null
  } catch {
    return null
  }
}

/** `fresh` is the manifest from this page's config load, once it arrives. */
export function useSiteImages(fresh: SiteImages | undefined): SiteImages {
  const [cached] = useState(readCache)

  useEffect(() => {
    if (!fresh) return
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(fresh))
    } catch {
      // Private mode or a full quota — the cache is only a nicety.
    }
  }, [fresh])

  return fresh ?? cached ?? EMPTY_SITE_IMAGES
}

/**
 * Downsizes a picked photo in the browser and returns it as base64 WebP (or
 * JPEG where the browser can't encode WebP).
 *
 * Phone photos are routinely 5–12 MB, well past what a Vercel function will
 * accept as a request body; 2000px on the long edge is plenty for a full-bleed
 * hero and keeps uploads to a few hundred KB.
 */
export async function prepareImageUpload(file: File, maxEdge = 2000): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image couldn't be read. Try a JPEG or PNG.")
  })
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
  // Older Safari silently hands back a PNG when asked for WebP — fall back to
  // JPEG rather than upload a PNG several times the size.
  let blob = await toBlob('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg')
  if (!blob) throw new Error("That image couldn't be processed.")

  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
