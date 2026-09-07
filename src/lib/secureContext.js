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
      title: '请用系统浏览器打开',
      detail:
        '当前环境无法在微信内可靠定位。请点右上角「···」→「在浏览器中打开」。',
    }
  }
  if (!canUseBrowserGeolocation()) {
    return {
      title: '需要 HTTPS 才能定位',
      detail: `请用手机浏览器打开 ${getHttpsUrl()} 。推荐 Chrome / Safari / 百度浏览器。`,
    }
  }
  return null
}
