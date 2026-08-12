/**
 * Hugging Face 客户端。
 * - 列表：/api/models?author={org}&sort=downloads&direction=-1&limit=N（无参数字段）
 * - 结构参数 + 参数量：逐模型取 config.json 估算（estimate.ts）
 * - config 404（无标准 config）/ 401（gated）→ 跳过，不重试
 */
import { extractStructure, type ExtractedStructure } from '../estimate.js'
import { buildHfCandidate } from '../normalize.js'
import type { HfConfig, HfModelSummary, SyncSourceResult } from '../types.js'
import { fetchJson } from './http.js'
import type { ClientOpts } from './modelscope.js'

const HF_LIST_URL = (author: string, limit: number) =>
  `https://huggingface.co/api/models?author=${encodeURIComponent(author)}&sort=downloads&direction=-1&limit=${limit}`
const HF_CONFIG_URL = (id: string) => `https://huggingface.co/${id}/raw/main/config.json`

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

function countSkipped(skipped: SyncSourceResult['skipped'], reason: string): void {
  const hit = skipped.find((s) => s.reason === reason)
  if (hit) hit.count += 1
  else skipped.push({ reason, count: 1 })
}

/** 拉取某白名单组织的模型候选（下载量排序取头部 → 逐模型 config 估算） */
export async function fetchHfOrg(
  orgName: string,
  hfAuthor: string,
  opts: ClientOpts = {},
): Promise<SyncSourceResult> {
  const { maxModelsPerOrg = 20, signal } = opts
  const skipped: SyncSourceResult['skipped'] = []
  const errors: string[] = []

  // 1. 列表：按下载量取头部（×3 缓冲，过滤非目标类型后仍够数）
  const res = await fetchJson<HfModelSummary[]>(HF_LIST_URL(hfAuthor, maxModelsPerOrg * 3), {
    delayMs: 200,
  })
  if (!res.ok) {
    return { models: [], skipped, errors: [`列表获取失败: ${res.error}`] }
  }

  // 2. 过滤目标类型（提前过滤，避免为无关模型发 config 请求）
  const candidates = res.data.filter((m) => {
    if (m.private) return false
    const t = (m.pipeline_tag ?? '').toLowerCase()
    return ['text-generation', 'image-text-to-text', 'text-to-image'].includes(t)
  })

  // 3. 逐模型取 config（估算参数量/结构）→ 组装候选
  const models = []
  for (const m of candidates.slice(0, maxModelsPerOrg)) {
    if (signal?.aborted) break
    let structure = EMPTY_STRUCTURE
    const cfgRes = await fetchJson<HfConfig>(HF_CONFIG_URL(m.id), { delayMs: 200 })
    if (cfgRes.ok) {
      structure = extractStructure(cfgRes.data)
    } else if (cfgRes.status !== 404) {
      // gated / 限流：跳过该模型
      countSkipped(skipped, `config 不可用（${cfgRes.error}）`)
      continue
    } else {
      countSkipped(skipped, '无标准 config.json')
      continue
    }

    const cand = buildHfCandidate(m, structure, orgName)
    if (cand) models.push(cand)
    else countSkipped(skipped, '无参数量（config 估算失败）')
  }

  return { models, skipped, errors }
}
