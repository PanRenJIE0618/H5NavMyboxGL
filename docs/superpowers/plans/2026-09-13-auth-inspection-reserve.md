# Auth + Inspection Reserve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship login + device-inspection domain modules with mock/real API, independent pages, and a feature flag that controls whether those pages appear in the App tab bar (default off; no binding to map/settings/quick-nav).

**Architecture:** `featureFlags` + `api` config → `apiClient` → `auth` / `inspection` libs; Vue pages under `components/auth` and `components/inspection`; `App.vue` appends tabs only when `SHOW_AUTH_INSPECTION_UI` is true; `initAuth()` always runs at boot.

**Tech Stack:** Vue 3, Vite 6, existing `request()`/`toast`/`i18n`, localStorage `h5nav:auth`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-13-auth-inspection-reserve-design.md`
- Default `VITE_SHOW_AUTH_INSPECTION_UI` off; default `VITE_API_MODE=mock`
- Do not gate NavMap / navigation on login
- Do not add login/inspection into `MapSettings` or `QuickNav`
- Do not introduce `vue-router`
- Do not patch `window.fetch`; Tianditu requests stay without Bearer
- Photos = metadata placeholders only (no multipart upload)
- Page `.vue` files stay under 1000 lines; use existing CSS vars (`--navy`, `--panel`, etc.)
- No test runner: verify with `npm run build` + manual / console checks

## File map

| File | Role |
|------|------|
| `src/config/featureFlags.js` | `SHOW_AUTH_INSPECTION_UI` |
| `src/config/api.js` | `API_BASE`, `API_MODE`, path constants |
| `src/lib/apiClient.js` | `apiRequest`, `isMockMode` |
| `src/lib/auth.js` | login session API |
| `src/lib/inspection.js` | tasks + submit |
| `src/components/auth/LoginPage.vue` | login UI |
| `src/components/inspection/InspectionListPage.vue` | list + hosts detail |
| `src/components/inspection/InspectionDetailPage.vue` | detail/submit |
| `src/App.vue` / `src/main.js` | tabs + initAuth |
| `src/lib/appStorage.js` + i18n + `style.css` + `docs/modules.md` + `.env.example` | wiring/docs |

---

### Task 1: Feature flags + API config + i18n keys

**Files:**
- Create: `src/config/featureFlags.js`, `src/config/api.js`, `.env.example`
- Modify: `src/i18n/locales/zh-CN.js`, `zh-TW.js`, `en.js`

**Interfaces:**
- Produces: `SHOW_AUTH_INSPECTION_UI` (boolean), `API_BASE`, `API_MODE`, `API_PATHS`, `isMockMode` helper can live in api.js or apiClient
- Produces i18n keys listed below

- [ ] **Step 1: Create `src/config/featureFlags.js`**

```js
function envFlag(value, fallback = false) {
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

/** 登录/巡检页面是否上图（App Tab） */
export const SHOW_AUTH_INSPECTION_UI = envFlag(
  import.meta.env.VITE_SHOW_AUTH_INSPECTION_UI,
  false,
)
```

- [ ] **Step 2: Create `src/config/api.js`**

```js
export const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const mode = String(import.meta.env.VITE_API_MODE || 'mock').toLowerCase()
export const API_MODE = mode === 'real' ? 'real' : 'mock'

export const API_PATHS = Object.freeze({
  login: '/api/auth/login',
  me: '/api/auth/me',
  logout: '/api/auth/logout',
  inspectionTasks: '/api/inspection/tasks',
  inspectionTask: (id) => `/api/inspection/tasks/${encodeURIComponent(id)}`,
  inspectionSubmit: (id) => `/api/inspection/tasks/${encodeURIComponent(id)}/submit`,
})

export function isMockMode() {
  return API_MODE === 'mock'
}
```

- [ ] **Step 3: Add `.env.example`**

```env
VITE_TIANDITU_TK=
VITE_API_BASE=
VITE_API_MODE=mock
VITE_SHOW_AUTH_INSPECTION_UI=false
```

- [ ] **Step 4: i18n keys (zh-CN; mirror zh-TW/en)**

```js
  'app.tab.login': '登录',
  'app.tab.inspection': '巡检',
  'auth.title': '账号登录',
  'auth.username': '账号',
  'auth.password': '密码',
  'auth.login': '登录',
  'auth.logout': '退出登录',
  'auth.loggedInAs': '已登录：{name}',
  'auth.loginFail': '登录失败，请检查账号密码',
  'auth.needUsername': '请输入账号',
  'inspection.title': '设备巡检',
  'inspection.empty': '暂无巡检任务',
  'inspection.status.pending': '待巡检',
  'inspection.status.done': '已完成',
  'inspection.status.cancelled': '已取消',
  'inspection.detail': '任务详情',
  'inspection.asset': '设备编号',
  'inspection.remark': '备注',
  'inspection.photos': '照片（占位）',
  'inspection.addPhoto': '添加照片',
  'inspection.locate': '使用当前位置',
  'inspection.submit': '提交巡检',
  'inspection.submitOk': '提交成功',
  'inspection.submitFail': '提交失败',
  'inspection.back': '返回列表',
  'inspection.filter.all': '全部',
  'storage.item.auth': '登录会话',
```

- [ ] **Step 5: Commit**

```bash
git add src/config/featureFlags.js src/config/api.js .env.example src/i18n/locales/zh-CN.js src/i18n/locales/zh-TW.js src/i18n/locales/en.js
git commit -m "feat: add auth/inspection feature flags and API config"
```

---

### Task 2: `apiClient` + `auth` module

**Files:**
- Create: `src/lib/apiClient.js`, `src/lib/auth.js`
- Modify: `src/main.js`, `src/lib/appStorage.js`

**Interfaces:**
- Consumes: `API_BASE`, `API_PATHS`, `isMockMode`, `request`, `toast`/`t` as needed
- Produces: `apiRequest`, `initAuth`, `login`, `logout`, `getAccessToken`, `getUser`, `isLoggedIn`, `onAuthChange`, `AUTH_KEY`, `clearAuthStorage`

- [ ] **Step 1: Implement `src/lib/apiClient.js`**

```js
import { API_BASE, isMockMode } from '../config/api.js'
import { request } from './http.js'
import { getAccessToken } from './auth.js'

/**
 * @param {string} path
 * @param {RequestInit & { auth?: boolean, silent?: boolean, parse?: 'json'|'text'|'raw', body?: any }} [options]
 */
export async function apiRequest(path, options = {}) {
  const { auth = false, body, headers, ...rest } = options
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const nextHeaders = { Accept: 'application/json', ...(headers || {}) }
  let payload = body
  if (body != null && typeof body === 'object' && !(body instanceof FormData)) {
    nextHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  if (auth) {
    const token = getAccessToken()
    if (token) nextHeaders.Authorization = `Bearer ${token}`
  }
  return request(url, {
    parse: 'json',
    ...rest,
    headers: nextHeaders,
    body: payload,
  })
}

export { isMockMode }
```

Note: avoid circular import — either lazy-get token inside `apiRequest` via dynamic import, or put token read in a tiny `authStorage.js`. **Preferred:** keep token getters in `auth.js` and in `apiClient` use:

```js
function readToken() {
  try {
    const raw = localStorage.getItem('h5nav:auth')
    if (!raw) return ''
    return JSON.parse(raw)?.accessToken || ''
  } catch {
    return ''
  }
}
```

Do **not** import `auth.js` from `apiClient.js` (break cycle). `auth.js` may import `apiClient`.

- [ ] **Step 2: Implement `src/lib/auth.js`** per spec (versioned localStorage, mock login any non-empty username, real via `apiRequest(API_PATHS.login, { method:'POST', body })`, normalize `{ accessToken, user, expiresAt }`, listeners, `initAuth`, `logout`).

Mock login success shape:

```js
{
  accessToken: `mock-${username}-${Date.now()}`,
  user: { id: `u-${username}`, name: username, roles: ['user'] },
  expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
}
```

- [ ] **Step 3: Wire `initAuth()` in `src/main.js` after `initI18n()`**

```js
import { initAuth } from './lib/auth'
initAuth()
```

- [ ] **Step 4: Register storage catalog item `auth` in `appStorage.js`**

Import `AUTH_KEY` and `clearAuthStorage` (or `logout`) from `auth.js`. Add catalog entry `kind: 'data'`, `labelKey: 'storage.item.auth'`. In clear handler call `clearAuthStorage()`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apiClient.js src/lib/auth.js src/main.js src/lib/appStorage.js
git commit -m "feat: add apiClient and auth session module"
```

---

### Task 3: `inspection` module

**Files:**
- Create: `src/lib/inspection.js`

**Interfaces:**
- Consumes: `isMockMode`, `apiRequest`, `API_PATHS`
- Produces: `listInspectionTasks`, `getInspectionTask`, `submitInspectionResult`, `getLastSubmit`

- [ ] **Step 1: Implement mock seed (2–3 tasks) + normalize + list/get/submit** as in spec. Store mock mutations in module-level array; `getLastSubmit` from Map.

Seed example:

```js
{
  id: 'task-001',
  title: '箱体外观巡检',
  assetCode: 'BOX-A12',
  address: '示范路 1 号',
  lng: 116.391,
  lat: 39.907,
  status: 'pending',
  dueAt: null,
  remark: '',
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/inspection.js
git commit -m "feat: add inspection tasks domain module"
```

---

### Task 4: Login + Inspection pages + styles

**Files:**
- Create: `LoginPage.vue`, `InspectionListPage.vue`, `InspectionDetailPage.vue`
- Modify: `src/style.css`

**Interfaces:**
- Pages only call auth/inspection libs; no NavMap props

- [ ] **Step 1: `LoginPage.vue`** — form username/password, login button, show user + logout when `isLoggedIn`; subscribe `onAuthChange` for reactivity via `ref` + listener.

- [ ] **Step 2: `InspectionDetailPage.vue`** — props: `taskId`; load task; remark textarea; file input adding `{ name, id }` to photos; button to read `navigator.geolocation` once into lng/lat; submit calls `submitInspectionResult`; emit `back` / `submitted`.

- [ ] **Step 3: `InspectionListPage.vue`** — list tasks; filter chips all/pending/done; click opens detail via local `selectedId` ref (v-if detail vs list); no router.

- [ ] **Step 4: CSS** — `.auth-page`, `.inspection-page` card layouts, compact tab-friendly padding, use `--panel`/`--navy`.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth src/components/inspection src/style.css
git commit -m "feat: add login and inspection pages"
```

---

### Task 5: App shell feature-flag wiring + docs

**Files:**
- Modify: `src/App.vue`, `docs/modules.md`

**Interfaces:**
- Consumes: `SHOW_AUTH_INSPECTION_UI`

- [ ] **Step 1: Update `App.vue`**

```js
import { SHOW_AUTH_INSPECTION_UI } from './config/featureFlags'
import LoginPage from './components/auth/LoginPage.vue'
import InspectionListPage from './components/inspection/InspectionListPage.vue'

const TABS = computed(() => {
  const base = [
    { id: 'home', label: t('app.tab.home') },
    { id: 'quick', label: t('app.tab.quick') },
    { id: 'mine', label: t('app.tab.mine') },
  ]
  if (!SHOW_AUTH_INSPECTION_UI) return base
  return [
    ...base,
    { id: 'login', label: t('app.tab.login') },
    { id: 'inspection', label: t('app.tab.inspection') },
  ]
})
```

Template: when `tab === 'login'` show `LoginPage`; `tab === 'inspection'` show `InspectionListPage` (same overlay Transition pattern as QuickNav). Add class on tab-bar when 5 tabs if needed (e.g. `.tab-bar__group.is-wide` smaller font).

Optional: only static-import pages when flag true:

```js
const LoginPage = SHOW_AUTH_INSPECTION_UI
  ? (await import(...)).default // not in script setup without async
```

Prefer **always import** for simplicity (pages unused when flag false still tree-shaken only if dynamic). Accept static import for YAGNI unless bundle concern.

- [ ] **Step 2: Document in `docs/modules.md`** — 预留模块节：flags、api、auth、inspection、pages、上图开关。

- [ ] **Step 3: Verify**

```bash
npm run build
```

Default: no extra tabs. With env true (document in report): tabs appear.

- [ ] **Step 4: Commit**

```bash
git add src/App.vue docs/modules.md
git commit -m "feat: gate auth/inspection UI behind feature flag"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| feature flag + default off | 1, 5 |
| api config + paths | 1 |
| apiClient | 2 |
| auth + initAuth + storage | 2 |
| inspection domain | 3 |
| Login / list / detail pages | 4 |
| App tabs when on; no MapSettings/QuickNav bind | 5 |
| i18n | 1 |
| docs | 5 |

## Self-review

- No vue-router; inspection uses local selectedId.
- apiClient must not import auth.js (token via localStorage read).
- Flag default false keeps 3-tab UX.
