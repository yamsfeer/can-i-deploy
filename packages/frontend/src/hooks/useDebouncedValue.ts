/**
 * 通用防抖 hook：value 停止变化 delayMs 后更新为最新值。
 * 用于搜索输入（API.md 建议 400ms）与上下文滑块（建议 300ms）。
 */
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
