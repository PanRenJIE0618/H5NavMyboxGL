const R = 6371000

export function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function remainingPath(path, current) {
  if (!path?.length) return []
  let nearest = 0
  let min = Infinity
  path.forEach((point, index) => {
    const d = haversineMeters(current, point)
    if (d < min) {
      min = d
      nearest = index
    }
  })
  return path.slice(nearest)
}

export function pathLengthMeters(path) {
  let total = 0
  for (let i = 1; i < path.length; i += 1) {
    total += haversineMeters(path[i - 1], path[i])
  }
  return total
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.max(0, Math.round(meters))} 米`
  return `${(meters / 1000).toFixed(1)} 公里`
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const mins = Math.max(1, Math.round(seconds / 60))
  if (mins < 60) return `约 ${mins} 分钟`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `约 ${hours} 小时 ${rest} 分钟` : `约 ${hours} 小时`
}

function toRad(value) {
  return (value * Math.PI) / 180
}
