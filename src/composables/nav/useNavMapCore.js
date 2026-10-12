import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  getBehaviorPolicy,
} from '../../config'
import {
  basemapTileUrls,
  enableSupermapTileFallback,
  getStoredBasemap,
  isUsingSupermapTiles,
} from '../../lib/basemap'
import { getStoredUiTheme } from '../../lib/uiTheme'
import { LocationBeacon } from '../../lib/LocationBeacon'
import { setBootProgress } from '../../lib/bootSplash'
import { t } from '../../i18n'

/**
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function installNavMapCore(ctx) {
  const {
    error,
    hudEl,
    mapEl,
    mapError,
    mapReady,
    mastEl,
    stageEl,
  } = ctx

ctx.resolveMaxZoom = function resolveMaxZoom() {
  if (!ctx.map) return MAX_ZOOM
  const cap = Number(ctx.map.getMaxZoom?.())
  return Number.isFinite(cap) ? Math.min(MAX_ZOOM, cap) : MAX_ZOOM
}

ctx.refreshMapSize = function refreshMapSize() {
  ctx.map?.resize?.()
  ctx.beacon?.draw()
}

/** 根据顶部搜索卡 / 底部信息卡实际占位，给出行方式与右侧按钮让位 */
  ctx.resolveOverlayEl = function resolveOverlayEl(node) {
    if (!node) return null
    if (typeof Element !== 'undefined' && node instanceof Element) return node
    const el = node.$el
    if (typeof Element !== 'undefined' && el instanceof Element) return el
    return null
  }

  ctx.syncOverlayClearance = function syncOverlayClearance() {
  const stage = stageEl.value
  if (!stage) return
  const stageRect = stage.getBoundingClientRect()
  const mastNode = ctx.resolveOverlayEl(mastEl.value)
  const mastRect = mastNode?.getBoundingClientRect?.()
  const hudNode = ctx.resolveOverlayEl(hudEl.value)
  const hudHidden =
    !hudNode ||
    hudNode.style.display === 'none' ||
    (typeof getComputedStyle === 'function' && getComputedStyle(hudNode).display === 'none')
  const hudRect = hudHidden ? null : hudNode.getBoundingClientRect?.()

  const mastClear = mastRect
    ? Math.max(72, Math.ceil(mastRect.bottom - stageRect.top) + 10)
    : 120
  const tabPad = Number.parseFloat(getComputedStyle(stage).getPropertyValue('--tab-clearance')) || 0
  const hudClear =
    hudRect && hudRect.height > 2
      ? Math.max(96, Math.ceil(stageRect.bottom - hudRect.top) + 12)
      : Math.max(72, Math.ceil(tabPad) + 20)

  stage.style.setProperty('--mast-clearance', `${mastClear}px`)
  stage.style.setProperty('--hud-clearance', `${hudClear}px`)
}

ctx.bindOverlayObservers = function bindOverlayObservers() {
  ctx.overlayObserver?.disconnect?.()
  if (typeof ResizeObserver === 'undefined') {
    ctx.syncOverlayClearance()
    return
  }
  ctx.overlayObserver = new ResizeObserver(() => ctx.syncOverlayClearance())
  const mastNode = ctx.resolveOverlayEl(mastEl.value)
  const hudNode = ctx.resolveOverlayEl(hudEl.value)
  if (mastNode) ctx.overlayObserver.observe(mastNode)
  if (hudNode) ctx.overlayObserver.observe(hudNode)
  ctx.syncOverlayClearance()
}

/** 等地图容器宽高稳定，避免手机端布局未完成导致中心偏移、缩放不到位 */
ctx.waitForStableMapSize = async function waitForStableMapSize(timeoutMs = 1200) {
  if (!mapEl.value) return
  const start = performance.now()
  let lastW = 0
  let lastH = 0
  let stableHits = 0

  while (performance.now() - start < timeoutMs) {
    const w = mapEl.value.clientWidth
    const h = mapEl.value.clientHeight
    if (w > 40 && h > 40) {
      if (w === lastW && h === lastH) {
        stableHits += 1
        if (stableHits >= 2) {
          ctx.refreshMapSize()
          return
        }
      } else {
        stableHits = 0
        lastW = w
        lastH = h
      }
    }
    await new Promise((r) => requestAnimationFrame(() => r()))
  }
  ctx.refreshMapSize()
}

