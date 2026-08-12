/**
 * POST /api/sync 路由测试（mock runSync，不触网）。
 * 验证：调用真实 runSync、并发触发 409、日志读取。
 */
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../src/db/index.js'
import { useMemoryDb } from './helpers.js'

useMemoryDb()

vi.mock('../src/sync/index.js', () => ({
  runSync: vi.fn(),
  startSyncScheduler: vi.fn(),
}))

const { runSync } = await import('../src/sync/index.js')
const { syncRoutes } = await import('../src/routes/sync.js')

const SUMMARY = {
  startedAt: '2026-08-12T00:00:00.000Z',
  finishedAt: '2026-08-12T00:00:10.000Z',
  status: 'success',
  orgs: 18,
  candidates: 92,
  inserted: 88,
  quantRows: 92,
  skipped: [],
  errors: [],
}

function buildApp() {
  const app = Fastify()
  app.register(syncRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  getDb().exec('DELETE FROM sync_logs;')
})

describe('POST /api/sync', () => {
  it('触发 runSync 并返回摘要', async () => {
    vi.mocked(runSync).mockResolvedValue(SUMMARY)
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/api/sync' })
    expect(res.statusCode).toBe(200)
    expect(runSync).toHaveBeenCalledTimes(1)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.status).toBe('success')
    expect(body.candidates).toBe(92)
  })

  it('并发触发返回 409', async () => {
    vi.mocked(runSync).mockResolvedValue(SUMMARY)
    const app = buildApp()
    await app.ready()
    app.syncRunning = true // 模拟已有同步进行中

    const res = await app.inject({ method: 'POST', url: '/api/sync' })
    expect(res.statusCode).toBe(409)
    expect(runSync).not.toHaveBeenCalled()
  })

  it('runSync 抛错 → 500', async () => {
    vi.mocked(runSync).mockRejectedValue(new Error('网络故障'))
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/api/sync' })
    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('同步失败')
  })
})

describe('GET /api/sync/logs', () => {
  it('返回最近同步日志', async () => {
    const db = getDb()
    db.prepare(
      'INSERT INTO sync_logs (started_at, finished_at, status, message) VALUES (?, ?, ?, ?)',
    ).run('2026-08-12T00:00:00Z', '2026-08-12T00:00:10Z', 'success', '{}')

    const app = buildApp()
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/api/sync/logs' })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data).toHaveLength(1)
    expect(data[0].status).toBe('success')
  })
})
