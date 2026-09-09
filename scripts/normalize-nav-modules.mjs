/**
 * Convert *.part.js → normal installXxx(ctx) modules.
 * Strategy: destructure refs from ctx; rewrite only mutables + installed functions to ctx.*.
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('e:/Pan/H5NavMyBoxGL/src/composables/nav')

const PARTS = [
  { part: 'useNavMapState.part.js', out: 'installNavMapState.js', exportName: 'installNavMapState' },
  { part: 'useNavMapUi.part.js', out: 'useNavMapUi.js', exportName: 'installNavMapUi', alias: 'useNavMapUi' },
  { part: 'useNavClipboard.part.js', out: 'useNavClipboard.js', exportName: 'installNavClipboard', alias: 'useNavClipboard' },
  { part: 'useNavMapCore.part.js', out: 'useNavMapCore.js', exportName: 'installNavMapCore', alias: 'useNavMapCore' },
  { part: 'useNavCamera.part.js', out: 'useNavCamera.js', exportName: 'installNavCamera', alias: 'useNavCamera' },
  { part: 'useNavRouting.part.js', out: 'useNavRouting.js', exportName: 'installNavRouting', alias: 'useNavRouting' },
  { part: 'useNavSessionFlow.part.js', out: 'useNavSessionFlow.js', exportName: 'installNavSessionFlow', alias: 'useNavSessionFlow' },
]

/** Non-ref fields that are reassigned — always ctx.field */
const MUTABLES = new Set([
  'map',
  'beacon',
  'resizeObserver',
  'overlayObserver',
  'destMarker',
  'routeLines',
  'arriveHits',
  'lastDrawnRemainMeters',
  'lastFollowPanAt',
  'followPanRaf',
  'followPanPos',
  'pinnedCamera',
  'pinUntil',
  'resizeDebounceTimer',
  'settleTimer',
  'settleTimers',
  'lastGoodBearing',
  'locationTickPaused',
  'locationResumeTimer',
  'viewLockResumeTimer',
  'lastSessionSaveAt',
  'lastSessionSaveRemainMeters',
  'pageHiddenAt',
  'visibilityBound',
  'unsubBasemap',
  'unsubUiTheme',
  'unsubAutoViewLock',
  'unsubNavPrefs',
  'bearingRaf',
  'bearingTargetDeg',
  'headingSamples',
  'activeNavMeta',
  'walkHeadingBehavior',
  'offRouteMonitor',
  'lastSpeedingAlertAt',
  'lastOfferedClipboardFp',
  'dismissedClipboardFp',
  'lastIgnoredClipboardFp',
  'clipboardPollTimer',
  'clipboardCheckInFlight',
  'clipboardGestureBound',
  'ROUTE_COLOR_ACTIVE',
  'ROUTE_COLOR_IDLE',
  'ROUTE_CASING_COLOR',
  'ROUTE_OPACITY_ACTIVE',
  'ROUTE_OPACITY_IDLE',
  'ROUTE_ARROW_IMAGE_ID',
  'secureOk',
  'httpsUrl',
  'inWeChat',
  'browserHint',
  'showWeChatGate',
  // helpers installed as functions — call via ctx
])

