<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDeviceHeading } from '../composables/useDeviceHeading'
import { useGeolocation } from '../composables/useGeolocation'
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  LOCATED_ZOOM,
  MAX_ZOOM,
  NAV_ZOOM,
  TIANDITU_TK,
  getBehaviorPolicy,
  onBehaviorPolicyChange,
} from '../config'
import { basemapTileUrls, getStoredBasemap, onBasemapChange } from '../lib/basemap'
import { getStoredUiTheme, onUiThemeChange } from '../lib/uiTheme'
import { getAutoViewLock, onAutoViewLockChange } from '../lib/viewLock'
import {
  getDefaultDriveStyle,
  getDefaultTravelMode,
  getVoiceEnabled,
  onNavPrefsChange,
  setVoiceEnabled,
} from '../lib/navPrefs'
import { LocationBeacon } from '../lib/LocationBeacon'
import { createDeviceWalkBehavior } from '../lib/deviceWalkBehavior'
import { createOffRouteMonitor } from '../lib/offRouteMonitor'
import {
  getNavVoiceSupportHint,
  isNavVoiceMuted,
  onNavVoicePageHidden,
  onNavVoicePageVisible,
  speakNav,
  speakNavOverview,
  stopNavVoice,
  toggleNavVoiceMuted,
  unlockNavVoice,
} from '../lib/navVoice'
import {
  buildNavSessionSnapshot,
  clearNavSession,
  loadNavSession,
  saveNavSession,
} from '../lib/navSession'
import {
  pushNavHistory,
} from '../lib/navHistory'
import { formatDistance, formatDuration, haversineMeters } from '../lib/geo'
import { reverseGeocode } from '../lib/geocode'
import { normalizeHeading, shortestDelta, unwrapHeading } from '../lib/heading'
import { DRIVE_STYLES, driveStyleLabel, planByTravelMode, TRAVEL_MODES, travelModeLabel } from '../lib/route'
import { snapToRoute, coordsToPath } from '../lib/routeSnap'
import { searchPlaces } from '../lib/search'
import { debugConsoleOpen } from '../lib/debugLog'
import {
  canUseBrowserGeolocation,
  getBrowserOpenHint,
  getHttpsUrl,
  isWeChatBrowser,
} from '../lib/secureContext'
import DevConsole from './DevConsole.vue'

const props = defineProps({
  /** 页面是否处于前台展示（从设置返回时触发地图 resize） */
  active: { type: Boolean, default: true },
})
const emit = defineEmits(['navigating-change'])

function toggleDebugConsole() {
  debugConsoleOpen.value = !debugConsoleOpen.value
}

const CARDINAL = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']

const mapEl = ref(null)
const stageEl = ref(null)
const mastEl = ref(null)
const hudEl = ref(null)
const mapReady = ref(false)
const mapError = ref('')
const address = ref('')
const locatingHint = ref('正在获取当前位置…')
const keyword = ref('')
const searching = ref(false)
const searchError = ref('')
const places = ref([])
const destination = ref(null)
const travelMode = ref(getDefaultTravelMode())
const driveStyle = ref(getDefaultTravelMode() === 'walk' ? 'walk' : getDefaultDriveStyle())
const routeInfo = ref(null)
const routePlans = ref({})
const routesReady = ref(false)
const routing = ref(false)
const navigating = ref(false)
/** 选点 / 看路线时锁定相机，避免 GPS 跟随把目的地标和路线拽出视野 */
const routePreviewLock = ref(false)
/** 视角跟随：相机中心始终压在当前位置正上方（与朝向无关）；由「我的 · 自动视角锁定」控制 */
const followUser = ref(getAutoViewLock() && getBehaviorPolicy().followUserOnInit)
const arrived = ref(false)
const remainingMeters = ref(null)
const remainingSeconds = ref(null)
const nextGuide = ref('')
const offRoute = ref(false)
const offRouteDistanceMeters = ref(null)
const rerouting = ref(false)
const voiceMuted = ref(!getVoiceEnabled())
/** 冷启动待确认的导航会话 */
const pendingResume = ref(null)
/** @type {null | object} */
let activeNavMeta = null

/** 高德风格：选中蓝线 + 白边；备选淡蓝 */
const ROUTE_COLOR_ACTIVE = '#3370FF'
const ROUTE_COLOR_IDLE = '#9BB8FF'
const ROUTE_CASING_COLOR = '#FFFFFF'
const ROUTE_OPACITY_ACTIVE = 1
const ROUTE_OPACITY_IDLE = 0.85
const ROUTE_ARROW_IMAGE_ID = 'route-arrow'

const {
  lng,
  lat,
  speed,
  course,
  loading,
  error,
  watching,
  client,
  locate,
  watchLocation,
  restartWatch,
} = useGeolocation()
const secureOk = canUseBrowserGeolocation()
const httpsUrl = getHttpsUrl()
const inWeChat = isWeChatBrowser()
const browserHint = getBrowserOpenHint()
// 仅本机/局域网调试时拦截微信；正式 HTTPS 域名允许预览
const showWeChatGate = inWeChat && !secureOk
const {
  heading: deviceHeading,
  available: headingAvailable,
  start: startHeading,
  rebind: rebindHeading,
} = useDeviceHeading()

/** 地图偏航（朝上导航）；用 Mapbox bearing，不用 CSS 旋转容器 */
const mapBearing = ref(0)
/** 朝向锁定：按设备/行进朝向转相机；默认见行为策略 */
const headingTestLock = ref(getBehaviorPolicy().headingLockOnInit)
/** 3D 倾斜视角（pitch）；默认平面 2D */
const pitch3D = ref(false)
/** 步行自动朝向修正是否生效中 */
const walkHeadingActive = ref(false)
let bearingRaf = 0
let bearingTargetDeg = 0
let headingSamples = []

const walkHeadingBehavior = createDeviceWalkBehavior(() => ({
  ...getBehaviorPolicy().walk,
  onCorrect(deg) {
    walkHeadingActive.value = true
    locatingHint.value = `已按行进方向校正地图朝向 · ${deg.toFixed(0)}°`
    window.setTimeout(() => {
      if (String(locatingHint.value).startsWith('已按行进方向校正')) {
        locatingHint.value = ''
      }
    }, 2200)
  },
  onRelease() {
    walkHeadingActive.value = false
  },
}))

let map = null
let beacon = null
let resizeObserver = null
let overlayObserver = null
let destMarker = null
/** @type {Record<string, { sourceId: string, layerId: string }>} */
let routeLines = {}
let arriveHits = 0
let lastDrawnRemainMeters = null
let lastFollowPanAt = 0
let followPanRaf = 0
let followPanPos = null
/** 最近一次强制居中的相机（resize 后回正用） */
let pinnedCamera = null
let pinUntil = 0
let resizeDebounceTimer = 0
let settleTimer = 0
let settleTimers = []
/** 导航中保留的最近有效朝向，避免慢走时回弹北向上 */
let lastGoodBearing = 0
/** 拖图期间暂停定位回调；停拖后延迟恢复并开启视角锁定 */
let locationTickPaused = false
let locationResumeTimer = 0
let viewLockResumeTimer = 0
/** 会话快照节流 */
let lastSessionSaveAt = 0
let lastSessionSaveRemainMeters = null
let pageHiddenAt = 0
let visibilityBound = false
let unsubBasemap = null
let unsubUiTheme = null
let unsubAutoViewLock = null
let unsubNavPrefs = null

const offRouteMonitor = createOffRouteMonitor(() => getBehaviorPolicy(), {
  // 后续联调：返回后端重规划结果即可替换本地 planByTravelMode
  async replanHook() {
    return null
  },
})

function pauseLocationTicksByDrag() {
  locationTickPaused = true
  if (locationResumeTimer) {
    window.clearTimeout(locationResumeTimer)
    locationResumeTimer = 0
  }
  if (viewLockResumeTimer) {
    window.clearTimeout(viewLockResumeTimer)
    viewLockResumeTimer = 0
  }
}

function scheduleResumeAfterDragIdle() {
  if (locationResumeTimer) {
    window.clearTimeout(locationResumeTimer)
    locationResumeTimer = 0
  }
  if (viewLockResumeTimer) {
    window.clearTimeout(viewLockResumeTimer)
    viewLockResumeTimer = 0
  }

  const policy = getBehaviorPolicy()
  const resumeMs = policy.locationResumeAfterDragMs
  const lockMs = policy.viewLockAfterDragIdleMs

  locationResumeTimer = window.setTimeout(() => {
    locationResumeTimer = 0
    locationTickPaused = false
  }, resumeMs)

  viewLockResumeTimer = window.setTimeout(() => {
    viewLockResumeTimer = 0
    enableViewLockAfterDragIdle()
  }, lockMs)
}

function enableViewLockAfterDragIdle() {
  // 选点/看路线预览时不抢相机；导航中或普通浏览则按设置自动视角锁定
  if (routePreviewLock.value && !navigating.value) return

  locationTickPaused = false
  if (!getAutoViewLock()) {
    applyHeadingDragLock()
    return
  }

  followUser.value = true
  if (navigating.value) {
    headingTestLock.value = getBehaviorPolicy().headingLockOnNavStart
  }

  if (lng.value == null || lat.value == null) return
  void startHeading(true)
  if (navigating.value) {
    applyNavCamera({ lng: lng.value, lat: lat.value }, { snapBearing: headingTestLock.value })
  } else {
    applyPositionToMap(
      { lng: lng.value, lat: lat.value },
      undefined,
      { follow: true, animate: true, forceCenter: true },
    )
  }
  applyHeadingDragLock()
}

function clearLocationResumeTimer() {
  if (locationResumeTimer) {
    window.clearTimeout(locationResumeTimer)
    locationResumeTimer = 0
  }
  if (viewLockResumeTimer) {
    window.clearTimeout(viewLockResumeTimer)
    viewLockResumeTimer = 0
  }
  locationTickPaused = false
}

function resolveMaxZoom() {
  if (!map) return MAX_ZOOM
  const cap = Number(map.getMaxZoom?.())
  return Number.isFinite(cap) ? Math.min(MAX_ZOOM, cap) : MAX_ZOOM
}

function refreshMapSize() {
  map?.resize?.()
  beacon?.draw()
}

