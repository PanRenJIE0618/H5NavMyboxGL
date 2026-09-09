/**
 * Create domain modules: *.part.js (top-level stmts) + *.js installer using with(ctx).
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('e:/Pan/H5NavMyBoxGL/src/composables/nav')
const body = fs.readFileSync(path.join(dir, '_body_tmp.js'), 'utf8')
const imports = fs.readFileSync(path.join(dir, '_imports_tmp.js'), 'utf8')
const returnTmp = fs.readFileSync(path.join(dir, '_return_tmp.js'), 'utf8').trim()
const ret = returnTmp.endsWith('}')
  ? (() => {
      const w = returnTmp.slice(0, returnTmp.lastIndexOf('}')).trimEnd()
      return w.endsWith('}') ? w : returnTmp
    })()
  : returnTmp

const OWNERS = {
  useNavMapUi: new Set([
    'toggleDebugConsole',
    'travelModeBtnLabel',
    'driveStyleBtnLabel',
    'headingText',
    'coordText',
    'policyTick',
    'speedKmh',
    'speedLimitKmh',
    'isSpeeding',
    'speedDisplay',
    'offRouteBannerText',
    'overlayStyle',
    'lastSpeedingAlertAt',
    'statusText',
    'hudTitle',
    'showSearchPanel',
    'routeSummary',
    'navRemainRatio',
    'navRemainPercent',
    'estimateRemainingSeconds',
    'compassRotate',
    'onBehaviorPolicyChange',
  ]),
  useNavClipboard: new Set([
    'lastOfferedClipboardFp',
    'dismissedClipboardFp',
    'lastIgnoredClipboardFp',
    'clipboardPollTimer',
    'clipboardCheckInFlight',
    'clipboardGestureBound',
    'onClipboardUserGesture',
    'startClipboardWatch',
    'stopClipboardWatch',
    'bindClipboardGestureHook',
    'unbindClipboardGestureHook',
    'checkClipboardForAddress',
    'discardClipboardOffer',
    'confirmClipboardOffer',
  ]),
  useNavMapCore: new Set([
    'resolveOverlayEl',
    'resolveMaxZoom',
    'refreshMapSize',
    'syncOverlayClearance',
    'bindOverlayObservers',
    'waitForStableMapSize',
    'replaceRasterTiles',
    'applyBasemapToMap',
    'applyMapThemeStyle',
    'initMap',
  ]),
  useNavCamera: new Set([
    'pauseLocationTicksByDrag',
    'scheduleResumeAfterDragIdle',
    'enableViewLockAfterDragIdle',
    'clearLocationResumeTimer',
    'clearSettleTimers',
    'pinCamera',
    'scheduleCameraSettle',
    'onMapContainerResize',
    'syncBeaconHeading',
    'onMapDragStart',
    'onMapDragEnd',
    'setFollowUser',
    'onAutoViewLockPrefChange',
    'syncPitch3DFromMap',
    'togglePitch3D',
    'locateOnce',
    'noteHeadingSample',
    'resolveCourseDeg',
    'headingUpWanted',
    'syncMapBearingTarget',
    'testRotateByHeading',
    'ensureBearingLoop',
    'applyHeadingDragLock',
    'onLocationTick',
    'applyNavCamera',
    'copyOpenUrl',
    'applyPositionToMap',
    'scheduleSoftFollowPan',
  ]),
  useNavRouting: new Set([
    'pathToGeoJSON',
    'fitPathBounds',
    'maxZoomForRouteSpan',
    'scheduleFitRouteOverview',
    'onSearch',
    'closeSearchPanel',
    'selectPlace',
    'onNavigateClick',
    'onRouteClick',
    'prepareDualRoutes',
    'setTravelMode',
    'chooseDriveStyle',
    'setDestMarker',
    'ensureRouteArrowImage',
    'routeLineWidthExpr',
    'routeLayerIds',
    'applyRoutePaint',
    'addRouteLayers',
    'setRouteLine',
    'drawDualRoutes',
    'syncRouteLineStyles',
    'bringRouteLineToFront',
    'updateNavRoute',
    'clearDestMarker',
    'removeRouteLine',
    'clearIdleRouteLines',
    'clearAllRouteLines',
    'clearDestination',
  ]),
  useNavSessionFlow: new Set([
    'beginNavHistoryMeta',
    'commitNavHistory',
    'applyHistoryItem',
    'startNavigation',
    'onStartNavClick',
    'collectNavSessionState',
    'persistNavSession',
    'rebindNavRuntime',
    'onPageVisibilityChange',
    'onPageShow',
    'onWindowFocus',
    'bindPageLifecycle',
    'unbindPageLifecycle',
    'maybeOfferResumeSession',
    'discardResumeSession',
    'confirmResumeSession',
    'stopNavigation',
    'onNavUpdate',
    'toggleVoiceMute',
    'applyNavPrefs',
    'onRerouteClick',
    'rerouteAfterYaw',
  ]),
}

const META = {
  useNavMapUi: 'statusText, hudTitle, overlayStyle, speed, labels',
  useNavClipboard: 'clipboard watch / offer / confirm',
  useNavMapCore: 'map init, basemap/theme, resize, beacon',
  useNavCamera: 'pinCamera, follow, bearing, pitch3D, drag pause',
  useNavRouting: 'search, dual routes, travel mode, markers/lines',
  useNavSessionFlow: 'start/stop nav, session, history, onNavUpdate',
}

function splitChunks(code) {
  const lines = code.split(/\r?\n/)
  const chunks = []
  let i = 0
  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i += 1
    if (i >= lines.length) break
    const blockStart = i
    while (i < lines.length) {
      const t = lines[i].trim()
      if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('/**')) {
        if (t.startsWith('/*') && !t.includes('*/')) {
          while (i < lines.length && !lines[i].includes('*/')) i += 1
        }
        i += 1
        continue
      }
      break
    }
    if (i >= lines.length) break
    const t = lines[i].trim()
    let name = null
    let kind = 'other'
    if (t.startsWith('async function ')) {
      kind = 'function'
      name = t.match(/async function\s+(\w+)/)[1]
    } else if (t.startsWith('function ')) {
      kind = 'function'
      name = t.match(/function\s+(\w+)/)[1]
    } else if (t.startsWith('const ')) {
      kind = 'const'
      name = t.match(/const\s+(\w+)/)?.[1]
    } else if (t.startsWith('let ')) {
      kind = 'let'
      name = t.match(/let\s+(\w+)/)?.[1]
    } else if (t.startsWith('watch')) {
      kind = 'watch'
      name = null
    } else if (t.startsWith('onMounted')) {
      kind = 'life'
      name = 'onMounted'
    } else if (t.startsWith('onUnmounted')) {
      kind = 'life'
      name = 'onUnmounted'
    } else if (t.startsWith('onBehaviorPolicyChange')) {
      kind = 'side'
      name = 'onBehaviorPolicyChange'
    }

    let j = i
    let brace = 0
    let paren = 0
    let seen = false
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          brace++
          seen = true
        } else if (ch === '}') brace--
        else if (ch === '(') {
          paren++
          seen = true
        } else if (ch === ')') paren--
      }
      if (['function', 'watch', 'life', 'side'].includes(kind)) {
        if (seen && brace === 0 && paren === 0) {
          j++
          break
        }
      } else if (kind === 'const' || kind === 'let') {
        if (seen && brace === 0 && paren === 0) {
          j++
          break
        }
        // ASI: single-line decl without braces/parens ends at EOL
        if (!seen && brace === 0 && paren === 0) {
          j++
          break
        }
      } else {
        j++
        break
      }
    }
    chunks.push({ name, kind, text: lines.slice(blockStart, j).join('\n') })
    i = Math.max(j, i + 1)
  }
  return chunks
}

