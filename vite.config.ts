import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dataApiPlugin from './server/vite-plugin-data-api.js'

// 数据 API 以 Vite middleware 形式挂载到 /api 下，
// dev 与 preview 都可用，无需额外后端进程。
export default defineConfig({
  plugins: [react(), dataApiPlugin()],
})
