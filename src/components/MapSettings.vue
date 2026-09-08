<script setup>
import { ref, onMounted } from 'vue'
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

const emit = defineEmits(['back'])

const theme = ref(getStoredUiTheme())
const basemap = ref(getStoredBasemap())

onMounted(() => {
  theme.value = getStoredUiTheme()
  basemap.value = getStoredBasemap()
})

function chooseTheme(id) {
  theme.value = setUiTheme(id)
}

function chooseBasemap(id) {
  basemap.value = setBasemap(id)
}

function onBack() {
  emit('back')
}
</script>

<template>
  <div class="settings-page" role="dialog" aria-labelledby="settings-title">
    <header class="settings-page__bar">
      <button class="settings-page__back" type="button" aria-label="返回地图" @click="onBack">
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
      <h1 id="settings-title" class="settings-page__title">地图设置</h1>
    </header>

    <section class="settings-page__section">
      <h2 class="settings-page__h">界面风格</h2>
      <p class="settings-page__hint">选择面板与文字配色，不影响地图底图。</p>
      <div class="theme-list" role="radiogroup" aria-label="界面风格">
        <button
          v-for="item in UI_THEME_OPTIONS"
          :key="item.id"
          class="theme-card"
          type="button"
          role="radio"
          :aria-checked="theme === item.id"
          :class="{ 'is-active': theme === item.id }"
          @click="chooseTheme(item.id)"
        >
          <span class="theme-card__swatch" :data-preview="item.id" aria-hidden="true" />
          <span class="theme-card__text">
            <strong>{{ item.label }}</strong>
            <small>{{ item.desc }}</small>
          </span>
          <span class="theme-card__check" aria-hidden="true">{{ theme === item.id ? '✓' : '' }}</span>
        </button>
      </div>
    </section>

    <section class="settings-page__section settings-page__section--tight">
      <h2 class="settings-page__h">底图</h2>
      <p class="settings-page__hint">切换天地图底图类型（矢量 / 影像 / 地形）。</p>
      <div class="theme-list" role="radiogroup" aria-label="底图">
        <button
          v-for="item in BASEMAP_OPTIONS"
          :key="item.id"
          class="theme-card"
          type="button"
          role="radio"
          :aria-checked="basemap === item.id"
          :class="{ 'is-active': basemap === item.id }"
          @click="chooseBasemap(item.id)"
        >
          <span class="theme-card__swatch" :data-basemap="item.id" aria-hidden="true" />
          <span class="theme-card__text">
            <strong>{{ item.label }}</strong>
            <small>{{ item.desc }}</small>
          </span>
          <span class="theme-card__check" aria-hidden="true">{{ basemap === item.id ? '✓' : '' }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
