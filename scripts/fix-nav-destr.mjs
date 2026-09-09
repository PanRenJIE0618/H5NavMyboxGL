/**
 * Fix same-module destructure bugs + leftover bare mutables/fns.
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('e:/Pan/H5NavMyBoxGL/src/composables/nav')
const files = [
  'useNavMapUi.js',
  'useNavClipboard.js',
  'useNavMapCore.js',
  'useNavCamera.js',
  'useNavRouting.js',
  'useNavSessionFlow.js',
]

const ALWAYS_CTX = [
  'ROUTE_COLOR_ACTIVE',
  'ROUTE_COLOR_IDLE',
  'ROUTE_CASING_COLOR',
  'ROUTE_OPACITY_ACTIVE',
  'ROUTE_OPACITY_IDLE',
  'ROUTE_ARROW_IMAGE_ID',
  'routeLayerIds',
  'routeLineWidthExpr',
  'pathToGeoJSON',
  'ensureRouteArrowImage',
  'applyRoutePaint',
  'addRouteLayers',
  'setRouteLine',
  'bringRouteLineToFront',
  'removeRouteLine',
  'clearAllRouteLines',
  'clearIdleRouteLines',
  'clearDestMarker',
  'drawDualRoutes',
  'syncRouteLineStyles',
  'updateNavRoute',
  'setDestMarker',
  'fitPathBounds',
  'scheduleFitRouteOverview',
  'maxZoomForRouteSpan',
  'prepareDualRoutes',
  'selectPlace',
  'onSearch',
  'startNavigation',
  'stopNavigation',
  'persistNavSession',
  'collectNavSessionState',
  'beginNavHistoryMeta',
  'commitNavHistory',
  'rebindNavRuntime',
  'applyNavCamera',
  'applyPositionToMap',
  'applyHeadingDragLock',
  'syncMapBearingTarget',
  'resolveCourseDeg',
  'noteHeadingSample',
  'ensureBearingLoop',
  'headingUpWanted',
  'clearLocationResumeTimer',
  'clearSettleTimers',
  'pauseLocationTicksByDrag',
  'scheduleResumeAfterDragIdle',
  'enableViewLockAfterDragIdle',
  'pinCamera',
  'scheduleCameraSettle',
  'refreshMapSize',
  'resolveMaxZoom',
  'waitForStableMapSize',
  'syncOverlayClearance',
  'resolveOverlayEl',
  'syncBeaconHeading',
  'syncPitch3DFromMap',
  'onMapDragStart',
  'onMapDragEnd',
  'onMapContainerResize',
  'onLocationTick',
  'onNavUpdate',
  'estimateRemainingSeconds',
  'maybeOfferResumeSession',
  'checkClipboardForAddress',
  'startClipboardWatch',
  'stopClipboardWatch',
  'bindClipboardGestureHook',
  'unbindClipboardGestureHook',
  'applyBasemapToMap',
  'applyMapThemeStyle',
  'replaceRasterTiles',
  'bindOverlayObservers',
  'setFollowUser',
  'onAutoViewLockPrefChange',
  'applyNavPrefs',
  'rerouteAfterYaw',
  'scheduleSoftFollowPan',
]

function rewriteBare(code, names) {
  const set = new Set(names.sort((a, b) => b.length - a.length))
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
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (quote === '`' && code[j] === '$' && code[j + 1] === '{') {
          // fall through simple: copy until next unescaped quote for non-template; for template copy char by char
          break
        }
        if (code[j] === quote) {
          j++
          break
        }
        j++
      }
      if (quote !== '`' || code[j - 1] === quote) {
        // if we broke early for template, handle below
        if (!(quote === '`' && code.slice(i, j).includes('${'))) {
          out += code.slice(i, j)
          i = j
          continue
        }
      }
      // template with expr — naive char copy with ${} recursion
      out += '`'
      i++
      while (i < code.length) {
        if (code[i] === '\\') {
          out += code.slice(i, i + 2)
          i += 2
          continue
        }
        if (code[i] === '`') {
          out += '`'
          i++
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
          out += rewriteBare(code.slice(start, i), names)
          out += '}'
          i++
          continue
        }
        out += code[i]
        i++
      }
      continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1
      while (j < code.length && /[\w$]/.test(code[j])) j++
      const id = code.slice(i, j)
      let k = j
      while (k < code.length && /\s/.test(code[k])) k++
      const isKey = code[k] === ':' && code[k + 1] !== '='
      let p = i - 1
      while (p >= 0 && /\s/.test(code[p])) p--
      const isMember = p >= 0 && code[p] === '.'
      let q = p
      while (q >= 0 && /\s/.test(code[q])) q--
      let end = q
      while (q >= 0 && /[\w$]/.test(code[q])) q--
      const prev = code.slice(q + 1, end + 1)
      const isFnName = prev === 'function'
      if (set.has(id) && !isKey && !isMember && !isFnName) out += `ctx.${id}`
      else out += id
      i = j
      continue
    }
    out += ch
    i++
  }
  return out.replace(/\bctx\.ctx\./g, 'ctx.')
}

for (const file of files) {
  let code = fs.readFileSync(path.join(dir, file), 'utf8')

  // Collect names created in this file
  const created = new Set()
  for (const m of code.matchAll(/\bctx\.([A-Za-z_][\w]*)\s*=/g)) created.add(m[1])

  // Rebuild destructure: keep only names not created here
  code = code.replace(/export function (\w+)\(ctx\) \{\n  const \{([\s\S]*?)\} = ctx\n\n/, (full, fn, inner) => {
    const names = inner
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const keep = names.filter((n) => !created.has(n))
    const drop = names.filter((n) => created.has(n))
    console.log(file, 'drop from destr:', drop.join(', ') || '(none)')
    if (!keep.length) return `export function ${fn}(ctx) {\n`
    return `export function ${fn}(ctx) {\n  const {\n    ${keep.join(',\n    ')},\n  } = ctx\n\n`
  })

  // Rewrite bare usages of created-in-this-file names + always-ctx list
  const toRewrite = new Set([...created, ...ALWAYS_CTX])
  // Don't rewrite imports or destr bindings that remain — for created ones we must use ctx.
  // For ALWAYS_CTX that's fine.
  // Avoid rewriting names still in destr — those should stay bare.
  const destrMatch = code.match(/export function \w+\(ctx\) \{\n  const \{([\s\S]*?)\} = ctx\n\n/)
  const kept = new Set(
    destrMatch
      ? destrMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  )
  for (const k of kept) toRewrite.delete(k)

  code = rewriteBare(code, [...toRewrite])
  fs.writeFileSync(path.join(dir, file), code)
  console.log('fixed', file)
}
