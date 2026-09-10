<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { t } from '../i18n'
import {
  dismissVersionPrompt,
  refreshToLatest,
  subscribeVersion,
} from '../lib/appVersion'

const visible = ref(false)
let stop = () => {}
onMounted(() => {
  stop = subscribeVersion((state) => {
    visible.value = Boolean(state.pending)
  })
})
onUnmounted(() => stop())
</script>

<template>
  <div
    v-if="visible"
    class="app-version-banner"
    role="status"
  >
    <span class="app-version-banner__text">{{ t('version.title') }}</span>
    <button
      class="app-version-banner__btn"
      type="button"
      @click="refreshToLatest"
    >
      {{ t('version.refresh') }}
    </button>
    <button
      class="app-version-banner__close"
      type="button"
      :aria-label="t('version.dismiss')"
      @click="dismissVersionPrompt"
    >
      ×
    </button>
  </div>
</template>
