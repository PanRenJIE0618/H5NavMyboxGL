# 用户登录与设备巡检预留模块设计

日期：2026-09-13  
状态：已定稿（待实现）  
范围：登录 + 设备巡检的可对接骨架（默认 mock、API 预留、**不上实际界面**）

## 目标

1. 实现用户登录领域能力：登录 / 登出 / 当前用户 / token 持久化与变更订阅，默认 mock，可切真实 API。
2. 实现设备巡检领域能力：任务列表 / 详情 / 提交结果（含定位、照片占位、备注），默认 mock，可切真实 API。
3. **不改** Tab、「我的」、导航页等实际界面入口；仅 `main` 可做静默 `initAuth()` 恢复本地会话。

## 非目标

- 不做登录页、巡检列表页、拍照 UI、扫码 UI。
- 不强制导航/地图功能依赖登录（本阶段不上闸）。
- 不 patch 全局 `fetch`；天地图等第三方请求不绑 Bearer。
- 不上 Service Worker / OAuth / 短信登录（后续可扩）。

## 方案

采用「`apiClient` + `auth` / `inspection` 领域模块」（方案 A）。

### 1. 配置 `src/config/api.js`

| 项 | 来源 | 默认 |
| --- | --- | --- |
| `API_BASE` | `import.meta.env.VITE_API_BASE` | `''`（相对同源 `/api`） |
| `API_MODE` | `import.meta.env.VITE_API_MODE` | `'mock'`（仅 `'mock' \| 'real'`） |

路径约定（real 模式，可随后端调整常量）：

| 能力 | Method | Path |
| --- | --- | --- |
| 登录 | POST | `/api/auth/login` |
| 当前用户 | GET | `/api/auth/me` |
| 登出 | POST | `/api/auth/logout`（可选；本地必清） |
| 巡检任务列表 | GET | `/api/inspection/tasks` |
| 巡检任务详情 | GET | `/api/inspection/tasks/:id` |
| 提交巡检结果 | POST | `/api/inspection/tasks/:id/submit` |

`.env.example` 增补说明；本地 `.env` 可不改（保持 mock）。

### 2. `src/lib/apiClient.js`

- `apiRequest(path, { method, body, auth, silent, ... })`：拼 `API_BASE + path`，JSON body，可选 `Authorization: Bearer <token>`（token 来自 `auth.getAccessToken()`）。
- 底层走现有 `request()`（错误 Toast 策略与业务一致；mock 短路时不发网）。
- `isMockMode()` 供领域模块分支。

### 3. 登录 `src/lib/auth.js`

**存储：** `h5nav:auth`（localStorage），结构：

```json
{
  "version": 1,
  "accessToken": "...",
  "user": { "id": "...", "name": "...", "roles": [] },
  "expiresAt": 0
}
```

**API：**

| 方法 | 说明 |
| --- | --- |
| `initAuth()` | 启动时读本地；real 可选静默 `/me` 校验（失败则清会话）；mock 只恢复本地 |
| `login({ username, password })` | mock：非空账号即成功；real：POST login |
| `logout()` | 清本地；real 可尝试 POST logout（失败忽略） |
| `getAccessToken()` / `getUser()` / `isLoggedIn()` | 同步读 |
| `onAuthChange(listener)` | 返回取消函数 |

登录失败抛错并用现有 Toast/i18n（`auth.loginFail` 等）。  
**不上 UI**：不在 `App.vue` / `MapSettings.vue` 增加入口。

### 4. 巡检 `src/lib/inspection.js`

**任务模型（JSDoc）：**

```js
{
  id: string,
  title: string,
  assetCode: string,      // 设备/箱体编号
  address: string,
  lng: number | null,
  lat: number | null,
  status: 'pending' | 'done' | 'cancelled',
  dueAt: string | null,   // ISO
  remark: string,
}
```

**提交载荷：**

```js
{
  taskId: string,
  lng: number | null,
  lat: number | null,
  accuracy: number | null,
  photos: Array<{ id?: string, url?: string, name?: string }>, // 占位，本阶段可不上传二进制
  remark: string,
  submittedAt: string, // ISO
  deviceInfo?: Record<string, string>, // 可选，复用 deviceInfo 摘要
}
```

**API：**

| 方法 | 说明 |
| --- | --- |
| `listInspectionTasks({ status }?)` | mock 返回内置 2～3 条；real GET |
| `getInspectionTask(id)` | mock 查表；real GET |
| `submitInspectionResult(payload)` | mock：标记 done 并记结果；real POST |
| `getLastSubmit(taskId)?` | mock 内存/可选 session 缓存，便于调试 |

未登录时：mock 仍可读写本地演示数据；real 模式请求带 `auth: true`，401 可由调用方处理（本阶段不弹登录页）。

### 5. 启动与存储登记

- `main.js`：在现有 init 后调用 `initAuth()`（静默，无 UI）。
- `appStorage.js`：登记 `h5nav:auth`（kind: `data`，可清；清理时调 `logout`/`clearAuth`）。
- i18n：`auth.*` / `inspection.*` 错误与通用文案键（三语），供后续界面与 Toast。

### 6. 文档

- `docs/modules.md`：新增「预留模块」节，标明未挂 UI。
- 可选 `docs/superpowers/specs` 本文件即为契约。

## 验收

1. `VITE_API_MODE=mock`（默认）下，在 DevTools Console 可：
   - `await login({ username: 'demo', password: 'x' })` → `isLoggedIn() === true`
   - `await listInspectionTasks()` → 非空数组
   - `await submitInspectionResult({...})` → 任务变 `done`
2. 清存储「登录会话」或 `logout()` 后 `isLoggedIn() === false`。
3. 界面：首页 / 快捷 / 我的 **无** 新增登录或巡检入口。
4. `npm run build` 通过。

## 风险与注意

- mock 与 real 响应字段需保持同一归一化函数，避免接真后端时改调用方。
- token 放 localStorage：内网 H5 可接受；后续若要 HttpOnly Cookie 只改 `apiClient`/`auth`。
- 照片本阶段仅元数据占位，不做 multipart 上传。
