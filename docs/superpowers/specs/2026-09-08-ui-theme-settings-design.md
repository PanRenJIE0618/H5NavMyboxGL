# 地图 UI 主题设置设计

日期：2026-09-08  
状态：approved

## Goal

在朝向锁定上方增加设置入口，进入地图设置页，可切换 H5 页面 UI 主题（浅色 / 深色 / 高对比），并用 localStorage 持久化。

## Non-goals

- 天地图底图图层切换（矢量/影像）
- vue-router
- 行为策略其它项（偏航阈值等）

## UX

- FAB「设置」位于右侧栏、朝向锁定按钮上方
- 全屏设置页：标题「地图设置」、返回按钮
- 主题三选一：浅色（默认）、深色、高对比；点选即生效并保存
- 返回地图时地图仍存活（`v-show`），触发一次 `resize`

## Tech

- `src/lib/uiTheme.js`：`light|dark|contrast`，读写 `localStorage` 键 `h5nav:uiTheme`，`applyUiTheme` 设置 `document.documentElement.dataset.theme`
- `src/components/MapSettings.vue`：设置页 UI
- `App.vue`：`page` 在 `map` / `settings` 间切换；启动 `initUiTheme()`
- `style.css`：`html[data-theme="dark"]` / `contrast` 覆盖 CSS 变量
- `NavMap.vue`：设置按钮 + `emit('open-settings')`；`active` prop 为 true 时 `refreshMapSize`

## 底图（2026-09-08 增补）

- 天地图：`vec`（vec_w+cva_w）/ `img`（img_w+cia_w）/ `ter`（ter_w+cta_w）
- `src/lib/basemap.js` + localStorage `h5nav:basemap`
- 设置页「底图」三选一；`onBasemapChange` 通知 NavMap 热切换瓦片
