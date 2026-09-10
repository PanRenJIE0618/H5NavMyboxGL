# 模块说明 · H5NavMyBoxGL

按功能拆分后的职责、配置与存储约定。页面级 `.vue` 单文件不超过 **1000** 行。

---

## 规范

1. **页面 / 组件**：`src/components/**/*.vue` 单文件 &lt; 1000 行；复杂页用「壳组件 + 子组件 + composable」拆分。
2. **首页导航**：UI 在 `components/nav/`，逻辑在 `composables/nav/`，通过共享 `ctx` 安装域模块。
3. **配置**：地图常量走 `config.js` / `config/mapDefaults.js`；行为阈值走 `behaviorPolicy.js`（运行时用 `getBehaviorPolicy()`，勿缓存解构常量）。
4. **偏好持久化**：统一 `h5nav:*` 键名，模块内读写，设置页只调 API。
5. **文案**：界面与语音文案走 `i18n`，禁止在业务里散落硬编码多语言字符串（调试日志除外）。

---

## 页面组件（`src/components/`）

| 文件 | 职责 | 约行数 |
| --- | --- | ---: |
| `nav/NavMap.vue` | 首页壳：地图容器、组装子 UI、暴露 `applyHistoryItem`，事件 `navigating-change` / `map-ready` | ~206 |
| `nav/NavMast.vue` | 顶栏：标题、日志、罗盘、搜索 | &lt;100 |
| `nav/NavHud.vue` | 底栏：地址/状态/导航操作 | ~125 |
| `nav/NavBanners.vue` | 横幅：继续导航、剪贴板、偏航 | &lt;100 |
| `nav/NavMapChrome.vue` | 测速、剩余进度、出行方式、FAB、遮罩 | ~164 |
| `DevConsole.vue` | 调试日志浮层 | ~26 |
| `QuickNav.vue` | 快捷导航：常去 / 推荐 / 历史 | ~158 |
| `MapSettings.vue` | 「我的」：外观、语言、导航偏好、存储、本机信息 | ~497 |

样式仍集中在 `src/style.css`。

---

## 导航逻辑（`src/composables/nav/`）

`useNavMapLogic(props, emit)` 创建 `ctx`，按序安装域模块（均为普通 ES，无 eval）：

1. `installNavMapState` — 初始 ref / 运行时字段（地图、信标、定时器、定位、朝向…）
2. `installNavMapUi` — `statusText` / `hudTitle` / 测速展示 / 遮罩边距等
3. `installNavClipboard` — 剪贴板监测与前往确认
4. `installNavMapCore` — 地图初始化、底图/主题、resize、信标挂载
5. `installNavCamera` — 居中、跟随、朝向锁定、3D、拖图暂停
6. `installNavRouting` — 搜索选点、双路线、出行方式、线/标注
7. `installNavSessionFlow` — 开始/结束导航、偏航更新、会话恢复、历史

安装约定：

- 已有 ref：可从 `ctx` 解构后用 `.value`
- 会被整体替换的字段（`map`、`beacon`、定时器等）与跨模块函数：一律 `ctx.xxx`
- 各文件只 import 自己需要的依赖

其它 composable：

| 文件 | 职责 |
| --- | --- |
| `composables/useGeolocation.js` | 浏览器定位 |
| `composables/useDeviceHeading.js` | 设备朝向 / 罗盘 |

---

## 配置（`src/config*`）

| 文件 | 职责 |
| --- | --- |
| `src/config.js` | 入口：`TIANDITU_TK`、默认中心/缩放，并 re-export 行为策略 |
| `src/config/mapDefaults.js` | 地图常量：`DEFAULT_CENTER`、`DEFAULT_ZOOM`、`LOCATED_ZOOM`、`NAV_ZOOM`、`MAX_ZOOM`、瓦片辅助 |
| `src/config/behaviorPolicy.js` | 到达 / 偏航 / 测速 / 语音 / 会话 / 步行朝向（可热更新） |

### 地图默认参数（`config.js` / `mapDefaults.js`）

| 参数 | 含义 |
| --- | --- |
| `TIANDITU_TK` | 天地图服务 token |
| `DEFAULT_CENTER` | 未定位时默认中心 |
| `DEFAULT_ZOOM` | 默认缩放 |
| `LOCATED_ZOOM` | 定位成功后缩放 |
| `NAV_ZOOM` | 导航中缩放 |
| `MAX_ZOOM` | 最大缩放 |

### 行为策略字段（`behaviorPolicy.js`）

