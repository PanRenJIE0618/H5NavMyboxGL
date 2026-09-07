/**
 * UA 用途：
 * - locateMode：超时/轮询节奏
 * - coordFallback：仅当双重验证低置信/无参照时使用
 *   各浏览器「名义 GCJ」并不相同：夸克等与高德同源，套 coordtransform 正确；
 *   Chrome / 小米等再套同一套 GCJ 反解会偏，低置信时宁可不纠偏（按 WGS84）。
 */
const CLIENT_RULES = [
  { test: /Quark/i, name: '夸克', locateMode: 'china-app', coordFallback: 'gcj02' },
  { test: /UCBrowser|UCWEB|UBrowser/i, name: 'UC浏览器', locateMode: 'china-app', coordFallback: 'gcj02' },
  { test: /MicroMessenger/i, name: '微信', locateMode: 'china-app', coordFallback: 'wgs84' },
  { test: /AlipayClient/i, name: '支付宝', locateMode: 'china-app', coordFallback: 'gcj02' },
  { test: /DingTalk/i, name: '钉钉', locateMode: 'china-app', coordFallback: 'gcj02' },
  { test: /MQQBrowser|\sQQ\//i, name: 'QQ浏览器', locateMode: 'china-app', coordFallback: 'gcj02' },
  { test: /baiduboxapp/i, name: '百度APP', locateMode: 'baidu', coordFallback: 'gcj02' },
  {
    test: /baidubrowser|BIDUBrowser|BaiduBrowser|flyflow|bdbrowser|baiduboxapp/i,
    name: '百度浏览器',
    locateMode: 'baidu',
    coordFallback: 'gcj02',
  },
  { test: /aweme|BytedanceWebview/i, name: '抖音', locateMode: 'china-app', coordFallback: 'gcj02' },
  { test: /NewsArticle|newsarticle/i, name: '今日头条', locateMode: 'china-app', coordFallback: 'gcj02' },
  { test: /HuaweiBrowser/i, name: '华为浏览器', locateMode: 'china-app', coordFallback: 'wgs84' },
  { test: /MiuiBrowser/i, name: '小米浏览器', locateMode: 'china-app', coordFallback: 'wgs84' },
  { test: /HeyTapBrowser|OppoBrowser/i, name: 'OPPO浏览器', locateMode: 'china-app', coordFallback: 'wgs84' },
  { test: /VivoBrowser/i, name: 'vivo浏览器', locateMode: 'china-app', coordFallback: 'wgs84' },
  { test: /SamsungBrowser/i, name: '三星浏览器', locateMode: 'samsung', coordFallback: 'wgs84' },
  { test: /EdgA|EdgiOS/i, name: 'Edge', locateMode: 'system', coordFallback: 'wgs84' },
  { test: /Firefox|FxiOS/i, name: 'Firefox', locateMode: 'system', coordFallback: 'wgs84' },
  { test: /CriOS/i, name: 'Chrome', locateMode: 'chrome', coordFallback: 'wgs84' },
  { test: /Chrome/i, name: 'Chrome', locateMode: 'chrome', coordFallback: 'wgs84' },
  { test: /Safari/i, name: 'Safari', locateMode: 'safari', coordFallback: 'wgs84' },
]

const SYSTEM_LABEL = {
  auto: '探测中',
  wgs84: 'WGS84',
  gcj02: 'GCJ-02',
  bd09: 'BD-09',
}

const GEO_TIMEOUT_MS = 3000
const SAFARI_GEO_TIMEOUT_MS = 12000
const BAIDU_GEO_TIMEOUT_MS = 20000

const GEO_PROFILES = {
  baidu: {
    timeout: BAIDU_GEO_TIMEOUT_MS,
    pollMs: 6000,
    watch: {
      enableHighAccuracy: true,
      timeout: 25000,
      maximumAge: 15000,
    },
    locateAttempts: [
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
      { enableHighAccuracy: true, timeout: BAIDU_GEO_TIMEOUT_MS, maximumAge: 30000 },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 120000 },
    ],
    pollSteps: [
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000, label: '缓存/网络' },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000, label: '近30s' },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000, label: '宽松' },
    ],
  },
  chrome: {
    timeout: 8000,
    pollMs: 3000,
    watch: { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 },
    locateAttempts: [
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
    ],
    pollSteps: [
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0, label: '新GPS' },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000, label: '近3s' },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000, label: '宽松' },
    ],
  },
  safari: {
    timeout: SAFARI_GEO_TIMEOUT_MS,
    pollMs: 4000,
    watch: {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    },
    locateAttempts: [
      { enableHighAccuracy: true, timeout: SAFARI_GEO_TIMEOUT_MS, maximumAge: 10000 },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      { enableHighAccuracy: false, timeout: SAFARI_GEO_TIMEOUT_MS, maximumAge: 60000 },
    ],
    pollSteps: [
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000, label: '近5s' },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000, label: '近15s' },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000, label: '宽松' },
    ],
  },
  samsung: {
    timeout: 8000,
    pollMs: 3500,
    watch: { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 },
    locateAttempts: [
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    ],
    pollSteps: [
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 3000, label: '近3s' },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000, label: '近10s' },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000, label: '宽松' },
    ],
  },
  'china-app': {
    timeout: 8000,
    pollMs: 3000,
    watch: { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 },
    locateAttempts: [
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5000 },
    ],
    pollSteps: [
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0, label: '新点' },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000, label: '近3s' },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000, label: '宽松' },
    ],
  },
  system: {
    timeout: 8000,
    pollMs: 3000,
    watch: { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 },
    locateAttempts: [
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 15000 },
    ],
    pollSteps: [
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0, label: '新GPS' },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000, label: '近3s' },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000, label: '宽松' },
    ],
  },
}

