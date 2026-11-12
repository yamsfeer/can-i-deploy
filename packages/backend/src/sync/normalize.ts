/**
 * 归一化：源 API 字段 → ModelCandidate。
 * - 模型类型映射：HF pipeline_tag / ModelScope tasks → llm / vlm / image（PRD §4.1）
 * - 精度兜底纠偏：file_size ÷ params ≈ 2→fp16、≈1→fp8、≈0.5→int4（PRD §5.4）
 * - 原版量化档组装（fp16 / fp8），GGUF 官方量化一期留空（只收官方）
 */
import type { KvCacheType, ModelType, QuantName } from '@can-i-deploy/shared'
import { inferImageSteps } from '@can-i-deploy/shared'
import type { ExtractedStructure } from './estimate.js'
import type {
  HfModelSummary,
  ModelCandidate,
  ModelScopeModel,
  QuantCandidate,
} from './types.js'

/** VLM 视觉编码器固定开销兜底值（字节，量级参考 seed 的 Qwen2.5-VL / InternVL3） */
const DEFAULT_VISION_OVERHEAD_BYTES = 1.5e9
/** 图像生成中间激活兜底值（1024²，GB） */
const DEFAULT_IMAGE_ACTIVATION_GB = 1.5

/**
 * 从 HF tags 提取 license（HF 列表 API 无独立 license 字段，tags 带 `license:xxx` 前缀）。
 * 例：['transformers', 'license:apache-2.0'] → 'apache-2.0'；无则 null。
 */
export function extractLicenseFromTags(tags?: string[] | null): string | null {
  if (!tags) return null
  for (const tag of tags) {
    if (tag.startsWith('license:')) {
      const lic = tag.slice('license:'.length).trim()
      return lic || null
    }
  }
  return null
}

/** 类型判定：HF pipeline_tag / ModelScope tasks / tags 关键词 → ModelType */
export function classifyModelType(input: {
  pipelineTag?: string | null
  tasks?: string[]
  tags?: string[]
}): ModelType | null {
  const text = [input.pipelineTag ?? '', ...(input.tasks ?? []), ...(input.tags ?? [])]
    .join(' ')
    .toLowerCase()
  if (/text-to-image|image-to-image|\bt2i\b/.test(text)) return 'image'
  if (/image-text-to-text|text-image-to-text|visual-question|document-question/.test(text)) return 'vlm'
  if (/text-generation|conversational|text_generation/.test(text)) return 'llm'
  return null
}

/**
 * 精度兜底纠偏（PRD §5.4）。
 * 实际字节/参数 = file_size ÷ params：≈2→fp16、≈1→fp8/int8、≈0.5→int4。
 * 防 FP8 safetensors 被误当 fp16。
 */
export function inferPrecision(fileSizeBytes: number | null | undefined, paramsB: number | null): string | null {
  if (!fileSizeBytes || fileSizeBytes <= 0 || !paramsB || paramsB <= 0) return null
  const bytesPerParam = fileSizeBytes / (paramsB * 1e9)
  if (bytesPerParam >= 1.7) return 'fp16'
  if (bytesPerParam >= 0.85) return 'fp8'
  if (bytesPerParam >= 0.4) return 'int4'
  return 'unknown'
}

/** 组装原版 safetensors 档位（精度纠偏决定 fp16 还是 fp8） */
function buildBaseQuant(
  paramsB: number | null,
  precision: string | null,
  fileSize: number | null,
  url: string,
): QuantCandidate | null {
  if (!paramsB || paramsB <= 0) return null
  const quantName: QuantName = precision === 'fp8' ? 'fp8' : 'fp16'
  const bytesPerParam = quantName === 'fp8' ? 1.0 : 2.0
  const weightBytes = fileSize && fileSize > 0 ? fileSize : Math.round(paramsB * 1e9 * bytesPerParam)
  return {
    quantName,
    format: 'safetensors',
    bitsPerParam: bytesPerParam,
    weightBytes,
    downloads: null,
    url,
  }
}

