<script setup>
import { t } from '../../i18n'
import { formatDistance } from '../../lib/geo'
import { DRIVE_STYLES } from '../../lib/route'

defineProps({
  showSearchPanel: { type: Boolean, default: false },
  statusText: { type: String, default: '' },
  hudTitle: { type: String, default: '' },
  coordText: { type: String, default: '' },
  watching: { type: Boolean, default: false },
  lng: { default: null },
  loading: { type: Boolean, default: false },
  destination: { type: Object, default: null },
  routeSummary: { type: String, default: '' },
  navigating: { type: Boolean, default: false },
  nextGuide: { type: String, default: '' },
  searchError: { type: String, default: '' },
  routing: { type: Boolean, default: false },
  routesReady: { type: Boolean, default: false },
  travelMode: { type: String, default: 'drive' },
  driveStyle: { type: String, default: '0' },
  routePlans: { type: Object, default: () => ({}) },
  routeInfo: { type: Object, default: null },
  driveStyleBtnLabel: { type: Function, required: true },
  clientSchemeLabel: { type: String, default: '' },
  showWeChatGate: { type: Boolean, default: false },
  secureOk: { type: Boolean, default: true },
  browserHintDetail: { type: String, default: '' },
  httpsUrl: { type: String, default: '' },
})

defineEmits([
  'navigate',
  'route',
  'choose-drive-style',
  'start-nav',
  'stop-nav',
  'clear-dest',
])

const styles = DRIVE_STYLES
</script>

<template>
  <Transition name="sheet-up">
    <section v-show="!showSearchPanel" class="hud" aria-live="polite">
      <p v-if="statusText" class="hud__status">
        <span class="hud__dot" :class="{ 'is-live': watching || (lng != null && !loading) }" />
        {{ statusText }}
      </p>
      <h2>{{ hudTitle }}</h2>
      <p class="hud__coord">{{ coordText }}</p>
      <p v-if="destination?.address" class="hud__meta">{{ destination.address }}</p>
      <p v-if="routeSummary" class="hud__meta">{{ routeSummary }}</p>
      <p v-if="navigating && nextGuide" class="hud__guide">{{ nextGuide }}</p>
      <p v-if="searchError && destination" class="hud__warn">{{ searchError }}</p>

      <div class="hud__actions">
        <template v-if="!navigating && destination && !routesReady">
          <button
            class="relocate relocate--primary relocate--half"
            type="button"
            :disabled="routing"
            @click.stop="$emit('navigate')"
          >
            {{ routing ? t('map.planning') : t('map.nav') }}
          </button>
          <button
            class="relocate relocate--half"
            type="button"
            :disabled="routing"
            @click.stop="$emit('route')"
          >
            {{ routing ? t('map.planning') : t('map.route') }}
          </button>
        </template>

        <div
          v-if="!navigating && routesReady && travelMode === 'drive'"
          class="mode-switch mode-switch--styles"
        >
          <button
            v-for="item in styles"
            :key="item.id"
            class="mode-switch__btn"
            type="button"
            :class="{ 'is-active': driveStyle === item.id }"
            :disabled="routing || !routePlans[item.id]"
            @click="$emit('choose-drive-style', item.id)"
          >
            <span>{{ driveStyleBtnLabel(item.id) }}</span>
            <small v-if="routePlans[item.id]">{{
              formatDistance(routePlans[item.id].distanceMeters)
            }}</small>
          </button>
        </div>

        <button
          v-if="!navigating && routesReady"
          class="relocate relocate--primary"
          type="button"
          :disabled="routing || !routeInfo"
          @click="$emit('start-nav')"
        >
          {{ travelMode === 'walk' ? t('map.startWalk') : t('map.startDrive') }}
        </button>
        <button
          v-if="navigating"
          class="relocate relocate--danger"
          type="button"
          @click="$emit('stop-nav')"
        >
          {{ t('map.stopNav') }}
        </button>
        <button
          v-if="destination && !navigating"
          class="relocate"
          type="button"
          @click="$emit('clear-dest')"
        >
          {{ t('map.clearDest') }}
        </button>
      </div>

      <p v-if="!navigating && !destination" class="hud__meta">{{ clientSchemeLabel }}</p>

      <p v-if="showWeChatGate" class="hud__warn">{{ t('gate.hudWechat') }}</p>
      <p v-else-if="!secureOk" class="hud__warn">
        {{ browserHintDetail || t('map.openHttps', { url: httpsUrl }) }}
      </p>
    </section>
  </Transition>
</template>
