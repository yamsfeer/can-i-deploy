/**
 * ModelScope 客户端（openapi/v1/models + 仓库 config.json）。
 * - 列表接口实测支持 `owner={org}` 过滤；`org`/`organization` 参数无效
 * - 分页限制：page_number × page_size ≤ 3000
 * - params 字段直接给参数量（整数个参）；结构参数（KV cache）从 config.json 获取
 */
import { extractStructure, type ExtractedStructure } from '../estimate.js'
import { buildModelScopeCandidate } from '../normalize.js'
import type { HfConfig, ModelScopeModel, ModelScopeResponse, SyncSourceResult } from '../types.js'
import { fetchJson } from './http.js'

const MS_LIST_URL = 'https://modelscope.cn/openapi/v1/models'
const MS_CONFIG_URL = (id: string) =>
  `https://modelscope.cn/api/v1/models/${id}/repo?Revision=master&FilePath=config.json`

const EMPTY_STRUCTURE: ExtractedStructure = {
  paramsB: null,
  activeParamsB: null,
  contextLength: null,
  architecture: null,
  kvCacheType: null,
  numLayers: null,
  numHeads: null,
  headDim: null,
  kvHeads: null,
  visionOverheadBytes: null,
}

export interface ClientOpts {
  /** 每组织最多入库的模型数（按下载量取头部，控制 API 请求量） */
  maxModelsPerOrg?: number
  pageSize?: number
  signal?: AbortSignal
}

function countSkipped(skipped: SyncSourceResult['skipped'], reason: string): void {
  const hit = skipped.find((s) => s.reason === reason)
  if (hit) hit.count += 1
  else skipped.push({ reason, count: 1 })
}

/** 拉取某白名单组织的模型候选（列表分页 → 按下载量取头部 → 逐模型 config 结构估算） */
export async function fetchModelScopeOrg(
  orgName: string,
  orgId: string,
  opts: ClientOpts = {},
): Promise<SyncSourceResult> {
  // page_size 实测上限 50（100 会 400），分页上限 page_number×page_size ≤ 3000
  const { maxModelsPerOrg = 20, pageSize = 50, signal } = opts
  const skipped: SyncSourceResult['skipped'] = []
  const errors: string[] = []

  // 1. 分页拉全量（owner 过滤）
  const all: ModelScopeModel[] = []
  for (let page = 1; ; page++) {
    if (signal?.aborted) break
    const res = await fetchJson<ModelScopeResponse>(
      `${MS_LIST_URL}?page_number=${page}&page_size=${pageSize}&owner=${encodeURIComponent(orgId)}`,
      { delayMs: 120 },
    )
    if (!res.ok) {
      errors.push(`列表第 ${page} 页失败: ${res.error}`)
      break
    }
    const body = res.data // ModelScopeResponse：{ success, data: ModelScopePage }
    const pageModels = body.data?.models ?? []
    all.push(...pageModels)
    const total = body.data?.total_count ?? 0
    if (pageModels.length === 0 || all.length >= total) break
    if (page * pageSize >= 3000) {
      errors.push('达到分页上限 3000，已截断')
      break
    }
  }

  // 2. 过滤私密/gated，按下载量取头部
  const top = all
    .filter((m) => !m.private && !m.gated)
    .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
    .slice(0, maxModelsPerOrg)

  // 3. 逐模型取 config（结构参数）→ 组装候选
  const models = []
  for (const m of top) {
    if (signal?.aborted) break
    let structure = EMPTY_STRUCTURE
    const cfgRes = await fetchJson<HfConfig>(MS_CONFIG_URL(m.id), { delayMs: 120 })
    if (cfgRes.ok) {
      structure = extractStructure(cfgRes.data)
    } else if (cfgRes.status !== 404) {
      // gated/限流/网络失败：保留源 params（ModelScope 直给），结构缺失 KV 按 0 计
      errors.push(`config 获取失败 ${m.id}: ${cfgRes.error}`)
    }

    const cand = buildModelScopeCandidate(m, structure, orgName)
    if (cand) models.push(cand)
    else countSkipped(skipped, classifySkipReason(m))
  }

  return { models, skipped, errors }
}

function classifySkipReason(m: ModelScopeModel): string {
  if (!m.params || m.params <= 0) return 'params 缺失/为 0'
  if (!m.tasks || m.tasks.length === 0) return '无 tasks（无法判定类型）'
  return '非目标类型（llm/vlm/image）'
}
