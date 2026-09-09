/**
 * 启动屏：首屏即显，地图就绪后淡出
 */

export const BOOT_SPLASH_ID = 'boot-splash'
export const BOOT_MIN_MS = 4000
export const BOOT_MAX_MS = 12000

let startedAt = 0
let dismissed = false
/** @type {ReturnType<typeof setTimeout> | 0} */
let maxTimer = 0

function el() {
  return typeof document !== 'undefined' ? document.getElementById(BOOT_SPLASH_ID) : null
}

export function initBootSplash() {
  startedAt = Date.now()
  dismissed = false
  const node = el()
  if (!node) return
  node.classList.add('is-on')
  node.setAttribute('aria-busy', 'true')
  if (maxTimer) clearTimeout(maxTimer)
  maxTimer = setTimeout(() => {
    dismissBootSplash({ force: true })
  }, BOOT_MAX_MS)
}

/**
 * @param {number} pct 0~100
 * @param {string} [label]
 */
export function setBootProgress(pct, label) {
  const node = el()
  if (!node || dismissed) return
  const bar = node.querySelector('[data-boot-bar]')
  const text = node.querySelector('[data-boot-status]')
  const n = Math.max(0, Math.min(100, Number(pct) || 0))
  if (bar instanceof HTMLElement) {
    bar.style.width = `${n}%`
  }
  if (label && text) text.textContent = label
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export function dismissBootSplash(opts = {}) {
  if (dismissed) return
  const node = el()
  if (!node) {
    dismissed = true
    return
  }

  const wait = opts.force ? 0 : Math.max(0, BOOT_MIN_MS - (Date.now() - startedAt))
  const finish = () => {
    if (dismissed) return
    dismissed = true
    if (maxTimer) {
      clearTimeout(maxTimer)
      maxTimer = 0
    }
    setBootProgress(100)
    node.classList.add('is-leaving')
    node.setAttribute('aria-busy', 'false')
    window.setTimeout(() => {
      node.classList.remove('is-on', 'is-leaving')
      node.setAttribute('hidden', '')
      try {
        node.remove()
      } catch {
        // ignore
      }
    }, 620)
  }

  if (wait <= 0) finish()
  else window.setTimeout(finish, wait)
}

export function isBootSplashVisible() {
  return !dismissed && Boolean(el()?.classList.contains('is-on'))
}