function ownerOf(name, kind) {
  if (kind === 'watch' || kind === 'life') return 'useNavSessionFlow'
  if (kind === 'side') return 'useNavMapUi'
  if (!name) return null
  for (const [o, set] of Object.entries(OWNERS)) {
    if (set.has(name)) return o
  }
  return null
}

function promoteTopDecl(chunk) {
  let text = chunk.text
  if (chunk.kind === 'function') {
    text = text.replace(
      /^([\s\S]*?)(async\s+)?function\s+(\w+)/,
      (_, pre, a, n) => `${pre}ctx.${n} = ${a || ''}function ${n}`,
    )
  } else if (chunk.kind === 'const' || chunk.kind === 'let') {
    // destructuring: const { a, b: c } = expr() → assign each onto ctx
    const destr = text.match(/^([\s\S]*?)(?:const|let)\s*\{([\s\S]*?)\}\s*=\s*([\s\S]+)$/)
    if (destr) {
      const [, pre, inner, expr] = destr
      const pairs = []
      for (const raw of inner.split(',')) {
        const p = raw.trim()
        if (!p) continue
        if (p.includes(':')) {
          const [left, right] = p.split(':').map((s) => s.trim())
          pairs.push(`ctx.${right} = __tmp.${left}`)
        } else {
          pairs.push(`ctx.${p} = __tmp.${p}`)
        }
      }
      text = `${pre}{\n  const __tmp = ${expr.trim().replace(/;?\s*$/, '')}\n  ${pairs.join('\n  ')}\n}`
    } else {
      text = text.replace(/^([\s\S]*?)(?:const|let)\s+(\w+)\s*=/, (_, pre, n) => `${pre}ctx.${n} =`)
    }
  }
  return text
}