const IMPORT_CATALOG = [
  { ids: ['computed', 'nextTick', 'onMounted', 'onUnmounted', 'ref', 'watch'], from: 'vue' },
  { ids: ['useDeviceHeading'], from: '../useDeviceHeading' },
  { ids: ['useGeolocation'], from: '../useGeolocation' },
  {
    ids: [
      'DEFAULT_CENTER',
      'DEFAULT_ZOOM',
      'LOCATED_ZOOM',
      'MAX_ZOOM',
      'NAV_ZOOM',
      'TIANDITU_TK',
      'getBehaviorPolicy',
      'onBehaviorPolicyChange',
    ],
    from: '../../config',
  },
  { ids: ['basemapTileUrls', 'getStoredBasemap', 'onBasemapChange'], from: '../../lib/basemap' },
  { ids: ['getStoredUiTheme', 'onUiThemeChange'], from: '../../lib/uiTheme' },
  { ids: ['getAutoViewLock', 'onAutoViewLockChange'], from: '../../lib/viewLock' },
  {
    ids: [
      'getDefaultDriveStyle',
      'getDefaultTravelMode',
      'getVoiceEnabled',
      'onNavPrefsChange',
      'setVoiceEnabled',
    ],
    from: '../../lib/navPrefs',
  },
  { ids: ['LocationBeacon'], from: '../../lib/LocationBeacon' },
  { ids: ['createDeviceWalkBehavior'], from: '../../lib/deviceWalkBehavior' },
  { ids: ['createOffRouteMonitor'], from: '../../lib/offRouteMonitor' },
  {
    ids: [
      'getNavVoiceSupportHint',
      'isNavVoiceMuted',
      'onNavVoicePageHidden',
      'onNavVoicePageVisible',
      'speakNav',
      'speakNavOverview',
      'stopNavVoice',
      'toggleNavVoiceMuted',
      'unlockNavVoice',
    ],
    from: '../../lib/navVoice',
  },
  {
    ids: ['buildNavSessionSnapshot', 'clearNavSession', 'loadNavSession', 'saveNavSession'],
    from: '../../lib/navSession',
  },
  { ids: ['pushNavHistory'], from: '../../lib/navHistory' },
  { ids: ['formatDistance', 'formatDuration', 'haversineMeters'], from: '../../lib/geo' },
  { ids: ['reverseGeocode'], from: '../../lib/geocode' },
  { ids: ['normalizeHeading', 'shortestDelta', 'unwrapHeading'], from: '../../lib/heading' },
  {
    ids: ['DRIVE_STYLES', 'driveStyleLabel', 'planByTravelMode', 'TRAVEL_MODES', 'travelModeLabel'],
    from: '../../lib/route',
  },
  { ids: ['snapToRoute', 'coordsToPath'], from: '../../lib/routeSnap' },
  { ids: ['searchPlaces'], from: '../../lib/search' },
  {
    ids: ['clipboardFingerprint', 'extractAddressCandidate', 'readClipboardTextDetailed'],
    from: '../../lib/clipboardAddress',
  },
  { ids: ['debugConsoleOpen', 'debugLog'], from: '../../lib/debugLog' },
  {
    ids: ['canUseBrowserGeolocation', 'getBrowserOpenHint', 'getHttpsUrl', 'isWeChatBrowser'],
    from: '../../lib/secureContext',
  },
  { ids: ['setBootProgress'], from: '../../lib/bootSplash' },
  { ids: ['t', 'locale'], from: '../../i18n' },
]
const IMPORT_IDS = new Set(IMPORT_CATALOG.flatMap((e) => e.ids))

function collectInstalledFns() {
  const fns = new Set()
  for (const { part } of PARTS) {
    const src = fs.readFileSync(path.join(dir, part), 'utf8')
    for (const m of src.matchAll(/\bctx\.([A-Za-z_][\w]*)\s*=\s*(?:async\s+)?function\b/g)) {
      fns.add(m[1])
    }
  }
  return fns
}

function collectRefsAssigned() {
  // ctx.foo = ref(...) or ctx.foo = computed(...)
  const refs = new Set()
  for (const { part } of PARTS) {
    const src = fs.readFileSync(path.join(dir, part), 'utf8')
    for (const m of src.matchAll(/\bctx\.([A-Za-z_][\w]*)\s*=\s*(?:ref|computed)\b/g)) {
      refs.add(m[1])
    }
  }
  // geo/heading refs assigned without ref()
  ;[
    'lng',
    'lat',
    'speed',
    'course',
    'loading',
    'error',
    'watching',
    'client',
    'locate',
    'watchLocation',
    'restartWatch',
    'deviceHeading',
    'headingAvailable',
    'startHeading',
    'rebindHeading',
  ].forEach((n) => refs.add(n))
  return refs
}

