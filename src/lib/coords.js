/**
 * 坐标转换参考 Wandergis coordtransform：
 * BD-09 / GCJ-02（火星）/ WGS84
 * MapboxGL 相机与图层坐标使用 WGS84 经纬度（EPSG:4326）。
 */

const X_PI = (Math.PI * 3000.0) / 180.0
const PI = 3.1415926535897932384626
const A = 6378245.0
const EE = 0.00669342162296594323
const R = 6371000

/** 是否在国内（不在国内则不做偏移） */
export function outOfChina(lng, lat) {
  lng = +lng
  lat = +lat
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)
}

function transformLat(lng, lat) {
  lat = +lat
  lng = +lng
  let ret =
    -100.0 +
    2.0 * lng +
    3.0 * lat +
    0.2 * lat * lat +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng))
  ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLng(lng, lat) {
  lat = +lat
  lng = +lng
  let ret =
    300.0 +
    lng +
    2.0 * lat +
    0.1 * lng * lng +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng))
  ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((lng / 12.0) * PI) + 300.0 * Math.sin((lng / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

/** WGS84 → GCJ-02 */
export function wgs84ToGcj02(lng, lat) {
  lat = +lat
  lng = +lng
  if (outOfChina(lng, lat)) return { lng, lat }

  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { lng: lng + dLng, lat: lat + dLat }
}

/**
 * GCJ-02 → WGS84
 * 采用 coordtransform 的近似反解：lng*2 - mglng
 */
export function gcj02ToWgs84(lng, lat) {
  lat = +lat
  lng = +lng
  if (outOfChina(lng, lat)) return { lng, lat }

  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  const mgLat = lat + dLat
  const mgLng = lng + dLng
  return { lng: lng * 2 - mgLng, lat: lat * 2 - mgLat }
}

/** BD-09 → GCJ-02 */
export function bd09ToGcj02(lng, lat) {
  const bdLng = +lng
  const bdLat = +lat
  const x = bdLng - 0.0065
  const y = bdLat - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI)
  return {
    lng: z * Math.cos(theta),
    lat: z * Math.sin(theta),
  }
}

/** GCJ-02 → BD-09 */
export function gcj02ToBd09(lng, lat) {
  lat = +lat
  lng = +lng
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI)
  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006,
  }
}

/** BD-09 → WGS84 */
export function bd09ToWgs84(lng, lat) {
  const gcj = bd09ToGcj02(lng, lat)
  return gcj02ToWgs84(gcj.lng, gcj.lat)
}

/** 浏览器原始系 → WGS84 */
export function toWgs84(lng, lat, system) {
  if (system === 'gcj02') return gcj02ToWgs84(lng, lat)
  if (system === 'bd09') return bd09ToWgs84(lng, lat)
  return { lng: +lng, lat: +lat }
}

/**
 * 浏览器定位 → MapboxGL（WGS84）
 */
export function toMapCoords(lng, lat, system) {
  return toWgs84(lng, lat, system)
}

/** 原始点相对纠正后点的距离（米） */
export function offsetMeters(from, to) {
  if (!from || !to) return null
  const dLat = ((to.lat - from.lat) * PI) / 180
  const dLng = ((to.lng - from.lng) * PI) / 180
  const lat1 = (from.lat * PI) / 180
  const lat2 = (to.lat * PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
