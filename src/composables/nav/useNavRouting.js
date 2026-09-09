import { nextTick } from 'vue'
import {
  MAX_ZOOM,
  TIANDITU_TK,
  getBehaviorPolicy,
} from '../../config'
import { getDefaultDriveStyle } from '../../lib/navPrefs'
import { unlockNavVoice } from '../../lib/navVoice'
import { clearNavSession } from '../../lib/navSession'
import { haversineMeters } from '../../lib/geo'
import {
  DRIVE_STYLES,
  planByTravelMode,
} from '../../lib/route'
import { searchPlaces } from '../../lib/search'
import { t } from '../../i18n'

/**
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function installNavRouting(ctx) {
  const {
    arrived,
    destination,
    driveStyle,
    followUser,
    headingTestLock,
    keyword,
    lat,
    lng,
    locate,
    locatingHint,
    mapBearing,
    navigating,
    nextGuide,
    pendingResume,
    pitch3D,
    places,
    remainingMeters,
    remainingSeconds,
    routeInfo,
    routePlans,
    routePreviewLock,
    routesReady,
    routing,
    searchError,
    searching,
    stageEl,
    travelMode,
    walkHeadingActive,
  } = ctx

ctx.pathToGeoJSON = function pathToGeoJSON(path) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: (path || [])
        .map((p) => [Number(p?.lng), Number(p?.lat)])
        .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)),
    },
  }
}

ctx.fitPathBounds = function fitPathBounds(paths, options = {}) {
  if (!ctx.map || !window.mapboxgl) return
  ctx.syncOverlayClearance()

  const bounds = new window.mapboxgl.LngLatBounds()
  let has = false
  const extendPoint = (point) => {
    const lng = Number(point?.lng)
    const lat = Number(point?.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    bounds.extend([lng, lat])
    has = true
  }

  for (const path of paths || []) {
    for (const point of path || []) extendPoint(point)
  }

  // 保证起终点进视野（全局视角按起终点跨度定）
  if (options.includeEndpoints !== false) {
    if (lng.value != null && lat.value != null) {
      extendPoint({ lng: lng.value, lat: lat.value })
    }
    if (destination.value) {
      extendPoint({ lng: destination.value.lng, lat: destination.value.lat })
    }
  }

  if (!has) return

  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const spanMeters = Math.max(
    haversineMeters({ lng: sw.lng, lat: sw.lat }, { lng: ne.lng, lat: ne.lat }),
    Number(options.distanceMeters) || 0,
  )
  const maxZoom = ctx.maxZoomForRouteSpan(spanMeters)

  const stage = stageEl.value
  const mastClear = Number.parseFloat(stage?.style?.getPropertyValue('--mast-clearance')) || 120
  const hudClear = Number.parseFloat(stage?.style?.getPropertyValue('--hud-clearance')) || 140
  const padding = {
    top: Math.max(72, Math.round(mastClear) + 12),
    bottom: Math.max(96, Math.round(hudClear) + 12),
    left: 40,
    right: 72,
  }

  try {
    ctx.map.stop()
  } catch {
    // ignore
  }

  // 路线总览用平面视角，避免 3D 俯仰裁切路径
  try {
    ctx.map.easeTo({
      pitch: getBehaviorPolicy().pitch2d,
      bearing: 0,
      duration: 0,
    })
  } catch {
    // ignore
  }
  pitch3D.value = false

  try {
    ctx.map.fitBounds(bounds, {
      padding,
      maxZoom,
      duration: options.duration ?? 800,
      essential: true,
    })
  } catch {
    const c = bounds.getCenter()
    ctx.map.jumpTo({
      center: [c.lng, c.lat],
      zoom: Math.min(maxZoom, 12),
      bearing: 0,
      pitch: getBehaviorPolicy().pitch2d,
    })
  }
}

/** 按起终点 / 路线跨度给出总览最大缩放 */
ctx.maxZoomForRouteSpan = function maxZoomForRouteSpan(meters) {
  const m = Number(meters) || 0
  if (m <= 800) return Math.min(15, MAX_ZOOM)
  if (m <= 2500) return Math.min(14, MAX_ZOOM)
  if (m <= 8000) return Math.min(12, MAX_ZOOM)
  if (m <= 20000) return Math.min(11, MAX_ZOOM)
  if (m <= 50000) return Math.min(10, MAX_ZOOM)
  return Math.min(9, MAX_ZOOM)
}