/** Mapbox GL v1：替换栅格 tiles 并清缓存 */
ctx.replaceRasterTiles = function replaceRasterTiles(sourceId, tiles) {
  if (!ctx.map || !Array.isArray(tiles) || !tiles.length) return
  const source = ctx.map.getSource(sourceId)
  if (!source) return
  try {
    if (typeof source.setTiles === 'function') {
      source.setTiles(tiles)
      return
    }
  } catch {
    // fall through
  }
  try {
    source.tiles = tiles
    if (source._options) source._options.tiles = tiles
    const cache = ctx.map.style?.sourceCaches?.[sourceId]
    cache?.clearTiles?.()
    cache?.update?.(ctx.map.transform)
    ctx.map.triggerRepaint?.()
  } catch {
    // ignore
  }
}

ctx.applyBasemapToMap = function applyBasemapToMap(id) {
  if (!ctx.map) return
  const { baseTiles, labelTiles } = basemapTileUrls(id)
  ctx.replaceRasterTiles('tdt-vec', baseTiles)
  if (labelTiles.length) {
    ctx.replaceRasterTiles('tdt-cva', labelTiles)
    try {
      if (ctx.map.getLayer('tdt-cva-layer')) ctx.map.setLayoutProperty('tdt-cva-layer', 'visibility', 'visible')
    } catch {
      // ignore
    }
  } else {
    try {
      if (ctx.map.getLayer('tdt-cva-layer')) ctx.map.setLayoutProperty('tdt-cva-layer', 'visibility', 'none')
    } catch {
      // ignore
    }
  }
  ctx.applyMapThemeStyle(getStoredUiTheme())
}

/** 天地图瓦片失败时切 SuperMap，避免微信/部分网络灰屏 */
ctx.bindBasemapTileFallback = function bindBasemapTileFallback() {
  if (!ctx.map || ctx.tileFallbackBound) return
  ctx.tileFallbackBound = true
  let hits = 0
  ctx.map.on('error', (event) => {
    if (isUsingSupermapTiles()) return
    const src = event?.sourceId || event?.source?.id || ''
    const status = event?.error?.status || event?.error?.statusCode
    const msg = String(event?.error?.message || event?.error || '')
    const looksTile =
      src === 'tdt-vec' ||
      src === 'tdt-cva' ||
      /tianditu|DataServer|418|403|Failed to fetch|AJAXError/i.test(`${src} ${msg} ${status || ''}`)
    if (!looksTile && status !== 403 && status !== 418) return
    hits += 1
    if (hits < 2) return
    enableSupermapTileFallback()
    ctx.applyBasemapToMap(getStoredBasemap())
    ctx.refreshMapSize()
  })
}

ctx.waitForMapboxGl = function waitForMapboxGl(timeoutMs = 10000) {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl)
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (window.mapboxgl) {
        resolve(window.mapboxgl)
        return
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(t('map.mapboxMissing')))
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

/** 深色主题：矢量/注记栅格反色，得到暗色电子底图（不影响路线等矢量图层） */
ctx.applyMapThemeStyle = function applyMapThemeStyle(theme) {
  if (!ctx.map) return
  const dark = theme === 'dark'
  const basemapId = getStoredBasemap()
  /** @type {Record<string, number>} */
  let paint
  if (dark && basemapId === 'vec') {
    paint = {
      'raster-hue-rotate': 180,
      'raster-brightness-min': 1,
      'raster-brightness-max': 0,
      'raster-saturation': 0,
      'raster-contrast': 0,
    }
  } else if (dark) {
    // 影像 / 地形：轻微压暗，避免反色失真
    paint = {
      'raster-hue-rotate': 0,
      'raster-brightness-min': 0,
      'raster-brightness-max': 0.55,
      'raster-saturation': -0.15,
      'raster-contrast': 0.05,
    }
  } else {
    paint = {
      'raster-hue-rotate': 0,
      'raster-brightness-min': 0,
      'raster-brightness-max': 1,
      'raster-saturation': 0,
      'raster-contrast': 0,
    }
  }
  for (const layerId of ['tdt-vec-layer', 'tdt-cva-layer']) {
    if (!ctx.map.getLayer?.(layerId)) continue
    try {
      for (const [key, value] of Object.entries(paint)) {
        ctx.map.setPaintProperty(layerId, key, value)
      }
    } catch {
      // ignore
    }
  }
}

ctx.probeWebGL = function probeWebGL() {
  try {
    if (window.mapboxgl?.supported && !window.mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
      return false
    }
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    return Boolean(gl)
  } catch {
    return false
  }
}

