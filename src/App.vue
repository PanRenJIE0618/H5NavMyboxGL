<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import NavMap from './components/nav/NavMap.vue'
import QuickNav from './components/QuickNav.vue'
import MapSettings from './components/MapSettings.vue'
import AppToastHost from './components/AppToastHost.vue'
import AppVersionBanner from './components/AppVersionBanner.vue'
import { t } from './i18n'
import { dismissBootSplash, setBootProgress } from './lib/bootSplash'
import { setNavigating } from './lib/appVersion'

const TABS = computed(() => [
  { id: 'home', label: t('app.tab.home') },
  { id: 'quick', label: t('app.tab.quick') },
  { id: 'mine', label: t('app.tab.mine') },
])

const tab = ref('home')
const navigating = ref(false)
const mapRef = ref(null)
const quickRef = ref(null)
const bootDone = ref(false)

watch(tab, (id) => {
  if (id === 'quick') {
    nextTick(() => quickRef.value?.refresh?.())
  }
})

function setTab(id) {
  if (navigating.value && id !== 'home') return
  tab.value = id
}

function onNavigatingChange(value) {
  navigating.value = Boolean(value)
  setNavigating(navigating.value)
  if (navigating.value) tab.value = 'home'
}

async function onSelectHistory(item) {
  tab.value = 'home'
  await nextTick()
  await mapRef.value?.applyHistoryItem?.(item)
}

function onMapReady() {
  if (bootDone.value) return
  bootDone.value = true
  setBootProgress(100, t('boot.ready'))
  dismissBootSplash()
}
</script>

<template>
  <div
    class="app-shell"
    :class="{ 'is-nav': navigating, 'has-tabs': !navigating, 'is-booting': !bootDone }"
  >
    <div class="app-shell__main">
      <NavMap
        ref="mapRef"
        class="app-page app-page--map"
        :class="{ 'is-dimmed': tab !== 'home' }"
        :active="tab === 'home'"
        @navigating-change="onNavigatingChange"
        @map-ready="onMapReady"
      />

      <Transition name="page-sheet">
        <QuickNav
          v-if="tab === 'quick'"
          ref="quickRef"
          class="app-page app-page--overlay"
          @select="onSelectHistory"
          @go-home="setTab('home')"
        />
      </Transition>

      <Transition name="page-sheet">
        <MapSettings
          v-if="tab === 'mine'"
          class="app-page app-page--overlay"
          embedded
        />
      </Transition>
    </div>

    <Transition name="tab-bar">
      <nav
        v-if="!navigating && bootDone"
        class="tab-bar"
        :aria-label="t('app.navAria')"
      >
        <div class="tab-bar__group" role="tablist">
          <button
            v-for="item in TABS"
            :key="item.id"
            class="tab-bar__btn"
            type="button"
            role="tab"
            :class="{ 'is-active': tab === item.id }"
            :aria-selected="tab === item.id"
            @click="setTab(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </nav>
    </Transition>

    <AppToastHost />
    <AppVersionBanner />
  </div>
</template>
