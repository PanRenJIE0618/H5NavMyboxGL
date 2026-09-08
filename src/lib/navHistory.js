/**
 * 导航历史（localStorage）
 * 每次结束导航后写入一条记录。
 */

export const NAV_HISTORY_KEY = 'h5nav:navHistory'
export const NAV_HISTORY_VERSION = 1
export const NAV_HISTORY_MAX = 30

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/**
 * @returns {Array<object>}
 */
export function loadNavHistory() {
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(NAV_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed)
        ? parsed
        : []
    return list.filter((item) => item && item.destination?.lng != null).slice(0, NAV_HISTORY_MAX)
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
      NAV_HISTORY_KEY,
      JSON.stringify({
        version: NAV_HISTORY_VERSION,
        updatedAt: Date.now(),
        items: items.slice(0, NAV_HISTORY_MAX),
      }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * 追加一条导航记录（新记录在最前）
 * @param {object} record
 */
export function pushNavHistory(record) {
  const dest = record?.destination
  if (!dest || !Number.isFinite(Number(dest.lng)) || !Number.isFinite(Number(dest.lat))) {
    return loadNavHistory()
  }

  const item = {
    id: String(record.id || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`),
    startedAt: Number(record.startedAt) || Date.now(),
    endedAt: Number(record.endedAt) || Date.now(),
    arrived: Boolean(record.arrived),
    travelMode: record.travelMode === 'walk' ? 'walk' : 'drive',
    driveStyle: String(record.driveStyle || (record.travelMode === 'walk' ? 'walk' : '0')),
    distanceMeters: Number(record.distanceMeters) || 0,
    durationSeconds: Number(record.durationSeconds) || 0,
    destination: {
      name: String(dest.name || '目的地'),
      lng: Number(dest.lng),
      lat: Number(dest.lat),
      address: dest.address ? String(dest.address) : '',
    },
  }

  const prev = loadNavHistory().filter((row) => {
    // 同一目的地短时间内重复结束：保留最新一条
    if (row.id === item.id) return false
    const sameDest =
      row.destination?.name === item.destination.name &&
      Math.abs(Number(row.destination?.lng) - item.destination.lng) < 1e-5 &&
      Math.abs(Number(row.destination?.lat) - item.destination.lat) < 1e-5
    if (sameDest && Math.abs(Number(row.endedAt) - item.endedAt) < 60_000) return false
    return true
  })

  const next = [item, ...prev].slice(0, NAV_HISTORY_MAX)
  writeAll(next)
  return next
}

export function clearNavHistory() {
  writeAll([])
  return []
}

/**
 * @param {string} id
 */
export function removeNavHistory(id) {
  const next = loadNavHistory().filter((row) => row.id !== id)
  writeAll(next)
  return next
}

/**
 * @param {number} ts
 */
export function formatNavHistoryTime(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return ''
  try {
    return new Date(n).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}