function rewriteSelective(code, rewriteSet) {
  const set = new Set([...rewriteSet].sort((a, b) => b.length - a.length))
  let out = ''
  let i = 0
  while (i < code.length) {
    const ch = code[i]
    if (ch === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i)
      const j = end === -1 ? code.length : end
      out += code.slice(i, j)
      i = j
      continue
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const j = end === -1 ? code.length : end + 2
      out += code.slice(i, j)
      i = j
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      if (quote === '`') {
        out += '`'
        i += 1
        while (i < code.length) {
          if (code[i] === '\\') {
            out += code.slice(i, i + 2)
            i += 2
            continue
          }
          if (code[i] === '`') {
            out += '`'
            i += 1
            break
          }
          if (code[i] === '$' && code[i + 1] === '{') {
            out += '${'
            i += 2
            let depth = 1
            const start = i
            while (i < code.length && depth > 0) {
              if (code[i] === '{') depth++
              else if (code[i] === '}') depth--
              if (depth === 0) break
              i++
            }
            out += rewriteSelective(code.slice(start, i), rewriteSet)
            out += '}'
            i++
            continue
          }
          out += code[i]
          i++
        }
        continue
      }
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (code[j] === quote) {
          j++
          break
        }
        j++
      }
      out += code.slice(i, j)
      i = j
      continue
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1
      while (j < code.length && /[A-Za-z0-9_$]/.test(code[j])) j++
      const id = code.slice(i, j)

      let k = j
      while (k < code.length && /\s/.test(code[k])) k++
      const isKey = code[k] === ':' && code[k + 1] !== '='

      let p = i - 1
      while (p >= 0 && /\s/.test(code[p])) p--
      const isMember = p >= 0 && code[p] === '.'

      // function name after `function`
      let isFnName = false
      let q = p
      while (q >= 0 && /\s/.test(code[q])) q--
      let end = q
      while (q >= 0 && /[A-Za-z0-9_$]/.test(code[q])) q--
      if (code.slice(q + 1, end + 1) === 'function') isFnName = true

      if (set.has(id) && !isKey && !isMember && !isFnName) {
        out += `ctx.${id}`
      } else {
        out += id
      }
      i = j
      continue
    }

    out += ch
    i++
  }
  return out.replace(/\bctx\.ctx\./g, 'ctx.')
}

function usedImports(code) {
  const used = new Set()
  for (const id of IMPORT_IDS) {
    if (new RegExp(`\\b${id}\\b`).test(code)) used.add(id)
  }
  return used
}

function buildImportBlock(used) {
  const lines = []
  for (const entry of IMPORT_CATALOG) {
    const ids = entry.ids.filter((id) => used.has(id))
    if (!ids.length) continue
    if (ids.length === 1) lines.push(`import { ${ids[0]} } from '${entry.from}'`)
    else lines.push(`import {\n  ${ids.join(',\n  ')},\n} from '${entry.from}'`)
  }
  return lines.join('\n')
}

function refsUsedIn(code, allRefs) {
  // Names this file assigns onto ctx (created here — do not destructure upfront)
  const createdHere = new Set()
  for (const m of code.matchAll(/\bctx\.([A-Za-z_][\w]*)\s*=/g)) {
    createdHere.add(m[1])
  }

  const used = []
  for (const r of allRefs) {
    if (createdHere.has(r)) continue
    const stripped = code.replace(new RegExp(`\\bctx\\.${r}\\b`, 'g'), '')
    if (new RegExp(`(?<![.\\w])${r}(?!\\w)`).test(stripped)) used.push(r)
  }
  return used.sort()
}

const installedFns = collectInstalledFns()
const allRefs = collectRefsAssigned()
const rewriteSet = new Set([...MUTABLES, ...installedFns, 'props', 'emit'])

console.log('mutables+fns', rewriteSet.size, 'refs', allRefs.size)

for (const spec of PARTS) {
  const raw = fs.readFileSync(path.join(dir, spec.part), 'utf8')
  let body = rewriteSelective(raw, rewriteSet)

  // For state module: fix bare inWeChat/secureOk if still present
  body = body.replace(
    /ctx\.showWeChatGate = (?!ctx\.)(.*)/,
    (m, rhs) => `ctx.showWeChatGate = ${rewriteSelective(rhs, rewriteSet)}`,
  )

  const refs = refsUsedIn(body, allRefs)
  // Don't destructure in state installer (it CREATES the refs)
  const isState = spec.exportName === 'installNavMapState'
  const destr = !isState && refs.length
    ? `  const {\n    ${refs.join(',\n    ')},\n  } = ctx\n\n`
    : ''

  // state needs special handling for walkHeading callbacks using bare refs before destr —
  // state CREATE assigns ctx.xxx = ref, then later uses bare walkHeadingActive — rewrite those to ctx.
  if (isState) {
    body = rewriteSelective(body, new Set([...rewriteSet, ...allRefs]))
  }

  const used = usedImports(body)
  const imports = buildImportBlock(used)
  const alias = spec.alias
    ? `\n/** @see ${spec.exportName} */\nexport const ${spec.alias} = ${spec.exportName}\n`
    : ''

  const out = `${imports ? imports + '\n\n' : ''}/**
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function ${spec.exportName}(ctx) {
${destr}${body}
}
${alias}`

  fs.writeFileSync(path.join(dir, spec.out), out)
  console.log('wrote', spec.out, 'lines', out.split('\n').length, 'destr', refs.length)
}

