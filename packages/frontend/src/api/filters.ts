/**
 * URL query 参数模型（API.md §6.4）——首页与详情页共用的筛选状态。
 *
 * 约定：筛选状态全部承载在 URL query（type / gpu_id / custom_vram / context / q / sort / limit），
 * 刷新 / 分享链接保留硬件与上下文选择，首页 ↔ 详情页联动无需全局状态库。
 * UI 层通过 useSearchParams 读写，本模块提供结构化类型与双向转换（含容错与互斥规则）。
 */
import type { ModelType } from '@can-i-deploy/shared'
import { ENGINE_CONSTANTS } from '@can-i-deploy/shared'

export type ModelSort = 'downloads' | 'params' | 'name'

/** 完整的筛选/查询状态 */
export interface ModelFilters {
  /** 模型类型 tab（后端默认 llm） */
  type: ModelType
  /** 硬件库 GPU id；与 custom_vram 互斥，优先 */
  gpu_id: number | null
  /** 自定义显存（GB）；仅当 gpu_id 为空时生效 */
  custom_vram: number | null
  /** 上下文长度（KV cache 计算用；详情页滑块调整） */
  context: number
  /** 模糊搜索模型名 / source_id / org */
  q: string
  /** 排序（除 name 外均降序） */
  sort: ModelSort
  /** 返回条数上限（后端 clamp 到 500） */
  limit: number
}

const DEFAULT_CONTEXT = ENGINE_CONSTANTS.defaultContextLength

export const DEFAULT_FILTERS: ModelFilters = {
  type: 'llm',
  gpu_id: null,
  custom_vram: null,
  context: DEFAULT_CONTEXT,
  q: '',
  sort: 'downloads',
  limit: 200,
}

const MODEL_TYPES: readonly ModelType[] = ['llm', 'vlm', 'image']
const SORTS: readonly ModelSort[] = ['downloads', 'params', 'name']

/** 解析正整数，非法（空/非数/超范围）返回 null */
function parseIntStrict(raw: string | null, min: number, max: number | null): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min) return null
  if (max != null && n > max) return null
  return Math.floor(n)
}

/** 解析正数（显存 GB 允许小数），非法返回 null */
function parseFloatStrict(raw: string | null, min: number): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min) return null
  return n
}

/**
 * 从 URLSearchParams 解析出结构化筛选状态。
 * 容错：非法值回落默认；gpu_id 与 custom_vram 互斥（gpu_id 优先）。
 */
export function parseFilters(search: URLSearchParams): ModelFilters {
  const f: ModelFilters = { ...DEFAULT_FILTERS }

  const type = search.get('type')
  if (type && (MODEL_TYPES as readonly string[]).includes(type)) f.type = type as ModelType

  const gpuId = parseIntStrict(search.get('gpu_id'), 1, null)
  const customVram = parseFloatStrict(search.get('custom_vram'), 1)
  if (gpuId != null) {
    f.gpu_id = gpuId
  } else if (customVram != null) {
    f.custom_vram = customVram
  }

  const context = parseIntStrict(search.get('context'), 1, null)
  if (context != null) f.context = context

  const q = search.get('q')
  if (q) f.q = q.trim()

  const sort = search.get('sort')
  if (sort && (SORTS as readonly string[]).includes(sort)) f.sort = sort as ModelSort

  const limit = parseIntStrict(search.get('limit'), 1, 500)
  if (limit != null) f.limit = limit

  return f
}

/**
 * 结构化状态 → URLSearchParams。
 * 约定：与默认值相同的不写入（保持 URL 简洁）；gpu_id 存在时忽略 custom_vram。
 */
export function toSearchParams(filters: ModelFilters): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.type !== DEFAULT_FILTERS.type) params.set('type', filters.type)
  if (filters.gpu_id != null) {
    params.set('gpu_id', String(filters.gpu_id))
  } else if (filters.custom_vram != null) {
    params.set('custom_vram', String(filters.custom_vram))
  }
  if (filters.context !== DEFAULT_CONTEXT) params.set('context', String(filters.context))
  if (filters.q) params.set('q', filters.q)
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort)
  if (filters.limit !== DEFAULT_FILTERS.limit) params.set('limit', String(filters.limit))

  return params
}

/** 稳定序列化 key：两个语义等价的状态得到相同 key（用于 hooks 依赖比较） */
export function filtersKey(filters: ModelFilters): string {
  return toSearchParams(filters).toString()
}
