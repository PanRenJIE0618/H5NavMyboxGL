import { ref } from 'vue'

const MAX_LINES = 200

export const debugLines = ref([])
export const debugConsoleOpen = ref(false)

export function debugLog(...parts) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const text = parts
    .map((part) => {
      if (part == null) return String(part)
      if (typeof part === 'object') {
        try {
          return `\n${JSON.stringify(part, null, 2)}`
        } catch {
          return String(part)
        }
      }
      return String(part)
    })
    .join(' ')

  debugLines.value = [`${time} ${text}`, ...debugLines.value].slice(0, MAX_LINES)
  console.log(`[debug ${time}]`, ...parts)
}

export function clearDebugLog() {
  debugLines.value = []
}
