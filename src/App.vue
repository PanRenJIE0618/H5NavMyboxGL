<script setup>
import { ref } from 'vue'
import NavMap from './components/NavMap.vue'
import MapSettings from './components/MapSettings.vue'

const page = ref('map')

function openSettings() {
  page.value = 'settings'
}

function backToMap() {
  page.value = 'map'
}
</script>

<template>
  <NavMap
    v-show="page === 'map'"
    :active="page === 'map'"
    @open-settings="openSettings"
  />
  <MapSettings v-if="page === 'settings'" @back="backToMap" />
</template>
