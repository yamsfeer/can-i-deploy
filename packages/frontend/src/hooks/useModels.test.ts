/**
 * useModels 测试：走真实 api client，仅 mock 网络层。
 * 覆盖默认请求、q 防抖与 stale 语义、类型切换立即请求、错误暴露。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useModels } from './useModels'
import { DEFAULT_FILTERS } from '../api/filters'
import { installFetchMock, jsonResponse, fetchUrl } from '../test-utils/fetchMock'

function modelsResponse() {
  return {
    data: [],
    total: 0,
    context: 8192,
    target: { label: 'RTX 4090', vramGb: 24, availableGb: 23.5, estimateSpeed: true },
  }
}

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = installFetchMock()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useModels', () => {
  it('初始请求默认 URL（无 query），成功后 data/loading/error 正确', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, modelsResponse()))
    const { result } = renderHook(() => useModels(DEFAULT_FILTERS))

    expect(fetchUrl(mockFetch)).toBe('/api/models')
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data).not.toBeNull()
    expect(result.current.stale).toBe(false)
  })

  it('q 变化防抖 400ms：期间 stale=true，之后重新请求且 URL 带 q', async () => {
    vi.useFakeTimers()
    try {
      mockFetch.mockResolvedValue(jsonResponse(200, modelsResponse()))
      const { result, rerender } = renderHook(({ f }) => useModels(f), {
        initialProps: { f: DEFAULT_FILTERS },
      })
      await act(async () => {}) // flush 初始请求
      expect(mockFetch).toHaveBeenCalledTimes(1)

      rerender({ f: { ...DEFAULT_FILTERS, q: 'qwen' } })
      // 防抖窗口内：无新请求、数据仍未反映输入
      expect(result.current.stale).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      await act(async () => vi.advanceTimersByTime(300))
      expect(mockFetch).toHaveBeenCalledTimes(1)

      await act(async () => vi.advanceTimersByTime(100))
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(fetchUrl(mockFetch, 1)).toContain('q=qwen')
      // 防抖完成，输入与请求一致
      expect(result.current.stale).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('type 变化立即重新请求（无防抖）', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, modelsResponse()))
    const { rerender } = renderHook(({ f }) => useModels(f), {
      initialProps: { f: DEFAULT_FILTERS },
    })
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    rerender({ f: { ...DEFAULT_FILTERS, type: 'image' } })

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(fetchUrl(mockFetch, 1)).toContain('type=image')
  })

  it('错误响应: error 暴露中文 message', async () => {
    mockFetch.mockResolvedValue(jsonResponse(500, { error: '后端繁忙' }))
    const { result } = renderHook(() => useModels(DEFAULT_FILTERS))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('后端繁忙')
  })
})