| 字段 | 含义 |
| --- | --- |
| `locationResumeAfterDragMs` | 拖图停止后恢复定位回调等待（ms） |
| `viewLockAfterDragIdleMs` | 拖图停止后自动视角跟随等待（ms） |
| `pitch2d` / `pitch3d` / `maxPitch` | 2D/3D 俯仰与上限 |
| `followUserOnInit` / `headingLockOnInit` | 进页默认跟随 / 朝向锁 |
| `followUserOnNavStart` / `headingLockOnNavStart` | 开始导航时默认开关 |
| `pinCameraHoldMs` | 强制居中后钉住相机（ms） |
| `headingSampleWindowMs` | 朝向采样窗口（ms） |
| `arriveMeters` | 到达判定距离（m） |
| `offRouteMeters` / `offRouteHits` | 偏航距离阈值与连续命中次数 |
| `rerouteCooldownMs` | 重规划冷却（ms） |
| `offRouteAutoReroute` | 偏航是否自动重规划 |
| `speedLimitKmh` / `speedIdleKmh` | 限速与静止显示阈值（km/h） |
| `voiceEnabled` / `voiceRate` / `voiceLang` | 语音开关、语速、语言 |
| `navSessionTtlMs` | 会话快照有效期（ms） |
| `navSessionPersistThrottleMs` / `navSessionPersistMinMeters` | 会话写入节流 |
| `navVoiceRelockHiddenMs` | 挂起过久回前台需重新解锁语音 |
| `walk.*` | 步行稳定朝向自动校正 |

热更新：`applyBehaviorPolicy` / `setBehaviorPolicy`；订阅：`onBehaviorPolicyChange`。

---

## 本地存储键（`h5nav:*`）

| 键 | 存储 | 模块 | 用途 |
| --- | --- | --- | --- |
| `h5nav:uiTheme` | localStorage | `lib/uiTheme.js` | light / dark / contrast |
| `h5nav:locale` | localStorage | `i18n` | zh-CN / en / zh-TW（含语音语言） |
| `h5nav:basemap` | localStorage | `lib/basemap.js` | vec / img / ter |
| `h5nav:navPrefs` | localStorage | `lib/navPrefs.js` | 语音、默认出行、默认路线 |
| `h5nav:autoViewLock` | localStorage | `lib/viewLock.js` | 自动视角跟随 |
| `h5nav:navHistory` | localStorage | `lib/navHistory.js` | 导航历史 |
| `h5nav:frequentPlaces` | localStorage | `lib/frequentPlaces.js` | 常去地点（≥2 次） |
| `h5nav:session` | sessionStorage | `lib/navSession.js` | 未完成导航会话 |

### 偏好结构速查

- **navPrefs**：`{ voiceEnabled, travelMode: 'drive'|'walk', driveStyle }`
- **theme**：`light` \| `dark` \| `contrast`（深色会联动矢量底图着色）
- **basemap**：`vec` \| `img` \| `ter`
- **locale**：界面 + TTS 语言
- **viewLock**：与行为策略中的跟随开关共同生效

「我的 · 存储」可查看占用并清理；「恢复默认」只重置偏好，不清历史/常去（除非选清空全部）。

---

## 其它业务库（`src/lib/`）

| 模块 | 职责 |
| --- | --- |
| `route.js` | 驾车/步行规划、模式标签 |
| `search.js` / `geocode.js` | 检索与逆地理 |
| `navVoice.js` | 语音播报 |
| `navSession.js` / `navHistory.js` / `frequentPlaces.js` | 会话 / 历史 / 常去 |
| `clipboardAddress.js` | 剪贴板地址识别 |
| `LocationBeacon.js` | 定位标 |
| `offRouteMonitor.js` | 偏航监测 |
| `deviceWalkBehavior.js` | 步行朝向校正 |
| `appStorage.js` | 存储清单与清理/恢复默认 |
| `bootSplash.js` | 启动屏进度与关闭 |
| `http.js` | 业务 `request()` + 网络/HTTP 错误 toast |
| `toast.js` | 全局 toast 事件总线 |
| `appVersion.js` | 生产环境 BUILD-VERSION 轮询与更新提示 |
| `basemap.js` / `uiTheme.js` / `viewLock.js` / `navPrefs.js` | 底图、主题、视角锁、导航偏好 |

---

## 目录一览

```
src/
  App.vue                 # Tab 壳 + 启动屏结束
  main.js                 # i18n / 主题 / 偏好初始化
  config.js               # 地图与策略入口
  config/
    behaviorPolicy.js
    mapDefaults.js
  components/
    nav/                  # 首页地图 UI
    QuickNav.vue
    MapSettings.vue
    DevConsole.vue
  composables/
    nav/                  # 首页地图逻辑域
    useGeolocation.js
    useDeviceHeading.js
  lib/                    # 可复用能力
  i18n/                   # 多语言
docs/
  modules.md              # 本文档
```