/** 根据顶部搜索卡 / 底部信息卡实际占位，给出行方式与右侧按钮让位 */
function syncOverlayClearance() {
  const stage = stageEl.value
  if (!stage) return
  const stageRect = stage.getBoundingClientRect()
  const mastRect = mastEl.value?.getBoundingClientRect?.()
  const hudNode = hudEl.value
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

function bindOverlayObservers() {
  overlayObserver?.disconnect?.()
  if (typeof ResizeObserver === 'undefined') {
    syncOverlayClearance()
    return
  }
  overlayObserver = new ResizeObserver(() => syncOverlayClearance())
  if (mastEl.value) overlayObserver.observe(mastEl.value)
  if (hudEl.value) overlayObserver.observe(hudEl.value)
  syncOverlayClearance()
}

/** 等地图容器宽高稳定，避免手机端布局未完成导致中心偏移、缩放不到位 */
async function waitForStableMapSize(timeoutMs = 1200) {
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
          refreshMapSize()
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
  refreshMapSize()
}

function clearSettleTimers() {
  if (settleTimer) {
    window.clearTimeout(settleTimer)
    settleTimer = 0
  }
  settleTimers.forEach((id) => window.clearTimeout(id))
  settleTimers = []
}

/**
 * 钉死相机：先 resize，再 jumpTo。
 * 手机端强制居中不用 flyTo，避免动画中途 resize / setBearing 把视角冲偏。
 */
function pinCamera(pos, zoom, { animate = false } = {}) {
  if (!map || pos?.lng == null || pos?.lat == null) return
  if (navigating.value) return
  const zRaw = Number(zoom)
  const z = Math.min(Number.isFinite(zRaw) ? zRaw : resolveMaxZoom(), resolveMaxZoom())
  const center = [pos.lng, pos.lat]
  const bearing = map.getBearing?.() ?? mapBearing.value ?? 0
  pinnedCamera = { lng: pos.lng, lat: pos.lat, zoom: z, bearing }
  pinUntil = Date.now() + getBehaviorPolicy().pinCameraHoldMs

  clearSettleTimers()
  refreshMapSize()
  try {
    map.stop()
  } catch {
    // ignore
  }

  map.jumpTo({ center, zoom: z, bearing, pitch: map.getPitch?.() ?? 0 })
  mapBearing.value = bearing
  beacon?.draw()
  scheduleCameraSettle()
}

function scheduleCameraSettle() {
  clearSettleTimers()
  if (navigating.value) return

  const run = () => {
    if (!map || !pinnedCamera || navigating.value) return
    refreshMapSize()
    const z = pinnedCamera.zoom
    const center = [pinnedCamera.lng, pinnedCamera.lat]
    const bearing = pinnedCamera.bearing ?? map.getBearing()
    const zoomGap = Math.abs(map.getZoom() - z)
    const c = map.getCenter()
    const centerGap =
      Math.abs(c.lng - pinnedCamera.lng) + Math.abs(c.lat - pinnedCamera.lat)
    if (zoomGap > 0.08 || centerGap > 1e-4) {
      try {
        map.stop()
      } catch {
        // ignore
      }
      map.jumpTo({ center, zoom: z, bearing, pitch: map.getPitch?.() ?? 0 })
      mapBearing.value = bearing
    }
    beacon?.draw()
  }

  requestAnimationFrame(() => {
    run()
    requestAnimationFrame(run)
  })
  settleTimer = window.setTimeout(run, 280)
  settleTimers.push(window.setTimeout(run, 600))
}

function onMapContainerResize() {
  if (resizeDebounceTimer) window.clearTimeout(resizeDebounceTimer)
  resizeDebounceTimer = window.setTimeout(() => {
    resizeDebounceTimer = 0
    refreshMapSize()
    if (!map) return

    // 导航中：只 resize；开启视角跟随时用当前 GPS 回中
    if (navigating.value) {
      if (followUser.value && lng.value != null && lat.value != null) {
        const bearing = map.getBearing?.() ?? lastGoodBearing
        map.jumpTo({
          center: [lng.value, lat.value],
          zoom: Math.max(map.getZoom(), NAV_ZOOM),
          bearing,
        })
        pinnedCamera = {
          lng: lng.value,
          lat: lat.value,
          zoom: NAV_ZOOM,
          bearing,
        }
        beacon?.draw()
      }
      return
    }

    if (!pinnedCamera) return
    if (Date.now() >= pinUntil && !followUser.value) return
    try {
      map.stop()
    } catch {
      // ignore
    }
    map.jumpTo({
      center: [pinnedCamera.lng, pinnedCamera.lat],
      zoom: pinnedCamera.zoom,
      bearing: pinnedCamera.bearing ?? map.getBearing(),
    })
    beacon?.draw()
  }, 80)
}

function syncBeaconHeading() {
  if (!beacon) return
  const deg = deviceHeading.value
  const hasHeading = headingAvailable.value && deg != null
  if (!hasHeading) {
    beacon.setHeading(0, false)
    return
  }
  const bearing = map?.getBearing?.() ?? mapBearing.value ?? 0
  beacon.setHeading(deg - bearing, true)
}

const headingText = computed(() => {
  if (!headingAvailable.value || deviceHeading.value == null) return '—'
  const deg = deviceHeading.value
  const idx = Math.round(deg / 45) % 8
  return `${CARDINAL[idx]} ${deg.toFixed(0)}°`
})

const coordText = computed(() => {
  if (lng.value == null || lat.value == null) return '等待定位'
  return `${lng.value.toFixed(6)}, ${lat.value.toFixed(6)}`
})

/** GPS speed 为 m/s → km/h；策略热更新时同步刷新 */
const policyTick = ref(0)
onBehaviorPolicyChange(() => {
  policyTick.value += 1
})

const speedKmh = computed(() => {
  policyTick.value
  const mps = Number(speed.value)
  if (!Number.isFinite(mps) || mps < 0) return null
  const kmh = mps * 3.6
  const idle = getBehaviorPolicy().speedIdleKmh
  if (kmh < idle) return 0
  return kmh
})

const speedLimitKmh = computed(() => {
  policyTick.value
  return getBehaviorPolicy().speedLimitKmh
})

const isSpeeding = computed(() => {
  const v = speedKmh.value
  if (v == null) return false
  return v > speedLimitKmh.value
})

const speedDisplay = computed(() => {
  if (speedKmh.value == null) return '--'
  return String(Math.round(speedKmh.value))
})

const offRouteBannerText = computed(() => {
  if (rerouting.value) return '正在按当前位置重新规划路线…'
  const d = offRouteDistanceMeters.value
  if (Number.isFinite(d) && d > 0) {
    return `已偏离规划路线约 ${formatDistance(d)}`
  }
  return '已偏离规划路线，可重新规划'
})

const overlayStyle = computed(() => ({
  '--offroute-clearance':
    (pendingResume.value && !navigating.value) ||
    (navigating.value && (offRoute.value || rerouting.value))
      ? '64px'
      : '0px',
}))

let lastSpeedingAlertAt = 0
watch(isSpeeding, (over) => {
  if (!over) return
  const now = Date.now()
  if (now - lastSpeedingAlertAt < 8000) return
  lastSpeedingAlertAt = now
  locatingHint.value = `超速提醒 · 当前 ${speedDisplay.value} km/h，限速 ${speedLimitKmh.value} km/h`
  window.setTimeout(() => {
    if (String(locatingHint.value).startsWith('超速提醒')) locatingHint.value = ''
  }, 2800)
  try {
    navigator.vibrate?.(120)
  } catch {
    // ignore
  }
})

const statusText = computed(() => {
  if (arrived.value) return '已到达目的地'
  if (rerouting.value) return '已偏航，正在重新规划'
  if (navigating.value && offRoute.value) return '已偏航，偏离规划路线'
  if (navigating.value) {
    const parts = ['导航中']
    if (remainingMeters.value != null) parts.push(`剩余 ${formatDistance(remainingMeters.value)}`)
    if (remainingSeconds.value != null) parts.push(formatDuration(remainingSeconds.value))
    return parts.join(' · ')
  }
  if (routing.value) return '正在规划路线…'
  if (locatingHint.value) return locatingHint.value
  if (error.value) return error.value
  if (watching.value && lng.value != null) {
    if (followUser.value) return '定位跟踪中 · 视角跟随'
    return navigating.value ? '导航中' : '定位跟踪中'
  }
  return ''
})

const hudTitle = computed(() => {
  if (arrived.value && destination.value) return `已到达 ${destination.value.name}`
  if (navigating.value && destination.value) return `前往 ${destination.value.name}`
  if (destination.value) return destination.value.name
  return address.value || (loading.value ? '地址解析中' : '尚未获取地址')
})

/** 搜索结果展开时隐藏底部地址卡，避免与顶部结果列表重叠 */
const showSearchPanel = computed(
  () => places.value.length > 0 || Boolean(searchError.value && !destination.value),
)

const routeSummary = computed(() => {
  if (!routeInfo.value) return ''
  const mode = `${travelModeLabel(routeInfo.value.mode || travelMode.value)} · ${
    (routeInfo.value.mode || travelMode.value) === 'walk'
      ? '步行路线'
      : driveStyleLabel(routeInfo.value.style)
  }`
  // 导航中剩余里程/时间已在顶部 status 展示，此处不再重复
  if (navigating.value) return mode
  const distance = formatDistance(routeInfo.value.distanceMeters)
  const duration = formatDuration(routeInfo.value.durationSeconds)
  return [mode, distance, duration].filter(Boolean).join(' · ')
})

/** 剩余路程占比 0~1（越接近目的地越小，蓝条越短） */
const navRemainRatio = computed(() => {
  if (!navigating.value) return 0
  const total = Number(routeInfo.value?.distanceMeters) || 0
  const remain = Number(remainingMeters.value)
  if (!(total > 0) || !Number.isFinite(remain)) return 1
  return Math.min(1, Math.max(0, Math.max(0, remain) / total))
})

const navRemainPercent = computed(() => Math.round(navRemainRatio.value * 100))

function estimateRemainingSeconds(meters) {
  const plan = routeInfo.value
  const totalM = Number(plan?.distanceMeters) || 0
  const totalS = Number(plan?.durationSeconds) || 0
  if (totalM > 1 && totalS > 0) return Math.max(0, (meters / totalM) * totalS)
  return Math.max(0, meters / 10)
}

function pathToGeoJSON(path) {
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

function fitPathBounds(paths, options = {}) {
  if (!map || !window.mapboxgl) return
  syncOverlayClearance()

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
  const maxZoom = maxZoomForRouteSpan(spanMeters)

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
    map.stop()
  } catch {
    // ignore
  }

  // 路线总览用平面视角，避免 3D 俯仰裁切路径
  try {
    map.easeTo({
      pitch: getBehaviorPolicy().pitch2d,
      bearing: 0,
      duration: 0,
    })
  } catch {
    // ignore
  }
  pitch3D.value = false

  try {
    map.fitBounds(bounds, {
      padding,
      maxZoom,
      duration: options.duration ?? 800,
      essential: true,
    })
  } catch {
    const c = bounds.getCenter()
    map.jumpTo({
      center: [c.lng, c.lat],
      zoom: Math.min(maxZoom, 12),
      bearing: 0,
      pitch: getBehaviorPolicy().pitch2d,
    })
  }
}

/** 按起终点 / 路线跨度给出总览最大缩放 */
function maxZoomForRouteSpan(meters) {
  const m = Number(meters) || 0
  if (m <= 800) return Math.min(15, MAX_ZOOM)
  if (m <= 2500) return Math.min(14, MAX_ZOOM)
  if (m <= 8000) return Math.min(12, MAX_ZOOM)
  if (m <= 20000) return Math.min(11, MAX_ZOOM)
  if (m <= 50000) return Math.min(10, MAX_ZOOM)
  return Math.min(9, MAX_ZOOM)
}

/** 等底部信息卡高度稳定后再 fit，避免被 HUD 挡住误判缩放 */
async function scheduleFitRouteOverview(paths, options = {}) {
  await nextTick()
  syncOverlayClearance()
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  syncOverlayClearance()
  fitPathBounds(paths, {
    ...options,
    distanceMeters: options.distanceMeters ?? routeInfo.value?.distanceMeters,
  })
}

/** Mapbox GL v1：替换栅格 tiles 并清缓存 */
function replaceRasterTiles(sourceId, tiles) {
  if (!map || !Array.isArray(tiles) || !tiles.length) return
  const source = map.getSource(sourceId)
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
    const cache = map.style?.sourceCaches?.[sourceId]
    cache?.clearTiles?.()
    cache?.update?.(map.transform)
    map.triggerRepaint?.()
  } catch {
    // ignore
  }
}

