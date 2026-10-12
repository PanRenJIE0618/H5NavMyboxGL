<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
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
import {
  clearAllAppStorage,
  clearAppDataStorage,
  clearAppStorageItem,
  formatStorageBytes,
  getAppStorageSummary,
  restoreAppDefaults,
} from '../lib/appStorage'
import { LOCALE_OPTIONS, locale, setLocale, t } from '../i18n'
import { SHOW_AUTH_INSPECTION_UI } from '../config/featureFlags'
import {
  getUser,
  isLoggedIn,
  logout,
  onAuthChange,
} from '../lib/auth.js'

defineProps({
  /** 作为底部「我的」页嵌入时隐藏返回按钮 */
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['back', 'open-login'])

const theme = ref(getStoredUiTheme())
const basemap = ref(getStoredBasemap())
const autoViewLock = ref(getAutoViewLock())
const prefs = ref(getNavPrefs())
const deviceRows = ref(getDeviceInfoRows())
const deviceExpanded = ref(false)
const storageSummary = ref(getAppStorageSummary())
const storageExpanded = ref(false)
const storageFlash = ref('')
let storageFlashTimer = 0

const authUser = ref(getUser())
const authLoggedIn = ref(isLoggedIn())
const authBusy = ref(false)
const authError = ref('')
let stopAuthWatch = () => {}

function applyAuthState(state) {
  authLoggedIn.value = Boolean(state?.isLoggedIn)
  authUser.value = state?.user ?? null
}

const voiceEnabled = computed(() => prefs.value.voiceEnabled)
const travelMode = computed(() => prefs.value.travelMode)
const driveStyle = computed(() => prefs.value.driveStyle)
const currentLocale = computed(() => locale.value)

/** 上图开启时：未登录不展示设备/用户详情；关闭上图时始终展示本机信息 */
const showIdentity = computed(() => !SHOW_AUTH_INSPECTION_UI || authLoggedIn.value)

const localeLabel = computed(() => {
  const hit = LOCALE_OPTIONS.find((item) => item.id === currentLocale.value)
  return hit?.nativeLabel || currentLocale.value
})

const themeCurrentLabel = computed(() => themeLabel(theme.value))
const basemapCurrentLabel = computed(() => basemapLabel(basemap.value))

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

const visibleStorageRows = computed(() => {
  const rows = storageSummary.value.rows || []
  if (storageExpanded.value) return rows
  const used = rows.filter((row) => row.present)
  return used.length ? used.slice(0, 5) : rows.slice(0, 4)
})

const storageTotalLabel = computed(() =>
  t('mine.storageTotal', {
    size: formatStorageBytes(storageSummary.value.totalBytes || 0),
    used: storageSummary.value.usedCount || 0,
    total: storageSummary.value.totalCount || 0,
  }),
)

function refreshDeviceRows() {
  deviceRows.value = getDeviceInfoRows()
}

function refreshStorage() {
  storageSummary.value = getAppStorageSummary()
}

function flashStorage(message) {
  storageFlash.value = message
  if (storageFlashTimer) window.clearTimeout(storageFlashTimer)
  storageFlashTimer = window.setTimeout(() => {
    storageFlash.value = ''
  }, 1800)
}

function syncLocalStateFromStore() {
  theme.value = getStoredUiTheme()
  basemap.value = getStoredBasemap()
  autoViewLock.value = getAutoViewLock()
  prefs.value = getNavPrefs()
  refreshDeviceRows()
  refreshStorage()
}

watch(locale, () => {
  refreshDeviceRows()
  refreshStorage()
})

onMounted(() => {
  syncLocalStateFromStore()
  applyAuthState({ user: getUser(), isLoggedIn: isLoggedIn() })
  stopAuthWatch = onAuthChange(applyAuthState)
})

onUnmounted(() => stopAuthWatch())

async function onLogout() {
  authError.value = ''
  authBusy.value = true
  try {
    await logout()
  } catch (cause) {
    authError.value =
      cause instanceof Error && cause.message ? cause.message : t('auth.logoutFail')
  } finally {
    authBusy.value = false
  }
}

function onOpenLogin() {
  emit('open-login')
}

function chooseTheme(id) {
  theme.value = setUiTheme(id)
  if (id === 'dark' && basemap.value !== 'vec') {
    basemap.value = setBasemap('vec')
  }
  refreshStorage()
}

function chooseBasemap(id) {
  basemap.value = setBasemap(id)
  refreshStorage()
}

function chooseLocale(id) {
  setLocale(id)
  refreshStorage()
}

function toggleAutoViewLock() {
  autoViewLock.value = setAutoViewLock(!autoViewLock.value)
  refreshStorage()
}

function toggleVoice() {
  prefs.value = setVoiceEnabled(!prefs.value.voiceEnabled)
  refreshStorage()
}

function chooseTravelMode(id) {
  prefs.value = setDefaultTravelMode(id)
  refreshStorage()
}

function chooseDriveStyle(id) {
  prefs.value = setDefaultDriveStyle(id)
  refreshStorage()
}

function onClearStorageItem(id) {
  storageSummary.value = clearAppStorageItem(id)
  syncLocalStateFromStore()
  flashStorage(t('mine.storageCleared'))
}

function onClearNavData() {
  storageSummary.value = clearAppDataStorage()
  flashStorage(t('mine.storageCleared'))
}

function onClearAllStorage() {
  storageSummary.value = clearAllAppStorage()
  syncLocalStateFromStore()
  flashStorage(t('mine.storageCleared'))
}

function onRestoreDefaults() {
  restoreAppDefaults()
  syncLocalStateFromStore()
  flashStorage(t('mine.restoreDone'))
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
  <div
    class="settings-page settings-page--ios"
    :class="{ 'is-embedded': embedded }"
    role="region"
    aria-labelledby="settings-title"
  >
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

    <div class="settings-page__body stg-body">
      <!-- 未登录（上图）：仅入口去登录 -->
      <section v-if="SHOW_AUTH_INSPECTION_UI && !authLoggedIn" class="stg-group">
        <button class="stg-row stg-row--nav" type="button" @click="onOpenLogin">
          <span class="stg-row__main">
            <strong>{{ t('auth.goLogin') }}</strong>
            <small>{{ t('auth.needLoginHint') }}</small>
          </span>
          <span class="stg-chevron" aria-hidden="true" />
        </button>
      </section>

      <!-- 已登录 / 未开上图：用户与设备 -->
      <template v-if="showIdentity">
        <section
          v-if="SHOW_AUTH_INSPECTION_UI && authLoggedIn"
          class="stg-group"
          :aria-label="t('auth.account')"
        >
          <div class="stg-profile">
            <div class="stg-profile__avatar" aria-hidden="true">
              {{ (authUser?.name || '?').slice(0, 1) }}
            </div>
            <div class="stg-profile__copy">
              <strong>{{ authUser?.name || t('auth.account') }}</strong>
              <span>{{ t('auth.accountHint') }}</span>
            </div>
          </div>
          <p v-if="authError" class="stg-error" role="alert">{{ authError }}</p>
          <button
            class="stg-row stg-row--danger"
            type="button"
            :disabled="authBusy"
            @click="onLogout"
          >
            <span class="stg-row__main">
              <strong>{{ t('auth.logout') }}</strong>
            </span>
          </button>
        </section>

        <section class="stg-group" :aria-label="t('mine.summary')">
          <div class="stg-profile stg-profile--device">
            <div class="stg-profile__avatar stg-profile__avatar--device" aria-hidden="true">
              {{ deviceSummary.device.slice(0, 1) }}
            </div>
            <div class="stg-profile__copy">
              <strong>{{ deviceSummary.device }}</strong>
              <span>{{ deviceSummary.browser }} · {{ deviceSummary.os }}</span>
              <small>{{ deviceSummary.crs }}</small>
            </div>
          </div>
        </section>
      </template>

      <p class="stg-caption">{{ t('mine.appearance') }}</p>
      <section class="stg-group">
        <div class="stg-row stg-row--stack">
          <div class="stg-row__line">
            <span class="stg-row__main">
              <strong>{{ t('mine.language') }}</strong>
            </span>
            <span class="stg-value">{{ localeLabel }}</span>
          </div>
          <div
            class="mine-seg mine-seg--compact stg-seg"
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

        <div class="stg-row stg-row--stack">
          <div class="stg-row__line">
            <span class="stg-row__main">
              <strong>{{ t('mine.theme') }}</strong>
            </span>
            <span class="stg-value">{{ themeCurrentLabel }}</span>
          </div>
          <div
            class="mine-seg mine-seg--compact stg-seg"
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

        <div class="stg-row stg-row--stack">
          <div class="stg-row__line">
            <span class="stg-row__main">
              <strong>{{ t('mine.basemap') }}</strong>
            </span>
            <span class="stg-value">{{ basemapCurrentLabel }}</span>
          </div>
          <div class="mine-tiles stg-tiles" role="radiogroup" :aria-label="t('mine.basemap')">
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
            </button>
          </div>
        </div>
      </section>

      <p class="stg-caption">{{ t('mine.nav') }}</p>
      <section class="stg-group" role="group" :aria-label="t('mine.nav')">
        <button
          class="stg-row"
          type="button"
          role="switch"
          :aria-checked="autoViewLock"
          :class="{ 'is-on': autoViewLock }"
          @click="toggleAutoViewLock"
        >
          <span class="stg-row__main">
            <strong>{{ t('mine.viewLock') }}</strong>
            <small>{{ autoViewLock ? t('mine.viewLockOn') : t('mine.viewLockOff') }}</small>
          </span>
          <span class="settings-switch__track" aria-hidden="true">
            <span class="settings-switch__thumb" />
          </span>
        </button>
        <button
          class="stg-row"
          type="button"
          role="switch"
          :aria-checked="voiceEnabled"
          :class="{ 'is-on': voiceEnabled }"
          @click="toggleVoice"
        >
          <span class="stg-row__main">
            <strong>{{ t('mine.voice') }}</strong>
            <small>{{ voiceEnabled ? t('mine.voiceOn') : t('mine.voiceOff') }}</small>
          </span>
          <span class="settings-switch__track" aria-hidden="true">
            <span class="settings-switch__thumb" />
          </span>
        </button>
        <div class="stg-row stg-row--stack">
          <div class="stg-row__line">
            <span class="stg-row__main">
              <strong>{{ t('mine.defaultTravel') }}</strong>
            </span>
          </div>
          <div
            class="mine-seg mine-seg--compact stg-seg"
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
        <div class="stg-row stg-row--stack" :class="{ 'is-disabled': travelMode === 'walk' }">
          <div class="stg-row__line">
            <span class="stg-row__main">
              <strong>{{ t('mine.defaultRoute') }}</strong>
              <small>
                {{
                  travelMode === 'walk' ? t('mine.defaultRouteWalk') : t('mine.defaultRouteDrive')
                }}
              </small>
            </span>
          </div>
          <div
            class="mine-seg mine-seg--compact stg-seg"
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
      </section>

      <p class="stg-caption">{{ t('mine.storage') }}</p>
      <section class="stg-group">
        <div class="stg-row stg-row--static">
          <span class="stg-row__main">
            <strong>{{ t('mine.storage') }}</strong>
            <small>{{ storageTotalLabel }}</small>
          </span>
        </div>
        <Transition name="mine-caption">
          <p v-if="storageFlash" class="stg-flash" role="status">{{ storageFlash }}</p>
        </Transition>
        <div
          v-for="row in visibleStorageRows"
          :key="row.id"
          class="stg-row stg-row--split"
        >
          <span class="stg-row__main">
            <strong>{{ t(row.labelKey) }}</strong>
            <small>
              {{ t(`storage.scope.${row.scope}`) }}
              ·
              {{ row.present ? formatStorageBytes(row.bytes) : t('mine.storageEmpty') }}
            </small>
          </span>
          <button
            class="stg-link"
            type="button"
            :disabled="!row.present"
            @click="onClearStorageItem(row.id)"
          >
            {{ t('mine.storageClear') }}
          </button>
        </div>
        <button
          class="stg-row stg-row--nav"
          type="button"
          :aria-expanded="storageExpanded"
          @click="storageExpanded = !storageExpanded"
        >
          <span class="stg-row__main">
            <strong>{{ storageExpanded ? t('mine.less') : t('mine.more') }}</strong>
          </span>
          <span class="stg-chevron" :class="{ 'is-open': storageExpanded }" aria-hidden="true" />
        </button>
        <button class="stg-row" type="button" @click="onRestoreDefaults">
          <span class="stg-row__main"><strong>{{ t('mine.restoreDefaults') }}</strong></span>
        </button>
        <button class="stg-row" type="button" @click="onClearNavData">
          <span class="stg-row__main"><strong>{{ t('mine.storageClearData') }}</strong></span>
        </button>
        <button class="stg-row stg-row--danger" type="button" @click="onClearAllStorage">
          <span class="stg-row__main"><strong>{{ t('mine.storageClearAll') }}</strong></span>
        </button>
      </section>

      <template v-if="showIdentity">
        <p class="stg-caption">{{ t('mine.device') }}</p>
        <section class="stg-group">
          <div
            v-for="row in visibleDeviceRows"
            :key="row.key"
            class="stg-row stg-row--static"
          >
            <span class="stg-row__main">
              <strong>{{ t(row.key) }}</strong>
            </span>
            <span class="stg-value stg-value--wrap">{{ row.value }}</span>
          </div>
          <button
            class="stg-row stg-row--nav"
            type="button"
            :aria-expanded="deviceExpanded"
            @click="deviceExpanded = !deviceExpanded"
          >
            <span class="stg-row__main">
              <strong>{{ deviceExpanded ? t('mine.less') : t('mine.more') }}</strong>
            </span>
            <span class="stg-chevron" :class="{ 'is-open': deviceExpanded }" aria-hidden="true" />
          </button>
        </section>
      </template>
    </div>
  </div>
</template>
