/**
 * API client 测试：mock 全局 fetch，验证请求构造、统一错误处理与响应解析。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, ApiError, queryString } from './client'
import { installFetchMock, jsonResponse, fetchUrl } from '../test-utils/fetchMock'

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = installFetchMock()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const GPU = {
  id: 1,
  name: 'RTX 4060',
  category: 'consumer' as const,
  vram_gb: 8,
  memory_bandwidth_gbps: 272,
  fp16_tflops: 30.2,
  tier: 8,
  note: null,
}

describe('请求构造', () => {
  it('hardware: 请求 /api/hardware 并解析 data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: [GPU] }))
    const res = await api.hardware()
    expect(fetchUrl(mockFetch)).toBe('/api/hardware')
    expect(res.data[0].name).toBe('RTX 4060')
  })

  it('models: query 参数拼接到 URL', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: [], total: 0, context: 8192, target: {} }))
    await api.models(new URLSearchParams('type=image&context=4096'))
    expect(fetchUrl(mockFetch)).toBe('/api/models?type=image&context=4096')
  })

  it('models: 空 query 不追加 ?', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: [], total: 0, context: 8192, target: {} }))
    await api.models(new URLSearchParams(''))
    expect(fetchUrl(mockFetch)).toBe('/api/models')
  })

  it('modelDetail: 请求 /api/models/1 并带 query', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: {}, context: 8192, target: {} }))
    await api.modelDetail(1, new URLSearchParams('gpu_id=2'))
    expect(fetchUrl(mockFetch)).toBe('/api/models/1?gpu_id=2')
  })

  it('triggerSync: 使用 POST 且请求 /api/sync', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { ok: true, message: 'done' }))
    await api.triggerSync()
    expect(fetchUrl(mockFetch)).toBe('/api/sync')
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })

  it('signal 透传给 fetch（供 hooks 取消请求）', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: [], total: 0, context: 8192, target: {} }))
    const controller = new AbortController()
    await api.models(new URLSearchParams(''), { signal: controller.signal })
    expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal)
  })
})

describe('统一错误处理', () => {
  it('非 2xx: 抛 ApiError，message 取后端 error 字段', async () => {
    mockFetch.mockResolvedValue(jsonResponse(404, { error: '模型不存在' }))
    const err = await api.hardware().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
    expect((err as ApiError).message).toBe('模型不存在')
  })

  it('非 2xx 且无 error 字段: message 回落为 HTTP 状态', async () => {
    mockFetch.mockResolvedValue(jsonResponse(500, {}))
    const err = await api.hardware().catch((e) => e)
    expect((err as ApiError).status).toBe(500)
    expect((err as ApiError).message).toBe('HTTP 500')
  })

  it('网络失败（fetch reject）: message 带原因', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await api.hardware().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toContain('网络请求失败')
    expect((err as ApiError).message).toContain('Failed to fetch')
  })

  it('响应不是合法 JSON: 抛错误', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'not-json' })
    const err = await api.hardware().catch((e) => e)
    expect((err as ApiError).message).toContain('不是合法 JSON')
  })
})

describe('queryString', () => {
  it('空参数返回空串', () => {
    expect(queryString(new URLSearchParams(''))).toBe('')
  })
  it('非空参数前加 ?', () => {
    expect(queryString(new URLSearchParams('a=1&b=2'))).toBe('?a=1&b=2')
  })
})