/** 等底部信息卡高度稳定后再 fit，避免被 HUD 挡住误判缩放 */
ctx.scheduleFitRouteOverview = async function scheduleFitRouteOverview(paths, options = {}) {
  await nextTick()
  ctx.syncOverlayClearance()
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  ctx.syncOverlayClearance()
  ctx.fitPathBounds(paths, {
    ...options,
    distanceMeters: options.distanceMeters ?? routeInfo.value?.distanceMeters,
  })
}

ctx.onSearch = async function onSearch() {
  searchError.value = ''
  searching.value = true
  arrived.value = false
  try {
    const around = lng.value != null ? { lng: lng.value, lat: lat.value } : null
    places.value = await searchPlaces(keyword.value, around, TIANDITU_TK)
    if (!places.value.length) searchError.value = t('map.searchEmpty')
  } catch (err) {
    places.value = []
    searchError.value = err.message || t('map.searchFail')
  } finally {
    searching.value = false
  }
}

ctx.closeSearchPanel = function closeSearchPanel() {
  places.value = []
  if (!destination.value) searchError.value = ''
}

ctx.selectPlace = async function selectPlace(place) {
  if (place.suggest) {
    keyword.value = place.name
    await ctx.onSearch()
    return
  }

  const lngNum = Number(place.lng)
  const latNum = Number(place.lat)
  if (!Number.isFinite(lngNum) || !Number.isFinite(latNum)) {
    searchError.value = t('map.invalidCoords')
    return
  }

  const dest = {
    ...place,
    lng: lngNum,
    lat: latNum,
  }

  // 选点后锁定预览相机，避免定位跟随把目的地标拽出视野
  followUser.value = false
  ctx.walkHeadingBehavior.reset('select-place')
  walkHeadingActive.value = false
  headingTestLock.value = false
  routePreviewLock.value = true
  if (ctx.bearingRaf) {
    cancelAnimationFrame(ctx.bearingRaf)
    ctx.bearingRaf = 0
  }
  ctx.bearingTargetDeg = 0

  destination.value = dest
  places.value = []
  searchError.value = ''
  arrived.value = false
  navigating.value = false
  routesReady.value = false
  routeInfo.value = null
  routePlans.value = {}
  driveStyle.value = travelMode.value === 'walk' ? 'walk' : getDefaultDriveStyle()
  nextGuide.value = ''
  remainingMeters.value = null
  remainingSeconds.value = null
  ctx.lastDrawnRemainMeters = null
  ctx.clearAllRouteLines()
  ctx.setDestMarker(dest)

  try {
    ctx.map.stop()
  } catch {
    // ignore
  }
  ctx.map.jumpTo({
    center: [dest.lng, dest.lat],
    zoom: 16,
    bearing: 0,
  })
  mapBearing.value = 0
  ctx.refreshMapSize()
}

ctx.onNavigateClick = async function onNavigateClick() {
  if (!destination.value || routing.value || navigating.value) return
  // 移动端：必须在任何 await 之前解锁语音（用户手势）
  unlockNavVoice({ primingText: t('voice.unlockStart') })
  locatingHint.value = t('hint.planning')
  const ok = await ctx.prepareDualRoutes({ previewDual: false })
  if (ok) await ctx.startNavigation()
  else if (!searchError.value) locatingHint.value = ''
}

ctx.onRouteClick = async function onRouteClick() {
  if (!destination.value || routing.value || navigating.value) return
  unlockNavVoice()
  locatingHint.value = t('hint.planning')
  const ok = await ctx.prepareDualRoutes({ previewDual: true })
  if (ok) {
    locatingHint.value = t('hint.routeReady')
    window.setTimeout(() => {
      locatingHint.value = ''
    }, 2200)
  } else if (!searchError.value) {
    locatingHint.value = ''
  }
}

