/**
 * 数据源客户端测试（mock 全局 fetch）。
 * 验证：分页/owner 过滤、config 结构获取、gated/缺参数跳过、非目标类型过滤。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HfConfig } from '../src/sync/types.js'
import { fetchHfOrg } from '../src/sync/clients/hf.js'
import { fetchModelScopeOrg } from '../src/sync/clients/modelscope.js'

const QWEN3_06B_CONFIG: HfConfig = {
  model_type: 'qwen3',
  hidden_size: 1024,
  num_hidden_layers: 28,
  num_attention_heads: 16,
  num_key_value_heads: 8,
  head_dim: 128,
  max_position_embeddings: 40960,
  intermediate_size: 3072,
  vocab_size: 151936,
  tie_word_embeddings: true,
}

interface MockRoute {
  match: (url: string) => boolean
  data?: unknown
  status?: number
}

/** 按 URL 路由返回 mock 响应 */
function mockFetch(routes: MockRoute[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string): Promise<Response> => {
    const hit = routes.find((r) => r.match(String(url)))
    if (!hit) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(hit.data ?? {}), {
      status: hit.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchModelScopeOrg', () => {
  it('分页拉取 + config 结构 + 候选组装', async () => {
    const fetchMock = mockFetch([
      {
        match: (u) => u.includes('/openapi/v1/models'),
        data: {
          success: true,
          data: {
            models: [
              { id: 'Qwen/Qwen3-0.6B', params: 595_984_384, tasks: ['text-generation'], downloads: 100, likes: 5, license: 'apache-2.0' },
            ],
            total_count: 1,
            page_number: 1,
            page_size: 50,
          },
        },
      },
      {
        match: (u) => u.includes('/repo?') && u.includes('config.json'),
        data: QWEN3_06B_CONFIG,
      },
    ])

    const r = await fetchModelScopeOrg('Qwen', 'Qwen', { maxModelsPerOrg: 3 })
    expect(r.models).toHaveLength(1)
    const m = r.models[0]
    expect(m.source).toBe('modelscope')
    expect(m.source_id).toBe('Qwen/Qwen3-0.6B')
    expect(m.params).toBeCloseTo(0.596, 2)
    expect(m.num_layers).toBe(28)
    expect(m.kv_cache_type).toBe('gqa')

    // 列表请求带 owner 过滤参数
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('owner=Qwen'))).toBe(true)
  })

  it('params=0 的模型被跳过并统计', async () => {
    mockFetch([
      {
        match: (u) => u.includes('/openapi/v1/models'),
        data: {
          success: true,
          data: {
            models: [
              { id: 'Qwen/Qwen3-27B', params: 0, tasks: ['text-generation'], downloads: 1 },
              { id: 'Qwen/Qwen3-0.6B', params: 595_984_384, tasks: ['text-generation'], downloads: 2 },
            ],
            total_count: 2,
            page_number: 1,
            page_size: 50,
          },
        },
      },
      { match: (u) => u.includes('/repo?'), data: QWEN3_06B_CONFIG },
    ])

    const r = await fetchModelScopeOrg('Qwen', 'Qwen', { maxModelsPerOrg: 10 })
    expect(r.models).toHaveLength(1)
    expect(r.skipped.some((s) => s.reason.includes('params'))).toBe(true)
  })

  it('非目标类型（text-to-video）不入库', async () => {
    mockFetch([
      {
        match: (u) => u.includes('/openapi/v1/models'),
        data: {
          success: true,
          data: {
            models: [
              { id: 'Qwen/Qwen-Video', params: 10e9, tasks: ['text-to-video'], downloads: 1 },
            ],
            total_count: 1,
            page_number: 1,
            page_size: 50,
          },
        },
      },
      { match: (u) => u.includes('/repo?'), data: QWEN3_06B_CONFIG },
    ])
    const r = await fetchModelScopeOrg('Qwen', 'Qwen', { maxModelsPerOrg: 10 })
    expect(r.models).toHaveLength(0)
    expect(r.skipped.some((s) => s.reason.includes('目标类型'))).toBe(true)
  })

  it('config 获取失败不中断，保留源 params（结构缺失）', async () => {
    mockFetch([
      {
        match: (u) => u.includes('/openapi/v1/models'),
        data: {
          success: true,
          data: {
            models: [
              { id: 'Qwen/Qwen3-0.6B', params: 595_984_384, tasks: ['text-generation'], downloads: 1 },
            ],
            total_count: 1,
            page_number: 1,
            page_size: 50,
          },
        },
      },
      { match: (u) => u.includes('/repo?'), status: 404 },
    ])
    const r = await fetchModelScopeOrg('Qwen', 'Qwen', { maxModelsPerOrg: 3 })
    expect(r.models).toHaveLength(1)
    expect(r.models[0].params).toBeCloseTo(0.596, 2) // 源 params 仍在
    expect(r.models[0].num_layers).toBeNull() // 结构缺失
  })
})

describe('fetchHfOrg', () => {
  it('过滤目标类型 + config 估算 + 候选组装', async () => {
    const fetchMock = mockFetch([
      {
        match: (u) => u.includes('/api/models?'),
        data: [
          { id: 'Qwen/Qwen3-0.6B', downloads: 100, likes: 5, pipeline_tag: 'text-generation' },
          { id: 'Qwen/Qwen-ASR', downloads: 99, pipeline_tag: 'automatic-speech-recognition' },
        ],
      },
      {
        match: (u) => u.includes('/raw/main/config.json'),
        data: QWEN3_06B_CONFIG,
      },
    ])

    const r = await fetchHfOrg('Qwen', 'Qwen', { maxModelsPerOrg: 3 })
    expect(r.models).toHaveLength(1)
    const m = r.models[0]
    expect(m.source).toBe('hf')
    expect(m.params).toBeCloseTo(0.596, 2)
    expect(m.quants[0].quantName).toBe('fp16')

    // 列表请求带 author 过滤
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('author=Qwen'))).toBe(true)
  })

  it('config 404 → 跳过该模型', async () => {
    mockFetch([
      {
        match: (u) => u.includes('/api/models?'),
        data: [{ id: 'Qwen/Qwen3-0.6B', downloads: 1, pipeline_tag: 'text-generation' }],
      },
      { match: (u) => u.includes('config.json'), status: 404 },
    ])
    const r = await fetchHfOrg('Qwen', 'Qwen', { maxModelsPerOrg: 3 })
    expect(r.models).toHaveLength(0)
    expect(r.skipped.some((s) => s.reason.includes('config'))).toBe(true)
  })

  it('列表请求失败 → 返回错误', async () => {
    mockFetch([{ match: (u) => u.includes('/api/models?'), status: 500 }])
    const r = await fetchHfOrg('Qwen', 'Qwen', { maxModelsPerOrg: 3 })
    expect(r.models).toHaveLength(0)
    expect(r.errors.length).toBeGreaterThan(0)
  })
})
