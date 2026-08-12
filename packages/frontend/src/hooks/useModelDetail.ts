/**
 * 模型详情数据 hook（详情页）。
 * 上下文滑块实时重算：对 context 做 300ms 防抖（API.md §6.1 / §6.3 建议），
 * 后端据此重新计算 KV cache / VRAM / 分级。
 * stale = 滑块仍在防抖/请求中，数据尚未反映最新 context。
 */
import { api, type ModelDetailResponse } from '../api/client'
import { filtersKey, toSearchParams, type ModelFilters } from '../api/filters'
import { useAsync, type AsyncState } from './useAsync'
import { useDebouncedValue } from './useDebouncedValue'

/** context 防抖时长（ms） */
const CONTEXT_DEBOUNCE_MS = 300

export interface UseModelDetailResult extends AsyncState<ModelDetailResponse> {
  /** 当前 context 输入是否尚未反映到数据（防抖/请求在途） */
  stale: boolean
}

export function useModelDetail(id: string | number, filters: ModelFilters): UseModelDetailResult {
  const currentKey = `${id}:${filtersKey(filters)}`
  const debouncedContext = useDebouncedValue(filters.context, CONTEXT_DEBOUNCE_MS)

  const requestedFilters: ModelFilters = { ...filters, context: debouncedContext }
  const requestedKey = `${id}:${filtersKey(requestedFilters)}`

  const asyncState = useAsync(
    (signal) => api.modelDetail(id, toSearchParams(requestedFilters), { signal }),
    [requestedKey],
  )

  return { ...asyncState, stale: currentKey !== requestedKey }
}
