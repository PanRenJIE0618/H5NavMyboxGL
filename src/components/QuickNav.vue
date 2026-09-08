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
      <h1 class="quick-page__title">快捷导航</h1>
      <button
        v-if="list.length"
        class="quick-page__clear"
        type="button"
        @click="onClear"
      >
        清空历史
      </button>
    </header>

    <p class="quick-page__hint">推荐点可一键设为目的地；历史来自结束导航后的记录。</p>

    <section class="quick-section" aria-labelledby="quick-recommend-title">
      <h2 id="quick-recommend-title" class="quick-section__title">推荐导航点</h2>
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
          <span class="quick-card__go" aria-hidden="true">前往</span>
        </button>
      </div>
    </section>

    <section class="quick-section" aria-labelledby="quick-history-title">
      <h2 id="quick-history-title" class="quick-section__title">历史导航点</h2>

      <p v-if="!list.length" class="quick-page__empty">暂无导航记录，结束一次导航后会出现在这里</p>

      <div v-else class="quick-list">
        <button
          v-for="item in list"
          :key="item.id"
          class="quick-card"
          type="button"
          @click="onSelectHistory(item)"
        >
          <div class="quick-card__body">
            <strong>{{ item.destination?.name || '目的地' }}</strong>
            <span>
              {{ item.travelMode === 'walk' ? '步行' : '驾车' }}
              · {{ formatDistance(item.distanceMeters) }}
              · {{ formatDuration(item.durationSeconds) }}
              <template v-if="item.arrived"> · 已到达</template>
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
            aria-label="删除该记录"
            @click="onRemove(item.id, $event)"
            @keydown.enter.prevent="onRemove(item.id, $event)"
          >
            删除
          </span>
        </button>
      </div>
    </section>
  </div>
</template>
