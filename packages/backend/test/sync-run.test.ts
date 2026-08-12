/**
 * 同步编排 runSync 测试（mock 双源客户端，不触网）。
 * 验证：遍历组织、汇总候选、upsert 入库、sync_logs 记录、状态判定、orgLimit。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../src/db/index.js'
import type { SyncSourceResult } from '../src/sync/types.js'
import { useMemoryDb } from './helpers.js'

useMemoryDb()

const mockState = vi.hoisted(() => ({
  hf: { models: [], skipped: [], errors: [] } as SyncSourceResult,
  ms: { models: [], skipped: [], errors: [] } as SyncSourceResult,
}))

vi.mock('../src/sync/clients/hf.js', () => ({
  fetchHfOrg: vi.fn(async () => mockState.hf),
}))
vi.mock('../src/sync/clients/modelscope.js', () => ({
  fetchModelScopeOrg: vi.fn(async () => mockState.ms),
}))

const { runSync } = await import('../src/sync/index.js')
const { fetchHfOrg } = await import('../src/sync/clients/hf.js')
const { fetchModelScopeOrg } = await import('../src/sync/clients/modelscope.js')

const cand = {
  source: 'hf',
  source_id: 'Qwen/Qwen3-0.6B',
  org: 'Qwen',
  name: 'Qwen3-0.6B',
  model_type: 'llm',
  params: 0.596,
  active_params: 0.596,
  context_length: 40960,
  architecture: 'qwen2',
  kv_cache_type: 'gqa',
  num_layers: 28,
  num_heads: 16,
  head_dim: 128,
  kv_heads: 8,
  vision_overhead_bytes: null,
  activation_gb: null,
  image_steps: null,
  license: 'apache-2.0',
  downloads: 100,
  likes: 10,
  file_size: null,
  precision: 'fp16',
  url: 'https://huggingface.co/Qwen/Qwen3-0.6B',
  quants: [
    {
      quantName: 'fp16',
      format: 'safetensors',
      bitsPerParam: 2.0,
      weightBytes: 0.596 * 1e9 * 2,
      downloads: null,
      url: 'https://huggingface.co/Qwen/Qwen3-0.6B',
    },
  ],
} as const

beforeEach(() => {
  vi.clearAllMocks()
  const db = getDb()
  db.exec('DELETE FROM quantizations; DELETE FROM models; DELETE FROM sync_logs;')
  mockState.hf = { models: [], skipped: [], errors: [] }
  mockState.ms = { models: [], skipped: [], errors: [] }
})

describe('runSync 编排', () => {
  it('遍历组织、调用双源、候选入库、写 sync_logs', async () => {
    mockState.hf = { models: [cand], skipped: [], errors: [] }
    mockState.ms = {
      models: [{ ...cand, source: 'modelscope', source_id: 'Qwen/Qwen3-0.6B', url: 'https://modelscope.cn/models/Qwen/Qwen3-0.6B' }],
      skipped: [{ reason: 'params 缺失', count: 2 }],
      errors: [],
    }

    const summary = await runSync({ orgLimit: 1 })
    expect(fetchHfOrg).toHaveBeenCalled()
    expect(fetchModelScopeOrg).toHaveBeenCalled()
    expect(summary.status).toBe('success')
    expect(summary.candidates).toBe(2)
    expect(summary.inserted).toBe(2)
    expect(summary.skipped.some((s) => s.reason === 'params 缺失')).toBe(true)

    const db = getDb()
    const count = db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }
    expect(count.c).toBe(2)
    const log = db.prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT 1').get() as { status: string }
    expect(log.status).toBe('success')
  })

  it('无候选且有错误 → failed', async () => {
    mockState.hf = { models: [], skipped: [], errors: ['列表获取失败'] }
    const summary = await runSync({ orgLimit: 1 })
    expect(summary.status).toBe('failed')
    expect(summary.candidates).toBe(0)
  })

  it('有候选且有部分错误 → partial', async () => {
    mockState.hf = { models: [cand], skipped: [], errors: ['部分 config 失败'] }
    const summary = await runSync({ orgLimit: 1 })
    expect(summary.status).toBe('partial')
    expect(summary.candidates).toBe(1)
  })

  it('orgLimit=2 时只处理前 2 个组织', async () => {
    mockState.hf = { models: [cand], skipped: [], errors: [] }
    const summary = await runSync({ orgLimit: 2 })
    // 每个组织调一次 hf + 一次 ms
    expect(fetchHfOrg).toHaveBeenCalledTimes(2)
    expect(fetchModelScopeOrg).toHaveBeenCalledTimes(2)
    expect(summary.orgs).toBe(2)
  })

  it('sources 参数只跑指定源', async () => {
    const summary = await runSync({ orgLimit: 1, sources: ['hf'] })
    expect(fetchHfOrg).toHaveBeenCalledTimes(1)
    expect(fetchModelScopeOrg).not.toHaveBeenCalled()
    expect(summary.orgs).toBe(1)
  })
})