const returnKeys = [
  'mapEl', 'stageEl', 'mastEl', 'hudEl', 'mapReady', 'mapError', 'address', 'locatingHint',
  'keyword', 'searching', 'searchError', 'places', 'destination', 'travelMode', 'driveStyle',
  'routeInfo', 'routePlans', 'routesReady', 'routing', 'navigating', 'routePreviewLock',
  'followUser', 'arrived', 'remainingMeters', 'remainingSeconds', 'nextGuide', 'offRoute',
  'offRouteDistanceMeters', 'rerouting', 'voiceMuted', 'pendingResume', 'clipboardOffer',
  'mapBearing', 'headingTestLock', 'pitch3D', 'walkHeadingActive', 'lng', 'lat', 'speed',
  'course', 'loading', 'error', 'watching', 'client', 'deviceHeading', 'headingAvailable',
  'headingText', 'coordText', 'speedKmh', 'speedLimitKmh', 'isSpeeding', 'speedDisplay',
  'offRouteBannerText', 'overlayStyle', 'statusText', 'hudTitle', 'showSearchPanel',
  'routeSummary', 'navRemainRatio', 'navRemainPercent', 'compassRotate', 'secureOk',
  'httpsUrl', 'inWeChat', 'browserHint', 'showWeChatGate', 'TRAVEL_MODES', 'DRIVE_STYLES',
  'debugConsoleOpen', 'toggleDebugConsole', 'travelModeBtnLabel', 'driveStyleBtnLabel',
  'formatDistance', 't', 'copyOpenUrl', 'onSearch', 'closeSearchPanel', 'selectPlace',
  'discardResumeSession', 'confirmResumeSession', 'discardClipboardOffer', 'confirmClipboardOffer',
  'onRerouteClick', 'setTravelMode', 'toggleVoiceMute', 'testRotateByHeading', 'togglePitch3D',
  'locateOnce', 'onNavigateClick', 'onRouteClick', 'chooseDriveStyle', 'onStartNavClick',
  'stopNavigation', 'clearDestination', 'applyHistoryItem',
]

fs.writeFileSync(
  path.join(dir, 'useNavMapLogic.js'),
  `/**
 * NavMap logic orchestrator — shared ctx + domain installers (plain ES modules).
 */
import { installNavMapState } from './installNavMapState.js'
import { installNavMapUi } from './useNavMapUi.js'
import { installNavClipboard } from './useNavClipboard.js'
import { installNavMapCore } from './useNavMapCore.js'
import { installNavCamera } from './useNavCamera.js'
import { installNavRouting } from './useNavRouting.js'
import { installNavSessionFlow } from './useNavSessionFlow.js'
import { formatDistance } from '../../lib/geo'
import { t } from '../../i18n'
import { TRAVEL_MODES, DRIVE_STYLES } from '../../lib/route'
import { debugConsoleOpen } from '../../lib/debugLog'

/**
 * @param {{ active?: boolean }} props
 * @param {(event: 'navigating-change' | 'map-ready', ...args: any[]) => void} emit
 */
export function useNavMapLogic(props, emit) {
  const ctx = { props, emit }

  installNavMapState(ctx)
  installNavMapUi(ctx)
  installNavClipboard(ctx)
  installNavMapCore(ctx)
  installNavCamera(ctx)
  installNavRouting(ctx)
  installNavSessionFlow(ctx)

  ctx.TRAVEL_MODES = TRAVEL_MODES
  ctx.DRIVE_STYLES = DRIVE_STYLES
  ctx.debugConsoleOpen = debugConsoleOpen
  ctx.formatDistance = formatDistance
  ctx.t = t

  return {
${returnKeys.map((k) => `    ${k}: ctx.${k},`).join('\n')}
  }
}
`,
)
console.log('wrote useNavMapLogic.js')
