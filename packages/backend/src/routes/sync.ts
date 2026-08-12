/**
 * POST /api/sync — 手动触发数据拉取（限管理）。
 * 调用真实 runSync（M2 数据管道），支持环境变量收敛请求量。
 * GET  /api/sync/logs — 最近同步日志。
 */
import type { FastifyInstance } from 'fastify'
import { runSync } from '../sync/index.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** 同步运行中标记（防并发触发） */
    syncRunning?: boolean
  }
}

export function syncRoutes(app: FastifyInstance) {
  app.post('/api/sync', async (_req, reply) => {
    // 简单防呆：不允许并发触发
    if (app.syncRunning) {
      return reply.code(409).send({ error: '同步正在进行中，请稍后再试' })
    }
    app.syncRunning = true
    try {
      const summary = await runSync()
      return { ok: true, ...summary }
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: '同步失败', message: String(err) })
    } finally {
      app.syncRunning = false
    }
  })

  app.get('/api/sync/logs', async () => {
    const { getDb } = await import('../db/index.js')
    const db = getDb()
    const rows = db.prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT 20').all()
    return { data: rows }
  })
}
