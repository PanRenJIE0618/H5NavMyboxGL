import { outOfChina, toMapCoords } from './coords'
import { debugLog } from './debugLog'

const R = 6371000
const SYSTEMS = ['wgs84', 'gcj02']
const SYSTEM_LABEL = {
  wgs84: 'WGS84',
  gcj02: 'GCJ-02',
  bd09: 'BD-09',
}

/** 项目地图目标系（MapboxGL） */
export const PROJECT_CRS = 'WGS84'
export const PROJECT_CRS_EPSG = 'EPSG:4326'

const CACHE_KEY = 'h5nav_myboxgl_coord_kernel_v1'

/**
 * 全端适配策略（解决「各浏览器名义 GCJ 不一致、乱纠偏偏移过大」）：
 *
 * 1. 先用各端 preferred（夸克族=gcj02，Chrome/小米等=wgs84）立即上图，保证能定位
 * 2. 后台双重验证；仅「高置信」才允许改写 preferred
 * 3. 禁止把 Chrome/小米等从 wgs84 误判成 gcj02（同一套 GCJ 反解会偏几百米）
 */
export async function resolveCoordKernel(rawLng, rawLat, options = {}) {
  const preferred =
    options.fallbackSystem === 'gcj02' || options.fallbackSystem === 'wgs84'
      ? options.fallbackSystem
      : 'wgs84'
  const clientName = options.clientName || ''
  const allowGcj = preferred === 'gcj02'

  const cached = readCache()
  if (cached && SYSTEMS.includes(cached.system)) {
    if (!allowGcj && cached.system === 'gcj02') {
      clearCoordKernelCache()
    } else {
      debugLog('坐标内核 · 使用本会话缓存', { ...cached, clientName, preferred })
      return {
        system: cached.system,
        label: SYSTEM_LABEL[cached.system],
        confidence: cached.confidence || 'cache',
        method: 'session-cache',
        candidates: [],
        projectCrs: PROJECT_CRS,
        preferred,
      }
    }
  }

  if (!Number.isFinite(rawLng) || !Number.isFinite(rawLat)) {
    return fallbackResult('invalid-raw', preferred)
  }

  if (outOfChina(rawLng, rawLat)) {
    const result = {
      system: 'wgs84',
      label: 'WGS84',
      confidence: 'high',
      method: 'out-of-china',
      candidates: [],
      projectCrs: PROJECT_CRS,
      preferred,
    }
    writeCache(result)
    return result
  }

  let system = preferred
  let confidence = 'preferred'
  let method = `preferred→${preferred}`
  let gapMeters = null
  let candidates = SYSTEMS.map((sys) => ({
    system: sys,
    map: toMapCoords(rawLng, rawLat, sys),
    score: null,
    refs: [],
  }))
  let network = null
  let ip = null

  const verified = await Promise.race([
    runDualVerify(rawLng, rawLat, preferred, {
      skipNetwork: Boolean(options.skipNetwork),
      skipIp: Boolean(options.skipIp),
    }),
    sleep(2200).then(() => null),
  ])

  if (verified) {
    network = verified.network
    ip = verified.ip
    candidates = verified.candidates
    gapMeters = verified.gapMeters

    const picked = pickVerifiedSystem(verified, preferred, allowGcj)
    system = picked.system
    confidence = picked.confidence
    method = picked.method

    if (picked.confidence === 'high' || picked.confidence === 'medium') {
      writeCache({ system, confidence, method })
    }
  }

  const result = {
    system,
    label: SYSTEM_LABEL[system],
    confidence,
    method,
    gapMeters,
    candidates,
    projectCrs: PROJECT_CRS,
    network,
    ip,
    preferred,
    clientName,
    allowGcj,
  }

  debugLog('坐标内核 · 适配完成', {
    胜出: result.system,
    偏好: preferred,
    允许GCJ纠偏: allowGcj,
    置信: result.confidence,
    方式: result.method,
    分差米: result.gapMeters,
    客户端: clientName,
    原始: { lng: rawLng, lat: rawLat },
    候选: result.candidates,
  })

  return result
}

function pickVerifiedSystem(verified, preferred, allowGcj) {
  const best = verified.best
  const gap = verified.gapMeters
  const confidence = gap > 120 ? 'high' : gap > 40 ? 'medium' : 'low'

  if (confidence === 'low' || !best) {
    return {
      system: preferred,
      confidence: 'preferred',
      method: `verify-low→preferred(${preferred})`,
    }
  }

  let system = best.system

  if (!allowGcj && system === 'gcj02') {
    return {
      system: 'wgs84',
      confidence: 'preferred',
      method: 'block-gcj→wgs84',
    }
  }

  if (confidence === 'medium' && system !== preferred) {
    if (preferred === 'gcj02' && system === 'wgs84') {
      return { system: 'gcj02', confidence: 'preferred', method: 'medium-keep-gcj' }
    }
    if (preferred === 'wgs84' && system === 'gcj02') {
      return { system: 'wgs84', confidence: 'preferred', method: 'medium-keep-wgs' }
    }
  }

  return {
    system,
    confidence,
    method: `dual-verify/${confidence}`,
  }
}

