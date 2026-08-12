/**
 * Can I Deploy API 入口。
 * 启动：pnpm --filter @can-i-deploy/backend dev
 */
import { buildApp } from './app.js'
import { initDb } from './db/index.js'
import { startSyncScheduler } from './sync/index.js'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '127.0.0.1'

initDb()
console.log(`[db] SQLite 就绪: ${process.env.DATABASE_PATH ?? 'packages/backend/data/can-i-deploy.db'}`)

const app = buildApp()

try {
  await app.listen({ port: PORT, host: HOST })
  console.log(`[api] 启动成功 → http://${HOST}:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

startSyncScheduler()
