/**
 * 预测引擎（纯解析公式，不采实测数据，PRD §7）。
 * 全部公式常量集中在 @can-i-deploy/shared 的 constants，便于调参。
 * 输出 4 档分级（smooth / ok / tight / no），只给"大概的估量值"。
 */
import {
  ENGINE_CONSTANTS,
  I18N_KEYS,
  inferImageSteps,
} from '@can-i-deploy/shared'
import type { GpuSpec, KvCacheType, ModelType, QuantRow, TierKey, TierResult } from '@can-i-deploy/shared'

/** models 表行 */
export interface ModelRow {
  id: number
  source: 'hf' | 'modelscope'
  source_id: string
  org: string
  name: string
  model_type: ModelType
  params: number | null
  active_params: number | null
  context_length: number | null
  architecture: string | null
  kv_cache_type: KvCacheType | null
  num_layers: number | null
  num_heads: number | null
  head_dim: number | null
  kv_heads: number | null
  vision_overhead_bytes: number | null
  activation_gb: number | null
  image_steps: number | null
  license: string | null
  downloads: number
  likes: number | null
  url: string
}

/** quantizations 表行 */
export interface QuantRowDb {
  format: 'safetensors' | 'gguf'
  quant_name: string
  bits_per_param: number
  weight_bytes: number | null
  official: number
  url: string | null
  downloads: number | null
}

/** 计算所需的最小 GPU 信息 */
export interface GpuLike {
  vram_gb: number
  memory_bandwidth_gbps: number
  fp16_tflops: number
}

/** 目标显存：硬件库 GPU 或自定义 VRAM */
export interface TargetVram {
  /** 可用显存（扣除系统预留后） */
  availableGb: number
  vramGb: number
}

const GIB = 1e9 // 统一用十进制 GB 展示

function toGb(bytes: number): number {
  return bytes / GIB
}

/**
 * 权重字节 = 参数量 × 每参数字节。
 * 注意：quantizations.bits_per_param 实为"每参数字节数"（PRD §7.1 命名）：fp16=2B、Q8=1B、Q4=0.5B。
 * 早期实现误当比特并除以 8，导致 VRAM 整体缩小 8 倍，已修正。
 */
export function computeWeightBytes(paramsB: number, bytesPerParam: number): number {
  return paramsB * 1e9 * bytesPerParam
}

/**
 * KV cache 字节（LLM/VLM）。
 * MHA：2 × layers × heads × head_dim × seq_len × 2 bytes
 * GQA：同上但用 kv_heads
 * MLA（DeepSeek 系）：按压缩系数近似（默认 1/8）
 */
export function computeKvBytes(model: ModelRow, seqLen: number): number {
  if (!model.num_layers || !model.head_dim) return 0 // 缺结构参数则按 0 计（不阻塞计算）
  const effectiveKvHeads =
    model.kv_cache_type === 'gqa' || model.kv_cache_type === 'mla'
      ? (model.kv_heads ?? model.num_heads ?? 0)
      : (model.num_heads ?? 0)
  const compress =
    model.kv_cache_type === 'mla' ? ENGINE_CONSTANTS.mlaCompressionFactor : 1
  const kvDimPerLayer = effectiveKvHeads * model.head_dim * compress
  const bytesPerToken =
    2 /* K+V */ * model.num_layers * kvDimPerLayer * ENGINE_CONSTANTS.kvBytesPerElement
  return bytesPerToken * seqLen
}

/** LLM/VLM：decode 单流 tok/s ≈ min(带宽约束, 算力约束)（PRD §7.2） */
export function computeLlmToksPerSec(
  activeParamsB: number,
  weightBytes: number,
  gpu: GpuLike,
): number {
  const bandwidthToks =
    (gpu.memory_bandwidth_gbps * GIB * ENGINE_CONSTANTS.bandwidthUtilization) / weightBytes
  const computeToks =
    (gpu.fp16_tflops * 1e12) / (ENGINE_CONSTANTS.flopsPerTokenFactor * activeParamsB * 1e9)
  return Math.min(bandwidthToks, computeToks)
}

/** 图像生成：秒/张 = 步数 × 单步前向时间（算力主导，PRD §7.2） */
export function computeImageSeconds(
  activeParamsB: number,
  steps: number,
  gpu: GpuLike,
): number {
  const perStep =
    (ENGINE_CONSTANTS.flopsPerTokenFactor *
      activeParamsB *
      1e9 *
      ENGINE_CONSTANTS.imageFlopsFactor) /
    (gpu.fp16_tflops * 1e12 * ENGINE_CONSTANTS.computeUtilization)
  return steps * perStep
}

function classifyLlmSpeed(tokPerSec: number): TierKey {
  if (tokPerSec > 20) return 'smooth'
  if (tokPerSec > 5) return 'ok'
  if (tokPerSec > 2) return 'tight'
  return 'no'
}

