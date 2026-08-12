/**
 * 数据源 HTTP 工具：fetch JSON + 超时 + 重试（429/5xx 指数退避）。
 * 401/403（gated/无权限）与 404（不存在）不重试，由调用方决定跳过。
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici'

// Node 原生 fetch（undici）默认不读取 HTTP(S)_PROXY 环境变量，而 curl 会。
// 存在代理 env（本机开发常用）时启用代理，NO_PROXY 由 EnvHttpProxyAgent 自动遵守。
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent())
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface FetchJsonOpts {
  timeoutMs?: number
  /** 最大重试次数（不含首次请求） */
  retries?: number
  /** 每次成功请求后的固定间隔（限流抑制） */
  delayMs?: number
}

export type FetchJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; error: string }

export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOpts = {},
): Promise<FetchJsonResult<T>> {
  const { timeoutMs = 15000, retries = 2, delayMs = 150 } = opts

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'can-i-deploy/0.1' },
      })
      if (res.ok) {
        const data = (await res.json()) as T
        if (delayMs > 0) await sleep(delayMs)
        return { ok: true, data }
      }
      if (res.status === 429) {
        // 限流：指数退避后重试
        await sleep(1000 * 2 ** attempt)
        continue
      }
      if (res.status >= 500) {
        await sleep(500 * 2 ** attempt)
        continue
      }
      // 401/403/404 等不可重试
      return { ok: false, status: res.status, error: `http ${res.status}` }
    } catch {
      // 网络错误/超时：重试
      await sleep(500 * 2 ** attempt)
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, status: null, error: 'max retries' }
}