/** Mapbox `load` 需等首帧完整绘制；微信/内置浏览器瓦片或 WebGL 异常时可能永不触发 */
ctx.waitForMapReady = function waitForMapReady(timeoutMs = 8000) {
  const map = ctx.map
  if (!map) return Promise.resolve(false)
  if (map.loaded?.() || map.isStyleLoaded?.()) return Promise.resolve(true)

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      map.off?.('load', onLoad)
      map.off?.('styledata', onStyle)
      map.off?.('idle', onIdle)
      resolve(ok)
    }
    const onLoad = () => finish(true)
    const onStyle = () => {
      if (map.isStyleLoaded?.() || map.loaded?.()) finish(true)
    }
    const onIdle = () => finish(true)
    const timer = setTimeout(() => finish(false), timeoutMs)
    map.once?.('load', onLoad)
    map.on?.('styledata', onStyle)
    map.once?.('idle', onIdle)
  })
}

ctx.initMap = async function initMap() {
  try {
    setBootProgress(72, t('boot.map'))
    const mapboxgl = await ctx.waitForMapboxGl(12000)
    if (!mapEl.value) throw new Error(t('map.containerMissing'))
    if (!ctx.probeWebGL()) throw new Error(t('map.webglUnsupported'))

    const { baseTiles, labelTiles } = basemapTileUrls(getStoredBasemap())
    const sources = {
      'tdt-vec': {
        type: 'raster',
        tiles: baseTiles,
        tileSize: 256,
        maxzoom: MAX_ZOOM,
      },
    }
    const layers = [
      {
        id: 'tdt-vec-layer',
        type: 'raster',
        source: 'tdt-vec',
        minzoom: 0,
        maxzoom: 22,
      },
    ]
    if (labelTiles.length) {
      sources['tdt-cva'] = {
        type: 'raster',
        tiles: labelTiles,
        tileSize: 256,
        maxzoom: MAX_ZOOM,
      }
      layers.push({
        id: 'tdt-cva-layer',
        type: 'raster',
        source: 'tdt-cva',
        minzoom: 0,
        maxzoom: 22,
      })
    }

    ctx.map = new mapboxgl.Map({
      container: mapEl.value,
      style: {
        version: 8,
        sources,
        layers,
      },
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      pitch: getBehaviorPolicy().pitch2d,
      maxPitch: getBehaviorPolicy().maxPitch,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      pitchWithRotate: true,
      failIfMajorPerformanceCaveat: false,
    })

    ctx.bindBasemapTileFallback()

    const mapPainted = await ctx.waitForMapReady(8000)
    if (!mapPainted) {
      // 样式可能已挂上但首帧未完成：仍继续，避免永久卡在启动遮罩
      ctx.map.resize?.()
    }

    await ctx.waitForStableMapSize()
    ctx.map.resize()
    ctx.ensureRouteArrowImage()
    try {
      ctx.map.dragPan?.enable?.()
      ctx.map.dragRotate?.enable?.()
      ctx.map.touchZoomRotate?.enable?.()
      ctx.map.touchPitch?.enable?.()
    } catch {
      // ignore
    }

    ctx.beacon = new LocationBeacon(ctx.map)
    ctx.beacon.attach()
    ctx.map.on('dragstart', ctx.onMapDragStart)
    ctx.map.on('dragend', ctx.onMapDragEnd)
    ctx.map.on('rotate', ctx.syncBeaconHeading)
    ctx.map.on('pitch', ctx.syncBeaconHeading)
    ctx.map.on('pitchend', ctx.syncPitch3DFromMap)

    mapReady.value = true
    ctx.emit('map-ready')
    ctx.applyMapThemeStyle(getStoredUiTheme())
    if (typeof ResizeObserver !== 'undefined' && mapEl.value) {
      ctx.resizeObserver = new ResizeObserver(() => ctx.onMapContainerResize())
      ctx.resizeObserver.observe(mapEl.value)
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', ctx.onMapContainerResize)
    }
    ctx.refreshMapSize()
    // 微信/iOS：启动屏与地址栏变化后容器尺寸常延迟稳定，多刷几次
    ;[120, 360, 800, 1600].forEach((ms) => {
      window.setTimeout(() => ctx.refreshMapSize(), ms)
    })
    ctx.maybeOfferResumeSession()
    await ctx.locateOnce(true)
  } catch (err) {
    mapError.value = err.message || t('map.mapInitFail')
    if (ctx.locatingHint) ctx.locatingHint.value = ''
    ctx.emit('map-ready')
  }
}
}

/** @see installNavMapCore */
export const useNavMapCore = installNavMapCore
