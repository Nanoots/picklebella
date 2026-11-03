import { useRef, useState } from 'react'
import { ImagePlus, Trash2, RotateCcw, Pencil, Check, X } from 'lucide-react'
import heroDefault1 from '@/imports/opt/Court123.webp'
import heroDefault2 from '@/imports/opt/Court_1_2_3.webp'
import court1Img from '@/imports/opt/Court1.webp'
import court2Img from '@/imports/opt/Court2.webp'
import court3Img from '@/imports/opt/Court3.webp'
import court12Img from '@/imports/opt/Court1_2.webp'
import court13Img from '@/imports/opt/Court1_3.webp'
import court23Img from '@/imports/opt/Court2_3.webp'
import * as api from '../../lib/api'
import type { GallerySlot, SiteImage, SiteImages } from '../../lib/types'
import { prepareImageUpload } from '../../lib/siteImages'
import { useAsync, errorMessage } from '../../lib/useAsync'
import { ErrorBlock, LoadingBlock } from '../../components/States'
import { G, FONT_BODY } from '../../lib/theme'
import { SectionCard } from './shared'

interface Props {
  showToast: (msg: string) => void
}

/* The booking page's header photo follows whichever courts are in the
   basket. These are the same keys BookingPage's photoForCourts() looks up. */
const COURT_SLOTS: { key: string; label: string; fallback: string }[] = [
  { key: 'none', label: 'No court selected', fallback: heroDefault1 },
  { key: '1', label: 'Court 1', fallback: court1Img },
  { key: '2', label: 'Court 2', fallback: court2Img },
  { key: '3', label: 'Court 3', fallback: court3Img },
  { key: '1,2', label: 'Courts 1 + 2', fallback: court12Img },
  { key: '1,3', label: 'Courts 1 + 3', fallback: court13Img },
  { key: '2,3', label: 'Courts 2 + 3', fallback: court23Img },
  { key: 'all', label: 'All courts', fallback: heroDefault2 },
]

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: G, color: 'white', border: 'none',
  borderRadius: '999px', padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_BODY,
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px',
  borderRadius: '999px', border: 'none', backgroundColor: 'rgba(17,24,39,0.7)', color: 'white', cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1.5px solid var(--pb-border)',
  fontSize: '0.85rem', fontFamily: FONT_BODY, boxSizing: 'border-box', backgroundColor: 'var(--pb-card)', color: 'var(--pb-text)',
}

/** A hidden file input behind a button. Picks one or several images. */
function UploadButton({ label, multiple, busy, onFiles }: { label: string; multiple?: boolean; busy: boolean; onFiles: (files: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
        <ImagePlus size={15} /> {busy ? 'Uploading…' : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = '' // so picking the same file again still fires
          if (files.length) onFiles(files)
        }}
      />
    </>
  )
}

