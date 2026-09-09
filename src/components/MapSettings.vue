<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import {
  UI_THEME_OPTIONS,
  getStoredUiTheme,
  setUiTheme,
} from '../lib/uiTheme'
import {
  BASEMAP_OPTIONS,
  getStoredBasemap,
  setBasemap,
} from '../lib/basemap'
import { getAutoViewLock, setAutoViewLock } from '../lib/viewLock'
import {
  getNavPrefs,
  setVoiceEnabled,
  setDefaultTravelMode,
  setDefaultDriveStyle,
} from '../lib/navPrefs'
import { TRAVEL_MODES, DRIVE_STYLES } from '../lib/route'
import { getDeviceInfoRows } from '../lib/deviceInfo'
import { LOCALE_OPTIONS, locale, setLocale, t } from '../i18n'

defineProps({
  /** 作为底部「我的」页嵌入时隐藏返回按钮 */
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['back'])

const theme = ref(getStoredUiTheme())
const basemap = ref(getStoredBasemap())
const autoViewLock = ref(getAutoViewLock())
const prefs = ref(getNavPrefs())
const deviceRows = ref(getDeviceInfoRows())
const deviceExpanded = ref(false)

const voiceEnabled = computed(() => prefs.value.voiceEnabled)
const travelMode = computed(() => prefs.value.travelMode)
const driveStyle = computed(() => prefs.value.driveStyle)
const currentLocale = computed(() => locale.value)

const PRIMARY_DEVICE_KEYS = [
  'device.browser',
  'device.deviceName',
  'device.os',
  'device.mapCrs',
  'device.coordScheme',
]

const deviceSummary = computed(() => {
  // touch locale for reactivity
  void locale.value
  const map = Object.fromEntries(deviceRows.value.map((r) => [r.key, r.value]))
  return {
    browser: map['device.browser'] || '—',
    device: map['device.deviceName'] || '—',
    os: map['device.os'] || '—',
    crs: map['device.mapCrs'] || '—',
  }
})

const devicePrimaryRows = computed(() =>
  deviceRows.value.filter((r) => PRIMARY_DEVICE_KEYS.includes(r.key)),
)

const deviceExtraRows = computed(() =>
  deviceRows.value.filter((r) => !PRIMARY_DEVICE_KEYS.includes(r.key)),
)

const visibleDeviceRows = computed(() =>
  deviceExpanded.value
    ? [...devicePrimaryRows.value, ...deviceExtraRows.value]
    : devicePrimaryRows.value,
)

function refreshDeviceRows() {
  deviceRows.value = getDeviceInfoRows()
}

watch(locale, () => {
  refreshDeviceRows()
})

onMounted(() => {
  theme.value = getStoredUiTheme()
  basemap.value = getStoredBasemap()
  autoViewLock.value = getAutoViewLock()
  prefs.value = getNavPrefs()
  refreshDeviceRows()
})

function chooseTheme(id) {
  theme.value = setUiTheme(id)
  if (id === 'dark' && basemap.value !== 'vec') {
    basemap.value = setBasemap('vec')
  }
}

function chooseBasemap(id) {
  basemap.value = setBasemap(id)
}

function chooseLocale(id) {
  setLocale(id)
}

function toggleAutoViewLock() {
  autoViewLock.value = setAutoViewLock(!autoViewLock.value)
}

function toggleVoice() {
  prefs.value = setVoiceEnabled(!prefs.value.voiceEnabled)
}

function chooseTravelMode(id) {
  prefs.value = setDefaultTravelMode(id)
}

function chooseDriveStyle(id) {
  prefs.value = setDefaultDriveStyle(id)
}

function themeLabel(id) {
  return t(`theme.${id}`)
}

function basemapLabel(id) {
  return t(`basemap.${id}`)
}

function basemapDesc(id) {
  return t(`basemap.${id}Desc`)
}

function travelLabel(id) {
  return id === 'walk' ? t('map.walk') : t('map.drive')
}

function driveLabel(id) {
  return String(id) === '1' ? t('map.shortest') : t('map.fastest')
}

/** 分段选择滑动指示条位置 */
function segVars(ids, activeId) {
  const list = Array.isArray(ids) ? ids : []
  const index = Math.max(0, list.findIndex((id) => id === activeId))
  return {
    '--seg-n': String(Math.max(1, list.length)),
    '--seg-i': String(index < 0 ? 0 : index),
  }
}

function onBack() {
  emit('back')
}
</script>

<template>
  <div class="settings-page" :class="{ 'is-embedded': embedded }" role="region" aria-labelledby="settings-title">
    <header class="settings-page__bar">
      <button
        v-if="!embedded"
        class="settings-page__back"
        type="button"
        :aria-label="t('mine.back')"
        @click="onBack"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15.2 5.2 L8.4 12 l6.8 6.8"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <h1 id="settings-title" class="settings-page__title">
        {{ embedded ? t('mine.title') : t('mine.settings') }}
      </h1>
    </header>

    <div class="settings-page__body">
      <section class="mine-hero" :aria-label="t('mine.summary')">
        <div class="mine-hero__avatar" aria-hidden="true">{{ deviceSummary.device.slice(0, 1) }}</div>
        <div class="mine-hero__copy">
          <strong>{{ deviceSummary.device }}</strong>
          <span>{{ deviceSummary.browser }} · {{ deviceSummary.os }}</span>
          <small>{{ deviceSummary.crs }}</small>
        </div>
      </section>

      <section class="mine-block">
        <header class="mine-block__head">
          <h2>{{ t('mine.appearance') }}</h2>
          <p>{{ t('mine.appearanceHint') }}</p>
        </header>

        <div class="mine-card">
          <div class="mine-card__label">{{ t('mine.language') }}</div>
          <p class="mine-card__hint">{{ t('mine.languageHint') }}</p>
          <div
            class="mine-seg"
            role="radiogroup"
            :aria-label="t('mine.language')"
            :style="segVars(LOCALE_OPTIONS.map((i) => i.id), currentLocale)"
          >
            <span class="mine-seg__thumb" aria-hidden="true" />
            <button
              v-for="item in LOCALE_OPTIONS"
              :key="item.id"
              class="mine-seg__btn"
              type="button"
              role="radio"
              :aria-checked="currentLocale === item.id"
              :class="{ 'is-active': currentLocale === item.id }"
              @click="chooseLocale(item.id)"
            >
              {{ item.nativeLabel }}
            </button>
          </div>
        </div>

        <div class="mine-card">
          <div class="mine-card__label">{{ t('mine.theme') }}</div>
          <div
            class="mine-seg"
            role="radiogroup"
            :aria-label="t('mine.theme')"
            :style="segVars(UI_THEME_OPTIONS.map((i) => i.id), theme)"
          >
            <span class="mine-seg__thumb" aria-hidden="true" />
            <button
              v-for="item in UI_THEME_OPTIONS"
              :key="item.id"
              class="mine-seg__btn"
              type="button"
              role="radio"
              :aria-checked="theme === item.id"
              :class="{ 'is-active': theme === item.id }"
              @click="chooseTheme(item.id)"
            >
              <span class="mine-seg__dot" :data-preview="item.id" aria-hidden="true" />
              {{ themeLabel(item.id) }}
            </button>
          </div>
        </div>

        <div class="mine-card">
          <div class="mine-card__label">{{ t('mine.basemap') }}</div>
          <div class="mine-tiles" role="radiogroup" :aria-label="t('mine.basemap')">
            <button
              v-for="item in BASEMAP_OPTIONS"
              :key="item.id"
              class="mine-tile"
              type="button"
              role="radio"
              :aria-checked="basemap === item.id"
              :class="{ 'is-active': basemap === item.id }"
              @click="chooseBasemap(item.id)"
            >
              <span class="mine-tile__swatch" :data-basemap="item.id" aria-hidden="true" />
              <strong>{{ basemapLabel(item.id) }}</strong>
              <small>{{ basemapDesc(item.id) }}</small>
            </button>
          </div>
        </div>
      </section>

      <section class="mine-block">
        <header class="mine-block__head">
          <h2>{{ t('mine.nav') }}</h2>
          <p>{{ t('mine.navHint') }}</p>
        </header>

        <div class="mine-list" role="group" :aria-label="t('mine.nav')">
          <button
            class="mine-list__row"
            type="button"
            role="switch"
            :aria-checked="autoViewLock"
            :class="{ 'is-on': autoViewLock }"
            @click="toggleAutoViewLock"
          >
            <span class="mine-list__text">
              <strong>{{ t('mine.viewLock') }}</strong>
              <Transition name="mine-caption" mode="out-in">
                <small :key="autoViewLock ? 'on' : 'off'">
                  {{ autoViewLock ? t('mine.viewLockOn') : t('mine.viewLockOff') }}
                </small>
              </Transition>
            </span>
            <span class="settings-switch__track" aria-hidden="true">
              <span class="settings-switch__thumb" />
            </span>
          </button>
          <button
            class="mine-list__row"
            type="button"
            role="switch"
            :aria-checked="voiceEnabled"
            :class="{ 'is-on': voiceEnabled }"
            @click="toggleVoice"
          >
            <span class="mine-list__text">
              <strong>{{ t('mine.voice') }}</strong>
              <Transition name="mine-caption" mode="out-in">
                <small :key="voiceEnabled ? 'on' : 'off'">
                  {{ voiceEnabled ? t('mine.voiceOn') : t('mine.voiceOff') }}
                </small>
              </Transition>
            </span>
            <span class="settings-switch__track" aria-hidden="true">
              <span class="settings-switch__thumb" />
            </span>
          </button>
        </div>

        <div class="mine-card mine-card--stack">
          <div class="mine-pref">
            <div class="mine-pref__meta">
              <strong>{{ t('mine.defaultTravel') }}</strong>
              <small>{{ t('mine.defaultTravelHint') }}</small>
            </div>
            <div
              class="mine-seg mine-seg--compact"
              role="radiogroup"
              :aria-label="t('mine.defaultTravel')"
              :style="segVars(TRAVEL_MODES.map((i) => i.id), travelMode)"
            >
              <span class="mine-seg__thumb" aria-hidden="true" />
              <button
                v-for="item in TRAVEL_MODES"
                :key="item.id"
                class="mine-seg__btn"
                type="button"
                role="radio"
                :aria-checked="travelMode === item.id"
                :class="{ 'is-active': travelMode === item.id }"
                @click="chooseTravelMode(item.id)"
              >
                {{ travelLabel(item.id) }}
              </button>
            </div>
          </div>
          <div class="mine-pref" :class="{ 'is-disabled': travelMode === 'walk' }">
            <div class="mine-pref__meta">
              <strong>{{ t('mine.defaultRoute') }}</strong>
              <Transition name="mine-caption" mode="out-in">
                <small :key="travelMode === 'walk' ? 'walk' : 'drive'">
                  {{
                    travelMode === 'walk' ? t('mine.defaultRouteWalk') : t('mine.defaultRouteDrive')
                  }}
                </small>
              </Transition>
            </div>
            <div
              class="mine-seg mine-seg--compact"
              role="radiogroup"
              :aria-label="t('mine.defaultRoute')"
              :style="segVars(DRIVE_STYLES.map((i) => i.id), driveStyle)"
            >
              <span class="mine-seg__thumb" aria-hidden="true" />
              <button
                v-for="item in DRIVE_STYLES"
                :key="item.id"
                class="mine-seg__btn"
                type="button"
                role="radio"
                :aria-checked="driveStyle === item.id"
                :class="{ 'is-active': driveStyle === item.id }"
                :disabled="travelMode === 'walk'"
                @click="chooseDriveStyle(item.id)"
              >
                {{ driveLabel(item.id) }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="mine-block mine-block--last">
        <header class="mine-block__head">
          <h2>{{ t('mine.device') }}</h2>
          <p>{{ t('mine.deviceHint') }}</p>
        </header>

        <div class="device-info" role="list">
          <TransitionGroup name="fade-row" tag="div">
            <div
              v-for="row in visibleDeviceRows"
              :key="row.key"
              class="device-info__row"
              role="listitem"
            >
              <span class="device-info__label">{{ t(row.key) }}</span>
              <span class="device-info__value">{{ row.value }}</span>
            </div>
          </TransitionGroup>
        </div>
        <button
          class="mine-more"
          type="button"
          :aria-expanded="deviceExpanded"
          @click="deviceExpanded = !deviceExpanded"
        >
          {{ deviceExpanded ? t('mine.less') : t('mine.more') }}
        </button>
      </section>
    </div>
  </div>
</template>
