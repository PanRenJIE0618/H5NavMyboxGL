import { request } from './http.js'

/** 逆地理编码（HTTP） */
export async function reverseGeocode(lng, lat, tk) {
  const postStr = JSON.stringify({ lon: lng, lat, ver: 1 })
  const url = `https://api.tianditu.gov.cn/geocoder?postStr=${encodeURIComponent(postStr)}&type=geocode&tk=${tk}`

  try {
    const data = await request(url, { parse: 'json', silent: true, timeout: 10000 })
    if (data.status == 0 || data.status === '0') {
      return data.result?.formatted_address || ''
    }
  } catch {
    // CORS 或网络失败时忽略
  }

  return ''
}
