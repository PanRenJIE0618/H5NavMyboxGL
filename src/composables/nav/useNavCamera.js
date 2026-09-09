import {
  NAV_ZOOM,
  TIANDITU_TK,
  getBehaviorPolicy,
} from '../../config'
import { getAutoViewLock } from '../../lib/viewLock'
import { reverseGeocode } from '../../lib/geocode'
import {
  normalizeHeading,
  unwrapHeading,
} from '../../lib/heading'
import { t } from '../../i18n'

/**
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function installNavCamera(ctx) {
  const {
    address,
    course,
    deviceHeading,
    error,
    followUser,
    headingAvailable,
    headingTestLock,
    lat,
    lng,
    locate,
    locatingHint,
    mapBearing,
    navigating,
    pitch3D,
    routePreviewLock,
    speed,
    startHeading,
    travelMode,
    walkHeadingActive,
    watchLocation,
  } = ctx

ctx.pauseLocationTicksByDrag = function pauseLocationTicksByDrag() {
  ctx.locationTickPaused = true
  if (ctx.locationResumeTimer) {
    window.clearTimeout(ctx.locationResumeTimer)
    ctx.locationResumeTimer = 0
  }
  if (ctx.viewLockResumeTimer) {
    window.clearTimeout(ctx.viewLockResumeTimer)
    ctx.viewLockResumeTimer = 0
  }
}

ctx.scheduleResumeAfterDragIdle = function scheduleResumeAfterDragIdle() {
  if (ctx.locationResumeTimer) {
    window.clearTimeout(ctx.locationResumeTimer)
    ctx.locationResumeTimer = 0
  }
  if (ctx.viewLockResumeTimer) {
    window.clearTimeout(ctx.viewLockResumeTimer)
    ctx.viewLockResumeTimer = 0
  }

  const policy = getBehaviorPolicy()
  const resumeMs = policy.locationResumeAfterDragMs
  const lockMs = policy.viewLockAfterDragIdleMs

  ctx.locationResumeTimer = window.setTimeout(() => {
    ctx.locationResumeTimer = 0
    ctx.locationTickPaused = false
  }, resumeMs)

  ctx.viewLockResumeTimer = window.setTimeout(() => {
    ctx.viewLockResumeTimer = 0
    ctx.enableViewLockAfterDragIdle()
  }, lockMs)
}

ctx.enableViewLockAfterDragIdle = function enableViewLockAfterDragIdle() {
  // 选点/看路线预览时不抢相机；导航中或普通浏览则按设置自动视角锁定
  if (routePreviewLock.value && !navigating.value) return

  ctx.locationTickPaused = false
  if (!getAutoViewLock()) {
    ctx.applyHeadingDragLock()
    return
  }

  followUser.value = true
  if (navigating.value) {
    headingTestLock.value = getBehaviorPolicy().headingLockOnNavStart
  }

  if (lng.value == null || lat.value == null) return
  void startHeading(true)
  if (navigating.value) {
    ctx.applyNavCamera({ lng: lng.value, lat: lat.value }, { snapBearing: headingTestLock.value })
  } else {
    ctx.applyPositionToMap(
      { lng: lng.value, lat: lat.value },
      undefined,
      { follow: true, animate: true, forceCenter: true },
    )
  }
  ctx.applyHeadingDragLock()
}

ctx.clearLocationResumeTimer = function clearLocationResumeTimer() {
  if (ctx.locationResumeTimer) {
    window.clearTimeout(ctx.locationResumeTimer)
    ctx.locationResumeTimer = 0
  }
  if (ctx.viewLockResumeTimer) {
    window.clearTimeout(ctx.viewLockResumeTimer)
    ctx.viewLockResumeTimer = 0
  }
  ctx.locationTickPaused = false
}

ctx.clearSettleTimers = function clearSettleTimers() {
  if (ctx.settleTimer) {
    window.clearTimeout(ctx.settleTimer)
    ctx.settleTimer = 0
  }
  ctx.settleTimers.forEach((id) => window.clearTimeout(id))
  ctx.settleTimers = []
}

/**
 * 钉死相机：先 resize，再 jumpTo。
 * 手机端强制居中不用 flyTo，避免动画中途 resize / setBearing 把视角冲偏。
 */