ctx.prepareDualRoutes = async function prepareDualRoutes({ previewDual = true } = {}) {
  if (!destination.value) return false
  routing.value = true
  searchError.value = ''
  arrived.value = false
  routePreviewLock.value = true
  followUser.value = false
  headingTestLock.value = false
  ctx.walkHeadingBehavior.reset('route-preview')
  walkHeadingActive.value = false
  try {
    let start = lng.value != null ? { lng: Number(lng.value), lat: Number(lat.value) } : null
    if (!start || !Number.isFinite(start.lng) || !Number.isFinite(start.lat)) {
      const pos = await locate()
      start = { lng: Number(pos.lng), lat: Number(pos.lat) }
    }

    const end = {
      lng: Number(destination.value.lng),
      lat: Number(destination.value.lat),
    }
    if (!Number.isFinite(end.lng) || !Number.isFinite(end.lat)) {
      throw new Error(t('map.invalidDest'))
    }

    const plans = {}

    if (travelMode.value === 'walk') {
      const walked = await planByTravelMode(start, end, TIANDITU_TK, 'walk')
      if (!walked?.path?.length) throw new Error(t('map.noWalkRoute'))
      plans.walk = walked
      driveStyle.value = 'walk'
      routePlans.value = plans
      routeInfo.value = walked
    } else {
      const results = await Promise.allSettled(
        DRIVE_STYLES.map((item) =>
          planByTravelMode(start, end, TIANDITU_TK, 'drive', item.id),
        ),
      )

      results.forEach((result, index) => {
        const styleId = DRIVE_STYLES[index].id
        if (result.status === 'fulfilled' && result.value?.path?.length >= 2) {
          plans[styleId] = result.value
        }
      })

      if (!Object.keys(plans).length) {
        throw new Error(
          results.find((item) => item.status === 'rejected')?.reason?.message || t('hint.routeFail'),
        )
      }

      driveStyle.value = plans['0'] ? '0' : Object.keys(plans)[0]
      routePlans.value = plans
      routeInfo.value = plans[driveStyle.value]
    }

    remainingMeters.value = routeInfo.value.distanceMeters
    remainingSeconds.value = routeInfo.value.durationSeconds
    nextGuide.value = routeInfo.value.guides?.[0]?.text || ''
    routesReady.value = true
    ctx.lastDrawnRemainMeters = null
    if (previewDual && travelMode.value === 'drive') {
      ctx.drawDualRoutes(false)
      await ctx.scheduleFitRouteOverview(
        Object.values(plans)
          .map((p) => p?.path)
          .filter((p) => p?.length),
        { distanceMeters: routeInfo.value.distanceMeters },
      )
    } else {
      ctx.clearAllRouteLines()
      ctx.setRouteLine(driveStyle.value, routeInfo.value.path, true)
      await ctx.scheduleFitRouteOverview([routeInfo.value.path], {
        distanceMeters: routeInfo.value.distanceMeters,
      })
    }
    locatingHint.value = ''
    return true
  } catch (err) {
    routesReady.value = false
    routePlans.value = {}
    routeInfo.value = null
    searchError.value = err.message || t('hint.routeFail')
    locatingHint.value = searchError.value
    ctx.clearAllRouteLines()
    return false
  } finally {
    routing.value = false
    ctx.refreshMapSize()
  }
}

ctx.setTravelMode = async function setTravelMode(mode) {
  if (mode !== 'drive' && mode !== 'walk') return
  if (travelMode.value === mode) return
  if (navigating.value) return
  travelMode.value = mode
  routesReady.value = false
  routePlans.value = {}
  routeInfo.value = null
  driveStyle.value = mode === 'walk' ? 'walk' : getDefaultDriveStyle()
  ctx.clearAllRouteLines()
  if (destination.value) {
    await ctx.prepareDualRoutes({ previewDual: mode === 'drive' })
  }
}

