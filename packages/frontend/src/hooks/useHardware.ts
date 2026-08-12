/**
 * 硬件列表 hook（硬件页 / 首页硬件选择器数据源）。
 * 一次性加载；可用 refresh() 重新拉取。
 */
import type { GpuSpec } from '@can-i-deploy/shared'
import { api } from '../api/client'
import { useAsync, type AsyncState } from './useAsync'

export interface UseHardwareResult extends AsyncState<{ data: GpuSpec[] }> {}

export function useHardware(): UseHardwareResult {
  return useAsync((signal) => api.hardware({ signal }), [])
}
