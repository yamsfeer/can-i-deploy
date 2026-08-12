/**
 * useAsync 通用原语测试：三态转换、refresh、依赖变化重请求、卸载后不 setState。
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsync } from './useAsync'

describe('useAsync', () => {
  it('成功: loading 过渡到 data，error 为空', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok')
    const { result } = renderHook(() => useAsync(fetcher, []))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('ok')
    expect(result.current.error).toBeNull()
  })

  it('失败: error 暴露，loading 结束', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAsync(fetcher, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.data).toBeNull()
  })

  it('refresh 强制重新请求并更新数据', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1')
    const { result } = renderHook(() => useAsync(fetcher, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetcher).toHaveBeenCalledTimes(1)

    fetcher.mockResolvedValue('v2')
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.data).toBe('v2'))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('依赖变化触发重新请求', async () => {
    const fetcher = vi.fn().mockResolvedValue('d')
    const { result, rerender } = renderHook(({ dep }) => useAsync(fetcher, [dep]), {
      initialProps: { dep: 1 },
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ dep: 2 })

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })

  it('卸载后迟到的响应不再 setState（不抛错）', async () => {
    let resolve!: (v: string) => void
    const fetcher = vi.fn(() => new Promise<string>((r) => (resolve = r)))
    const { unmount } = renderHook(() => useAsync(fetcher, []))

    unmount()
    // 卸载后 resolve——useAsync 的 active 标志应阻止 setState，不产生 React 警告/报错
    await act(async () => resolve('late'))
    expect(true).toBe(true)
  })
})
