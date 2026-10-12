import {
  nextTick,
  onMounted,
  onUnmounted,
  watch,
} from 'vue'
import {
  LOCATED_ZOOM,
  TIANDITU_TK,
  getBehaviorPolicy,
} from '../../config'
import { onBasemapChange } from '../../lib/basemap'
import { onUiThemeChange } from '../../lib/uiTheme'
import {
  getAutoViewLock,
  onAutoViewLockChange,
} from '../../lib/viewLock'
import {
  onNavPrefsChange,
  setVoiceEnabled,
} from '../../lib/navPrefs'
import {
  getNavVoiceSupportHint,
  onNavVoicePageHidden,
  onNavVoicePageVisible,
  speakNav,
  speakNavOverview,
  stopNavVoice,
  toggleNavVoiceMuted,
  unlockNavVoice,
} from '../../lib/navVoice'
import {
  buildNavSessionSnapshot,
  clearNavSession,
  loadNavSession,
  saveNavSession,
} from '../../lib/navSession'
import { pushNavHistory } from '../../lib/navHistory'
import {
  formatDistance,
  formatDuration,
  haversineMeters,
} from '../../lib/geo'
import { unwrapHeading } from '../../lib/heading'
import { planByTravelMode } from '../../lib/route'
import {
  snapToRoute,
  coordsToPath,
} from '../../lib/routeSnap'
import { t } from '../../i18n'

