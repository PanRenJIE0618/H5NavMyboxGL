import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

function readBuildVersion() {
  try {
    return fs.readFileSync(path.resolve(__dirname, 'BUILD-VERSION'), 'utf8').trim()
  } catch {
    return '0'
  }
}

function syncBuildVersionPlugin() {
  return {
    name: 'sync-build-version',
    config() {
      const v = readBuildVersion()
      return {
        define: {
          'import.meta.env.VITE_APP_BUILD_VERSION': JSON.stringify(v),
        },
      }
    },
    buildStart() {
      const v = readBuildVersion()
      const publicPath = path.resolve(__dirname, 'public/BUILD-VERSION')
      fs.writeFileSync(publicPath, `${v}\n`, 'utf8')
    },
    closeBundle() {
      const v = readBuildVersion()
      const out = path.resolve(__dirname, 'build/BUILD-VERSION')
      try {
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, `${v}\n`, 'utf8')
      } catch {
        /* ignore */
      }
    },
  }
}

/** 开发/preview：把 /proxy/tianditu 转到天地图官方（与生产 nginx 片段一致） */
function tiandituProxy() {
  /** @type {Record<string, import('vite').ProxyOptions>} */
  const proxy = {
    '/proxy/tianditu/api': {
      target: 'https://api.tianditu.gov.cn',
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(/^\/proxy\/tianditu\/api/, ''),
      headers: { Referer: 'https://www.tianditu.gov.cn/' },
    },
  }
  for (let n = 0; n <= 7; n += 1) {
    proxy[`/proxy/tianditu/t${n}`] = {
      target: `https://t${n}.tianditu.gov.cn`,
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(new RegExp(`^/proxy/tianditu/t${n}`), ''),
      headers: { Referer: 'https://www.tianditu.gov.cn/' },
    }
  }
  return proxy
}

export default defineConfig({
  plugins: [vue(), basicSsl(), syncBuildVersionPlugin()],
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    // 5173 被占用时自动顺延（例如其它项目的 Vite）
    strictPort: false,
    open: true,
    proxy: tiandituProxy(),
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: false,
    proxy: tiandituProxy(),
  },
})