ctx.pinCamera = function pinCamera(pos, zoom, { animate = false } = {}) {
  if (!ctx.map || pos?.lng == null || pos?.lat == null) return
  if (navigating.value) return
  const zRaw = Number(zoom)
  const z = Math.min(Number.isFinite(zRaw) ? zRaw : ctx.resolveMaxZoom(), ctx.resolveMaxZoom())
  const center = [pos.lng, pos.lat]
  const bearing = ctx.map.getBearing?.() ?? mapBearing.value ?? 0
  ctx.pinnedCamera = { lng: pos.lng, lat: pos.lat, zoom: z, bearing }
  ctx.pinUntil = Date.now() + getBehaviorPolicy().pinCameraHoldMs

  ctx.clearSettleTimers()
  ctx.refreshMapSize()
  try {
    ctx.map.stop()
  } catch {
    // ignore
  }

  ctx.map.jumpTo({ center, zoom: z, bearing, pitch: ctx.map.getPitch?.() ?? 0 })
  mapBearing.value = bearing
  ctx.beacon?.draw()
  ctx.scheduleCameraSettle()
}

ctx.scheduleCameraSettle = function scheduleCameraSettle() {
  ctx.clearSettleTimers()
  if (navigating.value) return

  const run = () => {
    if (!ctx.map || !ctx.pinnedCamera || navigating.value) return
    ctx.refreshMapSize()
    const z = ctx.pinnedCamera.zoom
    const center = [ctx.pinnedCamera.lng, ctx.pinnedCamera.lat]
    const bearing = ctx.pinnedCamera.bearing ?? ctx.map.getBearing()
    const zoomGap = Math.abs(ctx.map.getZoom() - z)
    const c = ctx.map.getCenter()
    const centerGap =
      Math.abs(c.lng - ctx.pinnedCamera.lng) + Math.abs(c.lat - ctx.pinnedCamera.lat)
    if (zoomGap > 0.08 || centerGap > 1e-4) {
      try {
        ctx.map.stop()
      } catch {
        // ignore
      }
      ctx.map.jumpTo({ center, zoom: z, bearing, pitch: ctx.map.getPitch?.() ?? 0 })
      mapBearing.value = bearing
    }
    ctx.beacon?.draw()
  }

  requestAnimationFrame(() => {
    run()
    requestAnimationFrame(run)
  })
  ctx.settleTimer = window.setTimeout(run, 280)
  ctx.settleTimers.push(window.setTimeout(run, 600))
}

ctx.onMapContainerResize = function onMapContainerResize() {
  if (ctx.resizeDebounceTimer) window.clearTimeout(ctx.resizeDebounceTimer)
  ctx.resizeDebounceTimer = window.setTimeout(() => {
    ctx.resizeDebounceTimer = 0
    ctx.refreshMapSize()
    if (!ctx.map) return

    // 导航中：只 resize；开启视角跟随时用当前 GPS 回中
    if (navigating.value) {
      if (followUser.value && lng.value != null && lat.value != null) {
        const bearing = ctx.map.getBearing?.() ?? ctx.lastGoodBearing
        ctx.map.jumpTo({
          center: [lng.value, lat.value],
          zoom: Math.max(ctx.map.getZoom(), NAV_ZOOM),
          bearing,
        })
        ctx.pinnedCamera = {
          lng: lng.value,
          lat: lat.value,
          zoom: NAV_ZOOM,
          bearing,
        }
        ctx.beacon?.draw()
      }
      return
    }

    if (!ctx.pinnedCamera) return
    if (Date.now() >= ctx.pinUntil && !followUser.value) return
    try {
      ctx.map.stop()
    } catch {
      // ignore
    }
    ctx.map.jumpTo({
      center: [ctx.pinnedCamera.lng, ctx.pinnedCamera.lat],
      zoom: ctx.pinnedCamera.zoom,
      bearing: ctx.pinnedCamera.bearing ?? ctx.map.getBearing(),
    })
    ctx.beacon?.draw()
  }, 80)
}

