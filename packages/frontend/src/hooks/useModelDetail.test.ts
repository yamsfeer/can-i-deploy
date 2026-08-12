/**
 * useModelDetail 测试：详情请求 URL 与 context 防抖（300ms 实时重算）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useModelDetail } from './useModelDetail'
import { DEFAULT_FILTERS } from '../api/filters'
import { installFetchMock, jsonResponse, fetchUrl } from '../test-utils/fetchMock'

function detailResponse() {
  return { data: { id: 1, quantizations: [] }, context: 8192, target: {} }
}

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = installFetchMock()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useModelDetail', () => {
  it('请求 /api/models/1', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, detailResponse()))
    const { result } = renderHook(() => useModelDetail(1, DEFAULT_FILTERS))

    expect(fetchUrl(mockFetch)).toBe('/api/models/1')
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.data.id).toBe(1)
  })

  it('context 变化防抖 300ms 后重新请求并带 context 参数', async () => {
    vi.useFakeTimers()
    try {
      mockFetch.mockResolvedValue(jsonResponse(200, detailResponse()))
      const { rerender } = renderHook(({ f }) => useModelDetail(1, f), {
        initialProps: { f: DEFAULT_FILTERS },
      })
      await act(async () => {}) // flush 初始请求
      expect(mockFetch).toHaveBeenCalledTimes(1)

      rerender({ f: { ...DEFAULT_FILTERS, context: 4096 } })
      await act(async () => vi.advanceTimersByTime(200))
      expect(mockFetch).toHaveBeenCalledTimes(1)

      await act(async () => vi.advanceTimersByTime(100))
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(fetchUrl(mockFetch, 1)).toContain('context=4096')
    } finally {
      vi.useRealTimers()
    }
  })

  it('错误: 404 暴露 message', async () => {
    mockFetch.mockResolvedValue(jsonResponse(404, { error: '模型不存在' }))
    const { result } = renderHook(() => useModelDetail(999, DEFAULT_FILTERS))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('模型不存在')
  })
})
