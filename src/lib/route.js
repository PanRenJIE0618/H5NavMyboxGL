import { haversineMeters } from './geo.js'
import { request } from './http.js'
import { t } from '../i18n/index.js'

const DRIVE_SPEED_MPS = 10
const WALK_SPEED_MPS = 1.25

export const TRAVEL_MODES = [
  { id: 'drive', label: '驾车' },
  { id: 'walk', label: '步行' },
]

export const DRIVE_STYLES = [
  { id: '0', label: '最快路线' },
  { id: '1', label: '最短路线' },
]

export function travelModeLabel(mode) {
  return mode === 'walk' ? t('map.walk') : t('map.drive')
}

export function driveStyleLabel(style) {
  return String(style) === '1' ? t('map.shortest') : t('map.fastest')
}

export async function planRoute(start, end, tk, driveStyle = '0') {
  const style = normalizeDriveStyle(driveStyle)
  const label = driveStyleLabel(style)
  const planned = await planWithHttp(start, end, tk, style)
  if (planned?.path?.length >= 2) return enrichPlan(planned, style)
  throw new Error(t('hint.planFail', { label }))
}

/** 步行：起终点直线 + 步行时速（无 JS API 时） */
export async function planWalkRoute(start, end) {
  const path = [
    { lng: start.lng, lat: start.lat },
    { lng: end.lng, lat: end.lat },
  ]
  const distanceMeters = haversineMeters(start, end)
  return enrichWalkPlan({
    mode: 'walk',
    style: 'walk',
    path,
    distanceMeters,
    durationSeconds: distanceMeters / WALK_SPEED_MPS,
    guides: [{ text: '沿直线方向步行前往目的地' }],
  })
}

export async function planByTravelMode(start, end, tk, travelMode, driveStyle = '0') {
  if (travelMode === 'walk') return planWalkRoute(start, end)
  return planRoute(start, end, tk, driveStyle)
}

function enrichWalkPlan(planned) {
  const path = planned.path || []
  const distanceMeters = planned.distanceMeters || pathLengthFallback(path)
  let durationSeconds = planned.durationSeconds || 0
  if (durationSeconds <= 0) durationSeconds = distanceMeters / WALK_SPEED_MPS
  return {
    ...planned,
    mode: 'walk',
    style: 'walk',
    path,
    distanceMeters,
    durationSeconds,
    guides: planned.guides?.length ? planned.guides : [{ text: '沿路线步行前往目的地' }],
  }
}

function normalizeDriveStyle(style) {
  const value = String(style)
  return DRIVE_STYLES.some((item) => item.id === value) ? value : '0'
}

async function planWithHttp(start, end, tk, style) {
  const postStr = JSON.stringify({
    orig: `${start.lng},${start.lat}`,
    dest: `${end.lng},${end.lat}`,
    style: String(style),
  })
  const url = `https://api.tianditu.gov.cn/drive?postStr=${encodeURIComponent(postStr)}&type=search&tk=${encodeURIComponent(tk)}`
  const text = await request(url, { parse: 'text', timeout: 20000 })
  const parsed = parseDriveBody(text, style)
  if (!parsed?.path?.length) throw new Error('没有找到驾车路线')
  return parsed
}

function parseDriveBody(text, style) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed)
    if (data.status && String(data.status) !== '0' && !data.result && !data.routelatlon) {
      throw new Error(data.msg || data.message || '驾车规划接口返回失败')
    }
    const result = data.result || data
    return fromDriveResult(result, style)
  }

  if (trimmed.includes('<')) {
    const doc = new DOMParser().parseFromString(trimmed, 'text/xml')
    const result = {
      routelatlon: doc.querySelector('routelatlon')?.textContent || '',
      distance: doc.querySelector('distance')?.textContent || '',
      duration: doc.querySelector('duration')?.textContent || '',
      simple: {
        item: [...doc.querySelectorAll('strguide')].map((node) => ({ strguide: node.textContent })),
      },
    }
    return fromDriveResult(result, style)
  }

  return null
}

function fromDriveResult(result, style) {
  const path = parseRouteLatLon(result?.routelatlon)
  if (path.length < 2) return null

  const guides = []
  const items = result.simple?.item || result.routes?.item || []
  const list = Array.isArray(items) ? items : [items]
  list.forEach((item) => {
    if (item?.strguide) guides.push({ text: item.strguide })
  })

  return {
    mode: 'drive',
    style: String(style),
    path,
    distanceMeters: parseHttpDistance(result.distance) || pathLengthFallback(path),
    durationSeconds: parseHttpDuration(result.duration),
    guides,
  }
}

function enrichPlan(planned, style) {
  const path = planned.path || []
  const distanceMeters = planned.distanceMeters || pathLengthFallback(path)
  let durationSeconds = planned.durationSeconds || 0
  if (durationSeconds <= 0) durationSeconds = distanceMeters / DRIVE_SPEED_MPS

  return {
    ...planned,
    mode: 'drive',
    style: String(style),
    distanceMeters,
    durationSeconds,
  }
}

function parseRouteLatLon(text) {
  return String(text || '')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [lng, lat] = pair.split(',').map(Number)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
      return { lng, lat }
    })
    .filter(Boolean)
}

function parseHttpDistance(value) {
  if (value == null || value === '') return 0
  const text = String(value)
  const km = text.match(/([\d.]+)\s*(公里|km)/i)
  if (km) return Number(km[1]) * 1000
  const meters = text.match(/([\d.]+)\s*(米|m)/i)
  if (meters) return Number(meters[1])
  const num = Number(text)
  return Number.isFinite(num) && num > 0 ? num * 1000 : 0
}

function parseHttpDuration(value) {
  const labeled = parseDuration(value)
  if (labeled) return labeled
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

function parseDuration(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return value
  const text = String(value)
  const hour = text.match(/([\d.]+)\s*小时/)
  const min = text.match(/([\d.]+)\s*分钟/)
  const sec = text.match(/([\d.]+)\s*秒/)
  return (
    (hour ? Number(hour[1]) * 3600 : 0) +
    (min ? Number(min[1]) * 60 : 0) +
    (sec ? Number(sec[1]) : 0)
  )
}

function pathLengthFallback(path) {
  let total = 0
  for (let i = 1; i < path.length; i += 1) total += haversineMeters(path[i - 1], path[i])
  return total
}
