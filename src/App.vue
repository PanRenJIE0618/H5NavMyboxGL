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
      <NavMap
        ref="mapRef"
        v-show="tab === 'home'"
        :active="tab === 'home'"
        @navigating-change="onNavigatingChange"
      />
      <QuickNav
        v-show="tab === 'quick'"
        ref="quickRef"
        @select="onSelectHistory"
        @go-home="setTab('home')"
      />
      <MapSettings v-show="tab === 'mine'" embedded />
    </div>

    <nav
      v-show="!navigating"
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
  </div>
</template>
