/**
 * 通用异步数据 hook：封装 loading / error / data 三态 + 过期请求自动取消。
 * 所有业务数据 hook 均建立在此基础上，UI 层只消费返回的 { data, loading, error, refresh }。
 */
import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  /** 错误可读文案（网络失败 / 后端 error 字段 / HTTP 状态码） */
  error: string | null
  /** 原始错误对象（如 ApiError，UI 需要 status 等细节时用） */
  errorRaw: unknown
  /** 强制重新请求（不依赖 deps 变化） */
  refresh: () => void
}

/**
 * @param fetcher  返回 Promise 的数据获取函数；收到 AbortSignal，被新的请求取代时自动取消
 * @param deps     任一依赖变化即重新请求（应传稳定 key，如序列化字符串）
 */
export function useAsync<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorRaw, setErrorRaw] = useState<unknown>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    setLoading(true)
    setError(null)
    setErrorRaw(null)

    fetcher(controller.signal)
      .then((result) => {
        if (!active) return
        setData(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        // 主动 abort（被新请求取代 / 组件卸载）不视为错误
        if (!active) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setErrorRaw(err)
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, errorRaw, refresh }
}