export function detectClient(ua = navigator.userAgent) {
  const matched = CLIENT_RULES.find((rule) => rule.test.test(ua))
  const name = matched?.name || guessGenericName(ua)
  const isiOS = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isBaiduApp = /baiduboxapp/i.test(ua)
  const isBaiduBrowser =
    !isBaiduApp && /baidubrowser|BIDUBrowser|BaiduBrowser|flyflow|bdbrowser/i.test(ua)
  const isChrome =
    (/CriOS/i.test(ua) || (/Chrome/i.test(ua) && !/EdgA|EdgiOS|OPR|SamsungBrowser/i.test(ua))) &&
    !isBaiduApp &&
    !isBaiduBrowser
  const isSafari =
    /Safari/i.test(ua) &&
    !/Chrome|CriOS|Chromium|EdgA|EdgiOS|FxiOS|OPR|SamsungBrowser|baidubrowser|baiduboxapp|MicroMessenger|UCBrowser|Quark|HeyTap|Huawei|Miui|Vivo/i.test(
      ua,
    )

  let locateMode = matched?.locateMode || 'system'
  if (isBaiduApp || isBaiduBrowser) locateMode = 'baidu'
  else if (/SamsungBrowser/i.test(ua)) locateMode = 'samsung'
  else if (isiOS || isSafari) locateMode = 'safari'
  else if (isChrome) locateMode = 'chrome'

  const geo = GEO_PROFILES[locateMode] || GEO_PROFILES.system
  let coordFallback = matched?.coordFallback || 'wgs84'
  if (isBaiduApp || isBaiduBrowser) coordFallback = 'gcj02'

  return {
    name,
    ua,
    coordSystem: 'auto',
    coordSystemLabel: SYSTEM_LABEL.auto,
    coordFallback,
    locateMode,
    needsRectify: false,
    isBaiduBrowser,
    isBaiduApp,
    isBaidu: isBaiduApp || isBaiduBrowser,
    isChrome,
    isChromeIOS: isChrome && isiOS,
    isChromeAndroid: isChrome && isAndroid,
    isSafari,
    isiOS,
    isAndroid,
    geo,
    schemeLabel: `${name}.${SYSTEM_LABEL[coordFallback] || coordFallback} → WGS84`,
  }
}

export function applyDetectedCoordSystem(client, system) {
  if (!client || !system || system === 'auto') return client
  client.coordSystem = system
  client.coordSystemLabel = SYSTEM_LABEL[system] || system
  client.needsRectify = system !== 'wgs84'
  client.schemeLabel = `${client.name}.${SYSTEM_LABEL[system] || system} → WGS84`
  return client
}

export function locateAttemptsFor(client) {
  return client?.geo?.locateAttempts || GEO_PROFILES.system.locateAttempts
}

export function geoWatchOptions(client) {
  return client?.geo?.watch || GEO_PROFILES.system.watch
}

export function geoPollSteps(client) {
  return client?.geo?.pollSteps || GEO_PROFILES.system.pollSteps
}

export function geoPollMs(client) {
  return client?.geo?.pollMs || GEO_PROFILES.system.pollMs
}

function guessGenericName(ua) {
  if (/iPhone|iPad|iPod/i.test(ua)) return '系统浏览器'
  if (/Android/i.test(ua)) return '系统浏览器'
  return '未知客户端'
}
