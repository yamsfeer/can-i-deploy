/**
 * 后端 API client。分级计算全部在后端完成，前端只消费结果。
 */
import type { GpuSpec, ModelDetail, ModelSummary, Organization, TierDef } from '@can-i-deploy/shared'

const BASE = import.meta.env.VITE_API_BASE ?? ''

export interface ModelListResponse {
  data: ModelSummary[]
  total: number
  context: number
  target: { label: string; vramGb: number; estimateSpeed: boolean }
}

export interface ModelDetailResponse {
  data: ModelDetail
  context: number
  target: { label: string; vramGb: number; estimateSpeed: boolean }
}

export interface TiersResponse {
  data: TierDef[]
  constants: {
    llmThresholds: { smoothMin: number; okMin: number; tightMin: number }
    imageThresholds: { smoothMax: number; okMax: number; tightMax: number }
    baseResolution: string
    defaultContext: number
    bandwidthUtilization: number
    systemReserveGb: number
    minFreeMarginGb: number
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  hardware: () => get<{ data: GpuSpec[] }>('/api/hardware'),
  models: (params: URLSearchParams) => get<ModelListResponse>(`/api/models?${params}`),
  modelDetail: (id: string | number, params: URLSearchParams) =>
    get<ModelDetailResponse>(`/api/models/${id}?${params}`),
  tiers: () => get<TiersResponse>('/api/tiers'),
  organizations: () => get<{ data: Organization[] }>('/api/organizations'),
}