function applyBasemapToMap(id) {
  if (!map) return
  const { baseTiles, labelTiles } = basemapTileUrls(id)
  replaceRasterTiles('tdt-vec', baseTiles)
  replaceRasterTiles('tdt-cva', labelTiles)
  applyMapThemeStyle(getStoredUiTheme())
}

/** 深色主题：矢量/注记栅格反色，得到暗色电子底图（不影响路线等矢量图层） */
function applyMapThemeStyle(theme) {
  if (!map) return
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
    if (!map.getLayer?.(layerId)) continue
    try {
      for (const [key, value] of Object.entries(paint)) {
        map.setPaintProperty(layerId, key, value)
      }
    } catch {
      // ignore
    }
  }
}

async function initMap() {
  try {
    const mapboxgl = window.mapboxgl
    if (!mapboxgl) throw new Error('Mapbox GL 未加载')
    if (!mapEl.value) throw new Error('地图容器未就绪')

    const { baseTiles, labelTiles } = basemapTileUrls(getStoredBasemap())

    map = new mapboxgl.Map({
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
    if (!map.loaded()) {
      await new Promise((resolve) => {
        map.once('load', resolve)
      })
    }

    await waitForStableMapSize()
    map.resize()
    ensureRouteArrowImage()
    try {
      map.dragPan?.enable?.()
      map.dragRotate?.enable?.()
      map.touchZoomRotate?.enable?.()
      map.touchPitch?.enable?.()
    } catch {
      // ignore
    }

    beacon = new LocationBeacon(map)
    beacon.attach()
    map.on('dragstart', onMapDragStart)
    map.on('dragend', onMapDragEnd)
    map.on('rotate', syncBeaconHeading)
    map.on('pitch', syncBeaconHeading)
    map.on('pitchend', syncPitch3DFromMap)

    mapReady.value = true
    applyMapThemeStyle(getStoredUiTheme())
    resizeObserver = new ResizeObserver(() => onMapContainerResize())
    resizeObserver.observe(mapEl.value)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onMapContainerResize)
    }
    refreshMapSize()
    maybeOfferResumeSession()
    await locateOnce(true)
  } catch (err) {
    mapError.value = err.message || '地图初始化失败'
  }
}

function onMapDragStart() {
  // 用户拖地图后关闭视角跟随与朝向锁定（自动锁定开启时，停拖后会再开）
  followUser.value = false
  headingTestLock.value = false
  pinUntil = 0
  walkHeadingBehavior.reset('drag')
  walkHeadingActive.value = false
  // 拖图期间暂停实时定位回调，避免 GPS 抢相机
  pauseLocationTicksByDrag()
}

function onMapDragEnd() {
  // 停拖约 10s 后恢复定位回调，并自动开启视角锁定（跟随）
  scheduleResumeAfterDragIdle()
}

function setFollowUser(enabled) {
  followUser.value = Boolean(enabled)
  if (followUser.value) {
    routePreviewLock.value = false
    clearLocationResumeTimer()
  }
  if (followUser.value && lng.value != null && lat.value != null) {
    if (navigating.value) {
      applyNavCamera({ lng: lng.value, lat: lat.value }, { snapBearing: headingTestLock.value })
    } else {
      applyPositionToMap(
        { lng: lng.value, lat: lat.value },
        undefined,
        { follow: true, animate: false, forceCenter: true },
      )
    }
  }
  applyHeadingDragLock()
}

function onAutoViewLockPrefChange(enabled) {
  if (enabled) {
    if (routePreviewLock.value && !navigating.value) return
    setFollowUser(true)
    return
  }
  clearLocationResumeTimer()
  followUser.value = false
  applyHeadingDragLock()
}

function syncPitch3DFromMap() {
  if (!map) return
  const pitch = map.getPitch?.() ?? 0
  pitch3D.value = pitch >= 20
}

function togglePitch3D() {
  if (!map) return
  pitch3D.value = !pitch3D.value
  const pitch = pitch3D.value ? getBehaviorPolicy().pitch3d : getBehaviorPolicy().pitch2d
  if (bearingRaf) {
    cancelAnimationFrame(bearingRaf)
    bearingRaf = 0
  }
  try {
    map.stop()
  } catch {
    // ignore
  }
  // jumpTo 立即生效，避免被后续 ease / 定位写入冲掉
  map.easeTo({
    pitch,
    duration: 420,
    essential: true,
  })
  locatingHint.value = pitch3D.value ? '已切换到 3D 视角' : '已切换到 2D 平面'
  window.setTimeout(() => {
    if (locatingHint.value.startsWith('已切换到')) locatingHint.value = ''
  }, 1600)
}

async function locateOnce(isFirst = false) {
  // 手动定位 / 回中：立刻恢复定位回调
  clearLocationResumeTimer()
  if (navigating.value) {
    // 导航中仅回中当前点，不打断导航状态
    if (lng.value != null && lat.value != null) {
      applyNavCamera({ lng: lng.value, lat: lat.value })
    }
    return
  }
  locatingHint.value = isFirst ? '正在获取当前位置…' : '正在重新定位…'
  if (!isFirst) startHeading(true)

  const targetZoom = resolveMaxZoom()
  await waitForStableMapSize(isFirst ? 1200 : 400)

  // 先立刻回到已知位置并拉到最大缩放，再刷新 GPS
  if (!isFirst && lng.value != null && lat.value != null) {
    applyPositionToMap(
      { lng: lng.value, lat: lat.value },
      targetZoom,
      { follow: true, animate: false, forceCenter: true },
    )
  }

  try {
    const pos = await locate()
    await waitForStableMapSize(300)
    // 首次定位用 jumpTo 钉死，避免手机端 flyTo 被 resize 打断导致偏移/缩不到最大
    applyPositionToMap(pos, targetZoom, {
      follow: true,
      animate: !isFirst,
      forceCenter: true,
    })
    address.value = '正在解析地址…'
    address.value = (await reverseGeocode(pos.lng, pos.lat, TIANDITU_TK)) || '地址解析暂不可用'
    locatingHint.value = ''
    refreshMapSize()
    pinCamera(pos, targetZoom, { animate: false })
    if (isFirst) await startHeading(false)
    syncMapBearingTarget()
    applyHeadingDragLock()
  } catch (err) {
    locatingHint.value = err?.message || error.value || '重新定位失败'
  } finally {
    try {
      await watchLocation(onLocationTick)
    } catch {
      // 无定位权限时保持提示，不打断页面
    }
  }
}

function noteHeadingSample(deg) {
  if (!Number.isFinite(deg)) return
  const now = Date.now()
  headingSamples.push({ t: now, h: normalizeHeading(deg) })
  while (headingSamples.length && now - headingSamples[0].t > getBehaviorPolicy().headingSampleWindowMs) {
    headingSamples.shift()
  }
}

function resolveCourseDeg() {
  const gpsSpeed = speed.value
  const gpsCourse = course.value
  // 导航中优先用罗盘，慢走时 GPS course 经常缺失
  if (navigating.value || travelMode.value === 'walk') {
    if (headingAvailable.value && deviceHeading.value != null) {
      return normalizeHeading(deviceHeading.value)
    }
  }
  if (Number.isFinite(gpsCourse) && Number.isFinite(gpsSpeed) && gpsSpeed >= 0.6) {
    return normalizeHeading(gpsCourse)
  }
  if (headingAvailable.value && deviceHeading.value != null) {
    return normalizeHeading(deviceHeading.value)
  }
  return null
}

function headingUpWanted() {
  return Boolean(headingTestLock.value || walkHeadingActive.value)
}

function syncMapBearingTarget() {
  // 导航相机由 applyNavCamera 统一写 center+bearing，避免 setBearing 打断跟随
  if (navigating.value) return
  // 选点 / 路线预览时不抢相机
  if (routePreviewLock.value) return

  const courseDeg = resolveCourseDeg()
  if (courseDeg != null) {
    noteHeadingSample(courseDeg)
    lastGoodBearing = courseDeg
  }

  // 朝向锁定：旋转地图；视角跟随只负责居中，不在这里改 bearing
  if (headingTestLock.value && courseDeg != null) {
    bearingTargetDeg = courseDeg
    ensureBearingLoop()
    applyHeadingDragLock()
    return
  }

  const walkResult = walkHeadingBehavior.update({
    heading: courseDeg,
    speed: speed.value,
    navigating: false,
  })
  walkHeadingActive.value = walkHeadingBehavior.isTracking()

  if (walkHeadingActive.value) {
    bearingTargetDeg =
      walkResult?.tracking ??
      walkHeadingBehavior.getTrackingHeading() ??
      courseDeg ??
      lastGoodBearing
    if (Number.isFinite(bearingTargetDeg)) lastGoodBearing = bearingTargetDeg
    ensureBearingLoop()
    applyHeadingDragLock()
    return
  }

  // 未开朝向锁定时不改 bearing，避免 jumpTo 抢拖图 / 打断 3D pitch
  applyHeadingDragLock()
}

