import { onUnmounted, reactive, ref } from 'vue'
import {
  applyDetectedCoordSystem,
  detectClient,
  geoPollMs,
  geoPollSteps,
  geoWatchOptions,
  locateAttemptsFor,
} from '../lib/client'
import { resolveCoordKernel } from '../lib/coordDetect'
import { offsetMeters, toMapCoords } from '../lib/coords'
import { debugLog } from '../lib/debugLog'
import { canUseBrowserGeolocation, getHttpsUrl, isWeChatBrowser } from '../lib/secureContext'

/**
 * 坐标来自浏览器 Geolocation。
 * 坐标内核不预判 UA，打开后双重验证，以实测为准。
 * locateMode 仅影响超时/轮询节奏。
 * 输出目标系：WGS84（MapboxGL）。
 */
const R = 6371000
const LOCATED_ZOOM = 16

export function useGeolocation() {
  const client = reactive(detectClient())
  const geo = client.geo
  const POLL_MS = geoPollMs(client)
  const GEO_TIMEOUT_MS = geo.timeout || 3000
  const lng = ref(null)
  const lat = ref(null)
  const rawLng = ref(null)
  const rawLat = ref(null)
  const accuracy = ref(null)
  const speed = ref(null)
  const course = ref(null)
  const loading = ref(false)
  const error = ref('')
  const rectified = ref(false)
  const watching = ref(false)
  const updatedAt = ref(null)
  const coordKernel = ref('auto')

  let watchId = null
  let pollTimer = null
  let onWatchUpdate = null
  let pollSeq = 0
  let pollInFlight = false
  let lastMapped = null
  let lastTimestamp = 0
  let kernelPromise = null
  let resolvedSystem = null
  let kernelLocked = false
  let locateLock = false

  debugLog('客户端', {
    name: client.name,
    locateMode: client.locateMode,
    coordFallback: client.coordFallback,
    coordSystem: 'auto（待实测）',
    isBaidu: client.isBaidu,
    isChrome: client.isChrome,
    isSafari: client.isSafari,
    isiOS: client.isiOS,
    timeout: GEO_TIMEOUT_MS,
    pollMs: POLL_MS,
  })

  async function ensureCoordKernel(raw) {
    if (kernelLocked && resolvedSystem) return resolvedSystem
    if (kernelPromise) return kernelPromise

    const preferred = client.coordFallback === 'gcj02' ? 'gcj02' : 'wgs84'
    if (!resolvedSystem) {
      resolvedSystem = preferred
      coordKernel.value = preferred
      applyDetectedCoordSystem(client, preferred)
      kernelLocked = true
      debugLog('坐标内核 · 即时偏好上图', {
        preferred,
        client: client.name,
        allowGcj: preferred === 'gcj02',
      })
    }

    kernelPromise = resolveCoordKernel(raw.lng, raw.lat, {
      fallbackSystem: preferred,
      clientName: client.name,
      skipNetwork: client.isBaidu || client.locateMode === 'baidu',
    })
      .then((result) => {
        const next = result.system || preferred
        const canSwitch =
          result.confidence === 'high' &&
          next !== resolvedSystem &&
          !(preferred === 'wgs84' && next === 'gcj02')

        if (canSwitch) {
          resolvedSystem = next
          coordKernel.value = next
          applyDetectedCoordSystem(client, next)
          debugLog('坐标内核 · 高置信改写', { from: preferred, to: next, result })
        }
        return resolvedSystem
      })
      .catch((err) => {
        debugLog('坐标内核后台验证失败（已用偏好）', err?.message || err)
        return resolvedSystem || preferred
      })
      .finally(() => {
        kernelPromise = null
      })

    return resolvedSystem
  }

  async function locate() {
    loading.value = true
    locateLock = true
    error.value = ''

    if (!navigator.geolocation) {
      return fail('当前浏览器不支持定位')
    }

    if (!canUseBrowserGeolocation()) {
      return fail(insecureMessage())
    }

    try {
      debugLog('locate 开始', client.locateMode)
      const position = await getPositionByAttempts(locateAttemptsFor(client))
      const mapped = await applyPosition(position, 'locate')
      loading.value = false
      error.value = ''
      return mapped
    } catch (err) {
      return fail(formatGeoError(err))
    } finally {
      locateLock = false
    }
  }

  async function applyPosition(position, source = '未知') {
    const raw = {
      lng: position.coords.longitude,
      lat: position.coords.latitude,
    }

    const system = await ensureCoordKernel(raw)
    const mapped = toMapCoords(raw.lng, raw.lat, system)
    const shiftM = offsetMeters(raw, mapped)
    if (system === 'gcj02') {
      debugLog('GCJ→WGS84 纠偏量', {
        偏移米: shiftM,
        原始: raw,
        地图: mapped,
      })
    }
    const ageMs = Number.isFinite(position.timestamp)
      ? Math.max(0, Date.now() - position.timestamp)
      : null
    const movedM = lastMapped ? haversineMeters(lastMapped, mapped) : null

    rawLng.value = raw.lng
    rawLat.value = raw.lat
    lng.value = mapped.lng
    lat.value = mapped.lat
    accuracy.value = position.coords.accuracy
    speed.value = Number.isFinite(position.coords.speed) ? position.coords.speed : null
    course.value =
      Number.isFinite(position.coords.heading) && position.coords.heading >= 0
        ? position.coords.heading
        : null
    rectified.value = client.needsRectify
    updatedAt.value = Date.now()
    lastMapped = { lng: mapped.lng, lat: mapped.lat }
    if (Number.isFinite(position.timestamp)) lastTimestamp = position.timestamp

    logFullCoords(position, mapped, source, {
      movedM,
      ageMs,
      skipped: false,
      system,
      shiftM,
    })

    return {
      lng: mapped.lng,
      lat: mapped.lat,
      accuracy: accuracy.value,
      speed: speed.value,
      course: course.value,
      raw,
      client,
      coordSystem: system,
    }
  }

  function logFullCoords(position, mapped, source, extra = {}) {
    const c = position.coords
    const ageMs =
      extra.ageMs ??
      (Number.isFinite(position.timestamp) ? Math.max(0, Date.now() - position.timestamp) : null)
    debugLog(`✓ [${source}] 完整坐标`, {
      地图lng: mapped?.lng ?? null,
      地图lat: mapped?.lat ?? null,
      原始longitude: c.longitude,
      原始latitude: c.latitude,
      accuracy: c.accuracy,
      altitude: c.altitude,
      altitudeAccuracy: c.altitudeAccuracy,
      heading: c.heading,
      speed: c.speed,
      timestamp: position.timestamp,
      timeLocal: Number.isFinite(position.timestamp)
        ? new Date(position.timestamp).toLocaleString('zh-CN', { hour12: false })
        : null,
      ageMs,
      距上次米: extra.movedM ?? null,
      GCJ相对WGS偏移米: extra.shiftM ?? null,
      地图CRS: 'WGS84(EPSG:4326)',
      实测内核: extra.system || client.coordSystem,
      客户端: client.name,
      纠偏: client.needsRectify,
      跳过上图: Boolean(extra.skipped),
    })
  }

  function watchLocation(onUpdate) {
    if (onUpdate) onWatchUpdate = onUpdate
    if (watchId != null || pollTimer != null) {
      watching.value = true
      debugLog('定位监听已在运行')
      return Promise.resolve()
    }

    if (!navigator.geolocation) {
      return fail('当前浏览器不支持定位')
    }
    if (!canUseBrowserGeolocation()) {
      return fail(insecureMessage())
    }

    const handle = (position, source) => {
      void handleWatchPosition(position, source)
    }

    const watchOpts = geoWatchOptions(client)
    watchId = navigator.geolocation.watchPosition(
      (position) => handle(position, 'watch'),
      (err) => {
        debugLog('watch 错误', geoErrorLabel(err))
      },
      watchOpts,
    )

    debugLog(
      `已启动 watch + 每${POLL_MS / 1000}s 补拉`,
      `${client.locateMode}`,
      `超时${GEO_TIMEOUT_MS}ms`,
    )

    runPoll('立即')

    pollTimer = window.setInterval(() => {
      runPoll('定时')
    }, POLL_MS)

    watching.value = true
    return Promise.resolve()
  }

  async function handleWatchPosition(position, source) {
    const rawLngVal = position.coords.longitude
    const rawLatVal = position.coords.latitude
    const sameStamp =
      Number.isFinite(position.timestamp) &&
      position.timestamp === lastTimestamp &&
      lastMapped

    if (sameStamp) {
      const system =
        resolvedSystem ||
        (await ensureCoordKernel({
          lng: rawLngVal,
          lat: rawLatVal,
        }))
      const mapped = toMapCoords(rawLngVal, rawLatVal, system)
      const movedM = lastMapped ? haversineMeters(lastMapped, mapped) : 0
      if (movedM < 0.8) {
        logFullCoords(position, mapped, source, {
          movedM: 0,
          skipped: true,
          system,
        })
        return
      }
    }
    const mapped = await applyPosition(position, source)
    onWatchUpdate?.(mapped)
  }

  function runPoll(tag) {
    if (pollInFlight || locateLock || loading.value) return
    pollInFlight = true
    pollSeq += 1
    const seq = pollSeq

    const steps = geoPollSteps(client)

    const tryStep = (index) => {
      if (locateLock || loading.value) {
        pollInFlight = false
        debugLog(`poll#${seq}(${tag}) 中止：手动定位中`)
        return
      }
      if (index >= steps.length) {
        pollInFlight = false
        debugLog(`poll#${seq}(${tag}) 全失败 → 仍无坐标更新`)
        return
      }
      const opt = steps[index]
      navigator.geolocation.getCurrentPosition(
        (position) => {
          pollInFlight = false
          if (locateLock || loading.value) {
            debugLog(`poll#${seq} 结果丢弃：手动定位中`)
            return
          }
          void handlePollSuccess(position, `poll#${seq}-${opt.label}`)
        },
        () => {
          tryStep(index + 1)
        },
        {
          enableHighAccuracy: opt.enableHighAccuracy,
          timeout: opt.timeout,
          maximumAge: opt.maximumAge,
        },
      )
    }

    tryStep(0)
  }

  async function handlePollSuccess(position, source) {
    const rawLngVal = position.coords.longitude
    const rawLatVal = position.coords.latitude
    const sameStamp =
      Number.isFinite(position.timestamp) &&
      position.timestamp === lastTimestamp &&
      lastMapped

    if (sameStamp) {
      const system =
        resolvedSystem ||
        (await ensureCoordKernel({
          lng: rawLngVal,
          lat: rawLatVal,
        }))
      const mapped = toMapCoords(rawLngVal, rawLatVal, system)
      const movedM = lastMapped ? haversineMeters(lastMapped, mapped) : 0
      if (movedM < 0.8) {
        logFullCoords(position, mapped, source, {
          movedM: 0,
          skipped: true,
          system,
        })
        return
      }
    }
    const mapped = await applyPosition(position, source)
    onWatchUpdate?.(mapped)
  }

  function stopWatch() {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    if (pollTimer != null) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
    pollInFlight = false
    if (watching.value) debugLog('已停止定位监听')
    watching.value = false
  }

  /** 强制停掉旧 watch 再启动（回前台时防止「假 listening」） */
  function restartWatch(onUpdate) {
    stopWatch()
    return watchLocation(onUpdate)
  }

  function fail(message) {
    error.value = message
    loading.value = false
    debugLog('定位失败', message)
    return Promise.reject(new Error(message))
  }

  onUnmounted(() => {
    stopWatch()
    loading.value = false
  })

  return {
    client,
    coordKernel,
    lng,
    lat,
    rawLng,
    rawLat,
    accuracy,
    speed,
    course,
    loading,
    error,
    rectified,
    watching,
    updatedAt,
    locate,
    watchLocation,
    restartWatch,
    stopWatch,
    LOCATED_ZOOM,
  }
}

