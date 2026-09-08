/**
 * 天地图底图切换（矢量 / 影像 / 地形）
 * 持久化：localStorage `h5nav:basemap`
 */

import { tiandituTileUrls } from '../config.js'

export const BASEMAP_KEY = 'h5nav:basemap'

/** @typedef {'vec' | 'img' | 'ter'} BasemapId */

/** @type {readonly BasemapId[]} */
export const BASEMAP_IDS = Object.freeze(['vec', 'img', 'ter'])

export const BASEMAP_OPTIONS = Object.freeze([
  {
    id: 'vec',
    label: '矢量',
    desc: '标准道路与地物，日常导航',
    base: 'vec_w',
    labelLayer: 'cva_w',
  },
  {
    id: 'img',
    label: '影像',
    desc: '卫星影像，看实地地貌',
    base: 'img_w',
    labelLayer: 'cia_w',
  },
  {
    id: 'ter',
    label: '地形',
    desc: '地形晕渲，看地势起伏',
    base: 'ter_w',
    labelLayer: 'cta_w',
  },
])

/** @type {Set<(id: BasemapId) => void>} */
const listeners = new Set()

/**
 * @param {unknown} value
 * @returns {BasemapId}
 */
export function normalizeBasemap(value) {
  const id = String(value || '').trim()
  return BASEMAP_IDS.includes(/** @type {BasemapId} */ (id))
    ? /** @type {BasemapId} */ (id)
    : 'vec'
}

/** @returns {typeof BASEMAP_OPTIONS[number]} */
export function getBasemapOption(id) {
  const key = normalizeBasemap(id)
  return BASEMAP_OPTIONS.find((item) => item.id === key) || BASEMAP_OPTIONS[0]
}

export function getStoredBasemap() {
  try {
    return normalizeBasemap(localStorage.getItem(BASEMAP_KEY))
  } catch {
    return 'vec'
  }
}

/**
 * @param {BasemapId} id
 * @returns {{ baseTiles: string[], labelTiles: string[] }}
 */
export function basemapTileUrls(id) {
  const opt = getBasemapOption(id)
  return {
    baseTiles: tiandituTileUrls(opt.base),
    labelTiles: tiandituTileUrls(opt.labelLayer),
  }
}

/**
 * @param {BasemapId | string} id
 */
export function setBasemap(id) {
  const next = normalizeBasemap(id)
  try {
    localStorage.setItem(BASEMAP_KEY, next)
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

/**
 * @param {(id: BasemapId) => void} fn
 * @returns {() => void}
 */
export function onBasemapChange(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}
