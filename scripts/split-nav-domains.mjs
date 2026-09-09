/**
 * Safer split: rewrite identifiers to ctx.* but skip strings & object keys.
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

const IMPORT_IDS = new Set([
  'computed',
  'nextTick',
  'onMounted',
  'onUnmounted',
  'ref',
  'watch',
  'useDeviceHeading',
  'useGeolocation',
  'DEFAULT_CENTER',
  'DEFAULT_ZOOM',
  'LOCATED_ZOOM',
  'MAX_ZOOM',
  'NAV_ZOOM',
  'TIANDITU_TK',
  'getBehaviorPolicy',
  'onBehaviorPolicyChange',
  'basemapTileUrls',
  'getStoredBasemap',
  'onBasemapChange',
  'getStoredUiTheme',
  'onUiThemeChange',
  'getAutoViewLock',
  'onAutoViewLockChange',
  'getDefaultDriveStyle',
  'getDefaultTravelMode',
  'getVoiceEnabled',
  'onNavPrefsChange',
  'setVoiceEnabled',
  'LocationBeacon',
  'createDeviceWalkBehavior',
  'createOffRouteMonitor',
  'getNavVoiceSupportHint',
  'isNavVoiceMuted',
  'onNavVoicePageHidden',
  'onNavVoicePageVisible',
  'speakNav',
  'speakNavOverview',
  'stopNavVoice',
  'toggleNavVoiceMuted',
  'unlockNavVoice',
  'buildNavSessionSnapshot',
  'clearNavSession',
  'loadNavSession',
  'saveNavSession',
  'pushNavHistory',
  'formatDistance',
  'formatDuration',
  'haversineMeters',
  'reverseGeocode',
  'normalizeHeading',
  'shortestDelta',
  'unwrapHeading',
  'DRIVE_STYLES',
  'driveStyleLabel',
  'planByTravelMode',
  'TRAVEL_MODES',
  'travelModeLabel',
  'snapToRoute',
  'coordsToPath',
  'searchPlaces',
  'clipboardFingerprint',
  'extractAddressCandidate',
  'readClipboardTextDetailed',
  'debugConsoleOpen',
  'debugLog',
  'canUseBrowserGeolocation',
  'getBrowserOpenHint',
  'getHttpsUrl',
  'isWeChatBrowser',
  'setBootProgress',
  't',
  'locale',
  'props',
  'emit',
])

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

/** Rewrite identifiers to ctx.X, skipping strings/comments/object keys */
function rewriteToCtx(code, bagNames) {
  const names = [...bagNames].filter((n) => !IMPORT_IDS.has(n)).sort((a, b) => b.length - a.length)
  const nameSet = new Set(names)
  let out = ''
  let i = 0
  while (i < code.length) {
    const ch = code[i]
    // line comment
    if (ch === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i)
      const j = end === -1 ? code.length : end + 1
      out += code.slice(i, j)
      i = j
      continue
    }
    // block comment
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const j = end === -1 ? code.length : end + 2
      out += code.slice(i, j)
      i = j
      continue
    }
    // string
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (code[j] === quote) {
          j += 1
          break
        }
        if (quote === '`' && code[j] === '$' && code[j + 1] === '{') {
          // template expression — recursively rewrite inside
          out += code.slice(i, j + 2)
          i = j + 2
          let depth = 1
          let k = i
          while (k < code.length && depth > 0) {
            if (code[k] === '{') depth += 1
            else if (code[k] === '}') depth -= 1
            k += 1
          }
          const inner = code.slice(i, k - 1)
          out += rewriteToCtx(inner, bagNames)
          out += '}'
          i = k
          // continue scanning rest of template from i
          let t = i
          while (t < code.length) {
            if (code[t] === '\\') {
              t += 2
              continue
            }
            if (code[t] === '`') {
              t += 1
              break
            }
            if (code[t] === '$' && code[t + 1] === '{') break
            t += 1
          }
          if (code[i] === '$' && code[i + 1] === '{') {
            // another expr — loop handled by outer while via continue without advancing string end
            continue
          }
          out += code.slice(i, t)
          i = t
          break
        }
        j += 1
      }
      if (!(quote === '`')) {
        out += code.slice(i, j)
        i = j
      }
      continue
    }

    // identifier
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1
      while (j < code.length && /[A-Za-z0-9_$]/.test(code[j])) j += 1
      const id = code.slice(i, j)
      // object key? look ahead for :
      let k = j
      while (k < code.length && /\s/.test(code[k])) k += 1
      const isKey = code[k] === ':' && code[k + 1] !== ':'
      // member access left? look behind for .
      let p = i - 1
      while (p >= 0 && /\s/.test(code[p])) p -= 1
      const isMember = p >= 0 && code[p] === '.'
      // label?
      if (nameSet.has(id) && !isKey && !isMember) {
        out += `ctx.${id}`
      } else {
        out += id
      }
      i = j
      continue
    }

    out += ch
    i += 1
  }

  // fix declarations
  out = out.replace(/\basync function ctx\.(\w+)/g, 'ctx.$1 = async function $1')
  out = out.replace(/\bfunction ctx\.(\w+)/g, 'ctx.$1 = function $1')
  out = out.replace(/\bconst ctx\.(\w+)/g, 'ctx.$1')
  out = out.replace(/\blet ctx\.(\w+)/g, 'ctx.$1')
  return out
}