async function runDualVerify(rawLng, rawLat, preferred, opts = {}) {
  const candidates = SYSTEMS.map((system) => {
    const map = toMapCoords(rawLng, rawLat, system)
    return { system, label: SYSTEM_LABEL[system], map, score: 0, refs: [] }
  })

  const [netRef, ipRef] = await Promise.all([
    opts.skipNetwork ? null : fetchNetworkRef(),
    opts.skipIp ? null : fetchIpRef(),
  ])
  const refs = []

  if (netRef) {
    const netDist = haversineMeters(
      { lng: rawLng, lat: rawLat },
      { lng: netRef.lng, lat: netRef.lat },
    )
    if (netDist >= 25 && netDist <= 2500) {
      for (const netSys of SYSTEMS) {
        refs.push({
          name: `network(${netSys})`,
          point: toMapCoords(netRef.lng, netRef.lat, netSys),
          weight: 1.1,
        })
      }
    }
  }
  if (ipRef) {
    refs.push({
      name: 'ip',
      point: { lng: ipRef.lng, lat: ipRef.lat },
      weight: 1.8,
    })
  }

  if (!refs.length) {
    return {
      best: { system: preferred },
      gapMeters: 0,
      candidates,
      network: netRef,
      ip: ipRef,
    }
  }

  for (const cand of candidates) {
    let bestWeighted = Infinity
    for (const ref of refs) {
      const d = haversineMeters(cand.map, ref.point)
      const weighted = d / ref.weight
      cand.refs.push({ name: ref.name, meters: d, weighted })
      if (weighted < bestWeighted) bestWeighted = weighted
    }
    cand.score = bestWeighted
  }

  candidates.sort((a, b) => {
    const ds = a.score - b.score
    if (Math.abs(ds) > 1) return ds
    if (a.system === preferred) return -1
    if (b.system === preferred) return 1
    return 0
  })

  const best = candidates[0]
  const second = candidates[1]
  const gapMeters = second ? Math.abs(second.score - best.score) : 0

  return {
    best,
    gapMeters,
    candidates: candidates.map((c) => ({
      system: c.system,
      map: c.map,
      score: c.score,
      refs: c.refs,
    })),
    network: netRef,
    ip: ipRef,
  }
}

export function clearCoordKernelCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}

export function coordSystemLabel(system) {
  return SYSTEM_LABEL[system] || system
}

function fallbackResult(method, preferred = 'wgs84') {
  return {
    system: preferred,
    label: SYSTEM_LABEL[preferred] || 'WGS84',
    confidence: 'low',
    method,
    candidates: [],
    projectCrs: PROJECT_CRS,
    preferred,
  }
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeCache(result) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        system: result.system,
        confidence: result.confidence,
        method: result.method,
        at: Date.now(),
      }),
    )
  } catch {
    // ignore
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function fetchNetworkRef() {
  if (!navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 2000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer)
        resolve({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
        })
      },
      () => {
        window.clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: false, timeout: 1800, maximumAge: 120000 },
    )
  })
}

async function fetchIpRef() {
  const endpoints = [
    {
      url: 'https://ipwho.is/',
      pick: (d) =>
        d.success !== false && Number.isFinite(+d.longitude) && Number.isFinite(+d.latitude)
          ? { lng: +d.longitude, lat: +d.latitude }
          : null,
    },
    {
      url: 'https://ipapi.co/json/',
      pick: (d) =>
        Number.isFinite(+d.longitude) && Number.isFinite(+d.latitude)
          ? { lng: +d.longitude, lat: +d.latitude }
          : null,
    },
    {
      url: 'https://ip.useragentinfo.com/json',
      pick: (d) => {
        const lng = +(d.lng ?? d.lon ?? d.longitude)
        const lat = +(d.lat ?? d.latitude)
        return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null
      },
    },
  ]

  for (const ep of endpoints) {
    try {
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), 1800)
      const res = await fetch(ep.url, { signal: ctrl.signal })
      window.clearTimeout(timer)
      if (!res.ok) continue
      const data = await res.json()
      const point = ep.pick(data)
      if (point) return point
    } catch {
      // try next
    }
  }
  return null
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
