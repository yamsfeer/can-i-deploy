/**
 * GET /api/hardware — GPU 规格列表（含云实例映射）
 */
import type { FastifyInstance } from 'fastify'
import type { GpuSpec } from '@can-i-deploy/shared'
import { getDb } from '../db/index.js'

export function hardwareRoutes(app: FastifyInstance) {
  app.get('/api/hardware', async () => {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM gpus ORDER BY category, vram_gb, name')
      .all() as unknown as GpuSpec[]
    return { data: rows }
  })
}
