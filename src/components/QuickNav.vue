<script setup>
import { onMounted, ref } from 'vue'
import {
  clearNavHistory,
  formatNavHistoryTime,
  loadNavHistory,
  removeNavHistory,
} from '../lib/navHistory'
import { listRecommendPlaces, recommendToHistoryShape } from '../lib/recommendPlaces'
import { formatDistance, formatDuration } from '../lib/geo'
import { t } from '../i18n'

const emit = defineEmits(['select', 'go-home'])

const recommends = ref(listRecommendPlaces())
const list = ref(loadNavHistory())

function refresh() {
  recommends.value = listRecommendPlaces()
  list.value = loadNavHistory()
}

onMounted(refresh)

defineExpose({ refresh })

function onClear() {
  list.value = clearNavHistory()
}

function onRemove(id, event) {
  event?.stopPropagation?.()
  list.value = removeNavHistory(id)
}

function onSelectHistory(item) {
  emit('select', item)
}

function onSelectRecommend(place) {
  const payload = recommendToHistoryShape(place)
  if (payload) emit('select', payload)
}
</script>

<template>
  <div class="quick-page">
    <header class="quick-page__bar">
      <h1 class="quick-page__title">{{ t('quick.title') }}</h1>
      <button
        v-if="list.length"
        class="quick-page__clear"
        type="button"
        @click="onClear"
      >
        {{ t('quick.clear') }}
      </button>
    </header>

    <p class="quick-page__hint">{{ t('quick.hint') }}</p>

    <section class="quick-section" aria-labelledby="quick-recommend-title">
      <h2 id="quick-recommend-title" class="quick-section__title">{{ t('quick.recommend') }}</h2>
      <div class="quick-list quick-list--tight">
        <button
          v-for="place in recommends"
          :key="place.id"
          class="quick-card quick-card--recommend"
          type="button"
          @click="onSelectRecommend(place)"
        >
          <div class="quick-card__body">
            <strong>
              {{ place.name }}
              <span v-if="place.tag" class="quick-card__tag">{{ place.tag }}</span>
            </strong>
            <small v-if="place.address" class="quick-card__addr">{{ place.address }}</small>
          </div>
          <span class="quick-card__go" aria-hidden="true">{{ t('quick.go') }}</span>
        </button>
      </div>
    </section>

    <section class="quick-section" aria-labelledby="quick-history-title">
      <h2 id="quick-history-title" class="quick-section__title">{{ t('quick.history') }}</h2>

      <p v-if="!list.length" class="quick-page__empty">{{ t('quick.empty') }}</p>

      <div v-else class="quick-list">
        <button
          v-for="item in list"
          :key="item.id"
          class="quick-card"
          type="button"
          @click="onSelectHistory(item)"
        >
          <div class="quick-card__body">
            <strong>{{ item.destination?.name || t('quick.dest') }}</strong>
            <span>
              {{ item.travelMode === 'walk' ? t('map.walk') : t('map.drive') }}
              · {{ formatDistance(item.distanceMeters) }}
              · {{ formatDuration(item.durationSeconds) }}
              <template v-if="item.arrived"> · {{ t('quick.arrived') }}</template>
            </span>
            <small>{{ formatNavHistoryTime(item.endedAt || item.startedAt) }}</small>
            <small v-if="item.destination?.address" class="quick-card__addr">
              {{ item.destination.address }}
            </small>
          </div>
          <span
            class="quick-card__remove"
            role="button"
            tabindex="0"
            :aria-label="t('quick.removeAria')"
            @click="onRemove(item.id, $event)"
            @keydown.enter.prevent="onRemove(item.id, $event)"
          >
            {{ t('quick.remove') }}
          </span>
        </button>
      </div>
    </section>
  </div>
</template>
