/**
 * GET /api/organizations — 白名单组织列表（关于/说明展示）
 */
import type { FastifyInstance } from 'fastify'
import type { Organization } from '@can-i-deploy/shared'
import { getDb } from '../db/index.js'

export function organizationsRoutes(app: FastifyInstance) {
  app.get('/api/organizations', async () => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM organizations ORDER BY id').all() as unknown as Organization[]
    return { data: rows }
  })
}
