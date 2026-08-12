/**
 * 测试辅助：mock 全局 fetch。
 * 后端 API 在此层被模拟——client.ts 真实执行、只替换网络出口，
 * 从而完整验证「hook → api → 请求参数 → 响应解析」的整体流程。
 */
import { vi } from 'vitest'

/** 最小可用 fetch Response（client 只依赖 ok / status / text） */
export interface MockResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

/** 构造一个返回 JSON 的 mock 响应 */
export function jsonResponse(status: number, body: unknown): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }
}

export type FetchMock = ReturnType<typeof vi.fn>

/** 安装全局 fetch mock，返回 mock 函数供断言 */
export function installFetchMock(): FetchMock {
  const fn = vi.fn()
  vi.stubGlobal('fetch', fn)
  return fn
}

/** 读取第 call 次 fetch 调用的 URL（未调用返回 'undefined'，断言前先确认调用次数） */
export function fetchUrl(fn: FetchMock, call = 0): string {
  return String(fn.mock.calls[call]?.[0])
}