ctx.chooseDriveStyle = function chooseDriveStyle(style) {
  if (navigating.value || routing.value || !routesReady.value) return
  const id = String(style)
  if (!routePlans.value[id]) return
  driveStyle.value = id
  routeInfo.value = routePlans.value[id]
  remainingMeters.value = routeInfo.value.distanceMeters
  remainingSeconds.value = routeInfo.value.durationSeconds
  nextGuide.value = routeInfo.value.guides?.[0]?.text || ''
  ctx.lastDrawnRemainMeters = null
  ctx.syncRouteLineStyles()
  void ctx.scheduleFitRouteOverview([routeInfo.value.path], {
    distanceMeters: routeInfo.value.distanceMeters,
  })
}

ctx.setDestMarker = function setDestMarker(place) {
  ctx.clearDestMarker()
  if (!ctx.map || !window.mapboxgl) return
  const lng = Number(place.lng)
  const lat = Number(place.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

  const el = document.createElement('div')
  el.className = 'dest-marker'
  el.innerHTML =
    `<div class="dest-marker__pin"></div><div class="dest-marker__label">${t('map.destMarker')}</div>`
  ctx.destMarker = new window.mapboxgl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([lng, lat])
    .addTo(ctx.map)
}

ctx.ensureRouteArrowImage = function ensureRouteArrowImage() {
  if (!ctx.map || ctx.map.hasImage?.(ctx.ROUTE_ARROW_IMAGE_ID)) return
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return
  g.clearRect(0, 0, size, size)
  // 白色箭头（沿路线前进方向），略留边距避免裁切
  g.fillStyle = '#FFFFFF'
  g.beginPath()
  g.moveTo(14, 14)
  g.lineTo(50, 32)
  g.lineTo(14, 50)
  g.closePath()
  g.fill()
  const imageData = g.getImageData(0, 0, size, size)
  ctx.map.addImage(ctx.ROUTE_ARROW_IMAGE_ID, imageData, { pixelRatio: 2 })
}

ctx.routeLineWidthExpr = function routeLineWidthExpr(active, kind) {
  // kind: 'fill' | 'casing'
  const fill = active ? [4, 8, 11] : [2.5, 5, 7]
  const casing = active ? [7, 12, 16] : [5, 8, 11]
  const [z10, z14, z18] = kind === 'casing' ? casing : fill
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    10,
    z10,
    14,
    z14,
    18,
    z18,
  ]
}

ctx.routeLayerIds = function routeLayerIds(styleId) {
  return {
    casingId: `route-${styleId}-casing`,
    lineId: `route-${styleId}-line`,
    arrowId: `route-${styleId}-arrow`,
  }
}

ctx.applyRoutePaint = function applyRoutePaint(styleId, active) {
  if (!ctx.map) return
  const { casingId, lineId, arrowId } = ctx.routeLayerIds(styleId)
  if (ctx.map.getLayer(casingId)) {
    ctx.map.setPaintProperty(casingId, 'line-color', ctx.ROUTE_CASING_COLOR)
    ctx.map.setPaintProperty(casingId, 'line-opacity', active ? 0.95 : 0.7)
    ctx.map.setPaintProperty(casingId, 'line-width', ctx.routeLineWidthExpr(active, 'casing'))
  }
  if (ctx.map.getLayer(lineId)) {
    ctx.map.setPaintProperty(lineId, 'line-color', active ? ctx.ROUTE_COLOR_ACTIVE : ctx.ROUTE_COLOR_IDLE)
    ctx.map.setPaintProperty(lineId, 'line-opacity', active ? ctx.ROUTE_OPACITY_ACTIVE : ctx.ROUTE_OPACITY_IDLE)
    ctx.map.setPaintProperty(lineId, 'line-width', ctx.routeLineWidthExpr(active, 'fill'))
  }
  if (ctx.map.getLayer(arrowId)) {
    ctx.map.setLayoutProperty(arrowId, 'visibility', active ? 'visible' : 'none')
    ctx.map.setPaintProperty(arrowId, 'icon-opacity', active ? 0.95 : 0)
  }
}