/**
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function installNavSessionFlow(ctx) {
  const {
    address,
    arrived,
    clipboardOffer,
    compassRotate,
    destination,
    deviceHeading,
    driveStyle,
    followUser,
    headingAvailable,
    headingTestLock,
    hudTitle,
    isSpeeding,
    keyword,
    lat,
    lng,
    locate,
    locatingHint,
    mapReady,
    navigating,
    nextGuide,
    offRoute,
    offRouteDistanceMeters,
    pendingResume,
    places,
    rebindHeading,
    remainingMeters,
    remainingSeconds,
    rerouting,
    restartWatch,
    routeInfo,
    routePlans,
    routePreviewLock,
    routesReady,
    routing,
    searchError,
    showSearchPanel,
    speed,
    speedDisplay,
    speedLimitKmh,
    startHeading,
    statusText,
    travelMode,
    voiceMuted,
    walkHeadingActive,
    watchLocation,
  } = ctx

watch(isSpeeding, (over) => {
  if (!over) return
  const now = Date.now()
  if (now - ctx.lastSpeedingAlertAt < 8000) return
  ctx.lastSpeedingAlertAt = now
  locatingHint.value = t('hint.speeding', {
    speed: speedDisplay.value,
    limit: speedLimitKmh.value,
  })
  window.setTimeout(() => {
    locatingHint.value = ''
  }, 2800)
  try {
    navigator.vibrate?.(120)
  } catch {
    // ignore
  }
})

ctx.beginNavHistoryMeta = function beginNavHistoryMeta() {
  if (!destination.value || !routeInfo.value) {
    ctx.activeNavMeta = null
    return
  }
  ctx.activeNavMeta = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    startedAt: Date.now(),
    destination: {
      name: destination.value.name || t('map.destination'),
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

ctx.commitNavHistory = function commitNavHistory(opts = {}) {
  if (!ctx.activeNavMeta || opts.keepSession) {
    if (!opts.keepSession) ctx.activeNavMeta = null
    return
  }
  const record = {
    ...activeNavMeta,
    endedAt: Date.now(),
    arrived: Boolean(opts.announceArrive),
    distanceMeters: Number(routeInfo.value?.distanceMeters) || ctx.activeNavMeta.distanceMeters,
    durationSeconds: Number(routeInfo.value?.durationSeconds) || ctx.activeNavMeta.durationSeconds,
    travelMode: travelMode.value === 'walk' ? 'walk' : ctx.activeNavMeta.travelMode,
    driveStyle: String(driveStyle.value || ctx.activeNavMeta.driveStyle),
  }
  pushNavHistory(record)
  ctx.activeNavMeta = null
}

ctx.applyHistoryItem = async function applyHistoryItem(item) {
  if (!item?.destination) return
  keyword.value = item.destination.name || ''
  if (item.travelMode === 'walk' || item.travelMode === 'drive') {
    travelMode.value = item.travelMode
  }
  if (item.driveStyle) driveStyle.value = String(item.driveStyle)
  await ctx.selectPlace({
    name: item.destination.name,
    lng: item.destination.lng,
    lat: item.destination.lat,
    address: item.destination.address || '',
  })
}

ctx.startNavigation = async function startNavigation() {
  if (!destination.value || !routesReady.value) return
  ctx.clearLocationResumeTimer()
  ctx.walkHeadingBehavior.reset('navigating')
  walkHeadingActive.value = false
  routePreviewLock.value = false
  // 导航默认开关见行为策略；视角跟随受「自动视角锁定」约束
  const policy = getBehaviorPolicy()
  followUser.value = getAutoViewLock() && policy.followUserOnNavStart
  headingTestLock.value = policy.headingLockOnNavStart
  ctx.clearSettleTimers()
  ctx.pinUntil = 0
  if (ctx.bearingRaf) {
    cancelAnimationFrame(ctx.bearingRaf)
    ctx.bearingRaf = 0
  }
  if (lng.value == null) {
    const pos = await locate()
    ctx.applyPositionToMap(pos, LOCATED_ZOOM)
  }
  if (!routeInfo.value) await ctx.prepareDualRoutes()
  if (!routeInfo.value) return
  await startHeading(true)
  navigating.value = true
  clipboardOffer.value = null
  arrived.value = false
  offRoute.value = false
  offRouteDistanceMeters.value = null
  ctx.arriveHits = 0
  ctx.lastDrawnRemainMeters = null
  ctx.offRouteMonitor.start()
  ctx.clearIdleRouteLines()
  const courseDeg = ctx.resolveCourseDeg()
  if (courseDeg != null) ctx.lastGoodBearing = courseDeg
  ctx.applyNavCamera({ lng: lng.value, lat: lat.value }, { snapBearing: true })
  locatingHint.value = t('hint.navFollow')
  window.setTimeout(() => {
    locatingHint.value = ''
  }, 1800)

  const hint = getNavVoiceSupportHint()
  if (hint) locatingHint.value = hint

  const modeLabel = travelMode.value === 'walk' ? t('voice.walkNav') : t('voice.driveNav')
  speakNavOverview({
    modeLabel,
    distanceText: formatDistance(routeInfo.value.distanceMeters),
    durationText: formatDuration(routeInfo.value.durationSeconds),
  })
  if (nextGuide.value) {
    speakNav(nextGuide.value, { interrupt: false, dedupeMs: 0 })
  }

  ctx.persistNavSession(true)
  pendingResume.value = null
  ctx.beginNavHistoryMeta()

  try {
    await watchLocation(ctx.onLocationTick)
  } catch (err) {
    navigating.value = false
    clearNavSession()
    ctx.activeNavMeta = null
    stopNavVoice()
    locatingHint.value = err?.message || t('hint.navCancelLocate')
  }
}

/** 按钮点击同步解锁语音，再进入异步导航流程 */
ctx.onStartNavClick = function onStartNavClick() {
  unlockNavVoice({ primingText: t('voice.unlockStart') })
  void ctx.startNavigation()
}

