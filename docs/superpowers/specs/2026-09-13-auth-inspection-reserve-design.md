# 用户登录与设备巡检预留模块设计

日期：2026-09-13  
状态：已定稿（待实现）  
修订：页面先实现；**配置开关控制是否上图**；**不与现有首页/快捷/我的业务绑定**

## 目标

1. 实现用户登录领域能力：登录 / 登出 / 当前用户 / token 持久化与变更订阅，默认 mock，可切真实 API。
2. 实现设备巡检领域能力：任务列表 / 详情 / 提交结果（含定位、照片占位、备注），默认 mock，可切真实 API。
3. **实现独立页面组件**（登录页、巡检列表/详情/提交页），视觉贴合现有蓝白卡片风格。
4. 用 **功能开关** 控制是否上图（出现在壳层入口）；默认 **关闭**。开启后仅增加独立入口，**不**改导航闸门、不写进「我的」设置项、不与地图/快捷导航数据流绑定。

## 非目标

- 不强制首页地图 / 导航依赖登录（本阶段不上闸）。
- 不把登录态写进 `MapSettings`、不往 `QuickNav` / `NavMap` 塞巡检任务。
- 不做真实拍照上传 / 扫码（照片仅本地选文件元数据或占位列表）。
- 不 patch 全局 `fetch`；天地图等第三方请求不绑 Bearer。
- 不上 OAuth / 短信登录。

## 方案

「领域模块 + 独立页面 + 上图开关」（在方案 A 上扩展 UI）。

### 0. 上图开关 `src/config/featureFlags.js`

| 项 | 来源 | 默认 | 含义 |
| --- | --- | --- | --- |
| `SHOW_AUTH_INSPECTION_UI` | `VITE_SHOW_AUTH_INSPECTION_UI` | `false` | `true` 时在 App 壳层露出独立入口与页面 |

- 解析：`['1','true','yes','on'].includes(String(env).toLowerCase())`
- `.env.example` 说明；本地默认不上图，需要演示时设 `VITE_SHOW_AUTH_INSPECTION_UI=true`

**上图时的入口（仅此绑定，且与现有三 Tab 业务解耦）：**

- 在 `App.vue` 底部 Tab **额外**出现两项（或一项「业务」下的子页）：`登录`、`巡检`（文案 i18n）。
- 仅当开关为 true 时 `TABS` 数组包含它们；关闭时与现在完全一致（首页 / 快捷 / 我的）。
- 导航中（`navigating`）仍只留在首页，行为不变；登录/巡检 Tab 在导航中同样隐藏（沿用现有 tab-bar 规则）。

**不上图时：** 组件文件仍在仓库，可被后续挂载；运行时不 import 进可见树亦可（为减小包体可用动态 `import()`，非必须）。

### 1. 配置 `src/config/api.js`

| 项 | 来源 | 默认 |
| --- | --- | --- |
| `API_BASE` | `import.meta.env.VITE_API_BASE` | `''`（相对同源） |
| `API_MODE` | `import.meta.env.VITE_API_MODE` | `'mock'`（`'mock' \| 'real'`） |

路径约定（real）：

| 能力 | Method | Path |
| --- | --- | --- |
| 登录 | POST | `/api/auth/login` |
| 当前用户 | GET | `/api/auth/me` |
| 登出 | POST | `/api/auth/logout` |
| 巡检任务列表 | GET | `/api/inspection/tasks` |
| 巡检任务详情 | GET | `/api/inspection/tasks/:id` |
| 提交巡检结果 | POST | `/api/inspection/tasks/:id/submit` |

### 2. `src/lib/apiClient.js`

- `apiRequest(path, { method, body, auth, silent, ... })`：拼基址、JSON、可选 Bearer（`auth.getAccessToken()`）。
- 底层 `request()`；mock 由领域模块短路，不发网。
- `isMockMode()`。

### 3. 登录 `src/lib/auth.js`

**存储** `h5nav:auth`：

```json
{
  "version": 1,
  "accessToken": "...",
  "user": { "id": "...", "name": "...", "roles": [] },
  "expiresAt": 0
}
```

| 方法 | 说明 |
| --- | --- |
| `initAuth()` | 恢复本地；real 可选静默 `/me` |
| `login({ username, password })` | mock：非空账号成功 |
| `logout()` | 清本地；real 尝试 logout |
| `getAccessToken()` / `getUser()` / `isLoggedIn()` | 同步 |
| `onAuthChange(listener)` | 取消订阅 |

### 4. 巡检 `src/lib/inspection.js`

任务模型：`id, title, assetCode, address, lng, lat, status('pending'|'done'|'cancelled'), dueAt, remark`。

提交：`taskId, lng, lat, accuracy, photos[{id?,url?,name?}], remark, submittedAt, deviceInfo?`。

| 方法 | 说明 |
| --- | --- |
| `listInspectionTasks({ status }?)` | |
| `getInspectionTask(id)` | |
| `submitInspectionResult(payload)` | |
| `getLastSubmit(taskId)?` | mock 调试用 |

mock 未登录也可演示；real 请求 `auth: true`。

### 5. 页面组件（独立，不塞进 MapSettings / NavMap）

| 文件 | 职责 |
| --- | --- |
| `src/components/auth/LoginPage.vue` | 账号、密码、登录/登出、展示当前用户 |
| `src/components/inspection/InspectionListPage.vue` | 任务列表、状态筛选、进详情 |
| `src/components/inspection/InspectionDetailPage.vue` | 详情 + 备注 + 选图占位 + 取当前位置提交 |

- 单文件 &lt; 1000 行；样式用现有 CSS 变量 / `style.css` 增补区块（`.auth-page` / `.inspection-page`）。
- 巡检详情内页可用列表页内 `ref` 切换或简单本地 state，**不引入 vue-router**（与现 App 一致）。
- 开关关闭时：`App.vue` 不渲染这些页面。

### 6. 启动、存储、i18n、文档

- `main.js`：`initAuth()` 静默恢复（与开关无关）。
- `appStorage`：登记 `h5nav:auth`，清理走 logout。
- i18n：`auth.*` / `inspection.*` / Tab 文案（三语）。
- `docs/modules.md`：预留模块 + **上图开关**说明。

## 验收

1. 默认（开关 false）：界面仍为三 Tab；无登录/巡检入口；console 仍可调 `login` / `listInspectionTasks`。
2. `.env` 设 `VITE_SHOW_AUTH_INSPECTION_UI=true` 并重启 dev：出现登录、巡检 Tab；可完成 mock 登录与提交一条巡检。
3. 开关 true 时：不改「我的」原有区块；地图导航流程无登录拦截。
4. `npm run build` 通过。

## 风险与注意

- Tab 变 5 项时注意小屏宽度：可用缩略标签或两行，保持可点。
- mock/real 字段归一化，避免接真后端改页面。
- 照片仅元数据占位，不做 multipart。
