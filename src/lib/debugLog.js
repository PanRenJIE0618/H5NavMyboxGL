import { ref } from 'vue'

const MAX_LINES = 200

/** @typedef {{ id: number, time: string, title: string, detail: string }} DebugEntry */

/** @type {import('vue').Ref<DebugEntry[]>} */
export const debugLines = ref([])
export const debugConsoleOpen = ref(false)

let seq = 0

function formatPart(part) {
  if (part == null) return String(part)
  if (typeof part === 'object') {
    try {
      return JSON.stringify(part, null, 2)
    } catch {
      return String(part)
    }
  }
  return String(part)
}

export function debugLog(...parts) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const titles = []
  const details = []
  for (const part of parts) {
    if (part != null && typeof part === 'object') details.push(formatPart(part))
    else titles.push(formatPart(part))
  }
  const title = titles.join(' ').trim() || (details.length ? '详情' : 'log')
  const detail = details.join('\n\n')
  const entry = {
    id: ++seq,
    time,
    title,
    detail,
  }
  debugLines.value = [entry, ...debugLines.value].slice(0, MAX_LINES)
  console.log(`[debug ${time}]`, ...parts)
}

export function clearDebugLog() {
  debugLines.value = []
}

export function closeDebugConsole() {
  debugConsoleOpen.value = false
}

export function toggleDebugConsole() {
  debugConsoleOpen.value = !debugConsoleOpen.value
}

/** 复制全部日志纯文本 */
export function formatDebugLogText() {
  return debugLines.value
    .map((line) => {
      const head = `[${line.time}] ${line.title}`
      return line.detail ? `${head}\n${line.detail}` : head
    })
    .join('\n\n')
}