ctx.collectNavSessionState = function collectNavSessionState() {
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

ctx.persistNavSession = function persistNavSession(force = false) {
  if (!navigating.value || !destination.value || !routeInfo.value?.path?.length) return
  const policy = getBehaviorPolicy()
  const throttleMs = Number(policy.navSessionPersistThrottleMs) || 15000
  const minMeters = Number(policy.navSessionPersistMinMeters) || 50
  const now = Date.now()
  const remain = remainingMeters.value
  if (!force) {
    const elapsedOk = now - ctx.lastSessionSaveAt >= throttleMs
    const movedOk =
      ctx.lastSessionSaveRemainMeters == null ||
      (Number.isFinite(remain) &&
        Math.abs(Number(remain) - Number(ctx.lastSessionSaveRemainMeters)) >= minMeters)
    if (!elapsedOk && !movedOk) return
  }
  const snap = buildNavSessionSnapshot(ctx.collectNavSessionState())
  if (!snap) return
  if (saveNavSession(snap)) {
    ctx.lastSessionSaveAt = now
    ctx.lastSessionSaveRemainMeters = remain
  }
}

ctx.rebindNavRuntime = async function rebindNavRuntime({ hint = true } = {}) {
  try {
    await restartWatch(ctx.onLocationTick)
  } catch (err) {
    locatingHint.value = err?.message || t('hint.resumeLocateFail')
    return false
  }
  rebindHeading()
  try {
    await startHeading(true)
  } catch {
    // ignore
  }
  if (lng.value != null && lat.value != null) {
    ctx.applyNavCamera({ lng: lng.value, lat: lat.value })
  }
  ctx.refreshMapSize()
  onNavVoicePageVisible({
    hiddenMs: ctx.pageHiddenAt ? Date.now() - ctx.pageHiddenAt : 0,
  })
  if (hint) {
    locatingHint.value = t('hint.locateRestored')
    window.setTimeout(() => {
      locatingHint.value = ''
    }, 1500)
  }
  return true
}

ctx.onPageVisibilityChange = function onPageVisibilityChange() {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') {
    ctx.pageHiddenAt = Date.now()
    onNavVoicePageHidden()
    ctx.stopClipboardWatch()
    return
  }
  if (document.visibilityState !== 'visible') return
  onNavVoicePageVisible({
    hiddenMs: ctx.pageHiddenAt ? Date.now() - ctx.pageHiddenAt : 0,
  })
  if (navigating.value) {
    void ctx.rebindNavRuntime({ hint: true })
  }
  ctx.pageHiddenAt = 0
  void ctx.checkClipboardForAddress({ reason: 'visible' })
  ctx.startClipboardWatch()
}

ctx.onPageShow = function onPageShow(event) {
  if (event?.persisted && navigating.value) {
    void ctx.rebindNavRuntime({ hint: true })
  }
  void ctx.checkClipboardForAddress({ reason: 'pageshow' })
}

ctx.onWindowFocus = function onWindowFocus() {
  void ctx.checkClipboardForAddress({ reason: 'focus' })
}

ctx.bindPageLifecycle = function bindPageLifecycle() {
  if (ctx.visibilityBound || typeof window === 'undefined') return
  ctx.visibilityBound = true
  document.addEventListener('visibilitychange', ctx.onPageVisibilityChange)
  window.addEventListener('pageshow', ctx.onPageShow)
  window.addEventListener('focus', ctx.onWindowFocus)
}

ctx.unbindPageLifecycle = function unbindPageLifecycle() {
  if (!ctx.visibilityBound || typeof window === 'undefined') return
  ctx.visibilityBound = false
  document.removeEventListener('visibilitychange', ctx.onPageVisibilityChange)
  window.removeEventListener('pageshow', ctx.onPageShow)
  window.removeEventListener('focus', ctx.onWindowFocus)
  ctx.stopClipboardWatch()
  ctx.unbindClipboardGestureHook()
}

ctx.maybeOfferResumeSession = function maybeOfferResumeSession() {
  if (navigating.value || pendingResume.value) return
  const session = loadNavSession()
  if (!session) return
  pendingResume.value = session
}

ctx.discardResumeSession = function discardResumeSession() {
  clearNavSession()
  pendingResume.value = null
  locatingHint.value = t('hint.resumeDiscarded')
  window.setTimeout(() => {
    locatingHint.value = ''
  }, 1600)
}

