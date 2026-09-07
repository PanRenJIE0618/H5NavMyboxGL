# Vue3 + Vite MapboxGL Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold Vue 3 + Vite (JS) in this repo, wire local SuperMap iClient MapboxGL via script tags, and show the official China basemap.

**Architecture:** Copy essential `dist/mapboxgl` JS/CSS into `public/libs/mapboxgl`. Load Mapbox GL from SuperMap libs CDN and iClient from local public paths in `index.html`. `App.vue` creates/destroys `mapboxgl.Map` with China raster tiles.

**Tech Stack:** Vue 3, Vite, Mapbox GL JS 1.13.2 (CDN), SuperMap iClient MapboxGL 12.1.0 (local)

## Global Constraints

- JavaScript only (no TypeScript)
- Use local SDK under `public/libs/mapboxgl` (not npm iClient packages)
- Basemap: `https://iserver.supermap.io/iserver/services/map-china400/rest/maps/China/zxyTileImage.png?z={z}&x={x}&y={y}`
- Full-screen single map page only
- Do not commit unless the user asks

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json` | Vue 3 + Vite scripts/deps |
| `vite.config.js` | Vite + `@vitejs/plugin-vue` |
| `index.html` | Entry + Mapbox/iClient script/CSS tags |
| `public/libs/mapboxgl/*` | Local iClient CSS/JS (from `dist/mapboxgl`) |
| `src/main.js` | Create Vue app |
| `src/App.vue` | Map container + lifecycle |
| `src/style.css` | Full-viewport layout |

---

### Task 1: Scaffold Vite + Vue and copy SDK assets

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/style.css`, `src/App.vue` (placeholder)
- Create: `public/libs/mapboxgl/iclient-mapboxgl.min.css`, `iclient-mapboxgl-es6.min.js` (copied)
- Optional create: `.gitignore`

**Interfaces:**
- Produces: `npm run dev` starts Vite; static files served at `/libs/mapboxgl/...`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "h5-nav-myboxgl",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "vite": "^6.0.7"
  }
}
```

- [ ] **Step 2: Create `vite.config.js`**

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    open: true
  }
})
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules
dist-app
.DS_Store
*.local
```

Note: keep existing SuperMap `dist/` unignored; Vite build output will use `build.outDir: 'dist-app'` to avoid clobbering the SDK.

Update `vite.config.js` to set `build: { outDir: 'dist-app' }`.

- [ ] **Step 4: Copy SDK CSS/JS into public**

```powershell
New-Item -ItemType Directory -Force -Path "public\libs\mapboxgl" | Out-Null
Copy-Item "dist\mapboxgl\iclient-mapboxgl.min.css" "public\libs\mapboxgl\"
Copy-Item "dist\mapboxgl\iclient-mapboxgl-es6.min.js" "public\libs\mapboxgl\"
```

- [ ] **Step 5: Create `index.html` with library tags**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>H5Nav MyBoxGL</title>
    <link
      rel="stylesheet"
      href="https://iclient.supermap.io/web/libs/mapbox-gl-js/1.13.2/mapbox-gl.css"
    />
    <link rel="stylesheet" href="/libs/mapboxgl/iclient-mapboxgl.min.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://iclient.supermap.io/web/libs/mapbox-gl-js/1.13.2/mapbox-gl.js"></script>
    <script src="/libs/mapboxgl/iclient-mapboxgl-es6.min.js"></script>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/main.js` and `src/style.css`**

`src/main.js`:

```js
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

`src/style.css`:

```css
html,
body,
#app {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 7: Placeholder `src/App.vue` then `npm install`**

```vue
<template>
  <div id="map"></div>
</template>

<script setup>
</script>

<style scoped>
#map {
  width: 100%;
  height: 100vh;
}
</style>
```

Run: `npm install`  
Expected: `node_modules` created, no errors.

---

### Task 2: Initialize China basemap in App.vue

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `window.mapboxgl` from index.html scripts
- Produces: interactive Map instance on `#map`

- [ ] **Step 1: Implement map lifecycle in `App.vue`**

```vue
<template>
  <div id="map"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'

let map = null

onMounted(() => {
  const mapboxgl = window.mapboxgl
  if (!mapboxgl) {
    console.error('mapboxgl is not loaded')
    return
  }

  map = new mapboxgl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'raster-tiles': {
          type: 'raster',
          tiles: [
            'https://iserver.supermap.io/iserver/services/map-china400/rest/maps/China/zxyTileImage.png?z={z}&x={x}&y={y}'
          ],
          tileSize: 256
        }
      },
      layers: [
        {
          id: 'simple-tiles',
          type: 'raster',
          source: 'raster-tiles',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    },
    center: [116.4, 39.9],
    zoom: 4
  })

  map.addControl(new mapboxgl.NavigationControl(), 'top-right')
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
#map {
  width: 100%;
  height: 100vh;
}
</style>
```

- [ ] **Step 2: Start dev server and verify**

Run: `npm run dev`  
Expected: Vite listens on `http://localhost:5173/`; page shows China map; pan/zoom works; Network shows tile requests to `iserver.supermap.io`.

- [ ] **Step 3: Smoke-check static assets**

Open `/libs/mapboxgl/iclient-mapboxgl-es6.min.js` and Mapbox CDN scripts — expect HTTP 200.

---

## Spec coverage (self-review)

- Vue3 + Vite JS scaffold → Task 1  
- Local dist via public + script tags → Task 1  
- China online basemap + full-screen container + destroy on unmount → Task 2  
- No TypeScript / no Vue-iClient / no private iServer → respected  