async function testRotateByHeading() {
  locatingHint.value = '正在读取朝向…'
  const ok = await startHeading(true)
  if (!ok && deviceHeading.value == null) {
    locatingHint.value = '无法读取朝向，请授权传感器后重试'
    return
  }

  headingTestLock.value = !headingTestLock.value
  if (!headingTestLock.value) {
    // 关闭朝向锁定：只停动画，不强制回正北（避免每帧 jumpTo 抢拖图）
    if (bearingRaf) {
      cancelAnimationFrame(bearingRaf)
      bearingRaf = 0
    }
    applyHeadingDragLock()
    locatingHint.value = '已关闭朝向锁定'
    window.setTimeout(() => {
      if (locatingHint.value === '已关闭朝向锁定') locatingHint.value = ''
    }, 1600)
    return
  }

  const courseDeg = resolveCourseDeg()
  if (courseDeg == null) {
    headingTestLock.value = false
    locatingHint.value = '暂无朝向数据'
    return
  }

  bearingTargetDeg = courseDeg
  ensureBearingLoop()
  applyHeadingDragLock()
  locatingHint.value = `相机方向 · ${courseDeg.toFixed(0)}°`
  window.setTimeout(() => {
    if (String(locatingHint.value).startsWith('相机方向')) locatingHint.value = ''
  }, 2000)
}

function ensureBearingLoop() {
  if (navigating.value) return
  if (bearingRaf) return
  const step = () => {
    if (!map || navigating.value) {
      bearingRaf = 0
      return
    }
    const current = map.getBearing()
    const targetUnwrapped = unwrapHeading(current, bearingTargetDeg)
    const delta = targetUnwrapped - current
    const alpha = Math.abs(delta) > 45 ? 0.18 : 0.1
    const next = Math.abs(delta) < 2 ? normalizeHeading(bearingTargetDeg) : current + delta * alpha
    // 与 center/zoom 一并写入，避免单独 setBearing → stop() 打断其它动画
    const c = map.getCenter()
    map.jumpTo({
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      bearing: next,
      pitch: map.getPitch?.() ?? 0,
    })
    mapBearing.value = next
    syncBeaconHeading()

    if (Math.abs(delta) < 2) {
      bearingRaf = 0
      applyHeadingDragLock()
      return
    }
    bearingRaf = requestAnimationFrame(step)
  }
  bearingRaf = requestAnimationFrame(step)
}

function applyHeadingDragLock() {
  if (!map) return
  try {
    // Mapbox bearing 已旋转相机，单指拖拽仍对齐屏幕，不能 disable dragPan
    // （否则步行朝向修正后无法拖图解锁，导航中也无法平移）
    map.dragPan?.enable?.()
    if (headingUpWanted()) {
      map.touchZoomRotate?.disableRotation?.()
    } else {
      map.touchZoomRotate?.enableRotation?.()
    }
  } catch {
    // ignore
  }
}

function onLocationTick(pos) {
  if (!map || !beacon || pos?.lng == null) return
  // 拖图暂停期内丢弃回调，不更新蓝点/相机/导航
  if (locationTickPaused) return
  if (navigating.value) {
    onNavUpdate(pos)
    return
  }
  // 预览目的地/路线时只更新蓝点，不跟相机
  if (routePreviewLock.value) {
    beacon.setLngLat({ lng: pos.lng, lat: pos.lat }, { animate: true })
    return
  }
  applyPositionToMap(pos, undefined, {
    follow: followUser.value,
    animate: true,
  })
  syncMapBearingTarget()
  applyHeadingDragLock()
}

/**
 * 导航相机：同一帧写入 center + zoom + bearing，避免互相 stop()
 * @param {{ lng: number, lat: number }} pos
 * @param {{ snapBearing?: boolean }} [opts]
 */
function applyNavCamera(pos, opts = {}) {
  if (!map || !pos || pos.lng == null) return
  beacon.setLngLat({ lng: pos.lng, lat: pos.lat }, { animate: true })

  const smooth = beacon.getDisplayLngLat?.() || pos
  const zoom = Math.max(map.getZoom(), NAV_ZOOM)
  let nextBearing = map.getBearing()

  // 朝向锁定才改 bearing；视角跟随只负责把用户放在画面中心
  if (headingTestLock.value) {
    const courseDeg = resolveCourseDeg()
    if (courseDeg != null) {
      noteHeadingSample(courseDeg)
      lastGoodBearing = courseDeg
      bearingTargetDeg = courseDeg
    } else {
      bearingTargetDeg = lastGoodBearing
    }

    const current = map.getBearing()
    const targetUnwrapped = unwrapHeading(current, bearingTargetDeg)
    const delta = targetUnwrapped - current
    const snapBearing = Boolean(opts.snapBearing)
    const alpha = Math.abs(delta) > 45 ? 0.28 : 0.18
    nextBearing = snapBearing || Math.abs(delta) < 2.5
      ? normalizeHeading(bearingTargetDeg)
      : current + delta * alpha
  }

  if (!followUser.value) {
    // 未开视角跟随：只更新蓝点与（可选）朝向，不强制居中
    if (headingTestLock.value) {
      map.jumpTo({ bearing: nextBearing })
      mapBearing.value = nextBearing
      syncBeaconHeading()
    }
    applyHeadingDragLock()
    return
  }

  pinnedCamera = {
    lng: smooth.lng,
    lat: smooth.lat,
    zoom: NAV_ZOOM,
    bearing: nextBearing,
  }
  pinUntil = 0

  map.jumpTo({
    center: [smooth.lng, smooth.lat],
    zoom,
    bearing: nextBearing,
    pitch: map.getPitch?.() ?? 0,
  })
  mapBearing.value = nextBearing
  syncBeaconHeading()
  lastFollowPanAt = performance.now()
  applyHeadingDragLock()
}

async function copyOpenUrl() {
  try {
    await navigator.clipboard.writeText(httpsUrl)
    locatingHint.value = '链接已复制，请粘贴到系统浏览器打开'
  } catch {
    locatingHint.value = `请手动复制：${httpsUrl}`
  }
}

function applyPositionToMap(pos, zoom, options = {}) {
  if (pos?.lng == null || pos?.lat == null || !map || !beacon) return
  const follow = options.follow !== false
  const animate = options.animate !== false
  const forceCenter = Boolean(options.forceCenter)
  beacon.setLngLat({ lng: pos.lng, lat: pos.lat }, { animate: !forceCenter && animate })

  if (!follow) return

  const curZoom = map.getZoom()
  const nextZoom = zoom ?? curZoom

  // 强制居中：resize + jumpTo/flyTo 钉死，并记录 pinnedCamera 供后续 resize 回正
  if (forceCenter) {
    lastFollowPanAt = performance.now()
    pinCamera(pos, nextZoom ?? resolveMaxZoom(), { animate })
    return
  }

  const zoomChanged =
    nextZoom != null && curZoom != null && Math.abs(Number(nextZoom) - Number(curZoom)) > 0.05

  if (zoomChanged) {
    lastFollowPanAt = performance.now()
    map.jumpTo({
      center: [pos.lng, pos.lat],
      zoom: nextZoom,
      bearing: map.getBearing(),
      pitch: map.getPitch?.() ?? 0,
    })
    return
  }

  // 视角跟随：每帧把相机压在用户位置正上方（不做偏离阈值）
  scheduleSoftFollowPan(pos)
}

function scheduleSoftFollowPan(pos) {
  followPanPos = pos
  if (followPanRaf) return
  followPanRaf = requestAnimationFrame(() => {
    followPanRaf = 0
    const target = followPanPos
    followPanPos = null
    if (!target || !map || navigating.value || !followUser.value) return

    const smooth = beacon?.getDisplayLngLat?.() || target
    lastFollowPanAt = performance.now()
    map.jumpTo({
      center: [smooth.lng, smooth.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch?.() ?? 0,
    })
  })
}

async function onSearch() {
  searchError.value = ''
  searching.value = true
  arrived.value = false
  try {
    const around = lng.value != null ? { lng: lng.value, lat: lat.value } : null
    places.value = await searchPlaces(keyword.value, around, TIANDITU_TK)
    if (!places.value.length) searchError.value = '没有找到匹配地点，请换个关键词'
  } catch (err) {
    places.value = []
    searchError.value = err.message || '搜索失败'
  } finally {
    searching.value = false
  }
}

function closeSearchPanel() {
  places.value = []
  if (!destination.value) searchError.value = ''
}

function beginNavHistoryMeta() {
  if (!destination.value || !routeInfo.value) {
    activeNavMeta = null
    return
  }
  activeNavMeta = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    startedAt: Date.now(),
    destination: {
      name: destination.value.name || '目的地',
      lng: Number(destination.value.lng),
      lat: Number(destination.value.lat),
      address: destination.value.address || '',
    },
    travelMode: travelMode.value === 'walk' ? 'walk' : 'drive',
    driveStyle: String(driveStyle.value || (travelMode.value === 'walk' ? 'walk' : '0')),
    distanceMeters: Number(routeInfo.value.distanceMeters) || 0,
    durationSeconds: Number(routeInfo.value.durationSeconds) || 0,
  }
}

function commitNavHistory(opts = {}) {
  if (!activeNavMeta || opts.keepSession) {
    if (!opts.keepSession) activeNavMeta = null
    return
  }
  const record = {
    ...activeNavMeta,
    endedAt: Date.now(),
    arrived: Boolean(opts.announceArrive),
    distanceMeters: Number(routeInfo.value?.distanceMeters) || activeNavMeta.distanceMeters,
    durationSeconds: Number(routeInfo.value?.durationSeconds) || activeNavMeta.durationSeconds,
    travelMode: travelMode.value === 'walk' ? 'walk' : activeNavMeta.travelMode,
    driveStyle: String(driveStyle.value || activeNavMeta.driveStyle),
  }
  pushNavHistory(record)
  activeNavMeta = null
}

async function applyHistoryItem(item) {
  if (!item?.destination) return
  keyword.value = item.destination.name || ''
  if (item.travelMode === 'walk' || item.travelMode === 'drive') {
    travelMode.value = item.travelMode
  }
  if (item.driveStyle) driveStyle.value = String(item.driveStyle)
  await selectPlace({
    name: item.destination.name,
    lng: item.destination.lng,
    lat: item.destination.lat,
    address: item.destination.address || '',
  })
}

async function selectPlace(place) {
  if (place.suggest) {
    keyword.value = place.name
    await onSearch()
    return
  }

  const lngNum = Number(place.lng)
  const latNum = Number(place.lat)
  if (!Number.isFinite(lngNum) || !Number.isFinite(latNum)) {
    searchError.value = '该结果没有有效坐标，请换一个地点'
    return
  }

  const dest = {
    ...place,
    lng: lngNum,
    lat: latNum,
  }

  // 选点后锁定预览相机，避免定位跟随把目的地标拽出视野
  followUser.value = false
  walkHeadingBehavior.reset('select-place')
  walkHeadingActive.value = false
  headingTestLock.value = false
  routePreviewLock.value = true
  if (bearingRaf) {
    cancelAnimationFrame(bearingRaf)
    bearingRaf = 0
  }
  bearingTargetDeg = 0

  destination.value = dest
  places.value = []
  searchError.value = ''
  arrived.value = false
  navigating.value = false
  routesReady.value = false
  routeInfo.value = null
  routePlans.value = {}
  driveStyle.value = travelMode.value === 'walk' ? 'walk' : '0'
  nextGuide.value = ''
  remainingMeters.value = null
  remainingSeconds.value = null
  lastDrawnRemainMeters = null
  clearAllRouteLines()
  setDestMarker(dest)

  try {
    map.stop()
  } catch {
    // ignore
  }
  map.jumpTo({
    center: [dest.lng, dest.lat],
    zoom: 16,
    bearing: 0,
  })
  mapBearing.value = 0
  refreshMapSize()
}

