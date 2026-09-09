<script setup>
import { t } from '../../i18n'
import { formatDistance } from '../../lib/geo'

defineProps({
  pendingResume: { type: Object, default: null },
  clipboardOffer: { type: Object, default: null },
  navigating: { type: Boolean, default: false },
  routing: { type: Boolean, default: false },
  offRoute: { type: Boolean, default: false },
  rerouting: { type: Boolean, default: false },
  offRouteBannerText: { type: String, default: '' },
})

defineEmits([
  'discard-resume',
  'confirm-resume',
  'discard-clipboard',
  'confirm-clipboard',
  'reroute',
])
</script>

<template>
  <Transition name="banner-down">
    <div v-if="pendingResume && !navigating" class="resume-banner" role="status">
      <div class="resume-banner__body">
        <strong>{{ t('banner.resumeTitle') }}</strong>
        <span>
          {{
            t('banner.resumeBody', {
              name: pendingResume.destination?.name || t('map.destination'),
            })
          }}
          <template v-if="pendingResume.remainingMeters != null">
            {{ t('banner.resumeRemain', { distance: formatDistance(pendingResume.remainingMeters) }) }}
          </template>
        </span>
      </div>
      <div class="resume-banner__actions">
        <button
          class="resume-banner__btn resume-banner__btn--ghost"
          type="button"
          @click="$emit('discard-resume')"
        >
          {{ t('banner.discard') }}
        </button>
        <button class="resume-banner__btn" type="button" @click="$emit('confirm-resume')">
          {{ t('banner.continue') }}
        </button>
      </div>
    </div>
  </Transition>

  <Transition name="banner-down">
    <div
      v-if="clipboardOffer && !pendingResume && !navigating"
      class="resume-banner resume-banner--clipboard"
      role="status"
    >
      <div class="resume-banner__body">
        <strong>{{ t('banner.clipboardTitle') }}</strong>
        <span>{{ t('banner.clipboardBody', { preview: clipboardOffer.preview }) }}</span>
      </div>
      <div class="resume-banner__actions">
        <button
          class="resume-banner__btn resume-banner__btn--ghost"
          type="button"
          @click="$emit('discard-clipboard')"
        >
          {{ t('banner.ignore') }}
        </button>
        <button
          class="resume-banner__btn"
          type="button"
          :disabled="routing"
          @click="$emit('confirm-clipboard')"
        >
          {{ routing ? t('banner.replanning') : t('banner.goNav') }}
        </button>
      </div>
    </div>
  </Transition>

  <Transition name="banner-down">
    <div v-if="navigating && (offRoute || rerouting)" class="offroute-banner" role="alert">
      <div class="offroute-banner__body">
        <strong>{{ rerouting ? t('banner.rerouting') : t('banner.offRoute') }}</strong>
        <span>{{ offRouteBannerText }}</span>
      </div>
      <button
        class="offroute-banner__btn"
        type="button"
        :disabled="rerouting"
        @click="$emit('reroute')"
      >
        {{ rerouting ? t('banner.replanning') : t('banner.replan') }}
      </button>
    </div>
  </Transition>
</template>
