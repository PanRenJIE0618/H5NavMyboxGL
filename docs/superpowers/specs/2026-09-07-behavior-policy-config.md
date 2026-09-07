# Behavior Policy（用户行为策略）

可热更新的地图交互 / 导航行为参数，便于后期接后端下发。

## 模块

- `src/config/behaviorPolicy.js` — 默认值、规范化、热更新 API
- `src/config.js` — 再导出；地图缩放等静态项仍在此

## API

```js
import {
  getBehaviorPolicy,
  applyBehaviorPolicy,
  setBehaviorPolicy,
  resetBehaviorPolicy,
  fetchBehaviorPolicy,
  onBehaviorPolicyChange,
} from './config'

getBehaviorPolicy()                 // 当前快照
applyBehaviorPolicy({ locationResumeAfterDragMs: 12000 })  // 增量热更新
setBehaviorPolicy(full)             // 全量替换（相对默认规范化）
resetBehaviorPolicy()               // 恢复内置默认
await fetchBehaviorPolicy('/api/nav/behavior-policy')      // 后端拉取
onBehaviorPolicyChange((p) => { /* … */ })                 // 订阅变更
```

## 关键字段

| 字段 | 含义 | 默认 |
|------|------|------|
| `locationResumeAfterDragMs` | 拖图停后恢复定位回调 | 10000 |
| `viewLockAfterDragIdleMs` | 拖图停后自动开启视角跟随 | 10000 |
| `pitch2d` / `pitch3d` / `maxPitch` | 平面/3D 俯仰 | 0 / 55 / 60 |
| `followUserOnInit` / `headingLockOnInit` | 进页默认开关 | false |
| `followUserOnNavStart` / `headingLockOnNavStart` | 开导航默认开关 | true |
| `pinCameraHoldMs` | 强制居中钉相机时长 | 2800 |
| `headingSampleWindowMs` | 朝向采样窗 | 2800 |
| `arriveMeters` | 到达判定距离 | 35 |
| `offRouteMeters` / `offRouteHits` | 偏航距离阈值 / 连续命中次数 | 50 / 3 |
| `rerouteCooldownMs` | 重规划冷却 | 8000 |
| `offRouteAutoReroute` | 偏航是否自动重规划 | true |
| `speedLimitKmh` | 超速阈值（km/h） | 60 |
| `speedIdleKmh` | 低于此速度显示 0 | 1.5 |
| `voiceEnabled` / `voiceRate` / `voiceLang` | 导航语音开关/语速/语言 | true / 1 / zh-CN |
| `walk.*` | 步行稳定朝向自动校正 | 见代码 |

## 约定

运行时请用 `getBehaviorPolicy()` 取当前值，不要缓存解构出的数字常量，否则热更新不生效。
