/* The PickleBella rally loader, in React.

   Styles live in src/styles/pickle-loader.css (linked from index.html so the
   static splash there shares them). The markup here must stay in step with
   the splash markup in index.html. */

import { useEffect, useState } from 'react'
import { adminThemeIsDark } from '../lib/adminThemePref'

/** Served from /public so the splash in index.html and this component hit
 * the same cached file instead of a hashed copy each. */
export const LOADER_LOGO = '/assets/logo.webp'

export const ROTATING_MESSAGES = [
  'Connecting to Server',
  'Loading Courts',
  'Checking Available Schedules',
  'Preparing Your Reservation',
]

const ROTATE_EVERY = 2600
const SLOW_AFTER = 8000

function Ball() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="pbBallShade" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#e3f55a" />
          <stop offset="0.6" stopColor="#c3de00" />
          <stop offset="1" stopColor="#8fae00" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#pbBallShade)" stroke="#467500" strokeWidth="1.4" />
      <g fill="#5d8a00" opacity="0.75">
        <circle cx="16" cy="8" r="2" />
        <circle cx="9" cy="13" r="2" />
        <circle cx="23" cy="13" r="2" />
        <circle cx="12" cy="21" r="2" />
        <circle cx="20" cy="21" r="2" />
        <circle cx="16" cy="15" r="1.6" />
      </g>
    </svg>
  )
}

function Paddle() {
  return (
    <svg viewBox="0 0 24 40" aria-hidden="true" focusable="false">
      <rect x="9.5" y="23" width="5" height="15" rx="2.2" fill="#ea6194" />
      <rect x="9.5" y="35.5" width="5" height="3" rx="1.2" fill="#c54a7b" />
      <path d="M9 22 L12 27 L15 22 Z" fill="#042210" />
      <rect x="1.5" y="1" width="21" height="23" rx="9.5" fill="#0b4526" stroke="#042210" strokeWidth="1.4" />
      <rect x="5" y="4.5" width="14" height="16" rx="6.5" fill="none" stroke="#2f7a50" strokeWidth="1" />
    </svg>
  )
}

export function Court() {
  return (
    <div className="pb-loader__court" aria-hidden="true">
      <span className="pb-loader__paddle pb-loader__paddle--left">
        <span className="pb-loader__paddle-swing"><Paddle /></span>
      </span>
      <span className="pb-loader__paddle pb-loader__paddle--right">
        <span className="pb-loader__paddle-swing"><Paddle /></span>
      </span>
      <div className="pb-loader__ball-x">
        <span className="pb-loader__shadow" />
        <div className="pb-loader__ball-y">
          <span className="pb-loader__ball"><Ball /></span>
        </div>
      </div>
    </div>
  )
}

/** Cycles through ROTATING_MESSAGES with the fade-swap from the preview. */
function useRotatingMessage(enabled: boolean) {
  const [index, setIndex] = useState(0)
  const [swapping, setSwapping] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let swapTimer: number | undefined
    const id = window.setInterval(() => {
      setSwapping(true)
      swapTimer = window.setTimeout(() => {
        setIndex((i) => (i + 1) % ROTATING_MESSAGES.length)
        setSwapping(false)
      }, 180)
    }, ROTATE_EVERY)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(swapTimer)
    }
  }, [enabled])

  return { text: ROTATING_MESSAGES[index], swapping }
}

function useSlowHint(enabled: boolean) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const id = window.setTimeout(() => setSlow(true), SLOW_AFTER)
    return () => window.clearTimeout(id)
  }, [enabled])
  return slow
}

/** Strips a trailing ellipsis — the animated dots already say "in progress". */
function clean(label: string) {
  return label.replace(/(\.{3}|…)\s*$/, '')
}

/**
 * Full-page loader: logo, rally, message. Used while a lazy page chunk is
 * downloading. With no `message`, it rotates through the stock messages.
 */
export function PageLoader({ message }: { message?: string }) {
  const rotating = useRotatingMessage(!message)
  const slow = useSlowHint(true)
  // The admin chunk is what this most often waits on — match its theme so a
  // dark-mode admin doesn't get a white flash before the dashboard paints.
  const dark = window.location.pathname.replace(/\/+$/, '') === '/admin' && adminThemeIsDark()
  const text = message ? clean(message) : rotating.text

  return (
    <div
      className={`pb-loader pb-loader--screen${dark ? ' pb-loader--dark' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="pb-loader__content">
        <img className="pb-loader__logo" src={LOADER_LOGO} alt="PickleBella Park" draggable={false} decoding="async" />
        <Court />
        <div className="pb-loader__status">
          <p className={`pb-loader__msg${!message && rotating.swapping ? ' is-swapping' : ''}`}>{text}</p>
          <span className="pb-loader__dots" aria-hidden="true"><i /><i /><i /></span>
        </div>
        <p className="pb-loader__sub">{slow ? 'This is taking a bit longer than usual…' : ''}</p>
      </div>
    </div>
  )
}

/**
 * In-page loader for one section (a list, a grid, a settings panel). Takes
 * the space the content will occupy instead of covering the page.
 *
 * `logo` adds the breathing logo above the rally — worth it for a section
 * that is the whole page's content, noise for a small card.
 */
export function BlockLoader({ label = 'Loading', pad = '3rem', logo = false }: { label?: string; pad?: string; logo?: boolean }) {
  return (
    <div
      className="pb-loader pb-loader--block"
      role="status"
      aria-live="polite"
      style={{ ['--pbl-pad' as string]: pad }}
    >
      <div className="pb-loader__content">
        {logo && <img className="pb-loader__logo" src={LOADER_LOGO} alt="" draggable={false} decoding="async" />}
        <Court />
        <div className="pb-loader__status">
          <p className="pb-loader__msg">{clean(label)}</p>
          <span className="pb-loader__dots" aria-hidden="true"><i /><i /><i /></span>
        </div>
      </div>
    </div>
  )
}
