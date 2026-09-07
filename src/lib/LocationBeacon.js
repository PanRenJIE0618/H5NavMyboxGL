import { unwrapHeading } from './heading.js'

const MARKER_HTML = `
  <div class="me-marker__pulse"></div>
  <div class="me-marker__disc"></div>
  <div class="me-marker__needle">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path class="me-marker__tip" d="M32 4 L42 42 L32 35 L22 42 Z" />
    </svg>
  </div>
  <div class="me-marker__core"></div>
  <div class="me-marker__label">我的位置</div>
`

const SMOOTH_TAU_S = 0.22
const SETTLE_EPS = 1e-7
const MARKER_HALF = 36

function readLngLat(lnglat) {
  if (!lnglat) return null
  const lng = typeof lnglat.getLng === 'function' ? lnglat.getLng() : lnglat.lng
  const lat = typeof lnglat.getLat === 'function' ? lnglat.getLat() : lnglat.lat
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

/**
 * MapboxGL 定位点：指数平滑 + map.project 屏幕坐标
 */
export class LocationBeacon {
  constructor(map) {
    this.map = map
    this.lnglat = null
    this.heading = 0
    this.displayRotate = 0
    this.hasHeading = false
    this._display = null
    this._target = null
    this._animRaf = 0
    this._lastTs = 0
    this._animate = true

    this._div = document.createElement('div')
    this._div.className = 'me-marker'
    this._div.innerHTML = MARKER_HTML
    this._needle = this._div.querySelector('.me-marker__needle')
    this._onChange = () => this.draw()
  }

  attach() {
    const root = this.map.getCanvasContainer?.() || this.map.getContainer()
    root.appendChild(this._div)
    this.map.on('move', this._onChange)
    this.map.on('zoom', this._onChange)
    this.map.on('resize', this._onChange)
    this.draw()
  }

  setLngLat(lnglat, opts = {}) {
    const next = readLngLat(lnglat)
    if (!next) return

    this.lnglat = lnglat
    this._target = next
    this._animate = opts.animate !== false && !prefersReducedMotion()

    if (!this._animate || !this._display) {
      this._stopLoop()
      this._display = { ...next }
      this.draw()
      return
    }

    this._ensureLoop()
  }

  getDisplayLngLat() {
    return this._display ? { ...this._display } : readLngLat(this.lnglat)
  }

  setHeading(deg, hasHeading) {
    this.displayRotate = unwrapHeading(this.displayRotate, deg)
    this.heading = ((this.displayRotate % 360) + 360) % 360
    this.hasHeading = Boolean(hasHeading)
    this._div.classList.toggle('is-heading', this.hasHeading)
    this._needle.style.transform = `rotate(${this.displayRotate}deg)`
  }

  draw() {
    const pos = this._display || this._target || readLngLat(this.lnglat)
    if (!pos || !this.map) {
      this._div.hidden = true
      return
    }

    this._div.hidden = false
    const point = this.map.project([pos.lng, pos.lat])
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return
    this._div.style.transform = `translate3d(${point.x - MARKER_HALF}px, ${point.y - MARKER_HALF}px, 0)`
  }

  _ensureLoop() {
    if (this._animRaf) return
    this._lastTs = 0

    const step = (now) => {
      if (!this._target || !this._display) {
        this._animRaf = 0
        this._lastTs = 0
        return
      }

      const last = this._lastTs || now
      this._lastTs = now
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      const alpha = 1 - Math.exp(-dt / SMOOTH_TAU_S)

      const { lng: tlng, lat: tlat } = this._target
      this._display.lng += (tlng - this._display.lng) * alpha
      this._display.lat += (tlat - this._display.lat) * alpha
      this.draw()

      const dLng = Math.abs(tlng - this._display.lng)
      const dLat = Math.abs(tlat - this._display.lat)
      if (dLng < SETTLE_EPS && dLat < SETTLE_EPS) {
        this._display.lng = tlng
        this._display.lat = tlat
        this.draw()
        this._animRaf = 0
        this._lastTs = 0
        return
      }

      this._animRaf = requestAnimationFrame(step)
    }

    this._animRaf = requestAnimationFrame(step)
  }

  _stopLoop() {
    if (this._animRaf) {
      cancelAnimationFrame(this._animRaf)
      this._animRaf = 0
    }
    this._lastTs = 0
  }

  destroy() {
    this._stopLoop()
    try {
      this.map.off('move', this._onChange)
      this.map.off('zoom', this._onChange)
      this.map.off('resize', this._onChange)
    } catch {
      // ignore
    }
    this._div.remove()
  }
}
