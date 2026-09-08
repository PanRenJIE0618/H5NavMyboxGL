# 导航会话挂起恢复设计

日期：2026-09-08  
范围：H5 浏览器挂后台 / 页面被杀或刷新后的导航恢复（A+B）  
状态：approved + implemented

## 问题

导航相关状态（目的地、路线、`navigating`、GPS watch、朝向监听、语音解锁、定时器）主要在内存中。  
浏览器挂到后台后：

- GPS / 传感器 / 定时器会被暂停或悄悄失效，但页面仍以为「在听」；
- 页面被系统回收或用户刷新后，Vue 状态全部丢失。

目标：

- **A**：短暂挂起再回前台 → 自动重绑监听，继续导航；
- **B**：页面被杀 / 刷新后 → 在 2 小时内可恢复会话，且需用户确认「继续导航」。

## 非目标

- 后台持续定位 / 后台播报（H5 做不到可靠能力）。
- Service Worker 承担 GPS / 传感器。
- 持久化 Mapbox 实例、LocationBeacon、偏航命中计数。
- 改变现有偏航 / 重规划业务规则（恢复后计数器可清零重计）。

## 方案总览

| 场景 | 行为 |
|------|------|
| 页面仍存活，仅 `hidden → visible` | 不弹确认条；强制 `restartWatch` + 重绑朝向 + 地图 resize + 语音看门狗 |
| 冷启动且存在有效快照 | 弹出「继续导航？」确认条；用户确认后再恢复路线并重绑 |
| 快照超过 2 小时 / 损坏 / 用户点放弃 | 清除快照，正常冷启动 |

## 持久化

### 存储

- 介质：`sessionStorage`（同标签页会话；关闭标签即清，符合导航会话语义）
- Key：`h5nav:session`
- TTL：`updatedAt` 起 **2 小时**（`7200000` ms）；读时校验，过期删除

### 快照字段（精简）

```ts
{
  version: 1,
  updatedAt: number,          // Date.now()
  navigating: true,
  destination: { name, lng, lat, address? },
  travelMode: 'drive' | 'walk',
  driveStyle: string,
  route: {
    mode, style,
    distanceMeters, durationSeconds,
    path: Array<[lng, lat]> | GeoJSON LineString coords,
    guides?: Array<{ text, distanceMeters?, ... }> // 与现有 guide 结构对齐，可裁剪
  },
  remainingMeters?: number,
  remainingSeconds?: number,
  nextGuide?: string | null,
  followUser: boolean,
  headingTestLock: boolean
}
```

### 写入时机

- 开始导航成功后立即写；
- 重规划成功后写；
- 导航中显著进度变化时节流写（建议 ≥ 15s 或剩余距离变化 ≥ 50m）；
- 到达 / 结束导航 / 清空目的地 / 用户放弃恢复 → **删除**快照。

### 不写入

Map 实例、marker、beacon、偏航状态、语音 mute（mute 可仍用模块内存；恢复后默认沿用当前 mute API）、定位内核缓存（已有 `coordDetect` 独立 session 缓存）。

## 回前台重绑（A，无确认条）

监听：`document.visibilitychange`；可选 `window.pageshow`（`event.persisted` BFCache）。

当 `document.visibilityState === 'visible'` 且内存中 `navigating === true`：

1. `useGeolocation.restartWatch(onLocationTick)`：内部 `stopWatch()` 再 `watchLocation()`（必须能打破「watching 仍为 true 但回调已死」）。
2. 主动 `getCurrentPosition` / 现有 locate 拉一次，刷新蓝点。
3. `useDeviceHeading`：若已授权则 `rebind()`（重新挂 `deviceorientation`）；未授权不弹系统权限（等用户下次点朝向相关操作）。
4. `map.resize()` + `applyNavCamera` / 刷新剩余线。
5. `navVoice`：停掉旧 watchdog → 重启；若挂起超过阈值（建议 ≥ 30s）将 `unlocked` 置为需重新手势解锁（下次点击静音钮或导航相关按钮再 `unlockNavVoice`）；不自动大声播报以免打扰。
6. 可选短提示：`定位已恢复`（1.5s）。

挂起时（`hidden`）：

- `speechSynthesis.cancel` + 停 watchdog（避免堆积）；
- **不要** `stopWatch`（部分机型回来更快；统一靠 visible 时 restart 更稳）。

## 冷启动恢复（B，确认条）

`NavMap` `onMounted`（地图 ready 后）：

1. `loadNavSession()`；无效 / 过期 → 忽略。
2. 有效则设置 `pendingResumeSession` UI 状态，展示确认条（非 modal 全屏，贴近现有白色浮层风格）：
   - 文案：`检测到未完成的导航：前往 {destination.name}` + 次要信息（模式 / 剩余距离若有）
   - 主按钮：`继续导航`
   - 次按钮：`放弃`
3. **放弃**：`clearNavSession()`，关闭条。
4. **继续**：
   - 在点击同步路径调用 `unlockNavVoice({ primingText: '继续导航' })`；
   - 恢复 destination / mode / routeInfo / guides / remaining / follow·heading 开关；
   - 绘制剩余路线与终点；
   - `navigating = true`；启动 offRouteMonitor；
   - 执行与 A 相同的重绑链路；
   - 成功后更新 / 保留快照 `updatedAt`。

确认条在用户未选择前不自动开始 GPS 导航监听（可照常展示底图与定位，但不进入 `navigating`）。

## API / 文件

| 文件 | 变更 |
|------|------|
| `src/lib/navSession.js` | 新建：`saveNavSession` / `loadNavSession` / `clearNavSession` / TTL / version |
| `src/composables/useGeolocation.js` | 新增 `restartWatch(onUpdate)` |
| `src/composables/useDeviceHeading.js` | 新增 `rebind()`（已 bound 则先解绑再绑；无 permission 手势需求时跳过） |
| `src/lib/navVoice.js` | hidden/visible 辅助：`onNavVoicePageHidden` / `onNavVoicePageVisible`；长挂起清 unlock |
| `src/components/NavMap.vue` | 快照读写、visibility 处理、确认条 UI、继续/放弃逻辑 |
| `src/config/behaviorPolicy.js` | 可选：`navSessionTtlMs: 7200000`、`navSessionPersistThrottleMs`（便于热更新）；无则常量写在 `navSession.js` |

## UI

- 确认条位置：搜索卡片下方或 HUD 上方一条，不挡地图中心操作。
- 主按钮实心、次按钮文字按钮，沿用现有白底浮层。
- 无障碍：`role="status"` 或明确按钮 `aria-label`。

## 失败与边界

- `restartWatch` 失败：提示「无法恢复定位，请检查权限后重试」，保持 `navigating` 与确认后的路线，允许用户再点「定位」类入口。
- 路线 path 缺失或非法：放弃恢复并 clear。
- 多标签：`sessionStorage` 按标签隔离，可接受。
- 微信内置浏览器：同套逻辑；若无 `speechSynthesis` 仍只提示不支持语音，不影响路线恢复。

## 验收

1. 导航中切后台 10s～2min 再回前台：蓝点继续动，无需确认条。
2. 导航中强制刷新：出现确认条；点继续后路线与导航态恢复，GPS 有更新。
3. 点放弃：快照清除，不进入导航。
4. 改系统时间或改快照 `updatedAt` 超过 2h：不出现确认条。
5. 到达或结束导航：无残留快照。

## 实现顺序建议

1. `navSession.js` + geolocation `restartWatch` + heading `rebind` + voice page hooks  
2. `NavMap` visibility 重绑（先完成 A）  
3. 确认条 + 冷启动恢复（B）  
4. 节流写入与验收
