/**
 * GET /api/models  — 模型列表 + 每模型分级 badge（后端算好，前端零逻辑）
 * GET /api/models/:id — 详情：量化档位表 + 换卡建议
 */
import type { FastifyInstance } from 'fastify'
import { ENGINE_CONSTANTS, getQuantLevels, LIST_BADGE_QUANT } from '@can-i-deploy/shared'
import type { GpuSpec, ModelType, QuantRow } from '@can-i-deploy/shared'
import { getDb } from '../db/index.js'
import { buildQuantRow, computeTierResult, suggestGpu } from '../services/engine.js'
import type { GpuLike, ModelRow, QuantRowDb, TierOpts } from '../services/engine.js'

const VALID_TYPES: ModelType[] = ['llm', 'vlm', 'image']

interface GpuCtx {
  /** 目标显存：GPU 或自定义 VRAM */
  vramGb: number
  availableGb: number
  gpu?: GpuSpec
  /** 自定义 VRAM 模式无法估算速度 */
  estimateSpeed: boolean
  label: string
}

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return max ? Math.min(n, max) : n
}

/** 解析 gpu_id / custom_vram 参数 → 目标显存上下文 */
function resolveGpuCtx(gpuIdRaw: unknown, customVramRaw: unknown): GpuCtx {
  const db = getDb()
  const gpuId = Number(gpuIdRaw)
  if (Number.isFinite(gpuId) && gpuId > 0) {
    const gpu = db.prepare('SELECT * FROM gpus WHERE id = ?').get(gpuId) as unknown as GpuSpec | undefined
    if (gpu) {
      return {
        vramGb: gpu.vram_gb,
        availableGb: gpu.vram_gb - ENGINE_CONSTANTS.systemReserveGb,
        gpu,
        estimateSpeed: true,
        label: gpu.name,
      }
    }
  }
  const custom = parsePositiveInt(customVramRaw, 0)
  if (custom > 0) {
    return {
      vramGb: custom,
      availableGb: custom - ENGINE_CONSTANTS.systemReserveGb,
      estimateSpeed: false,
      label: `${custom}GB`,
    }
  }
  // 兜底：默认第一张 GPU（seed 首行为 RTX 4090）
  const gpu = db.prepare('SELECT * FROM gpus ORDER BY id LIMIT 1').get() as unknown as GpuSpec
  return {
    vramGb: gpu.vram_gb,
    availableGb: gpu.vram_gb - ENGINE_CONSTANTS.systemReserveGb,
    gpu,
    estimateSpeed: true,
    label: gpu.name,
  }
}

/** 自定义 VRAM 模式构造无速度信息的 GpuLike */
function gpuLikeOf(ctx: GpuCtx): GpuLike {
  return (
    ctx.gpu ?? {
      vram_gb: ctx.vramGb,
      memory_bandwidth_gbps: 0,
      fp16_tflops: 0,
    }
  )
}

function tierOptsOf(ctx: GpuCtx): TierOpts {
  return { estimateSpeed: ctx.estimateSpeed }
}

/** 模型列表页 badge：默认 Q4_K_M（图像 fp8），该档无官方量化则降级到最轻可用档 */
function buildBadge(model: ModelRow, quants: QuantRowDb[], ctx: GpuCtx, context: number): { badge: QuantRow | null; badgeQuant: QuantRow['quantName'] | null } {
  const badgeName = LIST_BADGE_QUANT[model.model_type]
  let chosen = quants.find((q) => q.quant_name === badgeName && q.official === 1)
  if (!chosen) {
    chosen = quants.filter((q) => q.official === 1).sort((a, b) => a.bits_per_param - b.bits_per_param)[0] ?? null
  }
  if (!chosen) return { badge: null, badgeQuant: null }
  return { badge: buildQuantRow(model, gpuLikeOf(ctx), context, chosen, tierOptsOf(ctx)), badgeQuant: chosen.quant_name as QuantRow['quantName'] }
}

/** 详情页：按档位表展开所有量化档（无官方数据的档位留空） */
function buildQuantTable(model: ModelRow, quantMap: Map<string, QuantRowDb>, ctx: GpuCtx, context: number): QuantRow[] {
  const levels = getQuantLevels(model.model_type)
  return levels.map((level) => {
    const dbRow = quantMap.get(level.name)
    if (!dbRow) {
      return {
        quantName: level.name as QuantRow['quantName'],
        format: level.format,
        available: false,
        tier: 'no' as const,
        weightGb: null as unknown as number,
        kvGb: null as unknown as number,
        overheadGb: null as unknown as number,
        vramGb: null as unknown as number,
        tokPerSec: null,
        secondsPerImage: null,
        noteKey: null,
        url: null,
        downloads: null,
      }
    }
    return buildQuantRow(model, gpuLikeOf(ctx), context, dbRow, tierOptsOf(ctx))
  })
}

