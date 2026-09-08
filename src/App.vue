<script setup>
import { nextTick, ref, watch } from 'vue'
import NavMap from './components/NavMap.vue'
import QuickNav from './components/QuickNav.vue'
import MapSettings from './components/MapSettings.vue'

const TABS = [
  { id: 'home', label: '首页' },
  { id: 'quick', label: '快捷导航' },
  { id: 'mine', label: '我的' },
]

const tab = ref('home')
const navigating = ref(false)
const mapRef = ref(null)
const quickRef = ref(null)

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
  if (navigating.value) tab.value = 'home'
}

async function onSelectHistory(item) {
  tab.value = 'home'
  await nextTick()
  await mapRef.value?.applyHistoryItem?.(item)
}
</script>

<template>
  <div
    class="app-shell"
    :class="{ 'is-nav': navigating, 'has-tabs': !navigating }"
  >
    <div class="app-shell__main">
      <!-- 地图常驻，避免切页重建 -->
      <NavMap
        ref="mapRef"
        class="app-page app-page--map"
        :class="{ 'is-dimmed': tab !== 'home' }"
        :active="tab === 'home'"
        @navigating-change="onNavigatingChange"
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
        v-if="!navigating"
        class="tab-bar"
        aria-label="主导航"
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
  </div>
</template>