const chunks = splitChunks(body)
const byOwner = Object.fromEntries(Object.keys(OWNERS).map((k) => [k, []]))
const stateChunks = []

for (const c of chunks) {
  const o = ownerOf(c.name, c.kind)
  if (o) byOwner[o].push(c)
  else stateChunks.push(c)
}

const depsDestructure = `
  const { computed, nextTick, onMounted, onUnmounted, ref, watch } = vue
  const {
    DEFAULT_CENTER, DEFAULT_ZOOM, LOCATED_ZOOM, MAX_ZOOM, NAV_ZOOM, TIANDITU_TK,
    getBehaviorPolicy, onBehaviorPolicyChange,
    basemapTileUrls, getStoredBasemap, onBasemapChange,
    getStoredUiTheme, onUiThemeChange,
    getAutoViewLock, onAutoViewLockChange,
    getDefaultDriveStyle, getDefaultTravelMode, getVoiceEnabled, onNavPrefsChange, setVoiceEnabled,
    LocationBeacon, createDeviceWalkBehavior, createOffRouteMonitor,
    getNavVoiceSupportHint, isNavVoiceMuted, onNavVoicePageHidden, onNavVoicePageVisible,
    speakNav, speakNavOverview, stopNavVoice, toggleNavVoiceMuted, unlockNavVoice,
    buildNavSessionSnapshot, clearNavSession, loadNavSession, saveNavSession, pushNavHistory,
    formatDistance, formatDuration, haversineMeters, reverseGeocode,
    normalizeHeading, shortestDelta, unwrapHeading,
    DRIVE_STYLES, driveStyleLabel, planByTravelMode, TRAVEL_MODES, travelModeLabel,
    snapToRoute, coordsToPath, searchPlaces,
    clipboardFingerprint, extractAddressCandidate, readClipboardTextDetailed,
    debugConsoleOpen, debugLog,
    canUseBrowserGeolocation, getBrowserOpenHint, getHttpsUrl, isWeChatBrowser,
    setBootProgress, t, locale,
    useDeviceHeading, useGeolocation,
  } = libs
  const props = ctx.props
  const emit = ctx.emit
`

