import {
  computed,
  ref,
} from 'vue'
import {
  getBehaviorPolicy,
  onBehaviorPolicyChange,
} from '../../config'
import {
  formatDistance,
  formatDuration,
} from '../../lib/geo'
import {
  driveStyleLabel,
  travelModeLabel,
} from '../../lib/route'
import { debugConsoleOpen } from '../../lib/debugLog'
import {
  t,
  locale,
} from '../../i18n'

/**
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function installNavMapUi(ctx) {
  const {
    address,
    arrived,
    clipboardOffer,
    destination,
    deviceHeading,
    error,
    followUser,
    headingAvailable,
    lat,
    lng,
    loading,
    locatingHint,
    navigating,
    offRoute,
    offRouteDistanceMeters,
    pendingResume,
    places,
    remainingMeters,
    remainingSeconds,
    rerouting,
    routeInfo,
    routing,
    searchError,
    speed,
    travelMode,
    watching,
  } = ctx

ctx.toggleDebugConsole = function toggleDebugConsole() {
  debugConsoleOpen.value = !debugConsoleOpen.value
}

ctx.travelModeBtnLabel = function travelModeBtnLabel(id) {
  locale.value
  return id === 'walk' ? t('map.walk') : t('map.drive')
}

ctx.driveStyleBtnLabel = function driveStyleBtnLabel(id) {
  locale.value
  return String(id) === '1' ? t('map.shortest') : t('map.fastest')
}

ctx.headingText = computed(() => {
  locale.value
  if (!headingAvailable.value || deviceHeading.value == null) return '—'
  const deg = deviceHeading.value
  const idx = Math.round(deg / 45) % 8
  const labels = [
    t('cardinal.n'),
    t('cardinal.ne'),
    t('cardinal.e'),
    t('cardinal.se'),
    t('cardinal.s'),
    t('cardinal.sw'),
    t('cardinal.w'),
    t('cardinal.nw'),
  ]
  return `${labels[idx]} ${deg.toFixed(0)}°`
})

ctx.coordText = computed(() => {
  locale.value
  if (lng.value == null || lat.value == null) return t('map.waitingLocate')
  return `${lng.value.toFixed(6)}, ${lat.value.toFixed(6)}`
})

/** GPS speed 为 m/s → km/h；策略热更新时同步刷新 */
ctx.policyTick = ref(0)

onBehaviorPolicyChange(() => {
  ctx.policyTick.value += 1
})

ctx.speedKmh = computed(() => {
  ctx.policyTick.value
  const mps = Number(speed.value)
  if (!Number.isFinite(mps) || mps < 0) return null
  const kmh = mps * 3.6
  const idle = getBehaviorPolicy().speedIdleKmh
  if (kmh < idle) return 0
  return kmh
})

ctx.speedLimitKmh = computed(() => {
  ctx.policyTick.value
  return getBehaviorPolicy().speedLimitKmh
})

ctx.isSpeeding = computed(() => {
  const v = ctx.speedKmh.value
  if (v == null) return false
  return v > ctx.speedLimitKmh.value
})

ctx.speedDisplay = computed(() => {
  if (ctx.speedKmh.value == null) return '--'
  return String(Math.round(ctx.speedKmh.value))
})

ctx.offRouteBannerText = computed(() => {
  locale.value
  if (rerouting.value) return t('hint.reroutingNow')
  const d = offRouteDistanceMeters.value
  if (Number.isFinite(d) && d > 0) {
    return t('hint.offRouteAbout', { distance: formatDistance(d) })
  }
  return t('hint.offRouteCanReplan')
})

ctx.overlayStyle = computed(() => ({
  '--offroute-clearance':
    (pendingResume.value && !navigating.value) ||
    (clipboardOffer.value && !pendingResume.value && !navigating.value) ||
    (navigating.value && (offRoute.value || rerouting.value))
      ? '64px'
      : '0px',
}))

ctx.lastSpeedingAlertAt = 0

ctx.statusText = computed(() => {
  locale.value
  if (arrived.value) return t('hint.arrivedDest')
  if (rerouting.value) return t('hint.offRouteReplanning')
  if (navigating.value && offRoute.value) return t('hint.offRouteStatus')
  if (navigating.value) {
    const parts = [t('map.navigating')]
    if (remainingMeters.value != null) {
      parts.push(t('hint.remainDist', { distance: formatDistance(remainingMeters.value) }))
    }
    if (remainingSeconds.value != null) parts.push(formatDuration(remainingSeconds.value))
    return parts.join(' · ')
  }
  if (routing.value) return t('hint.planning')
  if (locatingHint.value) return locatingHint.value
  if (error.value) return error.value
  if (watching.value && lng.value != null) {
    if (followUser.value) return t('map.trackingFollow')
    return navigating.value ? t('map.navigating') : t('map.tracking')
  }
  return ''
})

ctx.hudTitle = computed(() => {
  locale.value
  if (arrived.value && destination.value) {
    return t('map.arrived', { name: destination.value.name })
  }
  if (navigating.value && destination.value) {
    return t('map.goingTo', { name: destination.value.name })
  }
  if (destination.value) return destination.value.name
  return address.value || (loading.value ? t('map.addrParsing') : t('map.noAddress'))
})

/** 搜索结果展开时隐藏底部地址卡，避免与顶部结果列表重叠 */
ctx.showSearchPanel = computed(
  () => places.value.length > 0 || Boolean(searchError.value && !destination.value),
)

ctx.routeSummary = computed(() => {
  locale.value
  if (!routeInfo.value) return ''
  const mode = `${travelModeLabel(routeInfo.value.mode || travelMode.value)} · ${
    (routeInfo.value.mode || travelMode.value) === 'walk'
      ? t('map.walkRoute')
      : driveStyleLabel(routeInfo.value.style)
  }`
  // 导航中剩余里程/时间已在顶部 status 展示，此处不再重复
  if (navigating.value) return mode
  const distance = formatDistance(routeInfo.value.distanceMeters)
  const duration = formatDuration(routeInfo.value.durationSeconds)
  return [mode, distance, duration].filter(Boolean).join(' · ')
})

/** 剩余路程占比 0~1（越接近目的地越小，蓝条越短） */
ctx.navRemainRatio = computed(() => {
  if (!navigating.value) return 0
  const total = Number(routeInfo.value?.distanceMeters) || 0
  const remain = Number(remainingMeters.value)
  if (!(total > 0) || !Number.isFinite(remain)) return 1
  return Math.min(1, Math.max(0, Math.max(0, remain) / total))
})

ctx.navRemainPercent = computed(() => Math.round(ctx.navRemainRatio.value * 100))

ctx.estimateRemainingSeconds = function estimateRemainingSeconds(meters) {
  const plan = routeInfo.value
  const totalM = Number(plan?.distanceMeters) || 0
  const totalS = Number(plan?.durationSeconds) || 0
  if (totalM > 1 && totalS > 0) return Math.max(0, (meters / totalM) * totalS)
  return Math.max(0, meters / 10)
}

ctx.compassRotate = ref(0)
}

/** @see installNavMapUi */
export const useNavMapUi = installNavMapUi