async function onNavigateClick() {
  if (!destination.value || routing.value || navigating.value) return
  // 移动端：必须在任何 await 之前解锁语音（用户手势）
  unlockNavVoice({ primingText: '开始导航' })
  locatingHint.value = '正在规划路线…'
  const ok = await prepareDualRoutes({ previewDual: false })
  if (ok) await startNavigation()
  else if (!searchError.value) locatingHint.value = ''
}

async function onRouteClick() {
  if (!destination.value || routing.value || navigating.value) return
  unlockNavVoice()
  locatingHint.value = '正在规划路线…'
  const ok = await prepareDualRoutes({ previewDual: true })
  if (ok) {
    locatingHint.value = '路线已就绪，可选择方案后开始导航'
    window.setTimeout(() => {
      if (locatingHint.value.startsWith('路线已就绪')) locatingHint.value = ''
    }, 2200)
  } else if (!searchError.value) {
    locatingHint.value = ''
  }
}

async function prepareDualRoutes({ previewDual = true } = {}) {
  if (!destination.value) return false
  routing.value = true
  searchError.value = ''
  arrived.value = false
  routePreviewLock.value = true
  followUser.value = false
  headingTestLock.value = false
  walkHeadingBehavior.reset('route-preview')
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
      throw new Error('目的地坐标无效')
    }

    const plans = {}

    if (travelMode.value === 'walk') {
      const walked = await planByTravelMode(start, end, TIANDITU_TK, 'walk')
      if (!walked?.path?.length) throw new Error('没有找到步行路线')
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
          results.find((item) => item.status === 'rejected')?.reason?.message || '路线规划失败',
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
    lastDrawnRemainMeters = null
    if (previewDual && travelMode.value === 'drive') {
      drawDualRoutes(false)
      await scheduleFitRouteOverview(
        Object.values(plans)
          .map((p) => p?.path)
          .filter((p) => p?.length),
        { distanceMeters: routeInfo.value.distanceMeters },
      )
    } else {
      clearAllRouteLines()
      setRouteLine(driveStyle.value, routeInfo.value.path, true)
      await scheduleFitRouteOverview([routeInfo.value.path], {
        distanceMeters: routeInfo.value.distanceMeters,
      })
    }
    locatingHint.value = ''
    return true
  } catch (err) {
    routesReady.value = false
    routePlans.value = {}
    routeInfo.value = null
    searchError.value = err.message || '路线规划失败'
    locatingHint.value = searchError.value
    clearAllRouteLines()
    return false
  } finally {
    routing.value = false
    refreshMapSize()
  }
}

async function setTravelMode(mode) {
  if (mode !== 'drive' && mode !== 'walk') return
  if (travelMode.value === mode) return
  if (navigating.value) return
  travelMode.value = mode
  routesReady.value = false
  routePlans.value = {}
  routeInfo.value = null
  driveStyle.value = mode === 'walk' ? 'walk' : getDefaultDriveStyle()
  clearAllRouteLines()
  if (destination.value) {
    await prepareDualRoutes({ previewDual: mode === 'drive' })
  }
}

function chooseDriveStyle(style) {
  if (navigating.value || routing.value || !routesReady.value) return
  const id = String(style)
  if (!routePlans.value[id]) return
  driveStyle.value = id
  routeInfo.value = routePlans.value[id]
  remainingMeters.value = routeInfo.value.distanceMeters
  remainingSeconds.value = routeInfo.value.durationSeconds
  nextGuide.value = routeInfo.value.guides?.[0]?.text || ''
  lastDrawnRemainMeters = null
  syncRouteLineStyles()
  void scheduleFitRouteOverview([routeInfo.value.path], {
    distanceMeters: routeInfo.value.distanceMeters,
  })
}

async function startNavigation() {
  if (!destination.value || !routesReady.value) return
  clearLocationResumeTimer()
  walkHeadingBehavior.reset('navigating')
  walkHeadingActive.value = false
  routePreviewLock.value = false
  // 导航默认开关见行为策略；视角跟随受「自动视角锁定」约束
  const policy = getBehaviorPolicy()
  followUser.value = getAutoViewLock() && policy.followUserOnNavStart
  headingTestLock.value = policy.headingLockOnNavStart
  clearSettleTimers()
  pinUntil = 0
  if (bearingRaf) {
    cancelAnimationFrame(bearingRaf)
    bearingRaf = 0
  }
  if (lng.value == null) {
    const pos = await locate()
    applyPositionToMap(pos, LOCATED_ZOOM)
  }
  if (!routeInfo.value) await prepareDualRoutes()
  if (!routeInfo.value) return
  await startHeading(true)
  navigating.value = true
  arrived.value = false
  offRoute.value = false
  offRouteDistanceMeters.value = null
  arriveHits = 0
  lastDrawnRemainMeters = null
  offRouteMonitor.start()
  clearIdleRouteLines()
  const courseDeg = resolveCourseDeg()
  if (courseDeg != null) lastGoodBearing = courseDeg
  applyNavCamera({ lng: lng.value, lat: lat.value }, { snapBearing: true })
  locatingHint.value = '导航中 · 视角跟随已开启'
  window.setTimeout(() => {
    if (locatingHint.value.startsWith('导航中 · 视角跟随')) locatingHint.value = ''
  }, 1800)

  const hint = getNavVoiceSupportHint()
  if (hint) locatingHint.value = hint

  const modeLabel = travelMode.value === 'walk' ? '步行导航' : '驾车导航'
  speakNavOverview({
    modeLabel,
    distanceText: formatDistance(routeInfo.value.distanceMeters),
    durationText: formatDuration(routeInfo.value.durationSeconds),
  })
  if (nextGuide.value) {
    speakNav(nextGuide.value, { interrupt: false, dedupeMs: 0 })
  }

  persistNavSession(true)
  pendingResume.value = null
  beginNavHistoryMeta()

  try {
    await watchLocation(onLocationTick)
  } catch (err) {
    navigating.value = false
    clearNavSession()
    activeNavMeta = null
    stopNavVoice()
    locatingHint.value = err?.message || '无法持续定位，导航已取消'
  }
}

/** 按钮点击同步解锁语音，再进入异步导航流程 */
function onStartNavClick() {
  unlockNavVoice({ primingText: '开始导航' })
  void startNavigation()
}

function collectNavSessionState() {
  return {
    destination: destination.value,
    travelMode: travelMode.value,
    driveStyle: driveStyle.value,
    routeInfo: routeInfo.value,
    remainingMeters: remainingMeters.value,
    remainingSeconds: remainingSeconds.value,
    nextGuide: nextGuide.value,
    followUser: followUser.value,
    headingTestLock: headingTestLock.value,
  }
}

function persistNavSession(force = false) {
  if (!navigating.value || !destination.value || !routeInfo.value?.path?.length) return
  const policy = getBehaviorPolicy()
  const throttleMs = Number(policy.navSessionPersistThrottleMs) || 15000
  const minMeters = Number(policy.navSessionPersistMinMeters) || 50
  const now = Date.now()
  const remain = remainingMeters.value
  if (!force) {
    const elapsedOk = now - lastSessionSaveAt >= throttleMs
    const movedOk =
      lastSessionSaveRemainMeters == null ||
      (Number.isFinite(remain) &&
        Math.abs(Number(remain) - Number(lastSessionSaveRemainMeters)) >= minMeters)
    if (!elapsedOk && !movedOk) return
  }
  const snap = buildNavSessionSnapshot(collectNavSessionState())
  if (!snap) return
  if (saveNavSession(snap)) {
    lastSessionSaveAt = now
    lastSessionSaveRemainMeters = remain
  }
}

async function rebindNavRuntime({ hint = true } = {}) {
  try {
    await restartWatch(onLocationTick)
  } catch (err) {
    locatingHint.value = err?.message || '无法恢复定位，请检查权限后重试'
    return false
  }
  rebindHeading()
  try {
    await startHeading(true)
  } catch {
    // ignore
  }
  if (lng.value != null && lat.value != null) {
    applyNavCamera({ lng: lng.value, lat: lat.value })
  }
  refreshMapSize()
  onNavVoicePageVisible({
    hiddenMs: pageHiddenAt ? Date.now() - pageHiddenAt : 0,
  })
  if (hint) {
    locatingHint.value = '定位已恢复'
    window.setTimeout(() => {
      if (locatingHint.value === '定位已恢复') locatingHint.value = ''
    }, 1500)
  }
  return true
}

function onPageVisibilityChange() {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') {
    pageHiddenAt = Date.now()
    onNavVoicePageHidden()
    return
  }
  if (document.visibilityState !== 'visible') return
  onNavVoicePageVisible({
    hiddenMs: pageHiddenAt ? Date.now() - pageHiddenAt : 0,
  })
  if (navigating.value) {
    void rebindNavRuntime({ hint: true })
  }
  pageHiddenAt = 0
}

function onPageShow(event) {
  if (event?.persisted && navigating.value) {
    void rebindNavRuntime({ hint: true })
  }
}

