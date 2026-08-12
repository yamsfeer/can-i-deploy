/**
 * 后端 API client —— 前端数据层唯一的 HTTP 入口。
 *
 * 分级计算全部在后端完成，前端只消费结果（契约见 docs/API.md）。
 * 本模块与 UI 完全解耦：页面设计完成后直接调用 api.* 或数据层 hooks 即可。
 */
import type { GpuSpec, ModelDetail, ModelSummary, Organization, TierDef } from '@can-i-deploy/shared'

const BASE = import.meta.env.VITE_API_BASE ?? ''

/** 请求可选的取消信号（数据层 hooks 用 AbortController 防止过期响应覆盖新状态） */
export interface RequestOptions {
  signal?: AbortSignal
}

/** API 错误：带 HTTP 状态码，便于 UI 区分 404 / 5xx / 网络错误 */
export class ApiError extends Error {
  /** HTTP 状态码；网络层失败时为 undefined */
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 后端目标硬件上下文（实际返回，比文档 §2.1 多 availableGb 与可选 gpu） */
export interface TargetGpu {
  /** 目标硬件展示名，如 "RTX 4090" / "24GB" */
  label: string
  /** 可用显存（GB） */
  vramGb: number
  /** 减去系统预留后的实际可用显存（GB） */
  availableGb: number
  /** false = 自定义显存模式，速度无法预估 */
  estimateSpeed: boolean
  /** 硬件库 GPU；自定义显存模式时为 undefined */
  gpu?: GpuSpec
}

/** GET /api/models 响应 */
export interface ModelListResponse {
  data: ModelSummary[]
  /** 返回条数（受 limit 截断，非全量总数） */
  total: number
  /** 实际生效的上下文长度 */
  context: number
  target: TargetGpu
}

/** GET /api/models/:id 响应 */
export interface ModelDetailResponse {
  data: ModelDetail
  context: number
  target: TargetGpu
}

/** GET /api/tiers 响应 */
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

/** GET /api/organizations 响应 */
export interface OrganizationsResponse {
  data: Organization[]
}

/** 同步日志行（sync_logs 表） */
export interface SyncLog {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  message: string | null
}

/** POST /api/sync 响应（M2 占位） */
export interface SyncTriggerResponse {
  ok: boolean
  message: string
}

/** GET /api/sync/logs 响应 */
export interface SyncLogsResponse {
  data: SyncLog[]
}

/**
 * 底层请求：统一错误处理（非 2xx 解析 { error }、网络失败、JSON 解析失败）。
 * 返回已解析的响应体。
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      ...init,
    })
  } catch (err) {
    // fetch 网络层失败（断网 / 代理未起 / CORS）
    const detail = err instanceof Error ? err.message : String(err)
    throw new ApiError(`网络请求失败：${detail}`)
  }

  const text = await res.text().catch(() => '')
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new ApiError(`响应不是合法 JSON（HTTP ${res.status}）`, res.status)
    }
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`
    throw new ApiError(message, res.status)
  }
  return body as T
}

const get = <T>(path: string, options?: RequestOptions) =>
  request<T>(path, { method: 'GET', signal: options?.signal })

const post = <T>(path: string, options?: RequestOptions) =>
  request<T>(path, { method: 'POST', signal: options?.signal })

/** 从 URLSearchParams 生成 query 字符串（空参数不追加） */
export function queryString(params: URLSearchParams): string {
  const s = params.toString()
  return s ? `?${s}` : ''
}

/** 全部接口封装。UI 层直接消费；数据层 hooks 在此基础上加状态管理。 */
export const api = {
  /** GET /api/hardware — GPU 规格列表（含云实例映射） */
  hardware: (options?: RequestOptions) => get<{ data: GpuSpec[] }>('/api/hardware', options),

  /** GET /api/models — 模型列表 + 每模型分级 badge */
  models: (params: URLSearchParams, options?: RequestOptions) =>
    get<ModelListResponse>(`/api/models${queryString(params)}`, options),

  /** GET /api/models/:id — 模型详情：量化表 + 换卡建议 */
  modelDetail: (id: string | number, params: URLSearchParams, options?: RequestOptions) =>
    get<ModelDetailResponse>(`/api/models/${id}${queryString(params)}`, options),

  /** GET /api/tiers — 4 档定义 + 公式常量 */
  tiers: (options?: RequestOptions) => get<TiersResponse>('/api/tiers', options),

  /** GET /api/organizations — 白名单组织列表 */
  organizations: (options?: RequestOptions) => get<OrganizationsResponse>('/api/organizations', options),

  /** POST /api/sync — 手动触发数据拉取（M2 占位） */
  triggerSync: (options?: RequestOptions) => post<SyncTriggerResponse>('/api/sync', options),

  /** GET /api/sync/logs — 同步日志 */
  syncLogs: (options?: RequestOptions) => get<SyncLogsResponse>('/api/sync/logs', options),
}