ctx.addRouteLayers = function addRouteLayers(styleId, sourceId, active) {
  ctx.ensureRouteArrowImage()
  const { casingId, lineId, arrowId } = ctx.routeLayerIds(styleId)
  const lineLayout = { 'line-join': 'round', 'line-cap': 'round' }

  if (!ctx.map.getLayer(casingId)) {
    ctx.map.addLayer({
      id: casingId,
      type: 'line',
      source: sourceId,
      layout: lineLayout,
      paint: {
        'line-color': ctx.ROUTE_CASING_COLOR,
        'line-width': ctx.routeLineWidthExpr(active, 'casing'),
        'line-opacity': active ? 0.95 : 0.7,
      },
    })
  }
  if (!ctx.map.getLayer(lineId)) {
    ctx.map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      layout: lineLayout,
      paint: {
        'line-color': active ? ctx.ROUTE_COLOR_ACTIVE : ctx.ROUTE_COLOR_IDLE,
        'line-width': ctx.routeLineWidthExpr(active, 'fill'),
        'line-opacity': active ? ctx.ROUTE_OPACITY_ACTIVE : ctx.ROUTE_OPACITY_IDLE,
      },
    })
  }
  if (!ctx.map.getLayer(arrowId) && ctx.map.hasImage?.(ctx.ROUTE_ARROW_IMAGE_ID)) {
    ctx.map.addLayer({
      id: arrowId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 64,
        'icon-image': ctx.ROUTE_ARROW_IMAGE_ID,
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          0.45,
          14,
          0.7,
          18,
          0.95,
        ],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        visibility: active ? 'visible' : 'none',
      },
      paint: {
        'icon-opacity': active ? 0.95 : 0,
      },
    })
  }
  ctx.applyRoutePaint(styleId, active)
}

ctx.setRouteLine = function setRouteLine(styleId, path, active) {
  if (!path?.length || !ctx.map) return
  const sourceId = `route-${styleId}`
  const data = ctx.pathToGeoJSON(path)
  if (!data.geometry.coordinates.length) return

  if (ctx.map.getSource(sourceId)) {
    ctx.map.getSource(sourceId).setData(data)
    ctx.addRouteLayers(styleId, sourceId, active)
  } else {
    ctx.map.addSource(sourceId, { type: 'geojson', data })
    ctx.addRouteLayers(styleId, sourceId, active)
  }

  ctx.routeLines[styleId] = { sourceId, ...ctx.routeLayerIds(styleId) }
  if (active) ctx.bringRouteLineToFront(styleId)
}

ctx.drawDualRoutes = function drawDualRoutes(fit = true) {
  ctx.clearAllRouteLines()
  const plans = routePlans.value
  const selected = driveStyle.value
  const allPaths = []

  // 先画未选中，再画选中，保证选中路线在上层
  Object.keys(plans).forEach((styleId) => {
    if (styleId === selected) return
    const path = plans[styleId]?.path
    if (!path?.length) return
    ctx.setRouteLine(styleId, path, false)
    allPaths.push(path)
  })

  const activePath = plans[selected]?.path
  if (activePath?.length) {
    ctx.setRouteLine(selected, activePath, true)
    ctx.bringRouteLineToFront(selected)
    allPaths.push(activePath)
  }

  if (fit && allPaths.length) ctx.fitPathBounds(allPaths)
}

ctx.syncRouteLineStyles = function syncRouteLineStyles() {
  const plans = routePlans.value
  const selected = driveStyle.value

  Object.keys(plans).forEach((styleId) => {
    if (styleId === selected) return
    const path = plans[styleId]?.path
    if (!path?.length) return
    ctx.setRouteLine(styleId, path, false)
  })

  const activePath = plans[selected]?.path
  if (activePath?.length) {
    ctx.setRouteLine(selected, activePath, true)
    ctx.bringRouteLineToFront(selected)
  }
}

