# HTTP Toast + Version Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify business `fetch` error toasts and prompt production users to refresh when `BUILD-VERSION` changes.

**Architecture:** Explicit `request()` wrapper (no global fetch patch) feeds a tiny toast bus; Vite injects build version and copies `BUILD-VERSION` to output; a production-only watcher compares `/BUILD-VERSION` and shows a banner (deferred while navigating).

**Tech Stack:** Vue 3, Vite 6, existing i18n (`t()`), native `fetch` + `AbortController`.

## Global Constraints

- Do not patch `window.fetch`.
- Do not add Service Worker.
- Version banner: user clicks「立即刷新」; never force-reload while navigating.
- Watcher only when `import.meta.env.PROD`.
- Search multi-hop requests use `silent: true`; route planning uses audible toasts.
- Leave `coordDetect.js` silent / unchanged.
- UI: brand blue `#3370ff` / theme CSS vars; no purple glow aesthetic.
- Spec: `docs/superpowers/specs/2026-09-10-http-toast-version-update-design.md`

## File map

| File | Role |
|------|------|
| `src/lib/http.js` | `HttpError`, `request()` |
| `src/lib/toast.js` | toast bus + dedupe |
| `src/lib/appVersion.js` | baseline, watcher, pending/dismiss |
| `src/components/AppToastHost.vue` | toast UI |
| `src/components/AppVersionBanner.vue` | version UI |
| `vite.config.js` | inject `VITE_APP_BUILD_VERSION`, copy `BUILD-VERSION` |
| `public/BUILD-VERSION` | served in prod (synced from root on build) |
| `src/lib/route.js` / `search.js` / `geocode.js` / `behaviorPolicy.js` | switch to `request` |
| `src/i18n/locales/{zh-CN,zh-TW,en}.js` | keys |
| `src/App.vue` / `src/main.js` | mount hosts + start watcher + wire navigating |
| `src/style.css` | toast + banner styles |

---

### Task 1: Toast bus + i18n keys

**Files:**
- Create: `src/lib/toast.js`
- Modify: `src/i18n/locales/zh-CN.js`, `zh-TW.js`, `en.js`

**Interfaces:**
- Produces: `toast.show({ type?, message, duration? })`, `toast.error(message)`, `toast.subscribe(listener) => unsubscribe`, `toast.clear()`
- Produces i18n keys: `http.offline`, `http.timeout`, `http.network`, `http.unavailable`, `http.parse`, `version.title`, `version.refresh`, `version.dismiss`

- [ ] **Step 1: Add i18n strings**

In `zh-CN.js` add:

```js
  'http.offline': '网络已断开，请检查连接',
  'http.timeout': '请求超时，请稍后重试',
  'http.network': '网络异常，请稍后重试',
  'http.unavailable': '服务暂时不可用（{status}）',
  'http.parse': '服务返回异常',
  'version.title': '发现新版本，刷新后使用最新功能',
  'version.refresh': '立即刷新',
  'version.dismiss': '关闭',
```

Mirror in `zh-TW.js` / `en.js` (Traditional / English equivalents).

- [ ] **Step 2: Implement toast bus**

```js
// src/lib/toast.js
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
  if (duration > 0) {
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
```

- [ ] **Step 3: Smoke-check in Node (optional quick assert)**

Run:

```bash
node --input-type=module -e "import { toast } from './src/lib/toast.js'; let n=0; toast.subscribe(i=>{n=i.length}); toast.error('a'); toast.error('a'); console.log(n===1?'ok':'fail', n)"
```

Expected: `ok 1` (dedupe). Note: `window.setTimeout` needs a shim in Node — if this fails, skip and verify in browser later; alternatively guard `typeof window !== 'undefined'`.

Adjust toast.js so timer only runs in browser:

```js
  if (duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismiss(item.id), duration)
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/toast.js src/i18n/locales/zh-CN.js src/i18n/locales/zh-TW.js src/i18n/locales/en.js
git commit -m "feat: add toast bus and http/version i18n keys"
```

---

### Task 2: `HttpError` + `request()`

**Files:**
- Create: `src/lib/http.js`

