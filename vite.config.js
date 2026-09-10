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

export default defineConfig({
  plugins: [vue(), basicSsl(), syncBuildVersionPlugin()],
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: true,
  },
  preview: {
    host: true,
    port: 5173,
  },
})