async function getPositionByAttempts(attempts) {
  let lastError = null
  for (let i = 0; i < attempts.length; i += 1) {
    const options = attempts[i]
    try {
      debugLog(`locate 尝试#${i + 1}/${attempts.length}`, {
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeout,
        maximumAge: options.maximumAge,
      })
      return await getPosition(options)
    } catch (err) {
      lastError = err
      debugLog(`locate 尝试#${i + 1} 失败`, geoErrorLabel(err))
    }
  }
  throw lastError || new Error('定位失败')
}

function getPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

function haversineMeters(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function geoErrorLabel(err) {
  const code = err?.code
  if (code === 1) return '1 权限被拒绝'
  if (code === 2) return '2 位置不可用'
  if (code === 3) return '3 超时：系统没给出点'
  return `${code ?? '-'} ${err?.message || ''}`.trim()
}

function insecureMessage() {
  const url = getHttpsUrl()
  if (isWeChatBrowser()) {
    return `微信内置浏览器在开发环境下通常无法打开本页或定位。请点右上角「···」用系统浏览器 / 百度浏览器打开 ${url}`
  }
  return `当前是 HTTP，手机不允许定位。请改用 ${url} ，证书提示选「继续访问」后再点定位按钮`
}

function formatGeoError(err) {
  if (!canUseBrowserGeolocation()) return insecureMessage()

  const ua = navigator.userAgent || ''
  const isBaidu = /baiduboxapp|baidubrowser|BIDUBrowser|BaiduBrowser|flyflow|bdbrowser/i.test(ua)
  const appleWebKit =
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Safari/i.test(ua) &&
      !/Chrome|CriOS|Chromium|EdgA|EdgiOS|FxiOS|OPR|SamsungBrowser|baidu/i.test(ua))

  switch (err?.code) {
    case 1:
      if (isBaidu) {
        return '定位权限被拒绝。请在系统设置打开定位，并允许「百度」访问位置后重试'
      }
      if (appleWebKit) {
        return '定位权限被拒绝。请到「设置 → 隐私与安全性 → 定位服务」开启，并允许 Safari 访问位置'
      }
      return isWeChatBrowser()
        ? '定位权限被拒绝。请在系统浏览器或百度浏览器中打开本页，并允许位置访问'
        : '定位权限被拒绝，请在浏览器或系统设置中允许位置访问'
    case 2:
      if (isBaidu) {
        return '百度内无法获取位置。请打开系统定位、允许百度定位权限后重试'
      }
      return appleWebKit
        ? '暂时无法获取位置。请确认定位服务已开，并到窗边或室外后重试'
        : '暂时无法获取位置，请到开阔处重试，或检查系统定位开关'
    case 3:
      if (isBaidu) {
        return '百度内定位较慢或未授权。请打开系统定位与百度定位权限后重试'
      }
      return appleWebKit
        ? '定位超时。Safari 首次定位较慢，请到室外或窗边后重试'
        : '定位超时。请打开系统定位、到窗边或室外后重试'
    default:
      return err?.message || '定位失败，请重试'
  }
}