for (const [mod, list] of Object.entries(byOwner)) {
  const part = list.map(promoteTopDecl).join('\n\n')
  fs.writeFileSync(path.join(dir, `${mod}.part.js`), part)

  const js = `${imports}

import part from './${mod}.part.js?raw'

/**
 * ${META[mod]}
 * @param {Record<string, any>} ctx
 */
export function ${mod}(ctx) {
  const run = new Function('ctx', 'vue', 'libs', 'part', [
${depsDestructure
  .split('\n')
  .map((l) => `    ${JSON.stringify(l)},`)
  .join('\n')}
    'with (ctx) {',
    '  eval(part)',
    '}',
  ].join('\\n'))

  run(
    ctx,
    { computed, nextTick, onMounted, onUnmounted, ref, watch },
    {
      DEFAULT_CENTER, DEFAULT_ZOOM, LOCATED_ZOOM, MAX_ZOOM, NAV_ZOOM, TIANDITU_TK,
      getBehaviorPolicy, onBehaviorPolicyChange,
      basemapTileUrls, getStoredBasemap, onBasemapChange,
      getStoredUiTheme, onUiThemeChange,
      getAutoViewLock, onAutoViewLockChange,
      getDefaultDriveStyle, getDefaultTravelMode, getVoiceEnabled, onNavPrefsChange, setVoiceEnabled,
      LocationBeacon, createDeviceWalkBehavior, createOffRouteMonitor,
      getNavVoiceSupportHint, isNavVoiceMuted, onNavVoicePageHidden, onNavVoicePageVisible,
      speakNav, speakNavOverview, stopNavVoice, toggleNavVoiceMuted, unlockNavVoice,
      buildNavSessionSnapshot, clearNavSession, loadNavSession, saveNavSession, pushNavHistory,
      formatDistance, formatDuration, haversineMeters, reverseGeocode,
      normalizeHeading, shortestDelta, unwrapHeading,
      DRIVE_STYLES, driveStyleLabel, planByTravelMode, TRAVEL_MODES, travelModeLabel,
      snapToRoute, coordsToPath, searchPlaces,
      clipboardFingerprint, extractAddressCandidate, readClipboardTextDetailed,
      debugConsoleOpen, debugLog,
      canUseBrowserGeolocation, getBrowserOpenHint, getHttpsUrl, isWeChatBrowser,
      setBootProgress, t, locale,
    },
    part,
  )
}
`
  fs.writeFileSync(path.join(dir, `${mod}.js`), js)
  console.log(mod, 'chunks', list.length, 'part lines', part.split('\n').length)
}

const stateCode = stateChunks.map((c) => c.text).join('\n\n')
const stateNames = stateChunks.filter((c) => c.name).map((c) => c.name)

// Also need names created inside domains for return — they're on ctx after install
const retNames = [...ret.matchAll(/^\s{4}(\w+),?\s*$/gm)].map((m) => m[1])

const orch = `${imports}
import { useNavMapUi } from './useNavMapUi.js'
import { useNavClipboard } from './useNavClipboard.js'
import { useNavMapCore } from './useNavMapCore.js'
import { useNavCamera } from './useNavCamera.js'
import { useNavRouting } from './useNavRouting.js'
import { useNavSessionFlow } from './useNavSessionFlow.js'

/**
 * NavMap logic orchestrator — shared state bag + domain modules.
 * @param {{ active?: boolean }} props
 * @param {(event: string, ...args: any[]) => void} emit
 */
export function useNavMapLogic(props, emit) {
${stateCode}

  const ctx = {
    props,
    emit,
${stateNames.map((n) => `    get ${n}() { return ${n} }, set ${n}(v) { ${n} = v },`).join('\n')}
  }

  // Plain assign for refs/objects (getters above fail for const bindings — use direct refs)
  Object.assign(ctx, {
${stateNames.map((n) => `    ${n},`).join('\n')}
  })

  useNavMapUi(ctx)
  useNavClipboard(ctx)
  useNavMapCore(ctx)
  useNavCamera(ctx)
  useNavRouting(ctx)
  useNavSessionFlow(ctx)

  return {
${retNames.map((n) => `    ${n}: ctx.${n},`).join('\n')}
  }
}
`

