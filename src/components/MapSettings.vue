<script setup>
import { computed, ref, onMounted } from 'vue'
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

const PRIMARY_DEVICE_LABELS = ['浏览器', '设备名称', '操作系统', '地图坐标系', '定位坐标方案']

const deviceSummary = computed(() => {
  const map = Object.fromEntries(deviceRows.value.map((r) => [r.label, r.value]))
  return {
    browser: map['浏览器'] || '—',
    device: map['设备名称'] || '—',
    os: map['操作系统'] || '—',
    crs: map['地图坐标系'] || '—',
  }
})

const devicePrimaryRows = computed(() =>
  deviceRows.value.filter((r) => PRIMARY_DEVICE_LABELS.includes(r.label)),
)

const deviceExtraRows = computed(() =>
  deviceRows.value.filter((r) => !PRIMARY_DEVICE_LABELS.includes(r.label)),
)

const visibleDeviceRows = computed(() =>
  deviceExpanded.value
    ? [...devicePrimaryRows.value, ...deviceExtraRows.value]
    : devicePrimaryRows.value,
)

onMounted(() => {
  theme.value = getStoredUiTheme()
  basemap.value = getStoredBasemap()
  autoViewLock.value = getAutoViewLock()
  prefs.value = getNavPrefs()
  deviceRows.value = getDeviceInfoRows()
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
        aria-label="返回地图"
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
      <h1 id="settings-title" class="settings-page__title">{{ embedded ? '我的' : '地图设置' }}</h1>
    </header>

    <div class="settings-page__body">
      <!-- 顶部摘要 -->
      <section class="mine-hero" aria-label="本机摘要">
        <div class="mine-hero__avatar" aria-hidden="true">{{ deviceSummary.device.slice(0, 1) }}</div>
        <div class="mine-hero__copy">
          <strong>{{ deviceSummary.device }}</strong>
          <span>{{ deviceSummary.browser }} · {{ deviceSummary.os }}</span>
          <small>{{ deviceSummary.crs }}</small>
        </div>
      </section>

      <!-- 外观 -->
      <section class="mine-block">
        <header class="mine-block__head">
          <h2>外观</h2>
          <p>界面配色与地图底图</p>
        </header>

        <div class="mine-card">
          <div class="mine-card__label">界面风格</div>
          <div class="mine-seg" role="radiogroup" aria-label="界面风格">
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
              {{ item.label }}
            </button>
          </div>
        </div>

        <div class="mine-card">
          <div class="mine-card__label">底图</div>
          <div class="mine-tiles" role="radiogroup" aria-label="底图">
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
              <strong>{{ item.label }}</strong>
              <small>{{ item.desc }}</small>
            </button>
          </div>
        </div>
      </section>

      <!-- 导航 -->
      <section class="mine-block">
        <header class="mine-block__head">
          <h2>导航</h2>
          <p>播报、视角与默认出行偏好</p>
        </header>

        <div class="mine-list" role="group" aria-label="导航开关">
          <button
            class="mine-list__row"
            type="button"
            role="switch"
            :aria-checked="autoViewLock"
            :class="{ 'is-on': autoViewLock }"
            @click="toggleAutoViewLock"
          >
            <span class="mine-list__text">
              <strong>自动视角锁定</strong>
              <small>{{ autoViewLock ? '跟随当前位置' : '自由拖图浏览' }}</small>
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
              <strong>语音播报</strong>
              <small>{{ voiceEnabled ? '朗读导航提示' : '仅文字提示' }}</small>
            </span>
            <span class="settings-switch__track" aria-hidden="true">
              <span class="settings-switch__thumb" />
            </span>
          </button>
        </div>

        <div class="mine-card mine-card--stack">
          <div class="mine-pref">
            <div class="mine-pref__meta">
              <strong>默认出行</strong>
              <small>进入首页时的出行方式</small>
            </div>
            <div class="mine-seg mine-seg--compact" role="radiogroup" aria-label="默认驾驶模式">
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
                {{ item.label }}
              </button>
            </div>
          </div>
          <div class="mine-pref" :class="{ 'is-disabled': travelMode === 'walk' }">
            <div class="mine-pref__meta">
              <strong>默认路线</strong>
              <small>{{ travelMode === 'walk' ? '步行无需路线偏好' : '驾车规划偏好' }}</small>
            </div>
            <div class="mine-seg mine-seg--compact" role="radiogroup" aria-label="默认路线">
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
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 本机 -->
      <section class="mine-block mine-block--last">
        <header class="mine-block__head">
          <h2>本机信息</h2>
          <p>运行环境基础信息，不含账号与安全策略</p>
        </header>

        <dl class="device-info">
          <div v-for="row in visibleDeviceRows" :key="row.label" class="device-info__row">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
        <button
          class="mine-more"
          type="button"
          :aria-expanded="deviceExpanded"
          @click="deviceExpanded = !deviceExpanded"
        >
          {{ deviceExpanded ? '收起详情' : '查看更多' }}
        </button>
      </section>
    </div>
  </div>
</template>
