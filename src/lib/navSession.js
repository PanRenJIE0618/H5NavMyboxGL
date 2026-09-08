/**
 * 导航会话快照（sessionStorage）
 * 用于页面挂起后重绑、以及冷启动「继续导航」确认。
 */

import { getBehaviorPolicy } from '../config/behaviorPolicy.js'

export const NAV_SESSION_KEY = 'h5nav:session'
export const NAV_SESSION_VERSION = 1

function ttlMs() {
  const n = Number(getBehaviorPolicy().navSessionTtlMs)
  return Number.isFinite(n) && n > 0 ? n : 7200000
}

function storage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isNavSessionFresh(raw) {
  if (!raw || typeof raw !== 'object') return false
  const s = /** @type {Record<string, unknown>} */ (raw)
  if (Number(s.version) !== NAV_SESSION_VERSION) return false
  if (s.navigating !== true) return false
  const updatedAt = Number(s.updatedAt)
  if (!Number.isFinite(updatedAt)) return false
  if (Date.now() - updatedAt > ttlMs()) return false
  const dest = s.destination
  if (!dest || typeof dest !== 'object') return false
  const d = /** @type {Record<string, unknown>} */ (dest)
  if (!Number.isFinite(Number(d.lng)) || !Number.isFinite(Number(d.lat))) return false
  const route = s.route
  if (!route || typeof route !== 'object') return false
  const path = /** @type {Record<string, unknown>} */ (route).path
  if (!Array.isArray(path) || path.length < 2) return false
  return true
}

/** @returns {object | null} */
export function loadNavSession() {
  const store = storage()
  if (!store) return null
  try {
    const text = store.getItem(NAV_SESSION_KEY)
    if (!text) return null
    const parsed = JSON.parse(text)
    if (!isNavSessionFresh(parsed)) {
      store.removeItem(NAV_SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    try {
      store.removeItem(NAV_SESSION_KEY)
    } catch {
      // ignore
    }
    return null
  }
}

export function clearNavSession() {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(NAV_SESSION_KEY)
  } catch {
    // ignore
  }
}

/**
 * @param {object} snapshot
 */
export function saveNavSession(snapshot) {
  const store = storage()
  if (!store) return false
  try {
    const payload = {
      ...snapshot,
      version: NAV_SESSION_VERSION,
      updatedAt: Date.now(),
      navigating: true,
    }
    if (!isNavSessionFresh(payload)) return false
    store.setItem(NAV_SESSION_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

/**
 * 从 NavMap 当前状态组装快照
 * @param {{
 *   destination: { name?: string, lng: number, lat: number, address?: string },
 *   travelMode: string,
 *   driveStyle: string,
 *   routeInfo: { mode?: string, style?: string, distanceMeters?: number, durationSeconds?: number, path?: Array<{lng:number,lat:number}|[number,number]>, guides?: Array<{text?: string}> },
 *   remainingMeters?: number | null,
 *   remainingSeconds?: number | null,
 *   nextGuide?: string | null,
 *   followUser?: boolean,
 *   headingTestLock?: boolean,
 * }} state
 */
export function buildNavSessionSnapshot(state) {
  const dest = state.destination
  const route = state.routeInfo
  if (!dest || !route?.path?.length) return null

  const path = route.path.map((p) => {
    if (Array.isArray(p)) return [Number(p[0]), Number(p[1])]
    return [Number(p.lng), Number(p.lat)]
  }).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))

  if (path.length < 2) return null

  const guides = Array.isArray(route.guides)
    ? route.guides
        .map((g) => ({ text: String(g?.text || '').trim() }))
        .filter((g) => g.text)
    : []

  return {
    version: NAV_SESSION_VERSION,
    updatedAt: Date.now(),
    navigating: true,
    destination: {
      name: String(dest.name || '目的地'),
      lng: Number(dest.lng),
      lat: Number(dest.lat),
      address: dest.address ? String(dest.address) : '',
    },
    travelMode: state.travelMode === 'walk' ? 'walk' : 'drive',
    driveStyle: String(state.driveStyle || (state.travelMode === 'walk' ? 'walk' : '0')),
    route: {
      mode: route.mode || state.travelMode,
      style: route.style || state.driveStyle,
      distanceMeters: Number(route.distanceMeters) || 0,
      durationSeconds: Number(route.durationSeconds) || 0,
      path,
      guides,
    },
    remainingMeters:
      state.remainingMeters == null ? null : Number(state.remainingMeters),
    remainingSeconds:
      state.remainingSeconds == null ? null : Number(state.remainingSeconds),
    nextGuide: state.nextGuide ? String(state.nextGuide) : '',
    followUser: Boolean(state.followUser),
    headingTestLock: Boolean(state.headingTestLock),
  }
}