const pickName = (id: string, displayName?: string | null): string => {
  if (displayName && displayName.trim()) return displayName.trim()
  const parts = id.split('/')
  return parts[parts.length - 1] ?? id
}

/** HF 列表项 + config 估算结构 → ModelCandidate（无 config / 无类型 → null） */
export function buildHfCandidate(
  m: HfModelSummary,
  structure: ExtractedStructure,
  orgName: string,
): ModelCandidate | null {
  const modelType = classifyModelType({ pipelineTag: m.pipeline_tag, tags: m.tags })
  if (!modelType) return null

  const sourceId = m.id
  const url = `https://huggingface.co/${sourceId}`
  const paramsB = structure.paramsB
  if (!paramsB) return null // config 估算失败：无法计算，跳过（与 ModelScope 一致）
  const baseQuant = buildBaseQuant(paramsB, 'fp16', null, url)

  return {
    source: 'hf',
    source_id: sourceId,
    org: orgName,
    name: pickName(sourceId),
    model_type: modelType,
    params: paramsB,
    active_params: structure.activeParamsB ?? paramsB,
    context_length: structure.contextLength,
    architecture: structure.architecture,
    kv_cache_type: structure.kvCacheType,
    num_layers: structure.numLayers,
    num_heads: structure.numHeads,
    head_dim: structure.headDim,
    kv_heads: structure.kvHeads,
    vision_overhead_bytes: modelType === 'vlm' ? (structure.visionOverheadBytes ?? DEFAULT_VISION_OVERHEAD_BYTES) : null,
    activation_gb: modelType === 'image' ? DEFAULT_IMAGE_ACTIVATION_GB : null,
    image_steps: modelType === 'image' ? inferImageSteps(structure.architecture) : null,
    license: extractLicenseFromTags(m.tags) ?? m.license ?? null,
    downloads: m.downloads ?? 0,
    likes: m.likes ?? null,
    file_size: null,
    precision: 'fp16',
    url,
    quants: baseQuant ? [baseQuant] : [],
  }
}

/** ModelScope 列表项 + config 估算结构 → ModelCandidate（无 params / 无类型 → null） */
export function buildModelScopeCandidate(
  m: ModelScopeModel,
  structure: ExtractedStructure,
  orgName: string,
): ModelCandidate | null {
  const modelType = classifyModelType({ tasks: m.tasks, tags: m.tags })
  if (!modelType) return null

  // ModelScope 直接给参数量（整数个参）；0/缺失视为不可计算
  const paramsB = m.params && m.params > 0 ? m.params / 1e9 : null
  if (!paramsB) return null

  const sourceId = m.id
  const url = `https://modelscope.cn/models/${sourceId}`
  const fileSize = m.file_size && m.file_size > 0 ? m.file_size : null
  const precision = inferPrecision(fileSize, paramsB)
  const baseQuant = buildBaseQuant(paramsB, precision, fileSize, url)

  return {
    source: 'modelscope',
    source_id: sourceId,
    org: orgName,
    name: pickName(sourceId, m.display_name),
    model_type: modelType,
    params: paramsB,
    active_params: structure.activeParamsB ?? paramsB,
    context_length: structure.contextLength,
    architecture: structure.architecture,
    kv_cache_type: structure.kvCacheType as KvCacheType | null,
    num_layers: structure.numLayers,
    num_heads: structure.numHeads,
    head_dim: structure.headDim,
    kv_heads: structure.kvHeads,
    vision_overhead_bytes: modelType === 'vlm' ? (structure.visionOverheadBytes ?? DEFAULT_VISION_OVERHEAD_BYTES) : null,
    activation_gb: modelType === 'image' ? DEFAULT_IMAGE_ACTIVATION_GB : null,
    image_steps: modelType === 'image' ? inferImageSteps(structure.architecture) : null,
    license: m.license ?? null,
    downloads: m.downloads ?? 0,
    likes: m.likes ?? null,
    file_size: fileSize,
    precision,
    url,
    quants: baseQuant ? [baseQuant] : [],
  }
}
