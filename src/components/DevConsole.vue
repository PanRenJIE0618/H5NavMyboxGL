<script setup>
import { nextTick, ref, watch } from 'vue'
import { clearDebugLog, debugConsoleOpen, debugLines } from '../lib/debugLog'

const listEl = ref(null)

watch(
  () => debugLines.value.length,
  async () => {
    await nextTick()
    if (listEl.value) listEl.value.scrollTop = 0
  },
)
</script>

<template>
  <Transition name="sheet-up">
    <div v-if="debugConsoleOpen" class="dev-console">
      <div class="dev-console__bar">
        <button class="dev-console__clear" type="button" @click="clearDebugLog">清空</button>
        <span class="dev-console__hint">定位调试 · 新日志在上</span>
      </div>
      <div ref="listEl" class="dev-console__list">
        <p v-if="!debugLines.length" class="dev-console__empty">暂无日志</p>
        <pre v-for="(line, index) in debugLines" :key="`${index}-${line}`">{{ line }}</pre>
      </div>
    </div>
  </Transition>
</template>
