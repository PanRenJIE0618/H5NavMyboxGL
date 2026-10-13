/**
 * 底图切换（矢量 / 影像 / 地形）
 * 持久化：localStorage `h5nav:basemap`
 * 瓦片源：天地图 + SuperMap 兜底（微信等环境天地图常被拦）
 */

import {
  SUPERMAP_CHINA_TILE_URL,
  TILE_PROVIDER,
  USE_TIANDITU_PROXY,
  supermapChinaTileUrls,
  tiandituTileUrls,
} from '../config.js'

export const BASEMAP_KEY = 'h5nav:basemap'
export const TILE_FALLBACK_KEY = 'h5nav:tile-fallback'

// 启用同源代理后，清掉此前「微信强制 SuperMap」的会话标记，重新走天地图
if (USE_TIANDITU_PROXY && typeof sessionStorage !== 'undefined') {
  try {
    sessionStorage.removeItem(TILE_FALLBACK_KEY)
  } catch {
    // ignore
  }
}

/** @typedef {'vec' | 'img' | 'ter'} BasemapId */
/** @typedef {'tianditu' | 'supermap'} TileProviderId */

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

/** 会话内是否已切到 SuperMap 兜底 */
let forceSupermap = false

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
 * @returns {TileProviderId}
 */
export function resolveTileProvider() {
  if (TILE_PROVIDER === 'supermap' || TILE_PROVIDER === 'tianditu') {
    return /** @type {TileProviderId} */ (TILE_PROVIDER)
  }
  if (forceSupermap) return 'supermap'
  try {
    if (sessionStorage.getItem(TILE_FALLBACK_KEY) === '1') return 'supermap'
  } catch {
    // ignore
  }
  // 微信等环境通过同源代理访问天地图，不再强制切 SuperMap
  return 'tianditu'
}

export function isUsingSupermapTiles() {
  return resolveTileProvider() === 'supermap'
}

/** 标记本会话改用 SuperMap 底图（天地图被拦时） */
export function enableSupermapTileFallback() {
  forceSupermap = true
  try {
    sessionStorage.setItem(TILE_FALLBACK_KEY, '1')
  } catch {
    // ignore
  }
}

/**
 * @param {BasemapId} id
 * @returns {{ baseTiles: string[], labelTiles: string[], provider: TileProviderId }}
 */
export function basemapTileUrls(id) {
  const provider = resolveTileProvider()
  if (provider === 'supermap') {
    const tiles = supermapChinaTileUrls()
    return { baseTiles: tiles, labelTiles: [], provider }
  }
  const opt = getBasemapOption(id)
  return {
    baseTiles: tiandituTileUrls(opt.base),
    labelTiles: tiandituTileUrls(opt.labelLayer),
    provider,
  }
}

export { SUPERMAP_CHINA_TILE_URL }

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
