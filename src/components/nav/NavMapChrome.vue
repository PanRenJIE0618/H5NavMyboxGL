<script setup>
import { t } from '../../i18n'
import { TRAVEL_MODES } from '../../lib/route'

defineProps({
  mapReady: { type: Boolean, default: false },
  mapError: { type: String, default: '' },
  navigating: { type: Boolean, default: false },
  routesReady: { type: Boolean, default: false },
  routing: { type: Boolean, default: false },
  travelMode: { type: String, default: 'drive' },
  travelModeBtnLabel: { type: Function, required: true },
  speedKmh: { default: null },
  speedDisplay: { type: String, default: '--' },
  speedLimitKmh: { type: Number, default: 60 },
  isSpeeding: { type: Boolean, default: false },
  navRemainPercent: { type: Number, default: 0 },
  voiceMuted: { type: Boolean, default: false },
  headingTestLock: { type: Boolean, default: false },
  pitch3D: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  lng: { default: null },
})

defineEmits([
  'set-travel-mode',
  'toggle-voice',
  'toggle-heading-lock',
  'toggle-pitch3d',
  'locate',
])

const modes = TRAVEL_MODES
</script>

<template>
  <Transition name="fade-pop">
    <div
      v-if="mapReady"
      class="map-speed"
      :class="{ 'is-over': isSpeeding, 'is-idle': speedKmh == null }"
      role="status"
      :aria-label="
        speedKmh == null
          ? t('map.speedNone')
          : isSpeeding
            ? t('map.speedOver', { n: speedDisplay })
            : t('map.speedNow', { n: speedDisplay })
      "
      :title="t('map.limitSpeed', { n: speedLimitKmh })"
    >
      <strong class="map-speed__value">{{ speedDisplay }}</strong>
      <span class="map-speed__unit">km/h</span>
      <span v-if="isSpeeding" class="map-speed__tag">{{ t('map.speeding') }}</span>
    </div>
  </Transition>

  <Transition name="fade-pop">
    <div
      v-if="mapReady && navigating"
      class="nav-progress"
      role="progressbar"
      :aria-valuenow="navRemainPercent"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="t('map.remainPct', { n: navRemainPercent })"
    >
      <div class="nav-progress__rail">
        <div class="nav-progress__bar" :style="{ height: `${navRemainPercent}%` }" />
      </div>
    </div>
  </Transition>

  <Transition name="fade-pop">
    <div
      v-if="mapReady && !navigating"
      class="map-travel"
      role="group"
      :aria-label="t('map.travelMode')"
    >
      <button
        v-for="item in modes"
        :key="item.id"
        class="map-travel__btn"
        type="button"
        :class="{ 'is-active': travelMode === item.id }"
        :disabled="routing"
        @click="$emit('set-travel-mode', item.id)"
      >
        {{ travelModeBtnLabel(item.id) }}
      </button>
    </div>
  </Transition>

  <Transition name="fade-pop">
    <div v-if="mapReady" class="map-fabs">
      <button
        v-if="navigating || routesReady"
        class="map-fab map-voice"
        type="button"
        :class="{ 'is-muted': voiceMuted }"
        :aria-label="voiceMuted ? t('map.voiceOn') : t('map.voiceOff')"
        :title="voiceMuted ? t('map.voice') : t('map.muted')"
        @click="$emit('toggle-voice')"
      >
        <span class="map-voice__label">{{ voiceMuted ? t('map.muted') : t('map.voice') }}</span>
      </button>
      <button
        class="map-fab map-heading-test"
        type="button"
        :class="{ 'is-active': headingTestLock }"
        :aria-label="headingTestLock ? t('map.headingLockOff') : t('map.headingLockOn')"
        :title="headingTestLock ? t('map.headingLockOff') : t('map.headingLock')"
        @click="$emit('toggle-heading-lock')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3.2v3.2M12 17.6v3.2M3.2 12h3.2M17.6 12h3.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
          <path d="M12 7.2 L15.6 16.2 L12 14.2 L8.4 16.2 Z" fill="currentColor" />
        </svg>
      </button>
      <button
        class="map-fab map-pitch3d"
        type="button"
        :class="{ 'is-active': pitch3D }"
        :aria-label="pitch3D ? t('map.to2d') : t('map.to3d')"
        :title="pitch3D ? '2D' : '3D'"
        @click="$emit('toggle-pitch3d')"
      >
        <span class="map-pitch3d__label">{{ pitch3D ? '2D' : '3D' }}</span>
      </button>
      <button
        class="map-fab map-locate"
        type="button"
        :class="{ 'is-busy': loading, 'is-live': lng != null && !loading }"
        :disabled="loading"
        :aria-label="navigating ? t('map.recenterNav') : loading ? t('map.locating') : t('map.recenter')"
        :title="navigating ? t('map.recenterNav') : t('map.recenter')"
        @click="$emit('locate')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.1" fill="currentColor" />
          <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path
            d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </Transition>

  <Transition name="fade">
    <div v-if="!mapReady && !mapError" class="veil">
      <span class="veil__spin" />
      <p>{{ t('map.loadingMap') }}</p>
    </div>
  </Transition>

  <Transition name="fade">
    <div v-if="mapError" class="veil">
      <p>{{ mapError }}</p>
    </div>
  </Transition>
</template>