function bindPageLifecycle() {
  if (visibilityBound || typeof window === 'undefined') return
  visibilityBound = true
  document.addEventListener('visibilitychange', onPageVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
}

function unbindPageLifecycle() {
  if (!visibilityBound || typeof window === 'undefined') return
  visibilityBound = false
  document.removeEventListener('visibilitychange', onPageVisibilityChange)
  window.removeEventListener('pageshow', onPageShow)
}

function maybeOfferResumeSession() {
  if (navigating.value || pendingResume.value) return
  const session = loadNavSession()
  if (!session) return
  pendingResume.value = session
}

function discardResumeSession() {
  clearNavSession()
  pendingResume.value = null
  locatingHint.value = '已放弃未完成的导航'
  window.setTimeout(() => {
    if (locatingHint.value === '已放弃未完成的导航') locatingHint.value = ''
  }, 1600)
}

async function confirmResumeSession() {
  const session = pendingResume.value
  if (!session) return
  unlockNavVoice({ primingText: '继续导航' })
  pendingResume.value = null

  const path = coordsToPath(session.route?.path || [])
  if (path.length < 2) {
    clearNavSession()
    locatingHint.value = '会话路线无效，已清除'
    return
  }

  destination.value = {
    name: session.destination.name || '目的地',
    lng: Number(session.destination.lng),
    lat: Number(session.destination.lat),
    address: session.destination.address || '',
  }
  travelMode.value = session.travelMode === 'walk' ? 'walk' : 'drive'
  driveStyle.value = String(
    session.driveStyle || (travelMode.value === 'walk' ? 'walk' : '0'),
  )
  routeInfo.value = {
    mode: session.route.mode || travelMode.value,
    style: session.route.style || driveStyle.value,
    distanceMeters: Number(session.route.distanceMeters) || 0,
    durationSeconds: Number(session.route.durationSeconds) || 0,
    path,
    guides: Array.isArray(session.route.guides) ? session.route.guides : [],
  }
  routePlans.value = { [driveStyle.value]: routeInfo.value }
  routesReady.value = true
  remainingMeters.value =
    session.remainingMeters == null
      ? routeInfo.value.distanceMeters
      : Number(session.remainingMeters)
  remainingSeconds.value =
    session.remainingSeconds == null
      ? routeInfo.value.durationSeconds
      : Number(session.remainingSeconds)
  nextGuide.value = session.nextGuide || routeInfo.value.guides?.[0]?.text || ''
  followUser.value = getAutoViewLock() && session.followUser !== false
  headingTestLock.value = session.headingTestLock !== false
  routePreviewLock.value = false
  arrived.value = false
  offRoute.value = false
  offRouteDistanceMeters.value = null
  arriveHits = 0
  lastDrawnRemainMeters = null

  setDestMarker(destination.value)
  clearIdleRouteLines()
  setRouteLine(driveStyle.value, path, true)
  navigating.value = true
  offRouteMonitor.start()
  applyHeadingDragLock()
  persistNavSession(true)
  beginNavHistoryMeta()

  const ok = await rebindNavRuntime({ hint: false })
  locatingHint.value = ok ? '已继续导航' : locatingHint.value || '导航已恢复，定位待重试'
  window.setTimeout(() => {
    if (locatingHint.value === '已继续导航') locatingHint.value = ''
  }, 1800)
}

function stopNavigation(opts = {}) {
  const wasNavigating = navigating.value
  navigating.value = false
  if (wasNavigating) commitNavHistory(opts)
  if (!opts.keepSession) {
    clearNavSession()
    lastSessionSaveAt = 0
    lastSessionSaveRemainMeters = null
  }
  offRoute.value = false
  offRouteDistanceMeters.value = null
  rerouting.value = false
  lastDrawnRemainMeters = null
  offRouteMonitor.stop()
  walkHeadingBehavior.reset('stop-nav')
  walkHeadingActive.value = false
  if (opts.announceArrive) {
    speakNav('已到达目的地', { interrupt: true, dedupeMs: 0 })
  } else {
    stopNavVoice()
  }
  // 结束导航后恢复为策略默认开关（视角跟随仍受自动锁定设置约束）
  const policy = getBehaviorPolicy()
  followUser.value = getAutoViewLock() && policy.followUserOnInit
  headingTestLock.value = policy.headingLockOnInit
  try {
    map?.dragPan?.enable?.()
    map?.touchZoomRotate?.enableRotation?.()
  } catch {
    // ignore
  }
  if (routesReady.value && destination.value) {
    routeInfo.value = routePlans.value[driveStyle.value] || routeInfo.value
    if (routeInfo.value) {
      remainingMeters.value = routeInfo.value.distanceMeters
      remainingSeconds.value = routeInfo.value.durationSeconds
    }
    drawDualRoutes(false)
  }
  syncMapBearingTarget()
  applyHeadingDragLock()
}

function onNavUpdate(pos) {
  if (!navigating.value || !destination.value) return

  const current = { lng: pos.lng, lat: pos.lat }
  const dest = { lng: destination.value.lng, lat: destination.value.lat }
  const path = routeInfo.value?.path || [current, dest]
  const policy = getBehaviorPolicy()
  const snap = snapToRoute(current, path, policy.offRouteMeters)

  applyNavCamera(current)

  if (snap.remaining?.length >= 1) {
    remainingMeters.value =
      snap.remaining.length >= 2
        ? snap.remainingMeters
        : haversineMeters({ lng: snap.lng, lat: snap.lat }, dest)
    remainingSeconds.value = estimateRemainingSeconds(remainingMeters.value)
    if (snap.remaining.length >= 2) {
      updateNavRoute(snap.remaining, snap.remainingMeters)
    }
  }

  // 偏航监测（导航中）；步行也提示，自动重规划由策略控制
  const yaw = offRouteMonitor.evaluate({
    onRoute: snap.onRoute,
    distanceMeters: snap.distanceMeters,
  })
  if (yaw) {
    offRoute.value = yaw.offRoute
    offRouteDistanceMeters.value = yaw.offRoute ? yaw.distanceMeters : null
    if (yaw.shouldReroute && travelMode.value !== 'walk') {
      void rerouteAfterYaw(current)
    }
  }

  const guideIndex = Math.min(
    routeInfo.value?.guides?.length ? routeInfo.value.guides.length - 1 : 0,
    Math.max(0, (routeInfo.value?.guides?.length || 1) - Math.ceil((snap.remaining?.length || 1) / 20)),
  )
  nextGuide.value = routeInfo.value?.guides?.[guideIndex]?.text || nextGuide.value

  const arriveMeters = policy.arriveMeters
  const nearDest =
    haversineMeters(current, dest) <= arriveMeters ||
    (Number.isFinite(remainingMeters.value) && remainingMeters.value <= arriveMeters)
  if (nearDest) {
    arriveHits += 1
    if (arriveHits >= 3) {
      arrived.value = true
      remainingMeters.value = 0
      remainingSeconds.value = 0
      stopNavigation({ announceArrive: true })
    }
  } else {
    arriveHits = 0
  }

  persistNavSession(false)
}

function toggleVoiceMute() {
  // 开启语音时必须在点击手势内解锁
  if (voiceMuted.value) {
    unlockNavVoice({ primingText: '语音已开启' })
  }
  const nextMuted = toggleNavVoiceMuted()
  voiceMuted.value = nextMuted
  setVoiceEnabled(!nextMuted)
  locatingHint.value = voiceMuted.value ? '语音播报已关闭' : '语音播报已开启'
  window.setTimeout(() => {
    if (locatingHint.value.startsWith('语音播报')) locatingHint.value = ''
  }, 1600)
}

function applyNavPrefs(next) {
  voiceMuted.value = !next.voiceEnabled
  if (navigating.value || routesReady.value || routing.value) return
  travelMode.value = next.travelMode
  driveStyle.value = next.travelMode === 'walk' ? 'walk' : next.driveStyle
}

async function onRerouteClick() {
  if (!navigating.value || rerouting.value) return
  unlockNavVoice({ primingText: '重新规划' })
  const current =
    lng.value != null && lat.value != null
      ? { lng: Number(lng.value), lat: Number(lat.value) }
      : null
  if (!current || !Number.isFinite(current.lng) || !Number.isFinite(current.lat)) {
    locatingHint.value = '暂无定位，无法重新规划'
    return
  }
  await rerouteAfterYaw(current)
}

async function rerouteAfterYaw(current) {
  if (rerouting.value || !destination.value) return
  rerouting.value = true
  offRouteMonitor.markRerouteStarted()
  nextGuide.value = '已偏航，正在按当前位置重新规划'
  speakNav('已偏离规划路线，正在重新规划', { interrupt: true, dedupeMs: 0 })
  try {
    // 预留后端：replanHook 返回有效路线则优先使用
    let planned = null
    if (typeof offRouteMonitor.requestReplan === 'function') {
      const hooked = await offRouteMonitor.requestReplan({
        current,
        destination: destination.value,
        mode: travelMode.value,
        style: driveStyle.value,
        reason: 'off-route',
      })
      if (hooked?.path?.length >= 2) planned = hooked
    }
    if (!planned) {
      planned = await planByTravelMode(
        current,
        destination.value,
        TIANDITU_TK,
        travelMode.value,
        travelMode.value === 'walk' ? 'walk' : driveStyle.value,
      )
    }
    routeInfo.value = planned
    routePlans.value = { ...routePlans.value, [driveStyle.value]: planned }
    remainingMeters.value = planned.distanceMeters
    remainingSeconds.value = planned.durationSeconds
    nextGuide.value = planned.guides?.[0]?.text || '已重新规划路线'
    speakNav(nextGuide.value, { interrupt: false, dedupeMs: 0 })
    lastDrawnRemainMeters = null
    clearIdleRouteLines()
    setRouteLine(driveStyle.value, planned.path, true)
    offRoute.value = false
    offRouteDistanceMeters.value = null
    offRouteMonitor.reset('rerouted')
    persistNavSession(true)
    if (activeNavMeta) {
      activeNavMeta.distanceMeters = Number(planned.distanceMeters) || activeNavMeta.distanceMeters
      activeNavMeta.durationSeconds = Number(planned.durationSeconds) || activeNavMeta.durationSeconds
      activeNavMeta.driveStyle = String(driveStyle.value || activeNavMeta.driveStyle)
      activeNavMeta.travelMode = travelMode.value === 'walk' ? 'walk' : 'drive'
    }
  } catch (err) {
    nextGuide.value = err.message || '重新规划失败，请靠近原路线'
    speakNav(nextGuide.value, { interrupt: true, dedupeMs: 0 })
  } finally {
    rerouting.value = false
    refreshMapSize()
  }
}

function setDestMarker(place) {
  clearDestMarker()
  if (!map || !window.mapboxgl) return
  const lng = Number(place.lng)
  const lat = Number(place.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

  const el = document.createElement('div')
  el.className = 'dest-marker'
  el.innerHTML =
    '<div class="dest-marker__pin"></div><div class="dest-marker__label">目的地</div>'
  destMarker = new window.mapboxgl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([lng, lat])
    .addTo(map)
}

function ensureRouteArrowImage() {
  if (!map || map.hasImage?.(ROUTE_ARROW_IMAGE_ID)) return
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, size, size)
  // 白色箭头（沿路线前进方向），略留边距避免裁切
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.moveTo(14, 14)
  ctx.lineTo(50, 32)
  ctx.lineTo(14, 50)
  ctx.closePath()
  ctx.fill()
  const imageData = ctx.getImageData(0, 0, size, size)
  map.addImage(ROUTE_ARROW_IMAGE_ID, imageData, { pixelRatio: 2 })
}

function routeLineWidthExpr(active, kind) {
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

function routeLayerIds(styleId) {
  return {
    casingId: `route-${styleId}-casing`,
    lineId: `route-${styleId}-line`,
    arrowId: `route-${styleId}-arrow`,
  }
}

function applyRoutePaint(styleId, active) {
  if (!map) return
  const { casingId, lineId, arrowId } = routeLayerIds(styleId)
  if (map.getLayer(casingId)) {
    map.setPaintProperty(casingId, 'line-color', ROUTE_CASING_COLOR)
    map.setPaintProperty(casingId, 'line-opacity', active ? 0.95 : 0.7)
    map.setPaintProperty(casingId, 'line-width', routeLineWidthExpr(active, 'casing'))
  }
  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, 'line-color', active ? ROUTE_COLOR_ACTIVE : ROUTE_COLOR_IDLE)
    map.setPaintProperty(lineId, 'line-opacity', active ? ROUTE_OPACITY_ACTIVE : ROUTE_OPACITY_IDLE)
    map.setPaintProperty(lineId, 'line-width', routeLineWidthExpr(active, 'fill'))
  }
  if (map.getLayer(arrowId)) {
    map.setLayoutProperty(arrowId, 'visibility', active ? 'visible' : 'none')
    map.setPaintProperty(arrowId, 'icon-opacity', active ? 0.95 : 0)
  }
}