**Interfaces:**
- Consumes: `toast.error`, `t()` from i18n
- Produces: `class HttpError`, `request(url, options) => Promise<body>`

- [ ] **Step 1: Implement `src/lib/http.js`**

```js
import { t } from '../i18n/index.js'
import { toast } from './toast.js'

export class HttpError extends Error {
  /**
   * @param {{ code: string, message: string, status?: number, cause?: unknown }} opts
   */
  constructor(opts) {
    super(opts.message)
    this.name = 'HttpError'
    this.code = opts.code
    this.status = opts.status ?? 0
    this.cause = opts.cause
  }
}

/**
 * @param {string} url
 * @param {RequestInit & {
 *   timeout?: number,
 *   silent?: boolean,
 *   parse?: 'text' | 'json' | 'raw',
 *   toastOnHttpError?: boolean,
 * }} [options]
 */
export async function request(url, options = {}) {
  const {
    timeout = 15000,
    silent = false,
    parse = 'text',
    toastOnHttpError = true,
    signal: outerSignal,
    ...init
  } = options

  const fail = (err) => {
    if (!silent && toastOnHttpError) toast.error(err.message)
    throw err
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return fail(new HttpError({ code: 'offline', message: t('http.offline') }))
  }

  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort(outerSignal?.reason)
  if (outerSignal) {
    if (outerSignal.aborted) ctrl.abort(outerSignal.reason)
    else outerSignal.addEventListener('abort', onAbort, { once: true })
  }

  const timer =
    timeout > 0
      ? setTimeout(() => ctrl.abort(new DOMException('Timeout', 'AbortError')), timeout)
      : null

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      return fail(
        new HttpError({
          code: 'http',
          status: res.status,
          message: t('http.unavailable', { status: String(res.status) }),
        }),
      )
    }
    if (parse === 'raw') return res
    if (parse === 'json') {
      try {
        return await res.json()
      } catch (cause) {
        return fail(new HttpError({ code: 'parse', message: t('http.parse'), cause }))
      }
    }
    return await res.text()
  } catch (cause) {
    if (cause instanceof HttpError) throw cause
    const aborted =
      cause?.name === 'AbortError' ||
      (typeof DOMException !== 'undefined' && cause instanceof DOMException && cause.name === 'AbortError')
    if (aborted) {
      return fail(new HttpError({ code: 'timeout', message: t('http.timeout'), cause }))
    }
    return fail(new HttpError({ code: 'network', message: t('http.network'), cause }))
  } finally {
    if (timer) clearTimeout(timer)
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/http.js
git commit -m "feat: add shared HTTP request helper with toasts"
```

---

### Task 3: Wire business modules

**Files:**
- Modify: `src/lib/route.js` (`planWithHttp`)
- Modify: `src/lib/search.js` (`fetchSearch`, `httpGeocode`)
- Modify: `src/lib/geocode.js` (`reverseGeocode`)
- Modify: `src/config/behaviorPolicy.js` (`fetchBehaviorPolicy`)

**Interfaces:**
- Consumes: `request` from `src/lib/http.js`

- [ ] **Step 1: `route.js` — replace raw fetch**

```js
import { request } from './http.js'

async function planWithHttp(start, end, tk, style) {
  const postStr = JSON.stringify({
    orig: `${start.lng},${start.lat}`,
    dest: `${end.lng},${end.lat}`,
    style: String(style),
  })
  const url = `https://api.tianditu.gov.cn/drive?postStr=${encodeURIComponent(postStr)}&type=search&tk=${encodeURIComponent(tk)}`
  const text = await request(url, { parse: 'text', timeout: 20000 })
  const parsed = parseDriveBody(text, style)
  if (!parsed?.path?.length) throw new Error('没有找到驾车路线')
  return parsed
}
```

Remove the old `res.ok` throw (handled by `request`). Keep business empty-route error as plain `Error` (optional: `toast.error` only if not already hinted by UI).

- [ ] **Step 2: `search.js` — silent hops**

```js
import { request } from './http.js'

