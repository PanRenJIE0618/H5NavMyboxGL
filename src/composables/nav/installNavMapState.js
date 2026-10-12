import { ref } from 'vue'
import { useDeviceHeading } from '../useDeviceHeading'
import { useGeolocation } from '../useGeolocation'
import { getBehaviorPolicy } from '../../config'
import { getAutoViewLock } from '../../lib/viewLock'
import {
  getDefaultDriveStyle,
  getDefaultTravelMode,
  getVoiceEnabled,
} from '../../lib/navPrefs'
import { createDeviceWalkBehavior } from '../../lib/deviceWalkBehavior'
import { createOffRouteMonitor } from '../../lib/offRouteMonitor'
import {
  canUseBrowserGeolocation,
  getBrowserOpenHint,
  getHttpsUrl,
  isWeChatBrowser,
} from '../../lib/secureContext'
import { t } from '../../i18n'

/**
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function installNavMapState(ctx) {
ctx.mapEl = ref(null)

ctx.stageEl = ref(null)

ctx.mastEl = ref(null)

ctx.hudEl = ref(null)

ctx.mapReady = ref(false)

ctx.mapError = ref('')

ctx.address = ref('')

ctx.locatingHint = ref('')

ctx.keyword = ref('')

ctx.searching = ref(false)

ctx.searchError = ref('')

ctx.places = ref([])

ctx.destination = ref(null)

ctx.travelMode = ref(getDefaultTravelMode())

ctx.driveStyle = ref(getDefaultTravelMode() === 'walk' ? 'walk' : getDefaultDriveStyle())

ctx.routeInfo = ref(null)

ctx.routePlans = ref({})

ctx.routesReady = ref(false)

ctx.routing = ref(false)

ctx.navigating = ref(false)

/** 选点 / 看路线时锁定相机，避免 GPS 跟随把目的地标和路线拽出视野 */
ctx.routePreviewLock = ref(false)

/** 视角跟随：相机中心始终压在当前位置正上方（与朝向无关）；由「我的 · 自动视角锁定」控制 */
ctx.followUser = ref(getAutoViewLock() && getBehaviorPolicy().followUserOnInit)

ctx.arrived = ref(false)

ctx.remainingMeters = ref(null)

ctx.remainingSeconds = ref(null)

ctx.nextGuide = ref('')

ctx.offRoute = ref(false)

ctx.offRouteDistanceMeters = ref(null)

ctx.rerouting = ref(false)

ctx.voiceMuted = ref(!getVoiceEnabled())

/** 冷启动待确认的导航会话 */
ctx.pendingResume = ref(null)

/** 剪贴板疑似地址提示 */
ctx.clipboardOffer = ref(null)

ctx.activeNavMeta = null

/** 高德风格：选中蓝线 + 白边；备选淡蓝 */
ctx.ROUTE_COLOR_ACTIVE = '#3370FF'

ctx.ROUTE_COLOR_IDLE = '#9BB8FF'

ctx.ROUTE_CASING_COLOR = '#FFFFFF'

ctx.ROUTE_OPACITY_ACTIVE = 1

ctx.ROUTE_OPACITY_IDLE = 0.85

ctx.ROUTE_ARROW_IMAGE_ID = 'route-arrow'

{
  const __tmp = useGeolocation()
  ctx.lng = __tmp.lng
  ctx.lat = __tmp.lat
  ctx.speed = __tmp.speed
  ctx.course = __tmp.course
  ctx.loading = __tmp.loading
  ctx.error = __tmp.error
  ctx.watching = __tmp.watching
  ctx.client = __tmp.client
  ctx.locate = __tmp.locate
  ctx.watchLocation = __tmp.watchLocation
  ctx.restartWatch = __tmp.restartWatch
}

ctx.secureOk = canUseBrowserGeolocation()

ctx.httpsUrl = getHttpsUrl()

ctx.inWeChat = isWeChatBrowser()

ctx.browserHint = getBrowserOpenHint()

// 仅本机/局域网调试时拦截微信；正式 HTTPS 域名允许预览
ctx.showWeChatGate = ctx.inWeChat && !ctx.secureOk

{
  const __tmp = useDeviceHeading()
  ctx.deviceHeading = __tmp.heading
  ctx.headingAvailable = __tmp.available
  ctx.startHeading = __tmp.start
  ctx.rebindHeading = __tmp.rebind
}

/** 地图偏航（朝上导航）；用 Mapbox bearing，不用 CSS 旋转容器 */
ctx.mapBearing = ref(0)

/** 朝向锁定：按设备/行进朝向转相机；默认见行为策略 */
ctx.headingTestLock = ref(getBehaviorPolicy().headingLockOnInit)

/** 3D 倾斜视角（pitch）；默认平面 2D */
ctx.pitch3D = ref(false)

/** 步行自动朝向修正是否生效中 */
ctx.walkHeadingActive = ref(false)

ctx.bearingRaf = 0

ctx.bearingTargetDeg = 0

ctx.headingSamples = []

ctx.walkHeadingBehavior = createDeviceWalkBehavior(() => ({
  ...getBehaviorPolicy().walk,
  onCorrect(deg) {
    ctx.walkHeadingActive.value = true
    ctx.locatingHint.value = t('hint.walkCorrect', { deg: deg.toFixed(0) })
    window.setTimeout(() => {
      ctx.locatingHint.value = ''
    }, 2200)
  },
  onRelease() {
    ctx.walkHeadingActive.value = false
  },
}))

ctx.map = null

ctx.beacon = null

ctx.resizeObserver = null

ctx.overlayObserver = null

ctx.destMarker = null

/** @type {Record<string, { sourceId: string, layerId: string }>} */
ctx.routeLines = {}

ctx.arriveHits = 0

ctx.lastDrawnRemainMeters = null

ctx.lastFollowPanAt = 0

ctx.followPanRaf = 0

ctx.followPanPos = null

/** 最近一次强制居中的相机（resize 后回正用） */
ctx.pinnedCamera = null

ctx.pinUntil = 0

ctx.resizeDebounceTimer = 0

ctx.settleTimer = 0

ctx.settleTimers = []

/** 导航中保留的最近有效朝向，避免慢走时回弹北向上 */
ctx.lastGoodBearing = 0

/** 拖图期间暂停定位回调；停拖后延迟恢复并开启视角锁定 */
ctx.locationTickPaused = false

ctx.locationResumeTimer = 0

ctx.viewLockResumeTimer = 0

/** 会话快照节流 */
ctx.lastSessionSaveAt = 0

ctx.lastSessionSaveRemainMeters = null

ctx.pageHiddenAt = 0

ctx.visibilityBound = false

ctx.unsubBasemap = null

ctx.unsubUiTheme = null

ctx.unsubAutoViewLock = null

ctx.unsubNavPrefs = null

ctx.offRouteMonitor = createOffRouteMonitor(() => getBehaviorPolicy(), {
  // 后续联调：返回后端重规划结果即可替换本地 planByTravelMode
  async replanHook() {
    return null
  },
})
}
