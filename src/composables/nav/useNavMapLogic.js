/**
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
    mapEl: ctx.mapEl,
    stageEl: ctx.stageEl,
    mastEl: ctx.mastEl,
    hudEl: ctx.hudEl,
    mapReady: ctx.mapReady,
    mapError: ctx.mapError,
    address: ctx.address,
    locatingHint: ctx.locatingHint,
    keyword: ctx.keyword,
    searching: ctx.searching,
    searchError: ctx.searchError,
    places: ctx.places,
    destination: ctx.destination,
    travelMode: ctx.travelMode,
    driveStyle: ctx.driveStyle,
    routeInfo: ctx.routeInfo,
    routePlans: ctx.routePlans,
    routesReady: ctx.routesReady,
    routing: ctx.routing,
    navigating: ctx.navigating,
    routePreviewLock: ctx.routePreviewLock,
    followUser: ctx.followUser,
    arrived: ctx.arrived,
    remainingMeters: ctx.remainingMeters,
    remainingSeconds: ctx.remainingSeconds,
    nextGuide: ctx.nextGuide,
    offRoute: ctx.offRoute,
    offRouteDistanceMeters: ctx.offRouteDistanceMeters,
    rerouting: ctx.rerouting,
    voiceMuted: ctx.voiceMuted,
    pendingResume: ctx.pendingResume,
    clipboardOffer: ctx.clipboardOffer,
    mapBearing: ctx.mapBearing,
    headingTestLock: ctx.headingTestLock,
    pitch3D: ctx.pitch3D,
    walkHeadingActive: ctx.walkHeadingActive,
    lng: ctx.lng,
    lat: ctx.lat,
    speed: ctx.speed,
    course: ctx.course,
    loading: ctx.loading,
    error: ctx.error,
    watching: ctx.watching,
    client: ctx.client,
    deviceHeading: ctx.deviceHeading,
    headingAvailable: ctx.headingAvailable,
    headingText: ctx.headingText,
    coordText: ctx.coordText,
    speedKmh: ctx.speedKmh,
    speedLimitKmh: ctx.speedLimitKmh,
    isSpeeding: ctx.isSpeeding,
    speedDisplay: ctx.speedDisplay,
    offRouteBannerText: ctx.offRouteBannerText,
    overlayStyle: ctx.overlayStyle,
    statusText: ctx.statusText,
    hudTitle: ctx.hudTitle,
    showSearchPanel: ctx.showSearchPanel,
    routeSummary: ctx.routeSummary,
    navRemainRatio: ctx.navRemainRatio,
    navRemainPercent: ctx.navRemainPercent,
    compassRotate: ctx.compassRotate,
    secureOk: ctx.secureOk,
    httpsUrl: ctx.httpsUrl,
    inWeChat: ctx.inWeChat,
    browserHint: ctx.browserHint,
    showWeChatGate: ctx.showWeChatGate,
    TRAVEL_MODES: ctx.TRAVEL_MODES,
    DRIVE_STYLES: ctx.DRIVE_STYLES,
    debugConsoleOpen: ctx.debugConsoleOpen,
    toggleDebugConsole: ctx.toggleDebugConsole,
    travelModeBtnLabel: ctx.travelModeBtnLabel,
    driveStyleBtnLabel: ctx.driveStyleBtnLabel,
    formatDistance: ctx.formatDistance,
    t: ctx.t,
    copyOpenUrl: ctx.copyOpenUrl,
    onSearch: ctx.onSearch,
    closeSearchPanel: ctx.closeSearchPanel,
    selectPlace: ctx.selectPlace,
    discardResumeSession: ctx.discardResumeSession,
    confirmResumeSession: ctx.confirmResumeSession,
    discardClipboardOffer: ctx.discardClipboardOffer,
    confirmClipboardOffer: ctx.confirmClipboardOffer,
    onRerouteClick: ctx.onRerouteClick,
    setTravelMode: ctx.setTravelMode,
    toggleVoiceMute: ctx.toggleVoiceMute,
    testRotateByHeading: ctx.testRotateByHeading,
    togglePitch3D: ctx.togglePitch3D,
    locateOnce: ctx.locateOnce,
    onNavigateClick: ctx.onNavigateClick,
    onRouteClick: ctx.onRouteClick,
    chooseDriveStyle: ctx.chooseDriveStyle,
    onStartNavClick: ctx.onStartNavClick,
    stopNavigation: ctx.stopNavigation,
    clearDestination: ctx.clearDestination,
    applyHistoryItem: ctx.applyHistoryItem,
  }
}