ctx.syncBeaconHeading = function syncBeaconHeading() {
  if (!ctx.beacon) return
  const deg = deviceHeading.value
  const hasHeading = headingAvailable.value && deg != null
  if (!hasHeading) {
    ctx.beacon.setHeading(0, false)
    return
  }
  const bearing = ctx.map?.getBearing?.() ?? mapBearing.value ?? 0
  ctx.beacon.setHeading(deg - bearing, true)
}

ctx.onMapDragStart = function onMapDragStart() {
  // 用户拖地图后关闭视角跟随与朝向锁定（自动锁定开启时，停拖后会再开）
  followUser.value = false
  headingTestLock.value = false
  ctx.pinUntil = 0
  ctx.walkHeadingBehavior.reset('drag')
  walkHeadingActive.value = false
  // 拖图期间暂停实时定位回调，避免 GPS 抢相机
  ctx.pauseLocationTicksByDrag()
}

ctx.onMapDragEnd = function onMapDragEnd() {
  // 停拖约 10s 后恢复定位回调，并自动开启视角锁定（跟随）
  ctx.scheduleResumeAfterDragIdle()
}

ctx.setFollowUser = function setFollowUser(enabled) {
  followUser.value = Boolean(enabled)
  if (followUser.value) {
    routePreviewLock.value = false
    ctx.clearLocationResumeTimer()
  }
  if (followUser.value && lng.value != null && lat.value != null) {
    if (navigating.value) {
      ctx.applyNavCamera({ lng: lng.value, lat: lat.value }, { snapBearing: headingTestLock.value })
    } else {
      ctx.applyPositionToMap(
        { lng: lng.value, lat: lat.value },
        undefined,
        { follow: true, animate: false, forceCenter: true },
      )
    }
  }
  ctx.applyHeadingDragLock()
}

ctx.onAutoViewLockPrefChange = function onAutoViewLockPrefChange(enabled) {
  if (enabled) {
    if (routePreviewLock.value && !navigating.value) return
    ctx.setFollowUser(true)
    return
  }
  ctx.clearLocationResumeTimer()
  followUser.value = false
  ctx.applyHeadingDragLock()
}

ctx.syncPitch3DFromMap = function syncPitch3DFromMap() {
  if (!ctx.map) return
  const pitch = ctx.map.getPitch?.() ?? 0
  pitch3D.value = pitch >= 20
}

ctx.togglePitch3D = function togglePitch3D() {
  if (!ctx.map) return
  pitch3D.value = !pitch3D.value
  const pitch = pitch3D.value ? getBehaviorPolicy().pitch3d : getBehaviorPolicy().pitch2d
  if (ctx.bearingRaf) {
    cancelAnimationFrame(ctx.bearingRaf)
    ctx.bearingRaf = 0
  }
  try {
    ctx.map.stop()
  } catch {
    // ignore
  }
  // jumpTo 立即生效，避免被后续 ease / 定位写入冲掉
  ctx.map.easeTo({
    pitch,
    duration: 420,
    essential: true,
  })
  locatingHint.value = pitch3D.value ? t('hint.pitch3d') : t('hint.pitch2d')
  window.setTimeout(() => {
    locatingHint.value = ''
  }, 1600)
}

ctx.locateOnce = async function locateOnce(isFirst = false) {
  // 手动定位 / 回中：立刻恢复定位回调
  ctx.clearLocationResumeTimer()
  if (navigating.value) {
    // 导航中仅回中当前点，不打断导航状态
    if (lng.value != null && lat.value != null) {
      ctx.applyNavCamera({ lng: lng.value, lat: lat.value })
    }
    return
  }
  locatingHint.value = isFirst ? t('hint.locating') : t('hint.relocating')
  if (!isFirst) startHeading(true)

  const targetZoom = ctx.resolveMaxZoom()
  await ctx.waitForStableMapSize(isFirst ? 1200 : 400)

  // 先立刻回到已知位置并拉到最大缩放，再刷新 GPS
  if (!isFirst && lng.value != null && lat.value != null) {
    ctx.applyPositionToMap(
      { lng: lng.value, lat: lat.value },
      targetZoom,
      { follow: true, animate: false, forceCenter: true },
    )
  }

  try {
    const pos = await locate()
    await ctx.waitForStableMapSize(300)
    // 首次定位用 jumpTo 钉死，避免手机端 flyTo 被 resize 打断导致偏移/缩不到最大
    ctx.applyPositionToMap(pos, targetZoom, {
      follow: true,
      animate: !isFirst,
      forceCenter: true,
    })
    address.value = t('hint.parsingAddr')
    address.value = (await reverseGeocode(pos.lng, pos.lat, TIANDITU_TK)) || t('hint.addrUnavailable')
    locatingHint.value = ''
    ctx.refreshMapSize()
    ctx.pinCamera(pos, targetZoom, { animate: false })
    if (isFirst) await startHeading(false)
    ctx.syncMapBearingTarget()
    ctx.applyHeadingDragLock()
  } catch (err) {
    locatingHint.value = err?.message || error.value || t('hint.locateFail')
  } finally {
    try {
      await watchLocation(ctx.onLocationTick)
    } catch {
      // 无定位权限时保持提示，不打断页面
    }
  }
}

