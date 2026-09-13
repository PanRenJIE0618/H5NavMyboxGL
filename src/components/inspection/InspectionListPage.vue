<script setup>
import { onMounted, ref, watch } from 'vue'
import { locale, t } from '../../i18n'
import { listInspectionTasks } from '../../lib/inspection.js'
import InspectionDetailPage from './InspectionDetailPage.vue'

const FILTERS = [
  { id: 'all', key: 'inspection.filter.all' },
  { id: 'pending', key: 'inspection.status.pending' },
  { id: 'done', key: 'inspection.status.done' },
]

const filter = ref('all')
const tasks = ref([])
const selectedId = ref('')
const loading = ref(false)
const error = ref('')

function tx(key, params) {
  void locale.value
  return t(key, params)
}

function statusLabel(status) {
  const key = `inspection.status.${status}`
  const label = tx(key)
  return label === key ? status : label
}

async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    const status = filter.value === 'all' ? undefined : filter.value
    tasks.value = await listInspectionTasks(status ? { status } : {})
  } catch (cause) {
    tasks.value = []
    error.value = cause instanceof Error && cause.message ? cause.message : t('inspection.empty')
  } finally {
    loading.value = false
  }
}

onMounted(loadTasks)
watch(filter, loadTasks)

function openTask(id) {
  selectedId.value = String(id || '')
}

function onBack() {
  selectedId.value = ''
  loadTasks()
}

function onSubmitted() {
  selectedId.value = ''
  loadTasks()
}
</script>

<template>
  <InspectionDetailPage
    v-if="selectedId"
    :task-id="selectedId"
    @back="onBack"
    @submitted="onSubmitted"
  />

  <div
    v-else
    class="inspection-page"
    role="region"
    aria-labelledby="inspection-list-title"
  >
    <header class="inspection-page__bar">
      <h1 id="inspection-list-title" class="inspection-page__title">
        {{ tx('inspection.title') }}
      </h1>
    </header>

    <div class="inspection-page__body">
      <div class="inspection-page__filters" role="tablist" :aria-label="tx('inspection.title')">
        <button
          v-for="item in FILTERS"
          :key="item.id"
          class="inspection-page__filter"
          type="button"
          role="tab"
          :class="{ 'is-active': filter === item.id }"
          :aria-selected="filter === item.id"
          @click="filter = item.id"
        >
          {{ tx(item.key) }}
        </button>
      </div>

      <p v-if="error" class="inspection-page__error" role="alert">{{ error }}</p>
      <p v-else-if="!loading && !tasks.length" class="inspection-page__empty">
        {{ tx('inspection.empty') }}
      </p>

      <div v-else class="inspection-page__list">
        <button
          v-for="item in tasks"
          :key="item.id"
          class="inspection-page__item"
          type="button"
          @click="openTask(item.id)"
        >
          <div class="inspection-page__item-body">
            <strong>{{ item.title }}</strong>
            <span>{{ tx('inspection.asset') }} {{ item.assetCode || '—' }}</span>
            <small v-if="item.address">{{ item.address }}</small>
          </div>
          <span class="inspection-page__chip" :data-status="item.status">
            {{ statusLabel(item.status) }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
