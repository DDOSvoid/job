import { createApiRouter } from './routes.js'

/**
 * Vite 插件：把数据 API 以 connect middleware 形式挂载到 /api 下。
 * dev（configureServer）与 preview（configurePreviewServer）都可用，
 * 因此 `npm run dev` 只需启动 vite，无需额外后端进程。
 */
export default function dataApiPlugin() {
  const apiRouter = createApiRouter()
  const applyMiddleware = (server) => {
    server.middlewares.use(apiRouter)
  }
  return {
    name: 'data-api',
    configureServer(server) {
      applyMiddleware(server)
    },
    configurePreviewServer(server) {
      applyMiddleware(server)
    },
  }
}
