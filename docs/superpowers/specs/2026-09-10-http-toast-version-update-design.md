# 全局请求提示与版本更新设计

日期：2026-09-10  
状态：已定稿（待实现）  
范围：业务 HTTP 统一错误提示 + 生产环境新版本提示与手动刷新

## 目标

1. 路线 / 搜索 / 地理编码等业务请求经统一封装，覆盖断网、超时、HTTP 错误、解析失败、业务失败，并向用户给出可读提示。
2. 生产环境重新打包部署后，在线用户能发现版本变化；提示「有新版本」，用户点击「立即刷新」后加载最新资源。导航中不强刷。

## 非目标

- 不 patch 全局 `window.fetch`（避免误伤瓦片 / SDK / 字体）。
- 不上 Service Worker。
- 不自动强制刷新；倒计时自动刷新不做。
- 坐标探测类探测请求（`coordDetect`）默认静默，不刷 Toast。

## 方案

采用「轻量 `request()` 封装 + App 级 Toast + `BUILD-VERSION` 轮询」。

### 1. HTTP 封装 `src/lib/http.js`

```js
request(url, {
  timeout = 15000,
  silent = false,      // true：不 Toast（探测/兜底链）
  parse = 'text',      // 'text' | 'json' | 'raw'
  toastOnHttpError = true,
  ...RequestInit
})
```

行为：

| 情况 | 错误码 / 行为 | 默认 Toast（i18n） |
|------|----------------|-------------------|
| `navigator.onLine === false` | `offline` | 网络已断开，请检查连接 |
| Abort / 超时 | `timeout` | 请求超时，请稍后重试 |
| `TypeError` / 网络失败 | `network` | 网络异常，请稍后重试 |
| HTTP !ok | `http` + status | 服务暂时不可用（含状态码简写） |
| JSON 解析失败 | `parse` | 服务返回异常 |
| 业务层自行 throw | 调用方决定文案；可复用 `toast.error` | — |

返回：成功时按 `parse` 返回 body；失败抛 `HttpError { code, status, message, cause }`。

`silent: true` 时仍抛错，但不 Toast，供搜索多路兜底（失败吞掉继续下一路）。

### 2. Toast `src/lib/toast.js` + UI

- 简单事件总线：`toast.show({ type, message, duration })` / `toast.error(message)`。
- `App.vue` 挂载浮层（底部偏上，避开 tab bar；导航中避开 HUD 底栏）。
- 同时最多 1～2 条；同文案短时去重。
- 样式贴合蓝白卡片：白底 / 深色主题适配，左边品牌蓝竖条；非紫色霓虹。

### 3. 业务接入点

| 模块 | 改动 |
|------|------|
| `src/lib/route.js` | `planWithHttp` → `request`，HTTP/网络失败 Toast；业务「无路线」保留现有文案 |
| `src/lib/search.js` | 内部 `fetchSearch` / geocode 用 `silent: true` 避免多路刷屏；最终无结果由调用方提示 |
| `src/lib/geocode.js` | `reverseGeocode` 默认 `silent: true`（辅助信息，失败不打断） |
| `src/config/behaviorPolicy.js` | `fetchBehaviorPolicy` 走 `request`；失败可 Toast |
| `src/lib/coordDetect.js` | **不改**或显式 `silent`（保持探测静默） |

搜索策略说明：多候选请求若每条都 Toast 会刷屏，故链路内 `silent`；仅当整次搜索对用户可见失败时（由 NavMap / clipboard 现有 hint）提示。路线规划为主路径，失败直接 Toast + 现有 `locatingHint` 可并存（Toast 为主、hint 可保留短提示）。

### 4. 版本检测 `src/lib/appVersion.js`

**构建：**

- 仓库根目录已有 `BUILD-VERSION`；Vite `build` 时复制到 `build/BUILD-VERSION`（`public/BUILD-VERSION` 同步或插件写入），保证线上可 `GET /BUILD-VERSION`（`Cache-Control: no-store` 由静态服务器配置；客户端请求加 `cache: 'no-store'` + query `?t=`）。
- 可选：构建时把同内容写入 `import.meta.env` 或 `src/generated/buildVersion.js`，作为**当前会话基准**；若不便 codegen，则**首次成功拉取**的版本记为 `baseline`。

**推荐基准：** 构建注入 `import.meta.env.VITE_APP_BUILD_VERSION`（vite 插件读 `BUILD-VERSION`），运行时与远端 `/BUILD-VERSION` 比对。无注入时退化为「首次 fetch 记 baseline」。

**运行时（仅 production）：**

1. `main.js` 启动 `startVersionWatcher({ intervalMs: 60_000 })`。
2. 时机：定时；`visibilitychange` → visible；`pageshow` / `focus`（节流）。
3. 远端 trim 后文本 ≠ baseline → `versionStore.pending = true`。
4. **导航中**（订阅 App / NavMap 的 `navigating`）：只置 pending，不展示条。
5. 非导航且 pending：展示版本条「发现新版本」+ 按钮「立即刷新」。
6. 点击：`location.reload()`（必要时 `?_v=` 防缓存，注意勿破坏现有 query）。
7. 用户可点关闭条（本次会话不再烦，`sessionStorage` 记下已忽略的远端版本）；下次远端再变仍提示。

**dev / preview：** 默认关闭 watcher（`import.meta.env.PROD`）。

### 5. i18n

新增键（zh-CN / zh-TW / en），例如：

- `http.offline` / `http.timeout` / `http.network` / `http.unavailable` / `http.parse`
- `version.title` / `version.refresh` / `version.dismiss`

### 6. UI 组件

- `AppToastHost.vue`：订阅 toast。
- `AppVersionBanner.vue`：订阅 version store；确认刷新 / 关闭。

## 验收

1. 断网后点规划路线 → 出现「网络已断开」类 Toast，不白屏。
2. 模拟超时 → 「请求超时」Toast。
3. 搜索多路失败 → 不连续弹多条网络 Toast；最终无结果走原有搜索提示。
4. 生产构建后改 `BUILD-VERSION` 并部署静态文件 → 在线页约 1 分钟内或切回前台后出现版本条；点刷新后页面为新版本。
5. 导航中改版本 → 不弹条；结束导航后出现。
6. `npm run dev` 不出现版本条。

## 风险与注意

- 天地图 CORS / 业务 status 非 HTTP 层：业务解析仍在各模块；封装只保证传输层。
- 静态托管若强缓存 `BUILD-VERSION`，需服务器 `no-cache` 或客户端 `cache: 'no-store'`（已做）。
- Toast 与 `locatingHint` 短暂并存可接受；避免同一失败写两套长文案。
