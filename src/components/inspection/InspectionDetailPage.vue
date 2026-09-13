<script setup>
import { onMounted, ref, watch } from 'vue'
import { locale, t } from '../../i18n'
import { getInspectionTask, submitInspectionResult } from '../../lib/inspection.js'

const props = defineProps({
  taskId: { type: String, required: true },
})

const emit = defineEmits(['back', 'submitted'])

const task = ref(null)
const remark = ref('')
const photos = ref([])
const lng = ref(0)
const lat = ref(0)
const accuracy = ref(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const photoSeq = ref(0)

function tx(key, params) {
  void locale.value
  return t(key, params)
}

function statusLabel(status) {
  const key = `inspection.status.${status}`
  const label = tx(key)
  return label === key ? status : label
}

async function loadTask() {
  error.value = ''
  notice.value = ''
  task.value = null
  if (!props.taskId) return
  try {
    const next = await getInspectionTask(props.taskId)
    task.value = next
    remark.value = next.remark || ''
    photos.value = []
    lng.value = next.lng
    lat.value = next.lat
    accuracy.value = null
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : t('inspection.submitFail')
  }
}

onMounted(loadTask)
watch(() => props.taskId, loadTask)

function onPickPhotos(event) {
  const files = Array.from(event.target?.files || [])
  for (const file of files) {
    photoSeq.value += 1
    photos.value.push({
      id: `photo-${photoSeq.value}`,
      name: file?.name || `photo-${photoSeq.value}`,
    })
  }
  if (event.target) event.target.value = ''
}

function onLocate() {
  error.value = ''
  notice.value = ''
  if (!navigator.geolocation) {
    error.value = t('inspection.submitFail')
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lng.value = pos.coords.longitude
      lat.value = pos.coords.latitude
      accuracy.value = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
    },
    () => {
      error.value = t('inspection.submitFail')
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
  )
}

async function onSubmit() {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    await submitInspectionResult({
      taskId: props.taskId,
      lng: lng.value,
      lat: lat.value,
      accuracy: accuracy.value,
      photos: photos.value.map((item) => ({ id: item.id, name: item.name })),
      remark: remark.value,
      submittedAt: Date.now(),
    })
    notice.value = t('inspection.submitOk')
    emit('submitted', props.taskId)
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : t('inspection.submitFail')
  } finally {
    busy.value = false
  }
}

function onBack() {
  emit('back')
}
</script>

<template>
  <div class="inspection-page inspection-page--detail" role="region" aria-labelledby="inspection-detail-title">
    <header class="inspection-page__bar">
      <button
        class="inspection-page__back"
        type="button"
        :aria-label="tx('inspection.back')"
        @click="onBack"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15.2 5.2 L8.4 12 l6.8 6.8"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <h1 id="inspection-detail-title" class="inspection-page__title">
        {{ tx('inspection.detail') }}
      </h1>
    </header>

    <div class="inspection-page__body">
      <p v-if="error" class="inspection-page__error" role="alert">{{ error }}</p>
      <p v-else-if="notice" class="inspection-page__ok" role="status">{{ notice }}</p>

      <section v-if="task" class="inspection-page__card">
        <h2 class="inspection-page__card-title">{{ task.title }}</h2>
        <p class="inspection-page__meta">
          <span class="inspection-page__chip" :data-status="task.status">
            {{ statusLabel(task.status) }}
          </span>
          <span>{{ tx('inspection.asset') }} {{ task.assetCode || '—' }}</span>
        </p>
        <p v-if="task.address" class="inspection-page__addr">{{ task.address }}</p>
        <p class="inspection-page__coords">{{ lng.toFixed(6) }}, {{ lat.toFixed(6) }}</p>
      </section>

      <section v-if="task" class="inspection-page__card">
        <label class="inspection-page__field">
          <span>{{ tx('inspection.remark') }}</span>
          <textarea v-model="remark" rows="3" :disabled="busy" />
        </label>

        <div class="inspection-page__field">
          <span>{{ tx('inspection.photos') }}</span>
          <label class="inspection-page__file">
            <input type="file" accept="image/*" multiple :disabled="busy" @change="onPickPhotos" />
            {{ tx('inspection.addPhoto') }}
          </label>
          <ul v-if="photos.length" class="inspection-page__photos">
            <li v-for="photo in photos" :key="photo.id">{{ photo.name }}</li>
          </ul>
        </div>

        <button class="inspection-page__btn inspection-page__btn--ghost" type="button" :disabled="busy" @click="onLocate">
          {{ tx('inspection.locate') }}
        </button>
        <button class="inspection-page__btn" type="button" :disabled="busy || !task" @click="onSubmit">
          {{ tx('inspection.submit') }}
        </button>
      </section>
    </div>
  </div>
</template>
