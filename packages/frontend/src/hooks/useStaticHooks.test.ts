/**
 * 一次性数据 hooks 测试：useHardware / useTiers / useOrganizations。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHardware } from './useHardware'
import { useTiers } from './useTiers'
import { useOrganizations } from './useOrganizations'
import { installFetchMock, jsonResponse, fetchUrl } from '../test-utils/fetchMock'

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = installFetchMock()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useHardware', () => {
  it('请求 /api/hardware 并返回 data', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: 1, name: 'RTX 4060', category: 'consumer', vram_gb: 8 }],
      }),
    )
    const { result } = renderHook(() => useHardware())

    expect(fetchUrl(mockFetch)).toBe('/api/hardware')
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.data[0].name).toBe('RTX 4060')
  })
})

describe('useTiers', () => {
  it('请求 /api/tiers 并返回 4 档定义', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(200, { data: [{ key: 'smooth' }], constants: { defaultContext: 8192 } }),
    )
    const { result } = renderHook(() => useTiers())

    expect(fetchUrl(mockFetch)).toBe('/api/tiers')
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.data[0].key).toBe('smooth')
  })
})

describe('useOrganizations', () => {
  it('请求 /api/organizations 并返回 data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, { data: [{ name: 'Qwen' }] }))
    const { result } = renderHook(() => useOrganizations())

    expect(fetchUrl(mockFetch)).toBe('/api/organizations')
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.data[0].name).toBe('Qwen')
  })
})
