<script setup>
import { t } from '../../i18n'
import { useNavMapLogic } from '../../composables/nav/useNavMapLogic'
import DevConsole from '../DevConsole.vue'
import NavMast from './NavMast.vue'
import NavBanners from './NavBanners.vue'
import NavMapChrome from './NavMapChrome.vue'
import NavHud from './NavHud.vue'

const props = defineProps({
  /** 页面是否处于前台展示（从设置返回时触发地图 resize） */
  active: { type: Boolean, default: true },
})
const emit = defineEmits(['navigating-change', 'map-ready'])

const {
  mapEl,
  stageEl,
  mastEl,
  hudEl,
  mapReady,
  mapError,
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
  nextGuide,
  offRoute,
  rerouting,
  voiceMuted,
  pendingResume,
  clipboardOffer,
  headingTestLock,
  pitch3D,
  lng,
  loading,
  watching,
  client,
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
  navRemainPercent,
  compassRotate,
  secureOk,
  httpsUrl,
  browserHint,
  showWeChatGate,
  toggleDebugConsole,
  travelModeBtnLabel,
  driveStyleBtnLabel,
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
} = useNavMapLogic(props, emit)

defineExpose({
  applyHistoryItem,
})
</script>

<template>
  <div ref="stageEl" class="stage" :style="overlayStyle">
    <Transition name="overlay-fade">
      <div v-if="showWeChatGate" class="browser-gate" role="dialog" aria-modal="true">
        <Transition name="fade-scale" appear>
          <div class="browser-gate__card">
            <p class="browser-gate__kicker">{{ t('gate.kicker') }}</p>
            <h2>{{ t('gate.title') }}</h2>
            <p>{{ t('gate.body') }}</p>
            <p class="browser-gate__url">{{ httpsUrl }}</p>
            <button class="browser-gate__btn" type="button" @click="copyOpenUrl">
              {{ t('gate.copy') }}
            </button>
            <p class="browser-gate__hint">{{ t('gate.hint') }}</p>
          </div>
        </Transition>
      </div>
    </Transition>

    <div class="map-shell">
      <NavMast
        ref="mastEl"
        v-model:keyword="keyword"
        :map-ready="mapReady"
        :navigating="navigating"
        :searching="searching"
        :show-search-panel="showSearchPanel"
        :search-error="searchError"
        :places="places"
        :heading-available="headingAvailable"
        :heading-text="headingText"
        :compass-rotate="compassRotate"
        @toggle-debug="toggleDebugConsole"
        @search="onSearch"
        @close-search="closeSearchPanel"
        @select-place="selectPlace"
      />

      <NavBanners
        :pending-resume="pendingResume"
        :clipboard-offer="clipboardOffer"
        :navigating="navigating"
        :routing="routing"
        :off-route="offRoute"
        :rerouting="rerouting"
        :off-route-banner-text="offRouteBannerText"
        @discard-resume="discardResumeSession"
        @confirm-resume="confirmResumeSession"
        @discard-clipboard="discardClipboardOffer"
        @confirm-clipboard="confirmClipboardOffer"
        @reroute="onRerouteClick"
      />

      <div class="map-camera">
        <div ref="mapEl" class="map" />
      </div>

      <NavMapChrome
        :map-ready="mapReady"
        :map-error="mapError"
        :navigating="navigating"
        :routes-ready="routesReady"
        :routing="routing"
        :travel-mode="travelMode"
        :travel-mode-btn-label="travelModeBtnLabel"
        :speed-kmh="speedKmh"
        :speed-display="speedDisplay"
        :speed-limit-kmh="speedLimitKmh"
        :is-speeding="isSpeeding"
        :nav-remain-percent="navRemainPercent"
        :voice-muted="voiceMuted"
        :heading-test-lock="headingTestLock"
        :pitch3-d="pitch3D"
        :loading="loading"
        :lng="lng"
        @set-travel-mode="setTravelMode"
        @toggle-voice="toggleVoiceMute"
        @toggle-heading-lock="testRotateByHeading"
        @toggle-pitch3d="togglePitch3D"
        @locate="locateOnce(false)"
      />
    </div>

    <NavHud
      ref="hudEl"
      :show-search-panel="showSearchPanel"
      :status-text="statusText"
      :hud-title="hudTitle"
      :coord-text="coordText"
      :watching="watching"
      :lng="lng"
      :loading="loading"
      :destination="destination"
      :route-summary="routeSummary"
      :navigating="navigating"
      :next-guide="nextGuide"
      :search-error="searchError"
      :routing="routing"
      :routes-ready="routesReady"
      :travel-mode="travelMode"
      :drive-style="driveStyle"
      :route-plans="routePlans"
      :route-info="routeInfo"
      :drive-style-btn-label="driveStyleBtnLabel"
      :client-scheme-label="client.schemeLabel"
      :show-we-chat-gate="showWeChatGate"
      :secure-ok="secureOk"
      :browser-hint-detail="browserHint?.detail || ''"
      :https-url="httpsUrl"
      @navigate="onNavigateClick"
      @route="onRouteClick"
      @choose-drive-style="chooseDriveStyle"
      @start-nav="onStartNavClick"
      @stop-nav="stopNavigation"
      @clear-dest="clearDestination"
    />

    <DevConsole />
  </div>
</template>