const chunks = splitChunks(body)
const stateChunks = []
const lifeChunks = []
const byOwner = Object.fromEntries(Object.keys(OWNERS).map((k) => [k, []]))

function ownerOf(name) {
  for (const [o, names] of Object.entries(OWNERS)) {
    if (names.includes(name)) return o
  }
  return null
}

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
  if (o) {
    byOwner[o].push(c)
    continue
  }
  stateChunks.push(c)
}

const bagNames = new Set()
for (const c of chunks) {
  if (c.name && !String(c.name).startsWith('watch@')) bagNames.add(c.name)
}
// ensure runtime fields
;[
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
].forEach((n) => bagNames.add(n))

const META = {
  useNavMapUi: 'HUD/status/speed/overlay helpers',
  useNavClipboard: 'clipboard watch/offer/confirm',
  useNavMapCore: 'map init, basemap/theme, resize, beacon',
  useNavCamera: 'pinCamera, follow, bearing, pitch3D, drag pause',
  useNavRouting: 'search, routes, travel mode, markers/lines',
  useNavSessionFlow: 'nav session, resume, history, onNavUpdate',
}

function slimImports(mod) {
  // keep full imports for simplicity (tree-shake unused)
  return imports
}

for (const [mod, list] of Object.entries(byOwner)) {
  const code = rewriteToCtx(list.map((c) => c.text).join('\n\n'), bagNames)
  const out = `${slimImports(mod)}

/**
 * ${META[mod]}
 * @param {Record<string, any>} ctx shared NavMap bag
 */
export function ${mod}(ctx) {
${code}
}
`
  fs.writeFileSync(path.join(dir, `${mod}.js`), out)
  console.log('wrote', mod, out.split(/\r?\n/).length)
}

const sessionPath = path.join(dir, 'useNavSessionFlow.js')
const life = rewriteToCtx(lifeChunks.map((c) => c.text).join('\n\n'), bagNames)
fs.appendFileSync(sessionPath, `\n// --- watches & lifecycle ---\n${life}\n`)

// Fix destructuring assigns in state: const { a, b } = foo() where a,b are bag names
let stateCode = stateChunks.map((c) => c.text).join('\n\n')
stateCode = rewriteToCtx(stateCode, bagNames)

// Fix broken destructure: const { ctx.lng, ctx.lat } = useGeolocation()
stateCode = stateCode.replace(/const \{([^}]+)\} = (useGeolocation|useDeviceHeading)\(\)/g, (_, inner, fn) => {
  const parts = inner.split(',').map((s) => s.trim()).filter(Boolean)
  const lines = [`const __tmp_${fn} = ${fn}()`]
  for (const p of parts) {
    // "ctx.lng" or "heading: ctx.deviceHeading"
    if (p.includes(':')) {
      const [left, right] = p.split(':').map((s) => s.trim())
      const src = left.startsWith('ctx.') ? left.slice(4) : left
      lines.push(`${right} = __tmp_${fn}.${src}`)
    } else {
      const name = p.startsWith('ctx.') ? p.slice(4) : p
      lines.push(`ctx.${name} = __tmp_${fn}.${name}`)
    }
  }
  return lines.join('\n')
})

const retNames = [...returnTmp.matchAll(/^\s{4}(\w+),?\s*$/gm)].map((m) => m[1])
const returnFixed = `return {\n${retNames.map((n) => `    ${n}: ctx.${n},`).join('\n')}\n  }`

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

${stateCode}

  useNavMapUi(ctx)
  useNavClipboard(ctx)
  useNavMapCore(ctx)
  useNavCamera(ctx)
  useNavRouting(ctx)
  useNavSessionFlow(ctx)

  ${returnFixed}
}
`

function expandCtxShorthand(code) {
  // { ctx.foo, ... } or { ctx.foo } → { foo: ctx.foo }
  return code.replace(/\{([^{}]*ctx\.\w+[^{}]*)\}/g, (full, inner) => {
    if (!inner.includes('ctx.')) return full
    const parts = []
    let buf = ''
    let depth = 0
    for (let i = 0; i < inner.length; i += 1) {
      const ch = inner[i]
      if (ch === '(' || ch === '[' || ch === '{') depth += 1
      if (ch === ')' || ch === ']' || ch === '}') depth -= 1
      if (ch === ',' && depth === 0) {
        parts.push(buf)
        buf = ''
        continue
      }
      buf += ch
    }
    if (buf.trim()) parts.push(buf)
    const mapped = parts.map((p) => {
      const t = p.trim()
      const m = t.match(/^ctx\.(\w+)$/)
      if (m) return `${m[1]}: ctx.${m[1]}`
      return t
    })
    return `{ ${mapped.join(', ')} }`
  })
}

// apply shorthand expand to all domain files + orch state
for (const mod of Object.keys(byOwner)) {
  const p = path.join(dir, `${mod}.js`)
  fs.writeFileSync(p, expandCtxShorthand(fs.readFileSync(p, 'utf8')))
}
fs.writeFileSync(path.join(dir, 'useNavMapLogic.js'), expandCtxShorthand(orch))
console.log('orchestrator', expandCtxShorthand(orch).split(/\r?\n/).length)
