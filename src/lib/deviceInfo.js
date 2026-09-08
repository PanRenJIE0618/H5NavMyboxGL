/**
 * 设备 / 运行环境基础信息（不含隐私敏感策略细节）
 */

import { detectClient } from './client.js'
import { PROJECT_CRS } from './coordDetect.js'

function guessOs(ua) {
  const s = String(ua || '')
  if (/iPhone|iPad|iPod/i.test(s)) return 'iOS'
  if (/Android/i.test(s)) return 'Android'
  if (/Windows/i.test(s)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(s)) return 'macOS'
  if (/Linux/i.test(s)) return 'Linux'
  return '未知'
}

function guessDeviceLabel(ua, isiOS, isAndroid) {
  const s = String(ua || '')
  if (/iPhone/i.test(s)) return 'iPhone'
  if (/iPad/i.test(s)) return 'iPad'
  if (/iPod/i.test(s)) return 'iPod'
  const androidModel = s.match(/;\s*([^;)]+)\s+Build\//i)
  if (androidModel?.[1]) {
    const name = androidModel[1].trim()
    if (name && !/^wv$/i.test(name) && name.length < 40) return name
  }
  if (isAndroid) return 'Android 设备'
  if (isiOS) return 'Apple 设备'
  if (/Mobile/i.test(s)) return '移动设备'
  return '桌面设备'
}

/**
 * @returns {Array<{ label: string, value: string }>}
 */
export function getDeviceInfoRows() {
  const client = detectClient()
  const nav = typeof navigator !== 'undefined' ? navigator : /** @type {Navigator} */ ({})
  const scr = typeof screen !== 'undefined' ? screen : /** @type {Screen} */ ({})
  const win = typeof window !== 'undefined' ? window : /** @type {Window} */ ({})

  const ua = nav.userAgent || ''
  const os = guessOs(ua)
  const device = guessDeviceLabel(ua, client.isiOS, client.isAndroid)
  const lang = nav.language || (Array.isArray(nav.languages) && nav.languages[0]) || '—'
  const screenSize =
    Number.isFinite(scr.width) && Number.isFinite(scr.height)
      ? `${scr.width} × ${scr.height}`
      : '—'
  const dpr = Number(win.devicePixelRatio)
  const pixelRatio = Number.isFinite(dpr) ? String(Math.round(dpr * 100) / 100) : '—'
  const touchPoints = Number(nav.maxTouchPoints) || 0
  const touch = touchPoints > 0 || 'ontouchstart' in win ? `支持${touchPoints ? `（${touchPoints} 点）` : ''}` : '不支持'
  const geo = 'geolocation' in nav ? '支持' : '不支持'
  const speech = 'speechSynthesis' in win ? '支持' : '不支持'
  const secure = win.isSecureContext ? '是（HTTPS / localhost）' : '否'
  const online = nav.onLine === false ? '离线' : '在线'
  const viewport =
    Number.isFinite(win.innerWidth) && Number.isFinite(win.innerHeight)
      ? `${win.innerWidth} × ${win.innerHeight}`
      : '—'

  return [
    { label: '浏览器', value: client.name || '—' },
    { label: '设备名称', value: device },
    { label: '操作系统', value: os },
    { label: '地图坐标系', value: `${PROJECT_CRS}（EPSG:4326）` },
    { label: '定位坐标方案', value: client.schemeLabel || '—' },
    { label: '当前坐标内核', value: client.coordSystemLabel || '探测中' },
    { label: '界面语言', value: String(lang) },
    { label: '屏幕分辨率', value: screenSize },
    { label: '视口尺寸', value: viewport },
    { label: '像素比', value: pixelRatio },
    { label: '触控', value: touch },
    { label: '定位 API', value: geo },
    { label: '语音合成', value: speech },
    { label: '安全上下文', value: secure },
    { label: '网络状态', value: online },
  ]
}