async function fetchSearch(postStr, tk) {
  const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(JSON.stringify(postStr))}&type=query&tk=${tk}`
  try {
    const data = await request(url, { parse: 'json', silent: true, timeout: 12000 })
    return normalizeSearchResult(data)
  } catch {
    return []
  }
}

async function httpGeocode(text, tk) {
  if (!tk) return []
  try {
    const url = `https://api.tianditu.gov.cn/geocoder?ds=${encodeURIComponent(JSON.stringify({ keyWord: text }))}&tk=${tk}`
    const data = await request(url, { parse: 'json', silent: true, timeout: 12000 })
    // ... existing loc parsing unchanged ...
  } catch {
    return []
  }
}
```

- [ ] **Step 3: `geocode.js` — silent reverse**

```js
import { request } from './http.js'

export async function reverseGeocode(lng, lat, tk) {
  const postStr = JSON.stringify({ lon: lng, lat, ver: 1 })
  const url = `https://api.tianditu.gov.cn/geocoder?postStr=${encodeURIComponent(postStr)}&type=geocode&tk=${tk}`
  try {
    const data = await request(url, { parse: 'json', silent: true, timeout: 10000 })
    if (data.status == 0 || data.status === '0') {
      return data.result?.formatted_address || ''
    }
  } catch {
    // ignore
  }
  return ''
}
```

- [ ] **Step 4: `behaviorPolicy.js`**

```js
import { request } from '../lib/http.js'