function addRouteLayers(styleId, sourceId, active) {
  ensureRouteArrowImage()
  const { casingId, lineId, arrowId } = routeLayerIds(styleId)
  const lineLayout = { 'line-join': 'round', 'line-cap': 'round' }

  if (!map.getLayer(casingId)) {
    map.addLayer({
      id: casingId,
      type: 'line',
      source: sourceId,
      layout: lineLayout,
      paint: {
        'line-color': ROUTE_CASING_COLOR,
        'line-width': routeLineWidthExpr(active, 'casing'),
        'line-opacity': active ? 0.95 : 0.7,
      },
    })
  }
  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      layout: lineLayout,
      paint: {
        'line-color': active ? ROUTE_COLOR_ACTIVE : ROUTE_COLOR_IDLE,
        'line-width': routeLineWidthExpr(active, 'fill'),
        'line-opacity': active ? ROUTE_OPACITY_ACTIVE : ROUTE_OPACITY_IDLE,
      },
    })
  }
  if (!map.getLayer(arrowId) && map.hasImage?.(ROUTE_ARROW_IMAGE_ID)) {
    map.addLayer({
      id: arrowId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 64,
        'icon-image': ROUTE_ARROW_IMAGE_ID,
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
  applyRoutePaint(styleId, active)
}

function setRouteLine(styleId, path, active) {
  if (!path?.length || !map) return
  const sourceId = `route-${styleId}`
  const data = pathToGeoJSON(path)
  if (!data.geometry.coordinates.length) return

  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(data)
    addRouteLayers(styleId, sourceId, active)
  } else {
    map.addSource(sourceId, { type: 'geojson', data })
    addRouteLayers(styleId, sourceId, active)
  }

  routeLines[styleId] = { sourceId, ...routeLayerIds(styleId) }
  if (active) bringRouteLineToFront(styleId)
}

function drawDualRoutes(fit = true) {
  clearAllRouteLines()
  const plans = routePlans.value
  const selected = driveStyle.value
  const allPaths = []

  // 先画未选中，再画选中，保证选中路线在上层
  Object.keys(plans).forEach((styleId) => {
    if (styleId === selected) return
    const path = plans[styleId]?.path
    if (!path?.length) return
    setRouteLine(styleId, path, false)
    allPaths.push(path)
  })

  const activePath = plans[selected]?.path
  if (activePath?.length) {
    setRouteLine(selected, activePath, true)
    bringRouteLineToFront(selected)
    allPaths.push(activePath)
  }

  if (fit && allPaths.length) fitPathBounds(allPaths)
}

function syncRouteLineStyles() {
  const plans = routePlans.value
  const selected = driveStyle.value

  Object.keys(plans).forEach((styleId) => {
    if (styleId === selected) return
    const path = plans[styleId]?.path
    if (!path?.length) return
    setRouteLine(styleId, path, false)
  })

  const activePath = plans[selected]?.path
  if (activePath?.length) {
    setRouteLine(selected, activePath, true)
    bringRouteLineToFront(selected)
  }
}

function bringRouteLineToFront(styleId) {
  const meta = routeLines[styleId]
  if (!meta || !map) return
  const { casingId, lineId, arrowId, sourceId } = meta
  const ids = [casingId, lineId, arrowId].filter((id) => id && map.getLayer(id))
  if (!ids.length) return
  try {
    ids.forEach((id) => map.moveLayer(id))
  } catch {
    try {
      const source = map.getSource(sourceId)
      const data = source?._data || pathToGeoJSON(routePlans.value[styleId]?.path || [])
      ids.forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id)
      })
      addRouteLayers(styleId, sourceId, true)
      if (source && data) source.setData?.(data)
    } catch {
      // ignore
    }
  }
}

/** 导航中就地更新当前选中路线的剩余路段 */
function updateNavRoute(path, remainMeters = null) {
  if (!path?.length || !map) return
  const meters = remainMeters ?? 0
  if (lastDrawnRemainMeters != null && Math.abs(lastDrawnRemainMeters - meters) < 0.5) return
  lastDrawnRemainMeters = meters

  const styleId = driveStyle.value
  const sourceId = `route-${styleId}`
  const { lineId } = routeLayerIds(styleId)
  const source = map.getSource(sourceId)
  if (source && typeof source.setData === 'function') {
    source.setData(pathToGeoJSON(path))
    if (!map.getLayer(lineId)) {
      setRouteLine(styleId, path, true)
    } else {
      applyRoutePaint(styleId, true)
      bringRouteLineToFront(styleId)
    }
    routeLines[styleId] = { sourceId, ...routeLayerIds(styleId) }
    return
  }
  setRouteLine(styleId, path, true)
}

function clearDestMarker() {
  if (!destMarker) return
  try {
    destMarker.remove()
  } catch {
    // ignore
  }
  destMarker = null
}

function removeRouteLine(styleId) {
  const meta = routeLines[styleId]
  delete routeLines[styleId]
  if (!meta || !map) return
  const ids = [meta.arrowId, meta.lineId, meta.casingId, meta.layerId].filter(Boolean)
  try {
    ids.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id)
    })
    if (map.getSource(meta.sourceId)) map.removeSource(meta.sourceId)
  } catch {
    // ignore
  }
}

function clearIdleRouteLines() {
  Object.keys(routeLines).forEach((styleId) => {
    if (styleId !== driveStyle.value) removeRouteLine(styleId)
  })
}

function clearAllRouteLines() {
  Object.keys(routeLines).forEach((styleId) => removeRouteLine(styleId))
  routeLines = {}
}

function clearDestination() {
  stopNavigation()
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
  lastDrawnRemainMeters = null
  clearDestMarker()
  clearAllRouteLines()
}

watch(
  () => [
    showSearchPanel.value,
    places.value.length,
    searchError.value,
    destination.value,
    routesReady.value,
    navigating.value,
    statusText.value,
    hudTitle.value,
    address.value,
  ],
  () => {
    requestAnimationFrame(() => {
      refreshMapSize()
      syncOverlayClearance()
    })
  },
)

const compassRotate = ref(0)

watch(
  () => [deviceHeading.value, headingAvailable.value],
  ([deg, hasHeading]) => {
    compassRotate.value = unwrapHeading(compassRotate.value, deg ?? 0)
    syncBeaconHeading()
    if (!hasHeading) return
    syncMapBearingTarget()
  },
)

watch(
  () => [navigating.value, followUser.value, headingTestLock.value],
  () => {
    syncMapBearingTarget()
    applyHeadingDragLock()
  },
)

watch(nextGuide, (text, prev) => {
  if (!navigating.value || !text || text === prev) return
  // 开始导航 / 重规划里已主动播报的句子会靠 dedupe 跳过
  speakNav(text)
})

watch(navigating, (value) => {
  emit('navigating-change', Boolean(value))
  nextTick(() => {
    syncOverlayClearance()
    refreshMapSize()
  })
})

defineExpose({
  applyHistoryItem,
})

watch(
  () => props.active,
  (visible) => {
    if (!visible || !mapReady.value) return
    requestAnimationFrame(() => {
      syncOverlayClearance()
      refreshMapSize()
    })
  },
)

watch(offRoute, (over, prev) => {
  if (!navigating.value || !over || prev || rerouting.value) return
  speakNav('已偏离规划路线', { interrupt: false })
})

onMounted(() => {
  bindPageLifecycle()
  unsubBasemap = onBasemapChange((id) => {
    applyBasemapToMap(id)
  })
  unsubUiTheme = onUiThemeChange((theme) => {
    applyMapThemeStyle(theme)
  })
  unsubAutoViewLock = onAutoViewLockChange((enabled) => {
    onAutoViewLockPrefChange(enabled)
  })
  unsubNavPrefs = onNavPrefsChange((next) => {
    applyNavPrefs(next)
  })
  initMap()
  requestAnimationFrame(() => bindOverlayObservers())
})

