<script setup>
import { t } from '../../i18n'
import { debugConsoleOpen } from '../../lib/debugLog'

defineProps({
  keyword: { type: String, default: '' },
  mapReady: { type: Boolean, default: false },
  navigating: { type: Boolean, default: false },
  searching: { type: Boolean, default: false },
  showSearchPanel: { type: Boolean, default: false },
  searchError: { type: String, default: '' },
  places: { type: Array, default: () => [] },
  headingAvailable: { type: Boolean, default: false },
  headingText: { type: String, default: '—' },
  compassRotate: { type: Number, default: 0 },
})

const emit = defineEmits([
  'update:keyword',
  'toggle-debug',
  'search',
  'close-search',
  'select-place',
])
</script>

<template>
  <header class="mast">
    <div class="mast__row">
      <div class="mast__copy">
        <div class="mast__title">
          <h1>{{ t('map.title') }}</h1>
          <button
            class="mast__log"
            type="button"
            :class="{ 'is-on': debugConsoleOpen }"
            @click="emit('toggle-debug')"
          >
            {{ debugConsoleOpen ? t('map.logClose') : t('map.log') }}
          </button>
        </div>
      </div>
      <div class="mast__heading" :aria-label="t('map.headingAria')">
        <span
          class="mast__needle"
          :class="{ 'is-live': headingAvailable }"
          :style="{ transform: `rotate(${compassRotate}deg)` }"
        />
        <small>{{ headingAvailable ? headingText : t('map.noHeading') }}</small>
      </div>
    </div>
    <form class="search" @submit.prevent="emit('search')">
      <input
        class="search__input"
        type="search"
        enterkeyhint="search"
        :value="keyword"
        :placeholder="t('map.searchPlaceholder')"
        :disabled="!mapReady || navigating"
        @input="emit('update:keyword', $event.target.value)"
      />
      <button class="search__btn" type="submit" :disabled="!mapReady || searching || navigating">
        {{ searching ? t('map.searching') : t('map.search') }}
      </button>
    </form>
    <Transition name="panel-drop">
      <div v-if="showSearchPanel" class="search-panel">
        <div class="search-panel__bar">
          <span>{{ searchError ? t('map.searchTip') : t('map.foundResults', { n: places.length }) }}</span>
          <button class="search-panel__close" type="button" @click="emit('close-search')">
            {{ t('map.close') }}
          </button>
        </div>
        <p v-if="searchError" class="search-panel__error">{{ searchError }}</p>
        <button
          v-for="(place, index) in places"
          :key="`${place.name}-${index}`"
          class="search-item"
          type="button"
          @click.stop="emit('select-place', place)"
        >
          <strong>{{ place.name }}</strong>
          <span>{{
            place.suggest
              ? t('map.suggestSearch')
              : place.address || `${place.lng.toFixed(4)}, ${place.lat.toFixed(4)}`
          }}</span>
        </button>
      </div>
    </Transition>
  </header>
</template>