export async function fetchBehaviorPolicy(url, init) {
  const data = await request(url, { ...init, parse: 'json', timeout: 12000 })
  return applyBehaviorPolicy(data)
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/route.js src/lib/search.js src/lib/geocode.js src/config/behaviorPolicy.js
git commit -m "feat: route business fetches through shared request()"
```

---

### Task 4: Toast + Version UI hosts

**Files:**
- Create: `src/components/AppToastHost.vue`
- Create: `src/components/AppVersionBanner.vue`
- Modify: `src/style.css` (append styles)
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `toast.subscribe`, `appVersion` store (Task 5 — banner can stub until Task 5; prefer implement banner after Task 5 starts, or land toast host first)

- [ ] **Step 1: `AppToastHost.vue`**

```vue
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
```

- [ ] **Step 2: Styles in `style.css`**

```css
.app-toast-host {
  position: fixed;
  left: 50%;
  bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 9600;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(92vw, 360px);
  pointer-events: none;
}
.app-shell.is-nav .app-toast-host {
  bottom: calc(120px + env(safe-area-inset-bottom, 0px));
}
.app-toast {
  pointer-events: none;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--panel);
  color: var(--ink);
  border: 1px solid var(--line);
  box-shadow: var(--card-shadow);
  border-left: 3px solid var(--navy);
  font-size: 13px;
  line-height: 1.45;
}
.app-toast.is-error {
  border-left-color: var(--danger);
}
.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.app-version-banner {
  position: fixed;
  left: 50%;
  top: calc(12px + env(safe-area-inset-top, 0px));
  transform: translateX(-50%);
  z-index: 9700;
  width: min(94vw, 420px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  box-shadow: var(--card-shadow);
  color: var(--ink);
}
.app-version-banner__text {
  flex: 1;
  font-size: 13px;
  line-height: 1.4;
}
.app-version-banner__btn {
  border: 0;
  border-radius: 10px;
  padding: 8px 12px;
  background: var(--navy);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.app-version-banner__close {
  border: 0;
  background: transparent;
  color: var(--mist);
  font-size: 18px;
  line-height: 1;
  padding: 4px;
}
```

- [ ] **Step 3: Mount toast host in `App.vue`**

Import and place `<AppToastHost />` inside `.app-shell` (sibling to main/tab bar).

- [ ] **Step 4: Commit**

```bash
git add src/components/AppToastHost.vue src/style.css src/App.vue
git commit -m "feat: mount app toast host"
```

---

### Task 5: Version watcher + banner + Vite inject

**Files:**
- Create: `src/lib/appVersion.js`
- Create: `src/components/AppVersionBanner.vue`
- Modify: `vite.config.js`
- Modify: `src/main.js`
- Modify: `src/App.vue`
- Ensure: root `BUILD-VERSION` copied to `public/BUILD-VERSION` on build (and for local preview)

**Interfaces:**
- Produces: `startVersionWatcher()`, `setNavigating(boolean)`, `getVersionUiState()`, `subscribeVersion(fn)`, `refreshToLatest()`, `dismissVersionPrompt()`
- Consumes: navigating flag from `App.vue` `onNavigatingChange`

- [ ] **Step 1: Update `vite.config.js`**

```js
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

function readBuildVersion() {
  try {
    return fs.readFileSync(path.resolve(__dirname, 'BUILD-VERSION'), 'utf8').trim()
  } catch {
    return '0'
  }
}

function syncBuildVersionPlugin() {
  return {
    name: 'sync-build-version',
    config() {
      const v = readBuildVersion()
      return {
        define: {
          'import.meta.env.VITE_APP_BUILD_VERSION': JSON.stringify(v),
        },
      }
    },
    buildStart() {
      const v = readBuildVersion()
      const publicPath = path.resolve(__dirname, 'public/BUILD-VERSION')
      fs.writeFileSync(publicPath, `${v}\n`, 'utf8')
    },
    closeBundle() {
      const v = readBuildVersion()
      const out = path.resolve(__dirname, 'build/BUILD-VERSION')
      try {
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, `${v}\n`, 'utf8')
      } catch {
        /* ignore */
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), basicSsl(), syncBuildVersionPlugin()],
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: true,
  },
  preview: {
    host: true,
    port: 5173,
  },
})
```

- [ ] **Step 2: Implement `src/lib/appVersion.js`**

```js
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
```

- [ ] **Step 3: `AppVersionBanner.vue`**

Subscribe `subscribeVersion`; show when `state.pending`; buttons call `refreshToLatest` / `dismissVersionPrompt`; use `t('version.*')`.

- [ ] **Step 4: Wire `main.js` + `App.vue`**

```js
// main.js after mount
import { startVersionWatcher } from './lib/appVersion'
startVersionWatcher()
```

In `App.vue` `onNavigatingChange`:

```js
import { setNavigating } from './lib/appVersion'
function onNavigatingChange(value) {
  navigating.value = Boolean(value)
  setNavigating(navigating.value)
  if (navigating.value) tab.value = 'home'
}
```

Mount `<AppVersionBanner />` in shell.

- [ ] **Step 5: Verify build copies version**

```bash
npm run build
```

Expected: `build/BUILD-VERSION` exists and matches root `BUILD-VERSION`; no console errors in build.

- [ ] **Step 6: Commit**

```bash
git add vite.config.js public/BUILD-VERSION src/lib/appVersion.js src/components/AppVersionBanner.vue src/main.js src/App.vue src/style.css
git commit -m "feat: production build version prompt and refresh"
```

---

### Task 6: Docs touch-up + acceptance pass

**Files:**
- Modify: `docs/modules.md` (short note on `http.js` / `toast.js` / `appVersion.js`)
- Modify: `README.md` only if structure section lists libs (one line each)

- [ ] **Step 1: Document modules**

Add under lib map:

- `http.js` — business fetch + error toast
- `toast.js` — global toast bus
- `appVersion.js` — prod version watcher

- [ ] **Step 2: Manual acceptance**

1. Dev: open app — no version banner.
2. Offline (DevTools Offline) → plan route → toast `网络已断开…`.
3. Search with network blocked — no toast spam; existing search hint still works.
4. `npm run build && npm run preview` — edit `build/BUILD-VERSION` to a new string → within 60s or tab focus → banner → 立即刷新 reloads.

- [ ] **Step 3: Commit**

```bash
git add docs/modules.md README.md
git commit -m "docs: note http toast and version update modules"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `request()` + error table | 2 |
| Toast bus + UI | 1, 4 |
| route/search/geocode/policy wiring | 3 |
| coordDetect untouched | 3 (explicit non-touch) |
| BUILD-VERSION inject + probe | 5 |
| navigating deferral + manual refresh + dismiss | 5 |
| i18n | 1 |
| prod-only watcher | 5 |
| acceptance | 6 |

## Placeholder / consistency self-review

- No TBD steps; signatures use `request` / `toast` / `setNavigating` consistently.
- Search stays `silent: true`; route audible — matches spec.
