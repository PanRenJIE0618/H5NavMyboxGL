/**
 * Split nav domains using with(ctx) via new Function (no identifier rewrite).
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('e:/Pan/H5NavMyBoxGL/src/composables/nav')
const body = fs.readFileSync(path.join(dir, '_body_tmp.js'), 'utf8')
const imports = fs.readFileSync(path.join(dir, '_imports_tmp.js'), 'utf8')
const returnTmp = fs.readFileSync(path.join(dir, '_return_tmp.js'), 'utf8')

const OWNERS = {
  useNavMapUi: [
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
  ],
  useNavClipboard: [
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
  ],
  useNavMapCore: [
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
  ],
  useNavCamera: [
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
  ],
  useNavRouting: [
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
  ],
  useNavSessionFlow: [
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
  ],
}

const META = {
  useNavMapUi: 'HUD/status/speed/overlay helpers',
  useNavClipboard: 'clipboard watch/offer/confirm',
  useNavMapCore: 'map init, basemap/theme, resize, beacon',
  useNavCamera: 'pinCamera, follow, bearing, pitch3D, drag pause',
  useNavRouting: 'search, routes, travel mode, markers/lines',
  useNavSessionFlow: 'nav session, resume, history, onNavUpdate',
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
      name = t.match(/async function\s+([A-Za-z0-9_]+)/)?.[1]
    } else if (t.startsWith('function ')) {
      kind = 'function'
      name = t.match(/function\s+([A-Za-z0-9_]+)/)?.[1]
    } else if (t.startsWith('const ')) {
      kind = 'const'
      name = t.match(/const\s+([A-Za-z0-9_]+)/)?.[1]
    } else if (t.startsWith('let ')) {
      kind = 'let'
      name = t.match(/let\s+([A-Za-z0-9_]+)/)?.[1]
    } else if (t.startsWith('watch(') || t.startsWith('watch (')) {
      kind = 'watch'
      name = `watch@${i}`
    } else if (t.startsWith('onMounted')) {
      kind = 'lifecycle'
      name = 'onMounted'
    } else if (t.startsWith('onUnmounted')) {
      kind = 'lifecycle'
      name = 'onUnmounted'
    } else if (t.startsWith('onBehaviorPolicyChange')) {
      kind = 'side'
      name = 'onBehaviorPolicyChange'
    }

    let j = i
    let brace = 0
    let paren = 0
    let seen = false
    for (; j < lines.length; j += 1) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          brace += 1
          seen = true
        } else if (ch === '}') brace -= 1
        else if (ch === '(') {
          paren += 1
          seen = true
        } else if (ch === ')') paren -= 1
      }
      if (kind === 'function' || kind === 'watch' || kind === 'lifecycle' || kind === 'side') {
        if (seen && brace === 0 && paren === 0) {
          j += 1
          break
        }
      } else if (kind === 'const' || kind === 'let') {
        if (seen && brace === 0 && paren === 0) {
          j += 1
          break
        }
        if (!seen && /;\s*$/.test(lines[j])) {
          j += 1
          break
        }
      } else {
        j += 1
        break
      }
    }
    chunks.push({ name, kind, text: lines.slice(blockStart, j).join('\n') })
    i = Math.max(j, i + 1)
  }
  return chunks
}

function ownerOf(name) {
  for (const [o, names] of Object.entries(OWNERS)) {
    if (names.includes(name)) return o
  }
  return null
}

const chunks = splitChunks(body)
const stateChunks = []
const lifeChunks = []
const byOwner = Object.fromEntries(Object.keys(OWNERS).map((k) => [k, []]))

for (const c of chunks) {
  if (c.kind === 'watch' || c.kind === 'lifecycle') {
    lifeChunks.push(c)
    continue
  }
  if (c.kind === 'side') {
    byOwner.useNavMapUi.push(c)
    continue
  }
  const o = c.name ? ownerOf(c.name) : null
  if (o) byOwner[o].push(c)
  else stateChunks.push(c)
}

/** Convert top-level decls so they write through to ctx; keep inner const/let intact */
function prepareForWith(chunkList) {
  return chunkList
    .map((c) => {
      let text = c.text
      if (c.kind === 'function') {
        text = text.replace(
          /^([ \t]*(?:\/\*[\s\S]*?\*\/\s*)?)(async\s+)?function\s+(\w+)/,
          (_, pre, asyncKw, name) => `${pre}ctx.${name} = ${asyncKw || ''}function ${name}`,
        )
      } else if (c.kind === 'const' || c.kind === 'let') {
        text = text.replace(
          /^([ \t]*(?:\/\*[\s\S]*?\*\/\s*)?)(?:const|let)\s+(\w+)\s*=/,
          (_, pre, name) => `${pre}ctx.${name} =`,
        )
      } else if (c.kind === 'side') {
        // onBehaviorPolicyChange(() => { policyTick.value += 1 }) — policyTick must be ctx
        // left as-is; with(ctx) resolves policyTick
      }
      return text
    })
    .join('\n\n')
}

