import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  getBehaviorPolicy,
} from '../../config'
import {
  basemapTileUrls,
  getStoredBasemap,
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
  ctx.replaceRasterTiles('tdt-cva', labelTiles)
  ctx.applyMapThemeStyle(getStoredUiTheme())
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

ctx.initMap = async function initMap() {
  try {
    setBootProgress(72, t('boot.map'))
    const mapboxgl = window.mapboxgl
    if (!mapboxgl) throw new Error(t('map.mapboxMissing'))
    if (!mapEl.value) throw new Error(t('map.containerMissing'))

    const { baseTiles, labelTiles } = basemapTileUrls(getStoredBasemap())

    ctx.map = new mapboxgl.Map({
      container: mapEl.value,
      style: {
        version: 8,
        sources: {
          'tdt-vec': {
            type: 'raster',
            tiles: baseTiles,
            tileSize: 256,
            maxzoom: MAX_ZOOM,
          },
          'tdt-cva': {
            type: 'raster',
            tiles: labelTiles,
            tileSize: 256,
            maxzoom: MAX_ZOOM,
          },
        },
        layers: [
          {
            id: 'tdt-vec-layer',
            type: 'raster',
            source: 'tdt-vec',
            minzoom: 0,
            maxzoom: 22,
          },
          {
            id: 'tdt-cva-layer',
            type: 'raster',
            source: 'tdt-cva',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      pitch: getBehaviorPolicy().pitch2d,
      maxPitch: getBehaviorPolicy().maxPitch,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      pitchWithRotate: true,
    })

    // 只等 style load；单张瓦片失败会触发 error，不能据此中断初始化
    if (!ctx.map.loaded()) {
      await new Promise((resolve) => {
        ctx.map.once('load', resolve)
      })
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
    ctx.resizeObserver = new ResizeObserver(() => ctx.onMapContainerResize())
    ctx.resizeObserver.observe(mapEl.value)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', ctx.onMapContainerResize)
    }
    ctx.refreshMapSize()
    ctx.maybeOfferResumeSession()
    await ctx.locateOnce(true)
  } catch (err) {
    mapError.value = err.message || t('map.mapInitFail')
    ctx.emit('map-ready')
  }
}
}

/** @see installNavMapCore */
export const useNavMapCore = installNavMapCore
