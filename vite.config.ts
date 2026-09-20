import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import dataApiPlugin from './server/vite-plugin-data-api.js'

// 数据 API 以 Vite middleware 形式挂载到 /api 下，
// dev 与 preview 都可用，无需额外后端进程。
export default defineConfig(({ mode }) => {
  // Vite 只把 .env 暴露给前端（import.meta.env），不会写进 Node 的 process.env。
  // 这里手动把 AI_* 配置注入 process.env，供 server 中间件（ai-provider.js）读取。
  // 密钥只存于 .env（已 gitignore），不进版本库。
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL']) {
    if (env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [react(), dataApiPlugin()],
  }
})