// Fix: const bindings can't use setters like that. Just Object.assign is enough for initial
// snapshot, BUT mutations to `let map` in domains via with(ctx) set ctx.map — local `map` in
// orchestrator stays null. So all runtime mutables MUST live only on ctx, not as local lets.

// Re-init mutables directly on ctx in orchestrator instead of local let/const for lets.
const orchFixed = `${imports}
import { useNavMapUi } from './useNavMapUi.js'
import { useNavClipboard } from './useNavClipboard.js'
import { useNavMapCore } from './useNavMapCore.js'
import { useNavCamera } from './useNavCamera.js'
import { useNavRouting } from './useNavRouting.js'
import { useNavSessionFlow } from './useNavSessionFlow.js'

/**
 * NavMap logic orchestrator — shared state bag + domain modules.
 * @param {{ active?: boolean }} props
 * @param {(event: string, ...args: any[]) => void} emit
 */
export function useNavMapLogic(props, emit) {
  const ctx = { props, emit }

  // Evaluate state init inside with(ctx) so let/const land on ctx
  const statePart = ${JSON.stringify(stateChunks.map(promoteTopDecl).join('\n\n'))}
  new Function('ctx', 'vue', 'libs', 'part', [
${depsDestructure
  .split('\n')
  .map((l) => `    ${JSON.stringify(l)},`)
  .join('\n')}
    'with (ctx) { eval(part) }',
  ].join('\\n'))(
    ctx,
    { computed, nextTick, onMounted, onUnmounted, ref, watch },
    {
      DEFAULT_CENTER, DEFAULT_ZOOM, LOCATED_ZOOM, MAX_ZOOM, NAV_ZOOM, TIANDITU_TK,
      getBehaviorPolicy, onBehaviorPolicyChange,
      basemapTileUrls, getStoredBasemap, onBasemapChange,
      getStoredUiTheme, onUiThemeChange,
      getAutoViewLock, onAutoViewLockChange,
      getDefaultDriveStyle, getDefaultTravelMode, getVoiceEnabled, onNavPrefsChange, setVoiceEnabled,
      LocationBeacon, createDeviceWalkBehavior, createOffRouteMonitor,
      getNavVoiceSupportHint, isNavVoiceMuted, onNavVoicePageHidden, onNavVoicePageVisible,
      speakNav, speakNavOverview, stopNavVoice, toggleNavVoiceMuted, unlockNavVoice,
      buildNavSessionSnapshot, clearNavSession, loadNavSession, saveNavSession, pushNavHistory,
      formatDistance, formatDuration, haversineMeters, reverseGeocode,
      normalizeHeading, shortestDelta, unwrapHeading,
      DRIVE_STYLES, driveStyleLabel, planByTravelMode, TRAVEL_MODES, travelModeLabel,
      snapToRoute, coordsToPath, searchPlaces,
      clipboardFingerprint, extractAddressCandidate, readClipboardTextDetailed,
      debugConsoleOpen, debugLog,
      canUseBrowserGeolocation, getBrowserOpenHint, getHttpsUrl, isWeChatBrowser,
      setBootProgress, t, locale,
      useDeviceHeading, useGeolocation,
    },
    statePart,
  )

  useNavMapUi(ctx)
  useNavClipboard(ctx)
  useNavMapCore(ctx)
  useNavCamera(ctx)
  useNavRouting(ctx)
  useNavSessionFlow(ctx)

  return {
${retNames.map((n) => `    ${n}: ctx.${n},`).join('\n')}
  }
}
`

fs.writeFileSync(path.join(dir, 'useNavMapLogic.js'), orchFixed)

console.log('state chunks', stateChunks.length)
console.log('orchestrator written')