export function modelsRoutes(app: FastifyInstance) {
  app.get('/api/models', async (req) => {
    const qp = req.query as {
      type?: string
      gpu_id?: string
      custom_vram?: string
      context?: string
      q?: string
      sort?: string
      limit?: string
    }
    const db = getDb()
    const type: ModelType = VALID_TYPES.includes(qp.type as ModelType) ? (qp.type as ModelType) : 'llm'
    const ctx = resolveGpuCtx(qp.gpu_id, qp.custom_vram)
    const context = parsePositiveInt(qp.context, ENGINE_CONSTANTS.defaultContextLength)
    const q = (qp.q ?? '').trim()
    const sortMap: Record<string, string> = { downloads: 'downloads DESC', params: 'params DESC', name: 'name ASC' }
    const orderBy = sortMap[qp.sort ?? ''] ?? 'downloads DESC'
    const limit = parsePositiveInt(qp.limit, 200, 500)

    const like = `%${q}%`
    const models = db
      .prepare(
        `SELECT * FROM models
         WHERE model_type = ?
           AND (? = '' OR name LIKE ? OR source_id LIKE ? OR org LIKE ?)
         ORDER BY ${orderBy} LIMIT ?`,
      )
      .all(type, q, like, like, like, limit) as unknown as ModelRow[]

    // 一次取出这些模型的所有量化，按 model_id 聚合
    type QuantRowWithModel = QuantRowDb & { model_id: number }
    const quantRows = db
      .prepare(`SELECT q.* FROM quantizations q WHERE q.model_id IN (${models.map(() => '?').join(',') || '0'})`)
      .all(...models.map((m) => m.id)) as unknown as QuantRowWithModel[]
    const quantByModel = new Map<number, QuantRowDb[]>()
    for (const qr of quantRows) {
      const arr = quantByModel.get(qr.model_id) ?? []
      arr.push(qr)
      quantByModel.set(qr.model_id, arr)
    }

    const data = models.map((m) => {
      const { badge, badgeQuant } = buildBadge(m, quantByModel.get(m.id) ?? [], ctx, context)
      return {
        id: m.id,
        source: m.source,
        source_id: m.source_id,
        org: m.org,
        name: m.name,
        model_type: m.model_type,
        params: m.params,
        context_length: m.context_length,
        downloads: m.downloads,
        likes: m.likes,
        license: m.license,
        url: m.url,
        badge,
        badgeQuant,
      }
    })

    return { data, total: data.length, context, target: ctx }
  })

  app.get('/api/models/:id', async (req, reply) => {
    const qp = req.query as { gpu_id?: string; custom_vram?: string; context?: string }
    const db = getDb()
    const id = Number((req.params as { id: string }).id)
    const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as ModelRow | undefined
    if (!model) {
      return reply.code(404).send({ error: '模型不存在' })
    }

    const ctx = resolveGpuCtx(qp.gpu_id, qp.custom_vram)
    const maxCtx = model.context_length ?? 131072
    const context = parsePositiveInt(qp.context, ENGINE_CONSTANTS.defaultContextLength, maxCtx)

    const quants = db.prepare('SELECT * FROM quantizations WHERE model_id = ?').all(model.id) as unknown as QuantRowDb[]
    const quantMap = new Map<string, QuantRowDb>(quants.map((r) => [r.quant_name, r]))

    const quantizations = buildQuantTable(model, quantMap, ctx, context)

    // 最小显存需求 = 最轻可用官方档的 vram；无官方量化则用 fp16 理论值
    const availableQuants = quants.filter((r) => r.official === 1)
    const lightest =
      availableQuants.length > 0
        ? availableQuants.sort((a, b) => a.bits_per_param - b.bits_per_param)[0]
        : { bits_per_param: 2.0 }
    const minResult = computeTierResult(model, gpuLikeOf(ctx), context, lightest.bits_per_param, tierOptsOf(ctx))
    const minVramGb = minResult.vramGb

    // 换卡建议：放不下 → 找显存刚够的最小卡（都不够则给最大卡并标注 fits=false）
    const allGpus = db.prepare('SELECT * FROM gpus ORDER BY vram_gb, id').all() as unknown as GpuSpec[]
    const suggestion =
      minVramGb > ctx.availableGb ? suggestGpu(allGpus, minVramGb, ctx.gpu?.id) : null

    const detail = {
      id: model.id,
      source: model.source,
      source_id: model.source_id,
      org: model.org,
      name: model.name,
      model_type: model.model_type,
      params: model.params,
      context_length: model.context_length,
      downloads: model.downloads,
      likes: model.likes,
      license: model.license,
      url: model.url,
      architecture: model.architecture,
      kv_cache_type: model.kv_cache_type,
      quantizations,
      minVramGb,
      suggestedGpu: suggestion?.gpu ?? null,
      suggestedFits: suggestion?.fits ?? null,
    }
    return { data: detail, context, target: ctx }
  })
}
