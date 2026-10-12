<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import NavMap from './components/nav/NavMap.vue'
import QuickNav from './components/QuickNav.vue'
import MapSettings from './components/MapSettings.vue'
import LoginPage from './components/auth/LoginPage.vue'
import InspectionListPage from './components/inspection/InspectionListPage.vue'
import AppToastHost from './components/AppToastHost.vue'
import AppVersionBanner from './components/AppVersionBanner.vue'
import { SHOW_AUTH_INSPECTION_UI } from './config/featureFlags'
import { isLoggedIn, onAuthChange } from './lib/auth'
import { t } from './i18n'
import { dismissBootSplash, setBootProgress } from './lib/bootSplash'
import { setNavigating } from './lib/appVersion'

const TABS = computed(() => {
  const base = [
    { id: 'home', label: t('app.tab.home') },
    { id: 'quick', label: t('app.tab.quick') },
    { id: 'mine', label: t('app.tab.mine') },
  ]
  if (!SHOW_AUTH_INSPECTION_UI) return base
  return [...base, { id: 'inspection', label: t('app.tab.inspection') }]
})

const tabBarWide = computed(() => TABS.value.length > 3)

const tab = ref('home')
const navigating = ref(false)
const mapRef = ref(null)
const quickRef = ref(null)
const bootDone = ref(false)

/** 独立登录页：上图且未登录时默认展示；可稍后再说或从「我的」再次打开 */
const authVisible = ref(SHOW_AUTH_INSPECTION_UI && !isLoggedIn())

let stopAuthWatch = () => {}

onMounted(() => {
  stopAuthWatch = onAuthChange((state) => {
    if (state?.isLoggedIn) authVisible.value = false
  })
})

onUnmounted(() => stopAuthWatch())

watch(tab, (id) => {
  if (id === 'quick') {
    nextTick(() => quickRef.value?.refresh?.())
  }
})

function setTab(id) {
  if (navigating.value && id !== 'home') return
  if (authVisible.value) return
  tab.value = id
}

function closeAuthAndGoHome() {
  authVisible.value = false
  tab.value = 'home'
}

function onLoginSuccess() {
  closeAuthAndGoHome()
}

function onLoginSkip() {
  closeAuthAndGoHome()
}

function onOpenLogin() {
  if (!SHOW_AUTH_INSPECTION_UI) return
  authVisible.value = true
}

function onNavigatingChange(value) {
  navigating.value = Boolean(value)
  setNavigating(navigating.value)
  if (navigating.value) {
    authVisible.value = false
    tab.value = 'home'
  }
}

async function onSelectHistory(item) {
  authVisible.value = false
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
    :class="{
      'is-nav': navigating,
      'has-tabs': !navigating && !authVisible,
      'is-booting': !bootDone,
      'is-auth': authVisible,
    }"
  >
    <div class="app-shell__main">
      <NavMap
        ref="mapRef"
        class="app-page app-page--map"
        :class="{ 'is-dimmed': tab !== 'home' || authVisible }"
        :active="tab === 'home' && !authVisible"
        @navigating-change="onNavigatingChange"
        @map-ready="onMapReady"
      />

      <Transition name="page-sheet">
        <QuickNav
          v-if="!authVisible && tab === 'quick'"
          ref="quickRef"
          class="app-page app-page--overlay"
          @select="onSelectHistory"
          @go-home="setTab('home')"
        />
      </Transition>

      <Transition name="page-sheet">
        <MapSettings
          v-if="!authVisible && tab === 'mine'"
          class="app-page app-page--overlay"
          embedded
          @open-login="onOpenLogin"
        />
      </Transition>

      <Transition name="page-sheet">
        <InspectionListPage
          v-if="SHOW_AUTH_INSPECTION_UI && !authVisible && tab === 'inspection'"
          class="app-page app-page--overlay"
        />
      </Transition>

      <Transition name="page-sheet">
        <LoginPage
          v-if="SHOW_AUTH_INSPECTION_UI && authVisible"
          class="app-page app-page--overlay app-page--auth"
          @success="onLoginSuccess"
          @skip="onLoginSkip"
        />
      </Transition>
    </div>

    <Transition name="tab-bar">
      <nav
        v-if="!navigating && !authVisible && bootDone"
        class="tab-bar"
        :aria-label="t('app.navAria')"
      >
        <div
          class="tab-bar__group"
          :class="{ 'is-wide': tabBarWide }"
          role="tablist"
        >
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
