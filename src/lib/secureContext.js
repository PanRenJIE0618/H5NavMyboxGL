import { t } from '../i18n/index.js'

export function canUseBrowserGeolocation() {
  return Boolean(navigator.geolocation) && isSecureGeolocationOrigin()
}

export function isSecureGeolocationOrigin() {
  if (window.isSecureContext) return true
  const host = location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

export function isWeChatBrowser() {
  return /MicroMessenger/i.test(navigator.userAgent)
}

export function isBaiduBrowser() {
  return /baidubrowser|BIDUBrowser|BaiduBrowser|flyflow|bdbrowser|baiduboxapp/i.test(
    navigator.userAgent,
  )
}

export function getHttpsUrl() {
  const { hostname, port, pathname, search, hash } = window.location
  const nextPort = !port || port === '80' || port === '443' ? '' : `:${port}`
  return `https://${hostname}${nextPort}${pathname}${search}${hash}`
}

export function getBrowserOpenHint() {
  if (isWeChatBrowser() && !canUseBrowserGeolocation()) {
    return {
      title: t('gate.openBrowserTitle'),
      detail: t('gate.openBrowserDetail'),
    }
  }
  if (!canUseBrowserGeolocation()) {
    return {
      title: t('gate.needHttpsTitle'),
      detail: t('gate.needHttpsDetail', { url: getHttpsUrl() }),
    }
  }
  return null
}