function Thumb({ src, aspect = '16 / 9', badge, children }: { src: string; aspect?: string; badge?: string; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', aspectRatio: aspect, borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--pb-border-soft)' }}>
      <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {badge && (
        <span style={{ position: 'absolute', top: '6px', left: '6px', backgroundColor: 'rgba(17,24,39,0.7)', color: 'white', fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{badge}</span>
      )}
      {children && <div style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', gap: '4px' }}>{children}</div>}
    </div>
  )
}

function CaptionEditor({ image, onSave }: { image: SiteImage; onSave: (caption: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(image.caption)
  const [saving, setSaving] = useState(false)

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginTop: '0.4rem' }}>
        <p style={{ flex: 1, margin: 0, fontSize: '0.78rem', color: image.caption ? 'var(--pb-text-soft)' : 'var(--pb-text-muted)', lineHeight: 1.4, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
          {image.caption || 'No caption'}
        </p>
        <button type="button" onClick={() => { setValue(image.caption); setEditing(true) }} aria-label="Edit caption" style={{ border: 'none', background: 'none', color: 'var(--pb-text-faint)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
          <Pencil size={13} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '0.4rem' }}>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} rows={2} style={{ ...inputStyle, resize: 'vertical' }} autoFocus />
      <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
        <button
          type="button"
          disabled={saving}
          onClick={async () => { setSaving(true); try { await onSave(value.trim()); setEditing(false) } finally { setSaving(false) } }}
          style={{ ...btnPrimary, padding: '0.3rem 0.75rem', fontSize: '0.72rem' }}
        >
          <Check size={12} /> Save
        </button>
        <button type="button" onClick={() => setEditing(false)} style={{ ...btnPrimary, padding: '0.3rem 0.75rem', fontSize: '0.72rem', backgroundColor: 'var(--pb-card)', color: 'var(--pb-text-faint)', border: '1px solid var(--pb-border)' }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

export default function ImagesView({ showToast }: Props) {
  const loaded = useAsync<SiteImages>(() => api.admin.listImages(), [])
  const [images, setImages] = useState<SiteImages | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [captions, setCaptions] = useState<Record<'openPlay' | 'feed', string>>({ openPlay: '', feed: '' })

  const current = images ?? loaded.data

  async function run(key: string, task: () => Promise<SiteImages>, done: string) {
    if (busy) return
    setBusy(key)
    try {
      setImages(await task())
      showToast(done)
    } catch (err) {
      showToast(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  function uploadGallery(slot: GallerySlot, files: File[]) {
    const caption = slot === 'hero' ? '' : captions[slot]
    void run(slot, async () => {
      let latest: SiteImages | null = null
      // One at a time: each upload rewrites the manifest, so parallel ones
      // would race and drop each other's entries.
      for (const file of files) {
        latest = await api.admin.uploadImage({ slot, data: await prepareImageUpload(file), caption })
      }
      if (slot !== 'hero') setCaptions((c) => ({ ...c, [slot]: '' }))
      return latest!
    }, files.length > 1 ? `${files.length} photos uploaded` : 'Photo uploaded')
  }

  function uploadCourt(key: string, file: File) {
    void run(`court:${key}`, async () => api.admin.uploadImage({ slot: 'court', key, data: await prepareImageUpload(file) }), 'Court photo updated')
  }

  function remove(image: SiteImage, done = 'Photo removed') {
    if (!window.confirm('Remove this photo from the site?')) return
    void run(`del:${image.id}`, () => api.admin.deleteImage(image.id), done)
  }

  async function saveCaption(image: SiteImage, caption: string) {
    try {
      setImages(await api.admin.updateImageCaption(image.id, caption))
      showToast('Caption saved')
    } catch (err) {
      showToast(errorMessage(err))
      throw err
    }
  }

  if (loaded.loading && !current) return <LoadingBlock label="Loading images…" pad="4rem" />
  if (loaded.error && !current) return <ErrorBlock message={loaded.error} onRetry={loaded.reload} />
  if (!current) return null

  const grid = (min: string): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))`, gap: '0.85rem' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--pb-text-faint)' }}>
        Changes can take up to a minute to appear on the public site. Large photos are resized automatically before upload.
      </p>

      {/* LANDING BACKGROUND */}
      <SectionCard
        title="Landing page background"
        subtitle={current.hero.length > 1 ? 'These rotate as a slideshow behind the hero.' : 'Shown full-width behind the hero. Add more than one to make a slideshow.'}
        action={<UploadButton label="Add background" multiple busy={busy === 'hero'} onFiles={(f) => uploadGallery('hero', f)} />}
      >
        {current.hero.length === 0 ? (
          <>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'var(--pb-text-muted)' }}>Using the built-in photos. Uploading a background replaces them.</p>
            <div style={grid('220px')}>
              <Thumb src={heroDefault1} badge="Default" />
              <Thumb src={heroDefault2} badge="Default" />
            </div>
          </>
        ) : (
          <div style={grid('220px')}>
            {current.hero.map((img, i) => (
              <Thumb key={img.id} src={img.url} badge={`Slide ${i + 1}`}>
                <button type="button" aria-label="Remove" disabled={busy !== null} onClick={() => remove(img)} style={iconBtn}><Trash2 size={14} /></button>
              </Thumb>
            ))}
          </div>
        )}
      </SectionCard>

      {/* COURT PHOTOS */}
      <SectionCard title="Court photos" subtitle="The photo at the top of the booking page changes with the courts a customer has selected.">
        <div style={grid('200px')}>
          {COURT_SLOTS.map((slot) => {
            const uploaded = current.courts[slot.key]
            const key = `court:${slot.key}`
            return (
              <div key={slot.key}>
                <Thumb src={uploaded?.url ?? slot.fallback} badge={uploaded ? 'Custom' : 'Default'}>
                  {uploaded && (
                    <button type="button" aria-label="Reset to default" title="Reset to default" disabled={busy !== null} onClick={() => remove(uploaded, 'Reset to default photo')} style={iconBtn}>
                      <RotateCcw size={14} />
                    </button>
                  )}
                </Thumb>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--pb-text)' }}>{slot.label}</span>
                  <UploadButton label="Change" busy={busy === key} onFiles={(f) => uploadCourt(slot.key, f[0]!)} />
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* OPEN PLAYS + FEED */}
      {([
        { slot: 'openPlay', title: 'Open Plays', subtitle: 'Photo gallery on the Open Plays tab of the booking page.', empty: 'No open play photos yet.' },
        { slot: 'feed', title: 'Feed', subtitle: 'Posts on the Feed tab, newest first. Add a caption to say what’s happening.', empty: 'Nothing posted yet.' },
      ] as const).map(({ slot, title, subtitle, empty }) => (
        <SectionCard key={slot} title={title} subtitle={subtitle}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <textarea
              value={captions[slot]}
              onChange={(e) => setCaptions((c) => ({ ...c, [slot]: e.target.value }))}
              placeholder={slot === 'feed' ? 'Write a caption for the next post (optional)' : 'Caption for the next photo (optional)'}
              maxLength={500}
              rows={slot === 'feed' ? 2 : 1}
              style={{ ...inputStyle, flex: '1 1 260px', width: 'auto', resize: 'vertical' }}
            />
            <UploadButton label={slot === 'feed' ? 'Post photo' : 'Upload photos'} multiple={slot === 'openPlay'} busy={busy === slot} onFiles={(f) => uploadGallery(slot, f)} />
          </div>
          {current[slot].length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--pb-text-muted)' }}>{empty}</p>
          ) : (
            <div style={grid('180px')}>
              {current[slot].map((img) => (
                <div key={img.id}>
                  <Thumb src={img.url} aspect="4 / 3">
                    <button type="button" aria-label="Remove" disabled={busy !== null} onClick={() => remove(img)} style={iconBtn}><Trash2 size={14} /></button>
                  </Thumb>
                  <CaptionEditor image={img} onSave={(c) => saveCaption(img, c)} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  )
}
