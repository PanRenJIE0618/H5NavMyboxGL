export async function searchPlaces(keyword, around, tk) {
  const text = String(keyword || '').trim()
  if (!text) throw new Error('请输入地址或地点名称')

  const httpPlaces = await httpKeywordSearch(text, around, tk).catch(() => [])
  if (httpPlaces.length) return uniquePlaces(httpPlaces)

  if (around) {
    const httpNearby = await httpNearbySearch(text, around, tk).catch(() => [])
    if (httpNearby.length) return uniquePlaces(httpNearby)
  }

  const geoPlaces = await httpGeocode(text, tk).catch(() => [])
  return uniquePlaces(geoPlaces)
}

async function httpKeywordSearch(text, around, tk) {
  if (!tk) return []
  const mapBound = around
    ? `${around.lng - 1.2},${around.lat - 1},${around.lng + 1.2},${around.lat + 1}`
    : '-180,-90,180,90'

  const payloads = [
    { keyWord: text, queryType: 1, start: 0, count: 20, level: 12, mapBound, show: 2 },
    { keyWord: text, queryType: 7, start: 0, count: 20, level: 5, mapBound: '-180,-90,180,90' },
  ]

  for (const postStr of payloads) {
    const places = await fetchSearch(postStr, tk)
    if (places.length) return places
  }
  return []
}

async function httpNearbySearch(text, around, tk) {
  if (!tk || !around) return []
  return fetchSearch(
    {
      keyWord: text,
      queryType: 3,
      start: 0,
      count: 20,
      level: 14,
      queryRadius: 20000,
      pointLonlat: `${around.lng},${around.lat}`,
    },
    tk,
  )
}

async function fetchSearch(postStr, tk) {
  const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(JSON.stringify(postStr))}&type=query&tk=${tk}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return normalizeSearchResult(data)
}

async function httpGeocode(text, tk) {
  if (!tk) return []
  try {
    const url = `https://api.tianditu.gov.cn/geocoder?ds=${encodeURIComponent(JSON.stringify({ keyWord: text }))}&tk=${tk}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const loc = data.location || data.result?.location
    const parsed = toPlace({
      name: data.location?.level || text,
      address: text,
      lonlat: loc ? `${loc.lon},${loc.lat}` : '',
    })
    return parsed ? [parsed] : []
  } catch {
    return []
  }
}

function normalizeSearchResult(result) {
  if (!result) return []

  const type = Number.parseInt(result.getResultType?.() ?? result.resultType ?? '0', 10)
  const places = []

  const pois = asArray(result.getPois?.() ?? result.pois)
  pois.forEach((item) => {
    const place = toPlace(item)
    if (place) places.push(place)
  })
  if (type === 1 && places.length) return places
  if (places.length) return places

  const area = result.getArea?.() ?? result.area
  const areaPlace = toPlace({
    name: area?.name,
    address: area?.lonstr || area?.address || '',
    lonlat: area?.lonlat,
  })
  if (areaPlace) places.push(areaPlace)

  const stats = result.getStatistics?.() ?? result.statistics
  const cities = [...asArray(stats?.priorityCitys), ...asArray(stats?.allAdmins)]
  cities.forEach((item) => {
    const place = toPlace({
      name: item.name || item.adminName,
      address: item.adminName || item.name || '',
      lonlat: item.lonlat,
    })
    if (place) places.push(place)
  })

  const suggests = asArray(result.getSuggests?.() ?? result.suggests)
  suggests.forEach((item) => {
    const place = toPlace(item)
    if (place) {
      places.push(place)
      return
    }
    if (item?.name) {
      places.push({
        name: item.name,
        address: item.address || item.gb || '',
        lng: null,
        lat: null,
        suggest: true,
      })
    }
  })

  return places
}

function toPlace(item) {
  if (!item) return null
  const parsed = parseLonLat(item.lonlat || item.lonLat || item.lonlatStr)
  if (!parsed) return null
  return {
    name: item.name || '未命名地点',
    address: item.address || item.adminName || '',
    lng: parsed.lng,
    lat: parsed.lat,
    suggest: false,
  }
}

function parseLonLat(value) {
  if (value == null || value === '') return null
  if (typeof value === 'object') {
    const lng = Number(value.lon ?? value.lng)
    const lat = Number(value.lat)
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null
  }
  const parts = String(value)
    .trim()
    .split(/[,，\s]+/)
    .map(Number)
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
  return { lng: parts[0], lat: parts[1] }
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function uniquePlaces(places) {
  const seen = new Set()
  return places.filter((place) => {
    const key = place.suggest ? `s:${place.name}` : `${place.name}:${place.lng}:${place.lat}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
