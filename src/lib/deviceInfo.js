/**
 * 设备 / 运行环境基础信息（不含隐私敏感策略细节）
 */

import { detectClient } from './client.js'
import { PROJECT_CRS } from './coordDetect.js'
import { t } from '../i18n/index.js'

function guessOs(ua) {
  const s = String(ua || '')
  if (/iPhone|iPad|iPod/i.test(s)) return 'iOS'
  if (/Android/i.test(s)) return 'Android'
  if (/Windows/i.test(s)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(s)) return 'macOS'
  if (/Linux/i.test(s)) return 'Linux'
  return '—'
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
  if (isAndroid) return 'Android'
  if (isiOS) return 'Apple'
  if (/Mobile/i.test(s)) return 'Mobile'
  return 'Desktop'
}

/**
 * @returns {Array<{ key: string, value: string }>}
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
  const touchSupported = touchPoints > 0 || 'ontouchstart' in win
  const touch = touchSupported
    ? `${t('device.support')}${touchPoints ? ` (${touchPoints})` : ''}`
    : t('device.unsupport')
  const geo = 'geolocation' in nav ? t('device.support') : t('device.unsupport')
  const speech = 'speechSynthesis' in win ? t('device.support') : t('device.unsupport')
  const secure = win.isSecureContext ? t('device.yesHttps') : t('device.no')
  const online = nav.onLine === false ? t('device.offlineVal') : t('device.onlineVal')
  const viewport =
    Number.isFinite(win.innerWidth) && Number.isFinite(win.innerHeight)
      ? `${win.innerWidth} × ${win.innerHeight}`
      : '—'

  return [
    { key: 'device.browser', value: client.name || '—' },
    { key: 'device.deviceName', value: device },
    { key: 'device.os', value: os },
    { key: 'device.mapCrs', value: `${PROJECT_CRS} (EPSG:4326)` },
    { key: 'device.coordScheme', value: client.schemeLabel || '—' },
    {
      key: 'device.coordKernel',
      value: client.coordSystemLabel || t('device.detecting'),
    },
    { key: 'device.language', value: String(lang) },
    { key: 'device.screen', value: screenSize },
    { key: 'device.viewport', value: viewport },
    { key: 'device.dpr', value: pixelRatio },
    { key: 'device.touch', value: touch },
    { key: 'device.geo', value: geo },
    { key: 'device.speech', value: speech },
    { key: 'device.secure', value: secure },
    { key: 'device.online', value: online },
  ]
}
