import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue(), basicSsl()],
  // 避免占用 dist / dist-app（与后续打包目录冲突）；静态 SDK 放 public/
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
