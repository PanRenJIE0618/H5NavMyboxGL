import { distance, length as turfLength, lineSlice, lineString, nearestPointOnLine, point } from './turf.js'

export function toLine(path) {
  const coords = (path || [])
    .filter((item) => Number.isFinite(item?.lng) && Number.isFinite(item?.lat))
    .map((item) => [item.lng, item.lat])
  if (coords.length < 2) return null
  return lineString(coords)
}

export function coordsToPath(coords) {
  return (coords || [])
    .filter((pair) => Array.isArray(pair) && pair.length >= 2)
    .map(([lng, lat]) => ({ lng, lat }))
}

/**
 * 将定位点投影到规划路线上（来自 spatial-analysis snapToRoad / nearestPointOnLine）
 * 超过 maxSnapMeters 视为偏航。
 */
export function snapToRoute(current, path, maxSnapMeters = 50) {
  const line = toLine(path)
  if (!line || !Number.isFinite(current?.lng) || !Number.isFinite(current?.lat)) {
    return {
      lng: current?.lng,
      lat: current?.lat,
      distanceMeters: Number.POSITIVE_INFINITY,
      onRoute: false,
      remaining: path || [],
      remainingMeters: 0,
    }
  }

  const gps = point([current.lng, current.lat])
  const snapped = nearestPointOnLine(line, gps, { units: 'meters' })
  const distanceMeters = Number(snapped?.properties?.dist ?? Number.POSITIVE_INFINITY)
  const [lng, lat] = snapped.geometry.coordinates
  const onRoute = distanceMeters <= maxSnapMeters
  // 无论是否判偏航，都从最近点裁剪剩余路段，便于导航中边走边缩短
  const remaining = ensureHead(sliceRemaining(line, snapped, path), { lng, lat })
  let remainingMeters = 0
  if (remaining.length >= 2) {
    remainingMeters = lineLengthMeters(remaining)
  } else if (remaining.length === 1) {
    const end = path[path.length - 1]
    remainingMeters = end
      ? distance(point([lng, lat]), point([end.lng, end.lat]), { units: 'meters' })
      : 0
  }

  return {
    lng,
    lat,
    distanceMeters,
    location: snapped.properties?.location ?? 0,
    index: snapped.properties?.index ?? 0,
    onRoute,
    remaining,
    remainingMeters,
  }
}

function ensureHead(path, head) {
  if (!head || !Number.isFinite(head.lng) || !Number.isFinite(head.lat)) return path || []
  if (!path?.length) return [head]
  const first = path[0]
  if (Math.abs(first.lng - head.lng) < 1e-7 && Math.abs(first.lat - head.lat) < 1e-7) {
    return path
  }
  return [head, ...path]
}

function sliceRemaining(line, snappedPoint, fallbackPath) {
  try {
    const coords = line.geometry.coordinates
    const endCoord = coords[coords.length - 1]
    const end = point(endCoord)
    const sliced = lineSlice(snappedPoint, end, line)
    const remaining = coordsToPath(sliced.geometry.coordinates)
    if (remaining.length >= 2) return remaining
    // 终点附近 slice 可能不足 2 点：不要回退成整条原路线
    const [lng, lat] = snappedPoint.geometry.coordinates
    return [
      { lng, lat },
      { lng: endCoord[0], lat: endCoord[1] },
    ]
  } catch {
    const coords = line?.geometry?.coordinates
    if (!coords?.length) return fallbackPath || []
    const endCoord = coords[coords.length - 1]
    const [lng, lat] = snappedPoint?.geometry?.coordinates || endCoord
    return [
      { lng, lat },
      { lng: endCoord[0], lat: endCoord[1] },
    ]
  }
}

export function lineLengthMeters(path) {
  const line = toLine(path)
  if (!line) return 0
  return turfLength(line, { units: 'meters' })
}

export function pointDistanceMeters(a, b) {
  return distance(point([a.lng, a.lat]), point([b.lng, b.lat]), { units: 'meters' })
}
