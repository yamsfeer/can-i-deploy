/**
 * 4 档分级定义 hook（分档说明页 / 首页图例数据源）。
 * 一次性加载；色值、阈值与公式常量均来自后端（/api/tiers）。
 */
import { api, type TiersResponse } from '../api/client'
import { useAsync, type AsyncState } from './useAsync'

export interface UseTiersResult extends AsyncState<TiersResponse> {}

export function useTiers(): UseTiersResult {
  return useAsync((signal) => api.tiers({ signal }), [])
}