ctx.bringRouteLineToFront = function bringRouteLineToFront(styleId) {
  const meta = ctx.routeLines[styleId]
  if (!meta || !ctx.map) return
  const { casingId, lineId, arrowId, sourceId } = meta
  const ids = [casingId, lineId, arrowId].filter((id) => id && ctx.map.getLayer(id))
  if (!ids.length) return
  try {
    ids.forEach((id) => ctx.map.moveLayer(id))
  } catch {
    try {
      const source = ctx.map.getSource(sourceId)
      const data = source?._data || ctx.pathToGeoJSON(routePlans.value[styleId]?.path || [])
      ids.forEach((id) => {
        if (ctx.map.getLayer(id)) ctx.map.removeLayer(id)
      })
      ctx.addRouteLayers(styleId, sourceId, true)
      if (source && data) source.setData?.(data)
    } catch {
      // ignore
    }
  }
}

/** 导航中就地更新当前选中路线的剩余路段 */
ctx.updateNavRoute = function updateNavRoute(path, remainMeters = null) {
  if (!path?.length || !ctx.map) return
  const meters = remainMeters ?? 0
  if (ctx.lastDrawnRemainMeters != null && Math.abs(ctx.lastDrawnRemainMeters - meters) < 0.5) return
  ctx.lastDrawnRemainMeters = meters

  const styleId = driveStyle.value
  const sourceId = `route-${styleId}`
  const { lineId } = ctx.routeLayerIds(styleId)
  const source = ctx.map.getSource(sourceId)
  if (source && typeof source.setData === 'function') {
    source.setData(ctx.pathToGeoJSON(path))
    if (!ctx.map.getLayer(lineId)) {
      ctx.setRouteLine(styleId, path, true)
    } else {
      ctx.applyRoutePaint(styleId, true)
      ctx.bringRouteLineToFront(styleId)
    }
    ctx.routeLines[styleId] = { sourceId, ...ctx.routeLayerIds(styleId) }
    return
  }
  ctx.setRouteLine(styleId, path, true)
}

ctx.clearDestMarker = function clearDestMarker() {
  if (!ctx.destMarker) return
  try {
    ctx.destMarker.remove()
  } catch {
    // ignore
  }
  ctx.destMarker = null
}

ctx.removeRouteLine = function removeRouteLine(styleId) {
  const meta = ctx.routeLines[styleId]
  delete ctx.routeLines[styleId]
  if (!meta || !ctx.map) return
  const ids = [meta.arrowId, meta.lineId, meta.casingId, meta.layerId].filter(Boolean)
  try {
    ids.forEach((id) => {
      if (ctx.map.getLayer(id)) ctx.map.removeLayer(id)
    })
    if (ctx.map.getSource(meta.sourceId)) ctx.map.removeSource(meta.sourceId)
  } catch {
    // ignore
  }
}

ctx.clearIdleRouteLines = function clearIdleRouteLines() {
  Object.keys(ctx.routeLines).forEach((styleId) => {
    if (styleId !== driveStyle.value) ctx.removeRouteLine(styleId)
  })
}

ctx.clearAllRouteLines = function clearAllRouteLines() {
  Object.keys(ctx.routeLines).forEach((styleId) => ctx.removeRouteLine(styleId))
  ctx.routeLines = {}
}

ctx.clearDestination = function clearDestination() {
  ctx.stopNavigation()
  pendingResume.value = null
  clearNavSession()
  destination.value = null
  routeInfo.value = null
  routePlans.value = {}
  routesReady.value = false
  routePreviewLock.value = false
  driveStyle.value = travelMode.value === 'walk' ? 'walk' : getDefaultDriveStyle()
  arrived.value = false
  remainingMeters.value = null
  remainingSeconds.value = null
  nextGuide.value = ''
  searchError.value = ''
  locatingHint.value = ''
  ctx.lastDrawnRemainMeters = null
  ctx.clearDestMarker()
  ctx.clearAllRouteLines()
}
}

/** @see installNavRouting */
export const useNavRouting = installNavRouting
