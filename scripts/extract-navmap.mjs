/**
 * Extract NavMap.vue <script setup> into useNavMapLogic(props, emit).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('e:/Pan/H5NavMyBoxGL')
const srcPath = path.join(root, 'src/components/NavMap.vue')
const src = fs.readFileSync(srcPath, 'utf8')

const scriptMatch = src.match(/<script setup>([\s\S]*?)<\/script>/)
if (!scriptMatch) throw new Error('no script')
let body = scriptMatch[1].trim()

// Collect import statements (including multi-line)
const imports = []
body = body.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*\n?/gm, (stmt) => {
  imports.push(stmt.trimEnd())
  return ''
})

body = body.replace(
  /const props = defineProps\(\{[\s\S]*?\}\)\r?\nconst emit = defineEmits\(\[[^\]]+\]\)\r?\n/,
  '',
)
body = body.replace(/defineExpose\(\{\s*applyHistoryItem,\s*\}\)\r?\n/, '')

const remapped = imports
  .filter((line) => !line.includes("DevConsole.vue"))
  .map((line) => {
    // NavMap was in components/; this file is composables/nav/
    if (line.includes('/composables/')) {
      return line.replace(/from ['"]\.\.\/composables\//g, (m) =>
        m.startsWith('from "') ? 'from "../' : "from '../",
      )
    }
    return line
      .replace(/from '\.\.\//g, "from '../../")
      .replace(/from "\.\.\//g, 'from "../../')
      .replace(/from '\.\//g, "from '../../components/")
      .replace(/from "\.\//g, 'from "../../components/')
  })

const out = `/** Extracted from NavMap.vue — orchestrator + domain modules compose this. */
${remapped.join('\n')}

/**
 * @param {{ active?: boolean }} props
 * @param {(event: 'navigating-change' | 'map-ready', ...args: any[]) => void} emit
 */
export function useNavMapLogic(props, emit) {
${body}

  return {
    mapEl,
    stageEl,
    mastEl,
    hudEl,
    mapReady,
    mapError,
    address,
    locatingHint,
    keyword,
    searching,
    searchError,
    places,
    destination,
    travelMode,
    driveStyle,
    routeInfo,
    routePlans,
    routesReady,
    routing,
    navigating,
    routePreviewLock,
    followUser,
    arrived,
    remainingMeters,
    remainingSeconds,
    nextGuide,
    offRoute,
    offRouteDistanceMeters,
    rerouting,
    voiceMuted,
    pendingResume,
    clipboardOffer,
    mapBearing,
    headingTestLock,
    pitch3D,
    walkHeadingActive,
    lng,
    lat,
    speed,
    course,
    loading,
    error,
    watching,
    client,
    deviceHeading,
    headingAvailable,
    headingText,
    coordText,
    speedKmh,
    speedLimitKmh,
    isSpeeding,
    speedDisplay,
    offRouteBannerText,
    overlayStyle,
    statusText,
    hudTitle,
    showSearchPanel,
    routeSummary,
    navRemainRatio,
    navRemainPercent,
    compassRotate,
    secureOk,
    httpsUrl,
    inWeChat,
    browserHint,
    showWeChatGate,
    TRAVEL_MODES,
    DRIVE_STYLES,
    debugConsoleOpen,
    toggleDebugConsole,
    travelModeBtnLabel,
    driveStyleBtnLabel,
    formatDistance,
    t,
    copyOpenUrl,
    onSearch,
    closeSearchPanel,
    selectPlace,
    discardResumeSession,
    confirmResumeSession,
    discardClipboardOffer,
    confirmClipboardOffer,
    onRerouteClick,
    setTravelMode,
    toggleVoiceMute,
    testRotateByHeading,
    togglePitch3D,
    locateOnce,
    onNavigateClick,
    onRouteClick,
    chooseDriveStyle,
    onStartNavClick,
    stopNavigation,
    clearDestination,
    applyHistoryItem,
  }
}
`

const logicPath = path.join(root, 'src/composables/nav/useNavMapLogic.js')
fs.writeFileSync(logicPath, out)
console.log('Wrote', logicPath, 'lines', out.split('\n').length)
console.log('Import count', remapped.length)
console.log('First imports:\\n', remapped.slice(0, 8).join('\\n'))
