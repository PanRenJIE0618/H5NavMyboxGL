const IGNORE_KEY = 'h5nav:ignoreBuildVersion'

const listeners = new Set()
let baseline = String(import.meta.env.VITE_APP_BUILD_VERSION || '').trim() || ''
let remote = ''
let pending = false
let navigating = false
let timer = 0
let started = false

export function getVersionUiState() {
  return {
    pending: pending && !navigating && remote && remote !== getIgnored(),
    remote,
    baseline,
  }
}

export function setNavigating(value) {
  navigating = Boolean(value)
  emit()
}

export function subscribeVersion(fn) {
  listeners.add(fn)
  fn(getVersionUiState())
  return () => listeners.delete(fn)
}

export function dismissVersionPrompt() {
  if (remote) sessionStorage.setItem(IGNORE_KEY, remote)
  emit()
}

export function refreshToLatest() {
  const url = new URL(location.href)
  url.searchParams.set('_v', remote || String(Date.now()))
  location.replace(url.toString())
}

export function startVersionWatcher({ intervalMs = 60_000 } = {}) {
  if (!import.meta.env.PROD || started || typeof window === 'undefined') return () => {}
  started = true
  const tick = () => {
    void checkRemote()
  }
  tick()
  timer = window.setInterval(tick, intervalMs)
  const onVis = () => {
    if (document.visibilityState === 'visible') tick()
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', tick)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', tick)
    started = false
  }
}

async function checkRemote() {
  try {
    const res = await fetch(`/BUILD-VERSION?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const text = (await res.text()).trim()
    if (!text) return
    remote = text
    if (!baseline) baseline = text
    pending = Boolean(baseline && remote && remote !== baseline)
    emit()
  } catch {
    /* ignore version probe errors */
  }
}

function getIgnored() {
  try {
    return sessionStorage.getItem(IGNORE_KEY) || ''
  } catch {
    return ''
  }
}

function emit() {
  const snap = getVersionUiState()
  listeners.forEach((fn) => {
    try {
      fn(snap)
    } catch {
      /* ignore */
    }
  })
}
