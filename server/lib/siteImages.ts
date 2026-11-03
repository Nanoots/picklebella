/* Admin-managed photos shown on the public site: the landing-page hero, the
   court photos at the top of the booking page, and the Open Plays and Feed
   galleries.

   Everything lives in one public Supabase Storage bucket — the image files
   and a small manifest.json describing which file goes where. The manifest is
   kept in the bucket rather than in the `settings` table because that table's
   key column is constrained to 'hours' and 'pricing', and widening it would
   need a migration run by hand. The bucket is created on first use, so this
   feature needs no setup at all.

   Writes go through the service-role client after requireAdmin(); the bucket
   being public only means anyone can READ a photo by URL, which is the point. */

import { randomUUID } from 'node:crypto'
import { db } from './supabase.js'
import { SUPABASE_URL } from './env.js'
import { badRequest, notFound } from './http.js'

const BUCKET = 'site-images'
const MANIFEST_PATH = 'manifest.json'

/** Decoded size cap. Vercel rejects request bodies over 4.5 MB, and base64
    inflates by a third — the client downsizes well below this anyway. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024

export type SiteImage = {
  id: string
  url: string
  path: string
  caption: string
  createdAt: string
}

export type SiteImages = {
  hero: SiteImage[]
  openPlay: SiteImage[]
  feed: SiteImage[]
  /** Keyed by court combination: 'none', 'all', '1', '2', '1,2', … */
  courts: Record<string, SiteImage>
}

export type GallerySlot = 'hero' | 'openPlay' | 'feed'

const EMPTY: SiteImages = { hero: [], openPlay: [], feed: [], courts: {} }

function publicUrl(path: string): string {
  return `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${path}`
}

let bucketReady = false

async function ensureBucket(): Promise<void> {
  if (bucketReady) return
  const { data } = await db.storage.getBucket(BUCKET)
  if (!data) {
    const { error } = await db.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png', 'application/json'],
    })
    // Two cold starts racing to create it is fine — the loser just sees it exists.
    if (error && !/already exists/i.test(error.message)) throw error
  }
  bucketReady = true
}

function isImage(v: unknown): v is SiteImage {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.path === 'string' && typeof o.url === 'string'
}

/** Re-validated on read, like the settings blobs: a hand-edited manifest must
    not be able to put anything but our own image records on the page. */
function sanitize(raw: unknown): SiteImages {
  if (!raw || typeof raw !== 'object') return structuredClone(EMPTY)
  const o = raw as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(isImage) : [])
  const courts: Record<string, SiteImage> = {}
  if (o.courts && typeof o.courts === 'object') {
    for (const [k, v] of Object.entries(o.courts as Record<string, unknown>)) {
      if (isCourtKey(k) && isImage(v)) courts[k] = v
    }
  }
  return { hero: list(o.hero), openPlay: list(o.openPlay), feed: list(o.feed), courts }
}

/**
 * The current manifest. Never throws — the public site must render with its
 * built-in photos even if storage is unreachable.
 */
export async function getSiteImages(): Promise<SiteImages> {
  try {
    const { data, error } = await db.storage.from(BUCKET).download(MANIFEST_PATH)
    if (error || !data) return structuredClone(EMPTY)
    return sanitize(JSON.parse(await data.text()))
  } catch {
    return structuredClone(EMPTY)
  }
}

async function saveManifest(images: SiteImages): Promise<void> {
  await ensureBucket()
  const { error } = await db.storage
    .from(BUCKET)
    .upload(MANIFEST_PATH, JSON.stringify(images), { contentType: 'application/json', upsert: true, cacheControl: '0' })
  if (error) throw error
}

export function isCourtKey(key: string): boolean {
  return /^(none|all|\d{1,2}(,\d{1,2})?)$/.test(key)
}

/** Identifies the format from the file's own bytes rather than trusting a
    client-supplied content type. */
function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  if (buf.length >= 8 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    return { mime: 'image/png', ext: 'png' }
  }
  return null
}

async function storeFile(folder: string, base64: string): Promise<{ path: string; url: string }> {
  const buf = Buffer.from(base64, 'base64')
  if (buf.length === 0) throw badRequest('The image is empty.')
  if (buf.length > MAX_IMAGE_BYTES) throw badRequest('That image is too large. Try a smaller photo.')
  const kind = sniffImage(buf)
  if (!kind) throw badRequest('Only JPEG, PNG and WebP images are supported.')

  await ensureBucket()
  const path = `${folder}/${randomUUID()}.${kind.ext}`
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: kind.mime, upsert: false, cacheControl: '31536000' })
  if (error) throw error
  return { path, url: publicUrl(path) }
}

async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  // Best effort: an orphaned file costs a little storage, whereas failing the
  // request would leave the manifest and what the admin sees out of step.
  const { error } = await db.storage.from(BUCKET).remove(paths)
  if (error) console.error('[siteImages] failed to remove files', { paths, error: error.message })
}

export async function addGalleryImage(slot: GallerySlot, base64: string, caption: string): Promise<SiteImages> {
  const file = await storeFile(slot, base64)
  const images = await getSiteImages()
  const image: SiteImage = { id: randomUUID(), ...file, caption, createdAt: new Date().toISOString() }
  // Feed and Open Plays read newest-first; hero slides play in upload order.
  images[slot] = slot === 'hero' ? [...images[slot], image] : [image, ...images[slot]]
  await saveManifest(images)
  return images
}

export async function setCourtImage(key: string, base64: string): Promise<SiteImages> {
  if (!isCourtKey(key)) throw badRequest('Unknown court photo slot.')
  const file = await storeFile('courts', base64)
  const images = await getSiteImages()
  const previous = images.courts[key]
  images.courts[key] = { id: randomUUID(), ...file, caption: '', createdAt: new Date().toISOString() }
  await saveManifest(images)
  if (previous) await removeFiles([previous.path])
  return images
}

export async function updateCaption(id: string, caption: string): Promise<SiteImages> {
  const images = await getSiteImages()
  const image = [...images.hero, ...images.openPlay, ...images.feed].find((i) => i.id === id)
  if (!image) throw notFound('Image not found.')
  image.caption = caption
  await saveManifest(images)
  return images
}

export async function deleteImage(id: string): Promise<SiteImages> {
  const images = await getSiteImages()
  let removed: SiteImage | undefined

  for (const slot of ['hero', 'openPlay', 'feed'] as const) {
    const hit = images[slot].find((i) => i.id === id)
    if (hit) {
      removed = hit
      images[slot] = images[slot].filter((i) => i.id !== id)
    }
  }
  for (const [key, img] of Object.entries(images.courts)) {
    if (img.id === id) {
      removed = img
      delete images.courts[key]
    }
  }

  if (!removed) throw notFound('Image not found.')
  await saveManifest(images)
  await removeFiles([removed.path])
  return images
}
