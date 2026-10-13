<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import {
  clearDebugLog,
  closeDebugConsole,
  debugConsoleOpen,
  debugLines,
  formatDebugLogText,
} from '../lib/debugLog'

const listEl = ref(null)
/** @type {import('vue').Ref<Record<number, boolean>>} */
const expanded = ref({})
const copyHint = ref('')

const countLabel = computed(() =>
  t('log.count', { n: String(debugLines.value.length) }),
)

watch(
  () => debugLines.value.length,
  async () => {
    await nextTick()
    if (listEl.value) listEl.value.scrollTop = 0
  },
)

watch(debugConsoleOpen, (open) => {
  if (!open) {
    expanded.value = {}
    copyHint.value = ''
  }
})

function toggleExpand(id) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}

async function onCopy() {
  const text = formatDebugLogText()
  if (!text) {
    copyHint.value = t('log.empty')
    return
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      throw new Error('no-clipboard')
    }
    copyHint.value = t('log.copied')
  } catch {
    copyHint.value = t('log.copyFail')
  }
  window.setTimeout(() => {
    if (copyHint.value === t('log.copied') || copyHint.value === t('log.copyFail')) {
      copyHint.value = ''
    }
  }, 1600)
}

function onKeydown(event) {
  if (event.key === 'Escape' && debugConsoleOpen.value) {
    closeDebugConsole()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dev-console">
      <div
        v-if="debugConsoleOpen"
        class="dev-console"
        role="dialog"
        aria-modal="true"
        :aria-label="t('log.title')"
      >
        <button
          class="dev-console__scrim"
          type="button"
          :aria-label="t('map.logClose')"
          @click="closeDebugConsole"
        />
        <div class="dev-console__panel">
          <header class="dev-console__bar">
            <div class="dev-console__heading">
              <strong>{{ t('log.title') }}</strong>
              <span class="dev-console__count">{{ countLabel }}</span>
            </div>
            <div class="dev-console__actions">
              <button class="dev-console__btn" type="button" @click="onCopy">
                {{ t('log.copy') }}
              </button>
              <button class="dev-console__btn" type="button" @click="clearDebugLog">
                {{ t('log.clear') }}
              </button>
              <button
                class="dev-console__btn dev-console__btn--close"
                type="button"
                @click="closeDebugConsole"
              >
                {{ t('map.logClose') }}
              </button>
            </div>
          </header>
          <p v-if="copyHint" class="dev-console__toast" role="status">{{ copyHint }}</p>
          <div ref="listEl" class="dev-console__list">
            <p v-if="!debugLines.length" class="dev-console__empty">{{ t('log.empty') }}</p>
            <article
              v-for="line in debugLines"
              :key="line.id"
              class="dev-console__item"
              :class="{ 'has-detail': Boolean(line.detail) }"
            >
              <button
                v-if="line.detail"
                class="dev-console__row"
                type="button"
                @click="toggleExpand(line.id)"
              >
                <time class="dev-console__time">{{ line.time }}</time>
                <span class="dev-console__title">{{ line.title }}</span>
                <span class="dev-console__caret" aria-hidden="true">{{
                  expanded[line.id] ? '▾' : '▸'
                }}</span>
              </button>
              <div v-else class="dev-console__row is-static">
                <time class="dev-console__time">{{ line.time }}</time>
                <span class="dev-console__title">{{ line.title }}</span>
              </div>
              <pre v-if="line.detail && expanded[line.id]" class="dev-console__detail">{{
                line.detail
              }}</pre>
            </article>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
