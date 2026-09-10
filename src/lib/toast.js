const listeners = new Set()
let seq = 0
/** @type {{ id: number, type: string, message: string, duration: number }[]} */
let items = []
let lastKey = ''
let lastAt = 0

export function show(opts) {
  const message = String(opts?.message || '').trim()
  if (!message) return null
  const type = opts?.type || 'info'
  const duration = opts?.duration ?? 3200
  const now = Date.now()
  const key = `${type}:${message}`
  if (key === lastKey && now - lastAt < 1800) return null
  lastKey = key
  lastAt = now
  const item = { id: ++seq, type, message, duration }
  items = [...items.slice(-1), item]
  emit()
  if (duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismiss(item.id), duration)
  }
  return item.id
}

export function error(message) {
  return show({ type: 'error', message })
}

export function dismiss(id) {
  const next = items.filter((x) => x.id !== id)
  if (next.length === items.length) return
  items = next
  emit()
}

export function clear() {
  items = []
  emit()
}

export function getItems() {
  return items.slice()
}

export function subscribe(fn) {
  listeners.add(fn)
  fn(getItems())
  return () => listeners.delete(fn)
}

function emit() {
  const snap = getItems()
  listeners.forEach((fn) => {
    try {
      fn(snap)
    } catch {
      /* ignore */
    }
  })
}

export const toast = { show, error, dismiss, clear, subscribe, getItems }