ctx.noteHeadingSample = function noteHeadingSample(deg) {
  if (!Number.isFinite(deg)) return
  const now = Date.now()
  ctx.headingSamples.push({ t: now, h: normalizeHeading(deg) })
  while (ctx.headingSamples.length && now - ctx.headingSamples[0].t > getBehaviorPolicy().headingSampleWindowMs) {
    ctx.headingSamples.shift()
  }
}

ctx.resolveCourseDeg = function resolveCourseDeg() {
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

ctx.headingUpWanted = function headingUpWanted() {
  return Boolean(headingTestLock.value || walkHeadingActive.value)
}

ctx.syncMapBearingTarget = function syncMapBearingTarget() {
  // 导航相机由 applyNavCamera 统一写 center+bearing，避免 setBearing 打断跟随
  if (navigating.value) return
  // 选点 / 路线预览时不抢相机
  if (routePreviewLock.value) return

  const courseDeg = ctx.resolveCourseDeg()
  if (courseDeg != null) {
    ctx.noteHeadingSample(courseDeg)
    ctx.lastGoodBearing = courseDeg
  }

  // 朝向锁定：旋转地图；视角跟随只负责居中，不在这里改 bearing
  if (headingTestLock.value && courseDeg != null) {
    ctx.bearingTargetDeg = courseDeg
    ctx.ensureBearingLoop()
    ctx.applyHeadingDragLock()
    return
  }

  const walkResult = ctx.walkHeadingBehavior.update({
    heading: courseDeg,
    speed: speed.value,
    navigating: false,
  })
  walkHeadingActive.value = ctx.walkHeadingBehavior.isTracking()

  if (walkHeadingActive.value) {
    ctx.bearingTargetDeg =
      walkResult?.tracking ??
      ctx.walkHeadingBehavior.getTrackingHeading() ??
      courseDeg ??
      ctx.lastGoodBearing
    if (Number.isFinite(ctx.bearingTargetDeg)) ctx.lastGoodBearing = ctx.bearingTargetDeg
    ctx.ensureBearingLoop()
    ctx.applyHeadingDragLock()
    return
  }

  // 未开朝向锁定时不改 bearing，避免 jumpTo 抢拖图 / 打断 3D pitch
  ctx.applyHeadingDragLock()
}

ctx.testRotateByHeading = async function testRotateByHeading() {
  locatingHint.value = t('hint.headingReading')
  const ok = await startHeading(true)
  if (!ok && deviceHeading.value == null) {
    locatingHint.value = t('hint.headingFail')
    return
  }

  headingTestLock.value = !headingTestLock.value
  if (!headingTestLock.value) {
    // 关闭朝向锁定：只停动画，不强制回正北（避免每帧 jumpTo 抢拖图）
    if (ctx.bearingRaf) {
      cancelAnimationFrame(ctx.bearingRaf)
      ctx.bearingRaf = 0
    }
    ctx.applyHeadingDragLock()
    locatingHint.value = t('hint.headingOff')
    window.setTimeout(() => {
      locatingHint.value = ''
    }, 1600)
    return
  }

  const courseDeg = ctx.resolveCourseDeg()
  if (courseDeg == null) {
    headingTestLock.value = false
    locatingHint.value = t('hint.headingNone')
    return
  }

  ctx.bearingTargetDeg = courseDeg
  ctx.ensureBearingLoop()
  ctx.applyHeadingDragLock()
  locatingHint.value = t('hint.cameraDir', { deg: courseDeg.toFixed(0) })
  window.setTimeout(() => {
    locatingHint.value = ''
  }, 2000)
}

ctx.ensureBearingLoop = function ensureBearingLoop() {
  if (navigating.value) return
  if (ctx.bearingRaf) return
  const step = () => {
    if (!ctx.map || navigating.value) {
      ctx.bearingRaf = 0
      return
    }
    const current = ctx.map.getBearing()
    const targetUnwrapped = unwrapHeading(current, ctx.bearingTargetDeg)
    const delta = targetUnwrapped - current
    const alpha = Math.abs(delta) > 45 ? 0.18 : 0.1
    const next = Math.abs(delta) < 2 ? normalizeHeading(ctx.bearingTargetDeg) : current + delta * alpha
    // 与 center/zoom 一并写入，避免单独 setBearing → stop() 打断其它动画
    const c = ctx.map.getCenter()
    ctx.map.jumpTo({
      center: [c.lng, c.lat],
      zoom: ctx.map.getZoom(),
      bearing: next,
      pitch: ctx.map.getPitch?.() ?? 0,
    })
    mapBearing.value = next
    ctx.syncBeaconHeading()

    if (Math.abs(delta) < 2) {
      ctx.bearingRaf = 0
      ctx.applyHeadingDragLock()
      return
    }
    ctx.bearingRaf = requestAnimationFrame(step)
  }
  ctx.bearingRaf = requestAnimationFrame(step)
}

ctx.applyHeadingDragLock = function applyHeadingDragLock() {
  if (!ctx.map) return
  try {
    // Mapbox bearing 已旋转相机，单指拖拽仍对齐屏幕，不能 disable dragPan
    // （否则步行朝向修正后无法拖图解锁，导航中也无法平移）
    ctx.map.dragPan?.enable?.()
    if (ctx.headingUpWanted()) {
      ctx.map.touchZoomRotate?.disableRotation?.()
    } else {
      ctx.map.touchZoomRotate?.enableRotation?.()
    }
  } catch {
    // ignore
  }
}

ctx.onLocationTick = function onLocationTick(pos) {
  if (!ctx.map || !ctx.beacon || pos?.lng == null) return
  // 拖图暂停期内丢弃回调，不更新蓝点/相机/导航
  if (ctx.locationTickPaused) return
  if (navigating.value) {
    ctx.onNavUpdate(pos)
    return
  }
  // 预览目的地/路线时只更新蓝点，不跟相机
  if (routePreviewLock.value) {
    ctx.beacon.setLngLat({ lng: pos.lng, lat: pos.lat }, { animate: true })
    return
  }
  ctx.applyPositionToMap(pos, undefined, {
    follow: followUser.value,
    animate: true,
  })
  ctx.syncMapBearingTarget()
  ctx.applyHeadingDragLock()
}

/**
 * 导航相机：同一帧写入 center + zoom + bearing，避免互相 stop()
 * @param {{ lng: number, lat: number }} pos
 * @param {{ snapBearing?: boolean }} [opts]
 */
ctx.applyNavCamera = function applyNavCamera(pos, opts = {}) {
  if (!ctx.map || !pos || pos.lng == null) return
  ctx.beacon.setLngLat({ lng: pos.lng, lat: pos.lat }, { animate: true })

  const smooth = ctx.beacon.getDisplayLngLat?.() || pos
  const zoom = Math.max(ctx.map.getZoom(), NAV_ZOOM)
  let nextBearing = ctx.map.getBearing()

  // 朝向锁定才改 bearing；视角跟随只负责把用户放在画面中心
  if (headingTestLock.value) {
    const courseDeg = ctx.resolveCourseDeg()
    if (courseDeg != null) {
      ctx.noteHeadingSample(courseDeg)
      ctx.lastGoodBearing = courseDeg
      ctx.bearingTargetDeg = courseDeg
    } else {
      ctx.bearingTargetDeg = ctx.lastGoodBearing
    }

    const current = ctx.map.getBearing()
    const targetUnwrapped = unwrapHeading(current, ctx.bearingTargetDeg)
    const delta = targetUnwrapped - current
    const snapBearing = Boolean(opts.snapBearing)
    const alpha = Math.abs(delta) > 45 ? 0.28 : 0.18
    nextBearing = snapBearing || Math.abs(delta) < 2.5
      ? normalizeHeading(ctx.bearingTargetDeg)
      : current + delta * alpha
  }

  if (!followUser.value) {
    // 未开视角跟随：只更新蓝点与（可选）朝向，不强制居中
    if (headingTestLock.value) {
      ctx.map.jumpTo({ bearing: nextBearing })
      mapBearing.value = nextBearing
      ctx.syncBeaconHeading()
    }
    ctx.applyHeadingDragLock()
    return
  }

  ctx.pinnedCamera = {
    lng: smooth.lng,
    lat: smooth.lat,
    zoom: NAV_ZOOM,
    bearing: nextBearing,
  }
  ctx.pinUntil = 0

  ctx.map.jumpTo({
    center: [smooth.lng, smooth.lat],
    zoom,
    bearing: nextBearing,
    pitch: ctx.map.getPitch?.() ?? 0,
  })
  mapBearing.value = nextBearing
  ctx.syncBeaconHeading()
  ctx.lastFollowPanAt = performance.now()
  ctx.applyHeadingDragLock()
}

ctx.copyOpenUrl = async function copyOpenUrl() {
  try {
    await navigator.clipboard.writeText(ctx.httpsUrl)
    locatingHint.value = t('hint.copyOk')
  } catch {
    locatingHint.value = t('hint.copyManual', { url: ctx.httpsUrl })
  }
}

ctx.applyPositionToMap = function applyPositionToMap(pos, zoom, options = {}) {
  if (pos?.lng == null || pos?.lat == null || !ctx.map || !ctx.beacon) return
  const follow = options.follow !== false
  const animate = options.animate !== false
  const forceCenter = Boolean(options.forceCenter)
  ctx.beacon.setLngLat({ lng: pos.lng, lat: pos.lat }, { animate: !forceCenter && animate })

  if (!follow) return

  const curZoom = ctx.map.getZoom()
  const nextZoom = zoom ?? curZoom

  // 强制居中：resize + jumpTo/flyTo 钉死，并记录 pinnedCamera 供后续 resize 回正
  if (forceCenter) {
    ctx.lastFollowPanAt = performance.now()
    ctx.pinCamera(pos, nextZoom ?? ctx.resolveMaxZoom(), { animate })
    return
  }

  const zoomChanged =
    nextZoom != null && curZoom != null && Math.abs(Number(nextZoom) - Number(curZoom)) > 0.05

  if (zoomChanged) {
    ctx.lastFollowPanAt = performance.now()
    ctx.map.jumpTo({
      center: [pos.lng, pos.lat],
      zoom: nextZoom,
      bearing: ctx.map.getBearing(),
      pitch: ctx.map.getPitch?.() ?? 0,
    })
    return
  }

  // 视角跟随：每帧把相机压在用户位置正上方（不做偏离阈值）
  ctx.scheduleSoftFollowPan(pos)
}

ctx.scheduleSoftFollowPan = function scheduleSoftFollowPan(pos) {
  ctx.followPanPos = pos
  if (ctx.followPanRaf) return
  ctx.followPanRaf = requestAnimationFrame(() => {
    ctx.followPanRaf = 0
    const target = ctx.followPanPos
    ctx.followPanPos = null
    if (!target || !ctx.map || navigating.value || !followUser.value) return

    const smooth = ctx.beacon?.getDisplayLngLat?.() || target
    ctx.lastFollowPanAt = performance.now()
    ctx.map.jumpTo({
      center: [smooth.lng, smooth.lat],
      zoom: ctx.map.getZoom(),
      bearing: ctx.map.getBearing(),
      pitch: ctx.map.getPitch?.() ?? 0,
    })
  })
}
}

/** @see installNavCamera */
export const useNavCamera = installNavCamera