function buildInstaller(modName, chunkList, extraChunks = []) {
  const all = [...chunkList, ...extraChunks]
  const prepared = prepareForWith(all)

  // Escape for embedding in template literal? We'll write as .part.js?raw instead.
  const partName = `${modName}.part.js`
  fs.writeFileSync(path.join(dir, partName), prepared)

  const file = `${imports}

import part from './${partName}?raw'

/**
 * ${META[modName]}
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function ${modName}(ctx) {
  // non-strict Function so \`with(ctx)\` resolves free vars onto the bag
  const run = new Function(
    'ctx',
    'vue',
    'libs',
    \`
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
    with (ctx) {
      \${part}
    }
    \`,
  )
  run(ctx, { computed, nextTick, onMounted, onUnmounted, ref, watch }, {
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
  })
}
`

  // The above embedding of ${part} inside template in the generator is wrong.
  // Write installer that concatenates part string instead.
  const installer = `${imports}

import part from './${partName}?raw'

/**
 * ${META[modName]}
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function ${modName}(ctx) {
  const run = new Function(
    'ctx',
    'vue',
    'libs',
    'part',
    [
      'const { computed, nextTick, onMounted, onUnmounted, ref, watch } = vue',
      'const {',
      '  DEFAULT_CENTER, DEFAULT_ZOOM, LOCATED_ZOOM, MAX_ZOOM, NAV_ZOOM, TIANDITU_TK,',
      '  getBehaviorPolicy, onBehaviorPolicyChange,',
      '  basemapTileUrls, getStoredBasemap, onBasemapChange,',
      '  getStoredUiTheme, onUiThemeChange,',
      '  getAutoViewLock, onAutoViewLockChange,',
      '  getDefaultDriveStyle, getDefaultTravelMode, getVoiceEnabled, onNavPrefsChange, setVoiceEnabled,',
      '  LocationBeacon, createDeviceWalkBehavior, createOffRouteMonitor,',
      '  getNavVoiceSupportHint, isNavVoiceMuted, onNavVoicePageHidden, onNavVoicePageVisible,',
      '  speakNav, speakNavOverview, stopNavVoice, toggleNavVoiceMuted, unlockNavVoice,',
      '  buildNavSessionSnapshot, clearNavSession, loadNavSession, saveNavSession, pushNavHistory,',
      '  formatDistance, formatDuration, haversineMeters, reverseGeocode,',
      '  normalizeHeading, shortestDelta, unwrapHeading,',
      '  DRIVE_STYLES, driveStyleLabel, planByTravelMode, TRAVEL_MODES, travelModeLabel,',
      '  snapToRoute, coordsToPath, searchPlaces,',
      '  clipboardFingerprint, extractAddressCandidate, readClipboardTextDetailed,',
      '  debugConsoleOpen, debugLog,',
      '  canUseBrowserGeolocation, getBrowserOpenHint, getHttpsUrl, isWeChatBrowser,',
      '  setBootProgress, t, locale,',
      '  useDeviceHeading, useGeolocation,',
      '} = libs',
      'const props = ctx.props',
      'const emit = ctx.emit',
      'with (ctx) {',
      'eval(part)',
      '}',
    ].join('\\n'),
  )
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
      useDeviceHeading, useGeolocation,
    },
    part,
  )
}
`
  fs.writeFileSync(path.join(dir, `${modName}.js`), installer)
  console.log('wrote', modName, 'part lines', prepared.split(/\n/).length)
}