ctx.confirmResumeSession = async function confirmResumeSession() {
  const session = pendingResume.value
  if (!session) return
  unlockNavVoice({ primingText: t('voice.unlockContinue') })
  pendingResume.value = null

  const path = coordsToPath(session.route?.path || [])
  if (path.length < 2) {
    clearNavSession()
    locatingHint.value = t('hint.sessionInvalid')
    return
  }

  destination.value = {
    name: session.destination.name || t('map.destination'),
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
  ctx.arriveHits = 0
  ctx.lastDrawnRemainMeters = null

  ctx.setDestMarker(destination.value)
  ctx.clearIdleRouteLines()
  ctx.setRouteLine(driveStyle.value, path, true)
  navigating.value = true
  ctx.offRouteMonitor.start()
  ctx.applyHeadingDragLock()
  ctx.persistNavSession(true)
  ctx.beginNavHistoryMeta()

  const ok = await ctx.rebindNavRuntime({ hint: false })
  locatingHint.value = ok ? t('hint.resumeOk') : locatingHint.value || t('hint.resumePartial')
  window.setTimeout(() => {
    locatingHint.value = ''
  }, 1800)
}

ctx.stopNavigation = function stopNavigation(opts = {}) {
  const wasNavigating = navigating.value
  navigating.value = false
  if (wasNavigating) ctx.commitNavHistory(opts)
  if (!opts.keepSession) {
    clearNavSession()
    ctx.lastSessionSaveAt = 0
    ctx.lastSessionSaveRemainMeters = null
  }
  offRoute.value = false
  offRouteDistanceMeters.value = null
  rerouting.value = false
  ctx.lastDrawnRemainMeters = null
  ctx.offRouteMonitor.stop()
  ctx.walkHeadingBehavior.reset('stop-nav')
  walkHeadingActive.value = false
  if (opts.announceArrive) {
    speakNav(t('voice.arrived'), { interrupt: true, dedupeMs: 0 })
  } else {
    stopNavVoice()
  }
  // 结束导航后恢复为策略默认开关（视角跟随仍受自动锁定设置约束）
  const policy = getBehaviorPolicy()
  followUser.value = getAutoViewLock() && policy.followUserOnInit
  headingTestLock.value = policy.headingLockOnInit
  try {
    ctx.map?.dragPan?.enable?.()
    ctx.map?.touchZoomRotate?.enableRotation?.()
  } catch {
    // ignore
  }
  if (routesReady.value && destination.value) {
    routeInfo.value = routePlans.value[driveStyle.value] || routeInfo.value
    if (routeInfo.value) {
      remainingMeters.value = routeInfo.value.distanceMeters
      remainingSeconds.value = routeInfo.value.durationSeconds
    }
    ctx.drawDualRoutes(false)
  }
  ctx.syncMapBearingTarget()
  ctx.applyHeadingDragLock()
}

ctx.onNavUpdate = function onNavUpdate(pos) {
  if (!navigating.value || !destination.value) return

  const current = { lng: pos.lng, lat: pos.lat }
  const dest = { lng: destination.value.lng, lat: destination.value.lat }
  const path = routeInfo.value?.path || [current, dest]
  const policy = getBehaviorPolicy()
  const snap = snapToRoute(current, path, policy.offRouteMeters)

  ctx.applyNavCamera(current)

  if (snap.remaining?.length >= 1) {
    remainingMeters.value =
      snap.remaining.length >= 2
        ? snap.remainingMeters
        : haversineMeters({ lng: snap.lng, lat: snap.lat }, dest)
    remainingSeconds.value = ctx.estimateRemainingSeconds(remainingMeters.value)
    if (snap.remaining.length >= 2) {
      ctx.updateNavRoute(snap.remaining, snap.remainingMeters)
    }
  }

  // 偏航监测（导航中）；步行也提示，自动重规划由策略控制
  const yaw = ctx.offRouteMonitor.evaluate({
    onRoute: snap.onRoute,
    distanceMeters: snap.distanceMeters,
  })
  if (yaw) {
    offRoute.value = yaw.offRoute
    offRouteDistanceMeters.value = yaw.offRoute ? yaw.distanceMeters : null
    if (yaw.shouldReroute && travelMode.value !== 'walk') {
      void ctx.rerouteAfterYaw(current)
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
    ctx.arriveHits += 1
    if (ctx.arriveHits >= 3) {
      arrived.value = true
      remainingMeters.value = 0
      remainingSeconds.value = 0
      ctx.stopNavigation({ announceArrive: true })
    }
  } else {
    ctx.arriveHits = 0
  }

  ctx.persistNavSession(false)
}

ctx.toggleVoiceMute = function toggleVoiceMute() {
  // 开启语音时必须在点击手势内解锁
  if (voiceMuted.value) {
    unlockNavVoice({ primingText: t('voice.unlockOn') })
  }
  const nextMuted = toggleNavVoiceMuted()
  voiceMuted.value = nextMuted
  setVoiceEnabled(!nextMuted)
  locatingHint.value = voiceMuted.value ? t('hint.voiceOff') : t('hint.voiceOn')
  window.setTimeout(() => {
    locatingHint.value = ''
  }, 1600)
}

ctx.applyNavPrefs = function applyNavPrefs(next) {
  voiceMuted.value = !next.voiceEnabled
  if (navigating.value || routesReady.value || routing.value) return
  travelMode.value = next.travelMode
  driveStyle.value = next.travelMode === 'walk' ? 'walk' : next.driveStyle
}

ctx.onRerouteClick = async function onRerouteClick() {
  if (!navigating.value || rerouting.value) return
  unlockNavVoice({ primingText: t('voice.unlockReplan') })
  const current =
    lng.value != null && lat.value != null
      ? { lng: Number(lng.value), lat: Number(lat.value) }
      : null
  if (!current || !Number.isFinite(current.lng) || !Number.isFinite(current.lat)) {
    locatingHint.value = t('hint.noLocateReplan')
    return
  }
  await ctx.rerouteAfterYaw(current)
}

ctx.rerouteAfterYaw = async function rerouteAfterYaw(current) {
  if (rerouting.value || !destination.value) return
  rerouting.value = true
  ctx.offRouteMonitor.markRerouteStarted()
  nextGuide.value = t('hint.rerouteGuide')
  speakNav(t('hint.rerouteSpeak'), { interrupt: true, dedupeMs: 0 })
  try {
    // 预留后端：replanHook 返回有效路线则优先使用
    let planned = null
    if (typeof ctx.offRouteMonitor.requestReplan === 'function') {
      const hooked = await ctx.offRouteMonitor.requestReplan({
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
    nextGuide.value = planned.guides?.[0]?.text || t('hint.rerouteDone')
    speakNav(nextGuide.value, { interrupt: false, dedupeMs: 0 })
    ctx.lastDrawnRemainMeters = null
    ctx.clearIdleRouteLines()
    ctx.setRouteLine(driveStyle.value, planned.path, true)
    offRoute.value = false
    offRouteDistanceMeters.value = null
    ctx.offRouteMonitor.reset('rerouted')
    ctx.persistNavSession(true)
    if (ctx.activeNavMeta) {
      ctx.activeNavMeta.distanceMeters = Number(planned.distanceMeters) || ctx.activeNavMeta.distanceMeters
      ctx.activeNavMeta.durationSeconds = Number(planned.durationSeconds) || ctx.activeNavMeta.durationSeconds
      ctx.activeNavMeta.driveStyle = String(driveStyle.value || ctx.activeNavMeta.driveStyle)
      ctx.activeNavMeta.travelMode = travelMode.value === 'walk' ? 'walk' : 'drive'
    }
  } catch (err) {
    nextGuide.value = err.message || t('hint.rerouteFail')
    speakNav(nextGuide.value, { interrupt: true, dedupeMs: 0 })
  } finally {
    rerouting.value = false
    ctx.refreshMapSize()
  }
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
      ctx.refreshMapSize()
      ctx.syncOverlayClearance()
    })
  },
)

watch(
  () => [deviceHeading.value, headingAvailable.value],
  ([deg, hasHeading]) => {
    compassRotate.value = unwrapHeading(compassRotate.value, deg ?? 0)
    ctx.syncBeaconHeading()
    if (!hasHeading) return
    ctx.syncMapBearingTarget()
  },
)

watch(
  () => [navigating.value, followUser.value, headingTestLock.value],
  () => {
    ctx.syncMapBearingTarget()
    ctx.applyHeadingDragLock()
  },
)

watch(nextGuide, (text, prev) => {
  if (!navigating.value || !text || text === prev) return
  // 开始导航 / 重规划里已主动播报的句子会靠 dedupe 跳过
  speakNav(text)
})

watch(navigating, (value) => {
  ctx.emit('navigating-change', Boolean(value))
  nextTick(() => {
    ctx.syncOverlayClearance()
    ctx.refreshMapSize()
  })
})

watch(
  () => ctx.props.active,
  (visible) => {
    if (!visible) {
      ctx.stopClipboardWatch()
      return
    }
    if (mapReady.value) {
      requestAnimationFrame(() => {
        ctx.syncOverlayClearance()
        ctx.refreshMapSize()
      })
    }
    void ctx.checkClipboardForAddress({ reason: 'visible' })
    ctx.startClipboardWatch()
  },
)

watch(offRoute, (over, prev) => {
  if (!navigating.value || !over || prev || rerouting.value) return
  speakNav(t('voice.offRoute'), { interrupt: false })
})

onMounted(() => {
  ctx.bindPageLifecycle()
  ctx.unsubBasemap = onBasemapChange((id) => {
    ctx.applyBasemapToMap(id)
  })
  ctx.unsubUiTheme = onUiThemeChange((theme) => {
    ctx.applyMapThemeStyle(theme)
  })
  ctx.unsubAutoViewLock = onAutoViewLockChange((enabled) => {
    ctx.onAutoViewLockPrefChange(enabled)
  })
  ctx.unsubNavPrefs = onNavPrefsChange((next) => {
    ctx.applyNavPrefs(next)
  })
  ctx.initMap()
  requestAnimationFrame(() => ctx.bindOverlayObservers())
  void ctx.checkClipboardForAddress({ reason: 'visible' })
  ctx.startClipboardWatch()
})

onUnmounted(() => {
  ctx.unsubBasemap?.()
  ctx.unsubBasemap = null
  ctx.unsubUiTheme?.()
  ctx.unsubUiTheme = null
  ctx.unsubAutoViewLock?.()
  ctx.unsubAutoViewLock = null
  ctx.unsubNavPrefs?.()
  ctx.unsubNavPrefs = null
  ctx.unbindPageLifecycle()
  // 保留 sessionStorage 快照，供刷新 / 被杀后「继续导航」
  ctx.stopNavigation({ keepSession: true })
  ctx.clearLocationResumeTimer()
  ctx.overlayObserver?.disconnect?.()
  ctx.overlayObserver = null
  if (ctx.followPanRaf) {
    cancelAnimationFrame(ctx.followPanRaf)
    ctx.followPanRaf = 0
  }
  if (ctx.bearingRaf) {
    cancelAnimationFrame(ctx.bearingRaf)
    ctx.bearingRaf = 0
  }
  if (ctx.resizeDebounceTimer) {
    window.clearTimeout(ctx.resizeDebounceTimer)
    ctx.resizeDebounceTimer = 0
  }
  if (ctx.settleTimer) {
    window.clearTimeout(ctx.settleTimer)
    ctx.settleTimer = 0
  }
  ctx.settleTimers.forEach((id) => window.clearTimeout(id))
  ctx.settleTimers = []
  try {
    window.visualViewport?.removeEventListener('resize', ctx.onMapContainerResize)
  } catch {
    // ignore
  }
  try {
    ctx.map?.dragPan?.enable?.()
    ctx.map?.off?.('dragstart', ctx.onMapDragStart)
    ctx.map?.off?.('dragend', ctx.onMapDragEnd)
    ctx.map?.off?.('rotate', ctx.syncBeaconHeading)
    ctx.map?.off?.('pitch', ctx.syncBeaconHeading)
    ctx.map?.off?.('pitchend', ctx.syncPitch3DFromMap)
  } catch {
    // ignore
  }
  ctx.resizeObserver?.disconnect()
  ctx.resizeObserver = null
  ctx.clearDestMarker()
  ctx.clearAllRouteLines()
  ctx.beacon?.destroy()
  ctx.beacon = null
  try {
    ctx.map?.remove?.()
  } catch {
    // ignore
  }
  ctx.map = null
  ctx.pinnedCamera = null
  ctx.walkHeadingBehavior.reset('unmount')
  walkHeadingActive.value = false
})
}

/** @see installNavSessionFlow */
export const useNavSessionFlow = installNavSessionFlow
