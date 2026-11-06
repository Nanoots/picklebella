/* Drives the static splash in index.html.

   The splash is plain markup so it paints before any JS has downloaded. The
   CSP (script-src 'self') rules out an inline script, so its rotating text,
   admin dark theme and slow-load hint are wired up here instead, from the
   first module that runs. App calls hideSplash() once real content mounts. */

import { ROTATING_MESSAGES } from '../components/PickleLoader'
import { adminThemeIsDark } from './adminThemePref'

let rotateTimer: number | undefined
let slowTimer: number | undefined

function splashEl() {
  return document.getElementById('pb-splash')
}

export function startSplash() {
  const el = splashEl()
  if (!el) return

  if (window.location.pathname.replace(/\/+$/, '') === '/admin' && adminThemeIsDark()) {
    el.classList.add('pb-loader--dark')
  }

  const msg = el.querySelector<HTMLElement>('.pb-loader__msg')
  const sub = el.querySelector<HTMLElement>('.pb-loader__sub')
  let index = 0

  if (msg) {
    rotateTimer = window.setInterval(() => {
      msg.classList.add('is-swapping')
      window.setTimeout(() => {
        index = (index + 1) % ROTATING_MESSAGES.length
        msg.textContent = ROTATING_MESSAGES[index]
        msg.classList.remove('is-swapping')
      }, 180)
    }, 2600)
  }
  if (sub) {
    slowTimer = window.setTimeout(() => {
      sub.textContent = 'This is taking a bit longer than usual…'
    }, 8000)
  }
}

let hidden = false

export function hideSplash() {
  if (hidden) return
  hidden = true
  window.clearInterval(rotateTimer)
  window.clearTimeout(slowTimer)
  document.documentElement.classList.remove('pb-loading')

  const el = splashEl()
  if (!el) return
  el.classList.add('is-hidden')
  el.setAttribute('aria-hidden', 'true')
  window.setTimeout(() => el.remove(), 400)
}
