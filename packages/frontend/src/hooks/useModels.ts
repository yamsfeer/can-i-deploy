/**
 * 模型列表数据 hook（首页）。
 * 对筛选状态中的 q 做 400ms 防抖（API.md §6.1 建议），其余字段立即生效。
 * stale = 当前输入与最近一次实际请求不一致（搜索输入中/防抖等待期），UI 可据此显示"搜索中"。
 */
import { api, type ModelListResponse } from '../api/client'
import { filtersKey, toSearchParams, type ModelFilters } from '../api/filters'
import { useAsync, type AsyncState } from './useAsync'
import { useDebouncedValue } from './useDebouncedValue'

/** q 防抖时长（ms） */
const Q_DEBOUNCE_MS = 400

export interface UseModelsResult extends AsyncState<ModelListResponse> {
  /** 当前输入是否尚未反映到数据（搜索防抖等待 / 请求在途） */
  stale: boolean
}

export function useModels(filters: ModelFilters): UseModelsResult {
  const currentKey = filtersKey(filters)
  const debouncedQ = useDebouncedValue(filters.q, Q_DEBOUNCE_MS)

  // 实际请求用防抖后的 q；key 稳定时才触发重新请求（避免对象身份变化造成重复请求）
  const requestedFilters: ModelFilters = { ...filters, q: debouncedQ }
  const requestedKey = filtersKey(requestedFilters)

  const asyncState = useAsync(
    (signal) => api.models(toSearchParams(requestedFilters), { signal }),
    [requestedKey],
  )

  return { ...asyncState, stale: currentKey !== requestedKey }
}
