<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { toast } from '../lib/toast.js'

const items = ref([])
let stop = () => {}
onMounted(() => {
  stop = toast.subscribe((list) => {
    items.value = list
  })
})
onUnmounted(() => stop())
</script>

<template>
  <div class="app-toast-host" aria-live="polite">
    <TransitionGroup name="app-toast">
      <div
        v-for="item in items"
        :key="item.id"
        class="app-toast"
        :class="`is-${item.type}`"
        role="status"
      >
        {{ item.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
