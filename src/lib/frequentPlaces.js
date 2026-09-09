/**
 * 常去地点（根据导航目的地频次自动累计）
 * 持久化：localStorage `h5nav:frequentPlaces`
 */

export const FREQUENT_PLACES_KEY = 'h5nav:frequentPlaces'
export const FREQUENT_PLACES_VERSION = 1
export const FREQUENT_PLACES_MAX = 20
/** 至少到达/结束该次数才进入「常去」列表 */
export const FREQUENT_MIN_COUNT = 2

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function roundCoord(value) {
  return Math.round(Number(value) * 1e5) / 1e5
}

function placeId(lng, lat) {
  return `fq_${roundCoord(lng)}_${roundCoord(lat)}`
}

/**
 * @returns {Array<object>}
 */
export function loadFrequentPlaces() {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(FREQUENT_PLACES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed)
        ? parsed
        : []
    return list
      .filter(
        (item) =>
          item &&
          Number.isFinite(Number(item.lng)) &&
          Number.isFinite(Number(item.lat)) &&
          Number(item.count) > 0,
      )
      .map((item) => ({
        id: String(item.id || placeId(item.lng, item.lat)),
        name: String(item.name || ''),
        lng: Number(item.lng),
        lat: Number(item.lat),
        address: item.address ? String(item.address) : '',
        count: Math.max(1, Math.round(Number(item.count) || 1)),
        lastAt: Number(item.lastAt) || 0,
      }))
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, FREQUENT_PLACES_MAX)
  } catch {
    return []
  }
}

/**
 * @param {Array<object>} items
 */
function writeAll(items) {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(
      FREQUENT_PLACES_KEY,
      JSON.stringify({
        version: FREQUENT_PLACES_VERSION,
        updatedAt: Date.now(),
        items: items.slice(0, FREQUENT_PLACES_MAX),
      }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * 列表（达到常去阈值的地点）
 * @param {number} [limit]
 */
export function listFrequentPlaces(limit = 8) {
  return loadFrequentPlaces()
    .filter((item) => item.count >= FREQUENT_MIN_COUNT)
    .slice(0, Math.max(1, limit))
}

/**
 * 导航结束时累计一次
 * @param {{ name?: string, lng: number, lat: number, address?: string }} dest
 */
export function recordFrequentPlace(dest) {
  const lng = Number(dest?.lng)
  const lat = Number(dest?.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return loadFrequentPlaces()

  const id = placeId(lng, lat)
  const now = Date.now()
  const prev = loadFrequentPlaces()
  const hit = prev.find((item) => item.id === id)
  const nextItem = {
    id,
    name: String(dest.name || hit?.name || ''),
    lng: roundCoord(lng),
    lat: roundCoord(lat),
    address: String(dest.address || hit?.address || ''),
    count: (hit?.count || 0) + 1,
    lastAt: now,
  }
  const next = [nextItem, ...prev.filter((item) => item.id !== id)]
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, FREQUENT_PLACES_MAX)
  writeAll(next)
  return next
}

export function clearFrequentPlaces() {
  writeAll([])
  return []
}

/**
 * @param {string} id
 */
export function removeFrequentPlace(id) {
  const next = loadFrequentPlaces().filter((item) => item.id !== id)
  writeAll(next)
  return next
}

/**
 * @param {object} place
 */
export function frequentToHistoryShape(place) {
  if (!place) return null
  return {
    id: place.id,
    travelMode: 'drive',
    driveStyle: '0',
    destination: {
      name: place.name || '',
      lng: Number(place.lng),
      lat: Number(place.lat),
      address: place.address ? String(place.address) : '',
    },
  }
}
