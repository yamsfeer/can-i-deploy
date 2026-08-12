/**
 * POST /api/sync — 手动触发数据拉取（限管理，本期占位）
 * M2 数据管道（HF + ModelScope 抓取）尚未实现，先记录执行日志。
 */
import type { FastifyInstance } from 'fastify'
import { getDb } from '../db/index.js'

export function syncRoutes(app: FastifyInstance) {
  app.post('/api/sync', async (_req, reply) => {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(
      'INSERT INTO sync_logs (started_at, finished_at, status, message) VALUES (?, ?, ?, ?)',
    ).run(now, now, 'skipped', 'M2 数据管道未实现，手动同步暂为占位')
    return {
      ok: true,
      message: 'M2 数据管道未实现（占位响应），同步日志已记录',
    }
  })

  app.get('/api/sync/logs', async () => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT 20').all()
    return { data: rows }
  })
}