for (const [mod, list] of Object.entries(byOwner)) {
  const extra = mod === 'useNavSessionFlow' ? lifeChunks : []
  buildInstaller(mod, list, extra)
}

// State stays in orchestrator as normal JS (no with needed for init)
const stateCode = stateChunks.map((c) => c.text).join('\n\n')

const retNames = [...returnTmp.matchAll(/^\s{4}(\w+),?\s*$/gm)].map((m) => m[1])
const returnFixed = `return {\n${retNames.map((n) => `    ${n}: ctx.${n},`).join('\n')}\n  }`

// State init must put fields on ctx
let stateOnCtx = stateCode
stateOnCtx = stateOnCtx.replace(/^(\s*)async function\s+(\w+)/gm, '$1ctx.$2 = async function $2')
stateOnCtx = stateOnCtx.replace(/^(\s*)function\s+(\w+)/gm, '$1ctx.$2 = function $2')
stateOnCtx = stateOnCtx.replace(/^(\s*)const\s+(\w+)\s*=/gm, '$1ctx.$2 =')
stateOnCtx = stateOnCtx.replace(/^(\s*)let\s+(\w+)\s*=/gm, '$1ctx.$2 =')

// Fix geo/heading destructuring onto ctx
stateOnCtx = stateOnCtx.replace(
  /ctx\.\w+\s*=\s*useGeolocation\(\)/,
  `Object.assign(ctx, (({
  lng, lat, speed, course, loading, error, watching, client, locate, watchLocation, restartWatch
}) => ({ lng, lat, speed, course, loading, error, watching, client, locate, watchLocation, restartWatch }))(useGeolocation()))`,
)

// The above might not match because rewrite made `ctx.{` broken. Check actual state text:
fs.writeFileSync(path.join(dir, '_state_raw.js'), stateCode)

const orch = `${imports}
import { useNavMapUi } from './useNavMapUi.js'
import { useNavClipboard } from './useNavClipboard.js'
import { useNavMapCore } from './useNavMapCore.js'
import { useNavCamera } from './useNavCamera.js'
import { useNavRouting } from './useNavRouting.js'
import { useNavSessionFlow } from './useNavSessionFlow.js'

/**
 * NavMap logic orchestrator — shared ctx + domain modules.
 * @param {{ active?: boolean }} props
 * @param {(event: string, ...args: any[]) => void} emit
 */
export function useNavMapLogic(props, emit) {
  const ctx = { props, emit }

  // --- shared reactive + runtime state ---
${stateCode
  .split(/\r?\n/)
  .map((line) => {
    // prefix top-level const/let onto ctx via transforming known patterns after write
    return line
  })
  .join('\n')}

  // bind state locals onto ctx for domain modules
  Object.assign(ctx, {
${stateChunks
  .filter((c) => c.name)
  .map((c) => `    ${c.name},`)
  .join('\n')}
  })

  useNavMapUi(ctx)
  useNavClipboard(ctx)
  useNavMapCore(ctx)
  useNavCamera(ctx)
  useNavRouting(ctx)
  useNavSessionFlow(ctx)

  ${returnFixed.replace(/ctx\./g, '') /* fix below */}
}
`

// Better orchestrator: keep state as local bindings, Object.assign to ctx
const stateNames = stateChunks.filter((c) => c.name).map((c) => c.name)
const orch2 = `${imports}
import { useNavMapUi } from './useNavMapUi.js'
import { useNavClipboard } from './useNavClipboard.js'
import { useNavMapCore } from './useNavMapCore.js'
import { useNavCamera } from './useNavCamera.js'
import { useNavRouting } from './useNavRouting.js'
import { useNavSessionFlow } from './useNavSessionFlow.js'

/**
 * NavMap logic orchestrator — shared ctx + domain modules.
 * @param {{ active?: boolean }} props
 * @param {(event: string, ...args: any[]) => void} emit
 */
export function useNavMapLogic(props, emit) {
${stateCode}

  const ctx = {
    props,
    emit,
${stateNames.map((n) => `    ${n},`).join('\n')}
  }

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

fs.writeFileSync(path.join(dir, 'useNavMapLogic.js'), orch2)
console.log('orchestrator lines', orch2.split(/\n/).length)
console.log('state names', stateNames.length)
