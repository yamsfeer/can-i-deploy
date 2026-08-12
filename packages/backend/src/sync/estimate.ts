/**
 * 参数量估算与结构参数提取（HF 专用；ModelScope 直接给 params，不走此模块）。
 * PRD §5.3：HF 无参数字段，需从 config.json 估算。
 *
 * 估算公式（标准 Transformer，与 seed 数据口径一致，已用 Qwen3-0.6B 校准 ≈0.6B）：
 *   params = embedding + Σ_layers (attention + mlp)
 *   embedding    = vocab × hidden（tie_word_embeddings 时 ×1，否则 ×2）
 *   attention/层 = 2×hidden×head_dim×heads（Q+O） + 2×hidden×head_dim×kv_heads（K+V）
 *   mlp/层       = SwiGLU 3×hidden×intermediate；传统 GELU 2×hidden×intermediate
 *   MoE          = router + num_local_experts × expert_mlp（激活侧用 num_experts_per_tok）
 */
import type { KvCacheType } from '@can-i-deploy/shared'
import { inferKvCacheType } from '@can-i-deploy/shared'
import type { HfConfig } from './types.js'

/** 从 config.json 提取的模型结构 */
export interface ExtractedStructure {
  /** 总参数量（十亿） */
  paramsB: number | null
  /** 激活参数量（十亿）；MoE < 总参数，非 MoE = 总参数 */
  activeParamsB: number | null
  contextLength: number | null
  architecture: string | null
  kvCacheType: KvCacheType | null
  numLayers: number | null
  numHeads: number | null
  headDim: number | null
  kvHeads: number | null
  /** VLM 视觉编码器固定开销（字节），config 无视觉结构时为 null */
  visionOverheadBytes: number | null
}

/**
 * 取 LLM 部分 config。
 * 多数 VLM/图像 config 将 LLM 结构嵌套在 text_config（如 Qwen2-VL、Phi-4-vision），
 * 部分 VLM（如 Qwen2.5-VL）为扁平结构，回退到顶层。
 */
function llmPart(config: HfConfig): HfConfig {
  if (config.text_config && (config.text_config.num_hidden_layers || config.text_config.hidden_size)) {
    return config.text_config
  }
  return config
}

/** 架构名 → 稳定简写（与 seed 风格一致，供 inferKvCacheType / inferImageSteps 使用） */
const ARCH_PATTERNS: Array<[RegExp, string]> = [
  [/flux/, 'flux'],
  [/stablediffusionxl|sdxl/, 'sdxl'],
  [/stablediffusion|stable_diffusion/, 'sd'],
  [/qwen.*vl|qwen.*vision/, 'qwen2-vl'],
  [/qwen/, 'qwen2'],
  [/deepseek_v[234]|deepseek.*r1|deepseek.*mla/, 'deepseek-v3-mla'],
  [/deepseek/, 'deepseek'],
  [/llama/, 'llama'],
  [/glm|chatglm/, 'glm4'],
  [/internvl|internlm|intern/, 'internvl3'],
  [/gemma/, 'gemma'],
  [/mistral/, 'mistral'],
  [/phi/, 'phi'],
  [/yi-/, 'yi'],
]

export function normalizeArchitecture(modelType: string | null | undefined): string | null {
  const t = (modelType ?? '').toLowerCase()
  if (!t) return null
  for (const [re, name] of ARCH_PATTERNS) {
    if (re.test(t)) return name
  }
  return t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** 参数量估算（返回 十亿）。估算失败返回 null。 */
export function estimateParams(config: HfConfig): {
  paramsB: number | null
  activeParamsB: number | null
} {
  const cfg = llmPart(config)
  const hidden = cfg.hidden_size
  const layers = cfg.num_hidden_layers
  if (!hidden || !layers || hidden <= 0 || layers <= 0) {
    return { paramsB: null, activeParamsB: null }
  }

  // embedding（含未 tied 的 lm_head）
  const vocab = cfg.vocab_size ?? 0
  const tied = cfg.tie_word_embeddings !== false
  const embeddingWeight = vocab * hidden * (tied ? 1 : 2)

  // attention（Q+O 按 head_dim×heads，兼容 head_dim ≠ hidden/heads 的模型）
  const heads = cfg.num_attention_heads ?? 1
  const kvHeads = cfg.num_key_value_heads ?? heads
  const headDim = cfg.head_dim ?? Math.round(hidden / heads)
  const attnPerLayer =
    2 * hidden * headDim * heads + 2 * hidden * headDim * kvHeads

  // MLP（MoE 判定）
  const experts = cfg.num_local_experts ?? cfg.num_experts ?? 0
  const isMoe = experts > 1
  const intermediate = cfg.intermediate_size ?? 0

  const denseWeight = embeddingWeight + layers * attnPerLayer

  if (isMoe) {
    const expertInter = cfg.moe_intermediate_size ?? intermediate
    const activeExperts = cfg.num_experts_per_tok ?? 2
    const routerWeight = hidden * hidden
    const fullMlp = layers * (routerWeight + experts * 3 * hidden * expertInter)
    const activeMlp = layers * (routerWeight + activeExperts * 3 * hidden * expertInter)
    return {
      paramsB: (denseWeight + fullMlp) / 1e9,
      activeParamsB: (denseWeight + activeMlp) / 1e9,
    }
  }

  const gelu = (cfg.hidden_act ?? '').toLowerCase().includes('gelu')
  const mlpPerLayer = (gelu ? 2 : 3) * hidden * intermediate
  const total = denseWeight + layers * mlpPerLayer
  return { paramsB: total / 1e9, activeParamsB: total / 1e9 }
}

/** 视觉编码器固定开销（字节）：按 vision_config 的 hidden²×layers×2（fp16 权重）粗估 */
function estimateVisionOverhead(config: HfConfig): number | null {
  const vc = config.vision_config
  if (!vc || typeof vc !== 'object') return null
  const hidden = Number(vc.hidden_size ?? vc.encoder_hidden_size ?? 0)
  const layers = Number(vc.num_hidden_layers ?? vc.encoder_layers ?? vc.num_layers ?? 0)
  if (hidden > 0 && layers > 0) return hidden * hidden * layers * 2
  return null
}

/** 提取结构字段（KV cache 计算所需）+ 架构 + 上下文长度 */
export function extractStructure(config: HfConfig): ExtractedStructure {
  const cfg = llmPart(config)
  const { paramsB, activeParamsB } = estimateParams(config)

  const heads = cfg.num_attention_heads ?? null
  const modelType = config.model_type ?? cfg.model_type
  const architecture = normalizeArchitecture(modelType)
  const kvCacheType = inferKvCacheType(architecture)

  return {
    paramsB,
    activeParamsB,
    contextLength: cfg.max_position_embeddings ?? null,
    architecture,
    kvCacheType,
    numLayers: cfg.num_hidden_layers ?? null,
    numHeads: heads,
    headDim: cfg.head_dim ?? (heads ? Math.round((cfg.hidden_size ?? 0) / heads) : null),
    kvHeads: cfg.num_key_value_heads ?? heads,
    visionOverheadBytes: estimateVisionOverhead(config),
  }
}