onUnmounted(() => {
  unsubBasemap?.()
  unsubBasemap = null
  unsubUiTheme?.()
  unsubUiTheme = null
  unsubAutoViewLock?.()
  unsubAutoViewLock = null
  unsubNavPrefs?.()
  unsubNavPrefs = null
  unbindPageLifecycle()
  // 保留 sessionStorage 快照，供刷新 / 被杀后「继续导航」
  stopNavigation({ keepSession: true })
  clearLocationResumeTimer()
  overlayObserver?.disconnect?.()
  overlayObserver = null
  if (followPanRaf) {
    cancelAnimationFrame(followPanRaf)
    followPanRaf = 0
  }
  if (bearingRaf) {
    cancelAnimationFrame(bearingRaf)
    bearingRaf = 0
  }
  if (resizeDebounceTimer) {
    window.clearTimeout(resizeDebounceTimer)
    resizeDebounceTimer = 0
  }
  if (settleTimer) {
    window.clearTimeout(settleTimer)
    settleTimer = 0
  }
  settleTimers.forEach((id) => window.clearTimeout(id))
  settleTimers = []
  try {
    window.visualViewport?.removeEventListener('resize', onMapContainerResize)
  } catch {
    // ignore
  }
  try {
    map?.dragPan?.enable?.()
    map?.off?.('dragstart', onMapDragStart)
    map?.off?.('dragend', onMapDragEnd)
    map?.off?.('rotate', syncBeaconHeading)
    map?.off?.('pitch', syncBeaconHeading)
    map?.off?.('pitchend', syncPitch3DFromMap)
  } catch {
    // ignore
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  clearDestMarker()
  clearAllRouteLines()
  beacon?.destroy()
  beacon = null
  try {
    map?.remove?.()
  } catch {
    // ignore
  }
  map = null
  pinnedCamera = null
  walkHeadingBehavior.reset('unmount')
  walkHeadingActive.value = false
})
</script>

<template>
  <div ref="stageEl" class="stage" :style="overlayStyle">
    <div v-if="showWeChatGate" class="browser-gate" role="dialog" aria-modal="true">
      <div class="browser-gate__card">
        <p class="browser-gate__kicker">微信内置浏览器</p>
        <h2>无法在此打开本页</h2>
        <p>
          当前不是可在微信内使用的正式 HTTPS 环境。
          请点右上角 <strong>···</strong> → <strong>在浏览器中打开</strong>。
        </p>
        <p class="browser-gate__url">{{ httpsUrl }}</p>
        <button class="browser-gate__btn" type="button" @click="copyOpenUrl">复制链接</button>
        <p class="browser-gate__hint">推荐：系统浏览器 / Chrome / Safari / 百度浏览器</p>
      </div>
    </div>

    <div class="map-shell">
      <header ref="mastEl" class="mast">
        <div class="mast__row">
          <div class="mast__copy">
            <div class="mast__title">
              <h1>现场定位</h1>
              <button
                class="mast__log"
                type="button"
                :class="{ 'is-on': debugConsoleOpen }"
                @click="toggleDebugConsole"
              >
                {{ debugConsoleOpen ? '收起' : '日志' }}
              </button>
            </div>
          </div>
          <div class="mast__heading" aria-label="设备朝向">
            <span
              class="mast__needle"
              :class="{ 'is-live': headingAvailable }"
              :style="{ transform: `rotate(${compassRotate}deg)` }"
            />
            <small>{{ headingAvailable ? headingText : '无朝向' }}</small>
          </div>
        </div>
        <form class="search" @submit.prevent="onSearch">
          <input
            v-model="keyword"
            class="search__input"
            type="search"
            enterkeyhint="search"
            placeholder="搜索地址或地点"
            :disabled="!mapReady || navigating"
          />
          <button class="search__btn" type="submit" :disabled="!mapReady || searching || navigating">
            {{ searching ? '搜索中' : '搜索' }}
          </button>
        </form>
        <div v-if="showSearchPanel" class="search-panel">
          <div class="search-panel__bar">
            <span>{{ searchError ? '搜索提示' : `找到 ${places.length} 条结果` }}</span>
            <button class="search-panel__close" type="button" @click="closeSearchPanel">关闭</button>
          </div>
          <p v-if="searchError" class="search-panel__error">{{ searchError }}</p>
          <button
            v-for="(place, index) in places"
            :key="`${place.name}-${index}`"
            class="search-item"
            type="button"
            @click.stop="selectPlace(place)"
          >
            <strong>{{ place.name }}</strong>
            <span>{{ place.suggest ? '相关搜索' : place.address || `${place.lng.toFixed(4)}, ${place.lat.toFixed(4)}` }}</span>
          </button>
        </div>
      </header>

      <div
        v-if="pendingResume && !navigating"
        class="resume-banner"
        role="status"
      >
        <div class="resume-banner__body">
          <strong>继续导航？</strong>
          <span>
            检测到未完成的导航：前往 {{ pendingResume.destination?.name || '目的地' }}
            <template v-if="pendingResume.remainingMeters != null">
              · 剩余约 {{ formatDistance(pendingResume.remainingMeters) }}
            </template>
          </span>
        </div>
        <div class="resume-banner__actions">
          <button class="resume-banner__btn resume-banner__btn--ghost" type="button" @click="discardResumeSession">
            放弃
          </button>
          <button class="resume-banner__btn" type="button" @click="confirmResumeSession">
            继续导航
          </button>
        </div>
      </div>

      <div
        v-if="navigating && (offRoute || rerouting)"
        class="offroute-banner"
        role="alert"
      >
        <div class="offroute-banner__body">
          <strong>{{ rerouting ? '偏航重规划' : '已偏航' }}</strong>
          <span>{{ offRouteBannerText }}</span>
        </div>
        <button
          class="offroute-banner__btn"
          type="button"
          :disabled="rerouting"
          @click="onRerouteClick"
        >
          {{ rerouting ? '规划中…' : '重新规划' }}
        </button>
      </div>

      <div class="map-camera">
        <div ref="mapEl" class="map" />
      </div>
      <div
        v-if="mapReady"
        class="map-speed"
        :class="{ 'is-over': isSpeeding, 'is-idle': speedKmh == null }"
        role="status"
        :aria-label="
          speedKmh == null
            ? '测速暂无数据'
            : isSpeeding
              ? `超速 ${speedDisplay} 公里每小时`
              : `当前速度 ${speedDisplay} 公里每小时`
        "
        :title="`限速 ${speedLimitKmh} km/h`"
      >
        <strong class="map-speed__value">{{ speedDisplay }}</strong>
        <span class="map-speed__unit">km/h</span>
        <span v-if="isSpeeding" class="map-speed__tag">超速</span>
      </div>
      <div
        v-if="mapReady && navigating"
        class="nav-progress"
        role="progressbar"
        :aria-valuenow="navRemainPercent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`剩余路程 ${navRemainPercent}%`"
      >
        <div class="nav-progress__rail">
          <div
            class="nav-progress__bar"
            :style="{ height: `${navRemainPercent}%` }"
          />
        </div>
      </div>
      <div
        v-if="mapReady && !navigating"
        class="map-travel"
        role="group"
        aria-label="出行方式"
      >
        <button
          v-for="item in TRAVEL_MODES"
          :key="item.id"
          class="map-travel__btn"
          type="button"
          :class="{ 'is-active': travelMode === item.id }"
          :disabled="routing"
          @click="setTravelMode(item.id)"
        >
          {{ item.label }}
        </button>
      </div>
      <div v-if="mapReady" class="map-fabs">
        <button
          v-if="navigating || routesReady"
          class="map-fab map-voice"
          type="button"
          :class="{ 'is-muted': voiceMuted }"
          :aria-label="voiceMuted ? '开启语音播报' : '关闭语音播报'"
          :title="voiceMuted ? '开启语音' : '静音'"
          @click="toggleVoiceMute"
        >
          <span class="map-voice__label">{{ voiceMuted ? '静音' : '语音' }}</span>
        </button>
        <button
          class="map-fab map-heading-test"
          type="button"
          :class="{ 'is-active': headingTestLock }"
          :aria-label="headingTestLock ? '关闭朝向锁定' : '开启朝向锁定'"
          :title="headingTestLock ? '关闭朝向锁定' : '朝向锁定'"
          @click="testRotateByHeading"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3.2v3.2M12 17.6v3.2M3.2 12h3.2M17.6 12h3.2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M12 7.2 L15.6 16.2 L12 14.2 L8.4 16.2 Z"
              fill="currentColor"
            />
          </svg>
        </button>
        <button
          class="map-fab map-pitch3d"
          type="button"
          :class="{ 'is-active': pitch3D }"
          :aria-label="pitch3D ? '切换到 2D 平面' : '切换到 3D 视角'"
          :title="pitch3D ? '2D' : '3D'"
          @click="togglePitch3D"
        >
          <span class="map-pitch3d__label">{{ pitch3D ? '2D' : '3D' }}</span>
        </button>
        <button
          class="map-fab map-locate"
          type="button"
          :class="{ 'is-busy': loading, 'is-live': lng != null && !loading }"
          :disabled="loading"
          :aria-label="navigating ? '导航回中' : loading ? '定位中' : '回到当前位置'"
          :title="navigating ? '回到导航中心' : '重新定位'"
          @click="locateOnce(false)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.1" fill="currentColor" />
            <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path
              d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div v-if="!mapReady && !mapError" class="veil">
        <span class="veil__spin" />
        <p>正在装载底图</p>
      </div>

      <div v-if="mapError" class="veil">
        <p>{{ mapError }}</p>
      </div>
    </div>

    <section
      v-show="!showSearchPanel"
      ref="hudEl"
      class="hud"
      aria-live="polite"
    >
      <p v-if="statusText" class="hud__status">
        <span class="hud__dot" :class="{ 'is-live': watching || (lng != null && !loading) }" />
        {{ statusText }}
      </p>
      <h2>{{ hudTitle }}</h2>
      <p class="hud__coord">
        {{ coordText }}
      </p>
      <p v-if="destination?.address" class="hud__meta">{{ destination.address }}</p>
      <p v-if="routeSummary" class="hud__meta">{{ routeSummary }}</p>
      <p v-if="navigating && nextGuide" class="hud__guide">{{ nextGuide }}</p>
      <p v-if="searchError && destination" class="hud__warn">{{ searchError }}</p>

      <div class="hud__actions">
        <template v-if="!navigating && destination && !routesReady">
          <button
            class="relocate relocate--primary relocate--half"
            type="button"
            :disabled="routing"
            @click.stop="onNavigateClick"
          >
            {{ routing ? '规划中…' : '导航' }}
          </button>
          <button
            class="relocate relocate--half"
            type="button"
            :disabled="routing"
            @click.stop="onRouteClick"
          >
            {{ routing ? '规划中…' : '路线' }}
          </button>
        </template>

        <div
          v-if="!navigating && routesReady && travelMode === 'drive'"
          class="mode-switch mode-switch--styles"
        >
          <button
            v-for="item in DRIVE_STYLES"
            :key="item.id"
            class="mode-switch__btn"
            type="button"
            :class="{ 'is-active': driveStyle === item.id }"
            :disabled="routing || !routePlans[item.id]"
            @click="chooseDriveStyle(item.id)"
          >
            <span>{{ item.label }}</span>
            <small v-if="routePlans[item.id]">{{ formatDistance(routePlans[item.id].distanceMeters) }}</small>
          </button>
        </div>

        <button
          v-if="!navigating && routesReady"
          class="relocate relocate--primary"
          type="button"
          :disabled="routing || !routeInfo"
          @click="onStartNavClick"
        >
          {{ travelMode === 'walk' ? '开始步行导航' : '开始驾车导航' }}
        </button>
        <button v-if="navigating" class="relocate relocate--danger" type="button" @click="stopNavigation">
          结束导航
        </button>
        <button v-if="destination && !navigating" class="relocate" type="button" @click="clearDestination">
          清除目的地
        </button>
      </div>

      <p v-if="!navigating && !destination" class="hud__meta">{{ client.schemeLabel }}</p>

      <p v-if="showWeChatGate" class="hud__warn">
        微信无法使用本机开发地址。请点右上角「···」→「在浏览器中打开」。
      </p>
      <p v-else-if="!secureOk" class="hud__warn">
        {{ browserHint?.detail || `请用 HTTPS 打开 ${httpsUrl}` }}
      </p>
    </section>

    <DevConsole />
  </div>
</template>