function classifyImageSpeed(secondsPerImage: number): TierKey {
  if (secondsPerImage < 10) return 'smooth'
  if (secondsPerImage < 30) return 'ok'
  if (secondsPerImage < 60) return 'tight'
  return 'no'
}

export interface TierOpts {
  /** 自定义 VRAM 模式无带宽/算力信息，无法估速；默认 true */
  estimateSpeed?: boolean
}

/**
 * 单档位分级计算（PRD §7.3）。
 * 第 1 步 VRAM 硬约束 → 放不下=红；
 * 第 2 步速度分档；余量 < 1GB 强制"勉强"。
 */
export function computeTierResult(
  model: ModelRow,
  gpu: GpuLike,
  contextLength: number,
  bitsPerParam: number,
  opts: TierOpts = {},
): TierResult {
  const weightBytes = computeWeightBytes(model.params ?? 0, bitsPerParam)

  let kvBytes = 0
  let activationBytes = 0
  if (model.model_type === 'image') {
    // 图像：中间激活按分辨率基准（默认 1024²）估算
    activationBytes = (model.activation_gb ?? 1.5) * GIB
  } else {
    kvBytes = computeKvBytes(model, contextLength)
    if (model.model_type === 'vlm') {
      // VLM：视觉编码器固定开销（PRD §7.1）
      kvBytes += model.vision_overhead_bytes ?? 0
    }
  }

  const overheadBytes = ENGINE_CONSTANTS.frameworkOverheadBytes
  const vramBytes = weightBytes + kvBytes + activationBytes + overheadBytes
  const vramGb = toGb(vramBytes)
  const available = gpu.vram_gb - ENGINE_CONSTANTS.systemReserveGb

  let tier: TierKey
  let noteKey: string | null = null
  let tokPerSec: number | null = null
  let secondsPerImage: number | null = null

  const estimateSpeed = opts.estimateSpeed !== false

  if (vramGb > available) {
    tier = 'no'
    noteKey = I18N_KEYS.tierRule.noVram
  } else if (!estimateSpeed) {
    // 自定义 VRAM 模式：只能判断放得下/放不下，速度无法预估
    tier = 'ok'
    noteKey = I18N_KEYS.tierRule.customVram
  } else {
    const activeParams = model.active_params ?? model.params ?? 0
    if (model.model_type === 'image') {
      const steps = model.image_steps ?? inferImageSteps(model.architecture)
      secondsPerImage = computeImageSeconds(activeParams, steps, gpu)
      tier = classifyImageSpeed(secondsPerImage)
      if (tier === 'no') noteKey = I18N_KEYS.tierRule.noSpeed
    } else {
      tokPerSec = computeLlmToksPerSec(activeParams, weightBytes, gpu)
      tier = classifyLlmSpeed(tokPerSec)
      if (tier === 'no') noteKey = I18N_KEYS.tierRule.noSpeed
    }

    // 附加规则：放得下但余量 < 1GB → 强制"勉强"（防 OOM 抖动）
    const margin = available - vramGb
    if (margin < ENGINE_CONSTANTS.minFreeMarginGb && tier !== 'no') {
      tier = 'tight'
      noteKey = I18N_KEYS.tierRule.lowMargin
    }
  }

  return {
    tier,
    weightGb: round(toGb(weightBytes)),
    kvGb: round(toGb(kvBytes)),
    overheadGb: round(toGb(overheadBytes)),
    vramGb: round(vramGb),
    tokPerSec: tokPerSec === null ? null : round(tokPerSec, 1),
    secondsPerImage: secondsPerImage === null ? null : round(secondsPerImage, 1),
    noteKey,
  }
}

/** 把量化行 + 分级结果组装成 API 的 QuantRow（详情页用） */
export function buildQuantRow(
  model: ModelRow,
  gpu: GpuLike,
  contextLength: number,
  q: QuantRowDb,
  opts: TierOpts = {},
): QuantRow {
  const base = computeTierResult(model, gpu, contextLength, q.bits_per_param, opts)
  return {
    ...base,
    quantName: q.quant_name as QuantRow['quantName'],
    format: q.format,
    url: q.url,
    downloads: q.downloads,
    available: q.official === 1,
  }
}

export interface GpuSuggestion {
  gpu: GpuSpec
  /** 该卡显存是否足够容纳（true=刚够的最小卡；false=库里最大卡仍不足） */
  fits: boolean
}

/** 换卡建议：优先找显存刚够的最小卡；都不够时给最大 VRAM 卡并标注 fits=false（PRD §8.1） */
export function suggestGpu(
  gpus: GpuSpec[],
  neededGb: number,
  excludeId?: number,
): GpuSuggestion | null {
  const others = gpus.filter((g) => g.id !== excludeId)
  const fits = others
    .filter((g) => g.vram_gb >= neededGb)
    .sort((a, b) => a.vram_gb - b.vram_gb)
  if (fits.length > 0) return { gpu: fits[0], fits: true }
  const largest = others.sort((a, b) => b.vram_gb - a.vram_gb)[0]
  return largest ? { gpu: largest, fits: false } : null
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
