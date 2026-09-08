/**
 * 导航偏好（语音 / 默认出行 / 默认路线）
 * 持久化：localStorage `h5nav:navPrefs`
 */

import { DRIVE_STYLES, TRAVEL_MODES } from './route.js'
import { setNavVoiceMuted } from './navVoice.js'

export const NAV_PREFS_KEY = 'h5nav:navPrefs'

/** @typedef {{ voiceEnabled: boolean, travelMode: 'drive' | 'walk', driveStyle: string }} NavPrefs */

/** @type {Set<(prefs: NavPrefs) => void>} */
const listeners = new Set()

/**
 * @returns {NavPrefs}
 */
export function defaultNavPrefs() {
  return {
    voiceEnabled: true,
    travelMode: 'drive',
    driveStyle: '0',
  }
}

/**
 * @param {unknown} raw
 * @returns {NavPrefs}
 */
export function normalizeNavPrefs(raw) {
  const base = defaultNavPrefs()
  const src = raw && typeof raw === 'object' ? raw : {}
  const travelMode = TRAVEL_MODES.some((m) => m.id === src.travelMode)
    ? /** @type {'drive'|'walk'} */ (src.travelMode)
    : base.travelMode
  const driveStyle = DRIVE_STYLES.some((s) => s.id === String(src.driveStyle))
    ? String(src.driveStyle)
    : base.driveStyle
  return {
    voiceEnabled: src.voiceEnabled === false ? false : true,
    travelMode,
    driveStyle: travelMode === 'walk' ? 'walk' : driveStyle,
  }
}

/**
 * @returns {NavPrefs}
 */
export function getNavPrefs() {
  try {
    const raw = localStorage.getItem(NAV_PREFS_KEY)
    if (!raw) return defaultNavPrefs()
    return normalizeNavPrefs(JSON.parse(raw))
  } catch {
    return defaultNavPrefs()
  }
}

/**
 * @param {Partial<NavPrefs>} patch
 * @returns {NavPrefs}
 */
export function setNavPrefs(patch) {
  const next = normalizeNavPrefs({ ...getNavPrefs(), ...patch })
  try {
    localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  try {
    setNavVoiceMuted(!next.voiceEnabled)
  } catch {
    // ignore
  }
  listeners.forEach((fn) => {
    try {
      fn(next)
    } catch {
      // ignore
    }
  })
  return next
}

export function getVoiceEnabled() {
  return getNavPrefs().voiceEnabled
}

/**
 * @param {boolean} enabled
 */
export function setVoiceEnabled(enabled) {
  return setNavPrefs({ voiceEnabled: Boolean(enabled) })
}

export function getDefaultTravelMode() {
  return getNavPrefs().travelMode
}

/**
 * @param {'drive'|'walk'|string} mode
 */
export function setDefaultTravelMode(mode) {
  const travelMode = mode === 'walk' ? 'walk' : 'drive'
  return setNavPrefs({
    travelMode,
    driveStyle: travelMode === 'walk' ? 'walk' : getNavPrefs().driveStyle === 'walk' ? '0' : getNavPrefs().driveStyle,
  })
}

export function getDefaultDriveStyle() {
  const prefs = getNavPrefs()
  return prefs.travelMode === 'walk' ? 'walk' : prefs.driveStyle
}

/**
 * @param {string} style
 */
export function setDefaultDriveStyle(style) {
  const driveStyle = DRIVE_STYLES.some((s) => s.id === String(style)) ? String(style) : '0'
  return setNavPrefs({ travelMode: 'drive', driveStyle })
}

/**
 * @param {(prefs: NavPrefs) => void} fn
 * @returns {() => void}
 */
export function onNavPrefsChange(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 启动时把语音静音状态与偏好对齐 */
export function initNavPrefs() {
  const prefs = getNavPrefs()
  try {
    setNavVoiceMuted(!prefs.voiceEnabled)
  } catch {
    // ignore
  }
  return prefs
}
