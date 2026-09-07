# Vue3 + Vite + SuperMap iClient MapboxGL 地图启动设计

日期：2026-09-07  
状态：已确认（待实现）

## 目标

在当前仓库（已有 SuperMap iClient for MapboxGL 12.1.0 开发包）下，用 **Vue 3 + Vite（JavaScript）** 启动前端工程，并成功显示可交互地图。

成功标准：`npm run dev` 后浏览器中可见中国底图，支持缩放与拖拽。

## 决策摘要

| 项 | 选择 |
| --- | --- |
| 框架 | Vue 3 + Vite，JavaScript |
| SDK 来源 | 本地 `dist/mapboxgl`（方案 1：script 全局引入） |
| 底图 | SuperMap 官方在线 China 栅格服务 |
| UI 范围 | 单页全屏地图，无额外业务功能 |

## 架构

- 在仓库根目录创建 Vite 应用（与现有 `dist/` 开发包共存）。
- 将 `dist/mapboxgl` 复制到 `public/libs/mapboxgl`，由 Vite 静态服务暴露。
- 在 `index.html` 引入 Mapbox GL CSS/JS（可用官方 libs CDN）及本地 `iclient-mapboxgl` CSS/JS，挂到 `window.mapboxgl` / SuperMap 命名空间。
- Vue 只负责容器与生命周期；地图实例在 `onMounted` 创建，在 `onBeforeUnmount` 销毁。

不采用：npm 模块化 `@supermapgis/iclient-mapboxgl`（与本地包版本可能不一致）；不采用 `@supermap/vue-iclient-mapboxgl`（面向 Vue 2）。

## 目录结构

```
H5NavMyBoxGL/
  package.json
  vite.config.js
  index.html
  public/
    libs/
      mapboxgl/          # 自 dist/mapboxgl 复制
  src/
    main.js
    App.vue
    style.css
  dist/                  # 原开发包保留，不改动其内容用途
  docs/superpowers/specs/
```

## 组件与数据流

1. `main.js` 挂载 `App.vue`。
2. `App.vue` 提供全屏 `#map` 容器（`width/height: 100%`，根节点 `100vh`）。
3. `onMounted`：
   - 使用 `window.mapboxgl.Map` 初始化；
   - `style.sources` 配置 raster 瓦片；
   - `center: [116.4, 39.9]`，`zoom: 4`。
4. `onBeforeUnmount`：调用 `map.remove()`。

### 底图 URL

```
https://iserver.supermap.io/iserver/services/map-china400/rest/maps/China/zxyTileImage.png?z={z}&x={x}&y={y}
```

`tileSize: 256`，layer 类型 `raster`。

### 脚本引入（index.html）

- Mapbox GL CSS/JS：`https://iclient.supermap.io/web/libs/mapbox-gl-js/1.13.2/...`（与开发包 `include-mapboxgl.js` 一致）
- iClient CSS/JS：`/libs/mapboxgl/iclient-mapboxgl.min.css`、`/libs/mapboxgl/iclient-mapboxgl-es6.min.js`（现代浏览器固定用 es6 构建）

## 错误处理与边界

- 地图容器若无明确宽高会出现空白；用全局 `html, body, #app { height: 100%; margin: 0 }` 与 `#map { width:100%; height:100vh }` 保证。
- 依赖外网：Mapbox libs CDN + `iserver.supermap.io`；离线环境不在本次范围。
- 热更新时必须销毁旧 map，避免多实例叠加。

## 验证

1. `npm install` && `npm run dev`
2. 打开本地地址，确认 China 底图渲染
3. 缩放、平移正常
4. 刷新/热更新后仍只有一个地图实例

## 非目标（本次不做）

- TypeScript
- 业务图层、绘制、量算、查询
- Vue-iClient 组件库
- 自建 iServer / 私有底图切换 UI
