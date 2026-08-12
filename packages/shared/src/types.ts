/**
 * 前后端共享 DTO 类型定义。
 * 前端只消费这些类型，分级计算完全在后端完成。
 */

/** 模型类型：LLM / VLM / 图像生成 */
export type ModelType = 'llm' | 'vlm' | 'image'

/** 数据来源平台 */
export type Source = 'hf' | 'modelscope'

/** 4 档分级 key（全站统一颜色约定） */
export type TierKey = 'smooth' | 'ok' | 'tight' | 'no'

/** GPU 类别 */
export type GpuCategory = 'consumer' | 'pro' | 'cloud'

/** 量化/精度档位名 */
export type QuantName = 'fp16' | 'fp8' | 'Q8_0' | 'Q6_K' | 'Q5_K_M' | 'Q4_K_M'

/** 文件格式 */
export type QuantFormat = 'safetensors' | 'gguf'

/** KV cache 类型（影响 KV cache 计算） */
export type KvCacheType = 'mha' | 'gqa' | 'mla'

/** 硬件规格（curated 手工维护清单） */
export interface GpuSpec {
  id: number
  name: string
  category: GpuCategory
  vram_gb: number
  memory_bandwidth_gbps: number
  fp16_tflops: number
  tier: number
  note: string | null
}

/** 4 档定义（供 /api/tiers 与前端图例使用） */
export interface TierDef {
  key: TierKey
  /** i18n key：档位名称 */
  nameKey: string
  /** 展示颜色（16 进制，前端 badge 使用） */
  color: string
  /** LLM 速度下限（tok/s），超过即达到该档；'no' 档无下限 */
  llmMinToks: number | null
  /** 图像生成秒/张上限，低于即达到该档；'no' 档无上限 */
  imageMaxSeconds: number | null
  /** 该档位的补充规则说明（i18n key） */
  ruleKey: string | null
}

/** 量化档位静态定义 */
export interface QuantLevel {
  name: QuantName
  /**
   * 每参数字节数（PRD §7.1 命名 bits_per_param，实为字节数）：
   * fp16=2B、Q8=1B、Q6=0.75B、Q5=0.625B、Q4=0.5B。权重字节 = params × 该值。
   */
  bitsPerParam: number
  format: QuantFormat
}

/** 分级结果（单个量化档位在某硬件/上下文下的计算结果） */
export interface TierResult {
  tier: TierKey
  /** 权重字节（GB） */
  weightGb: number
  /** KV cache 字节（GB），图像模型恒为 0 */
  kvGb: number
  /** 框架开销（GB，常量） */
  overheadGb: number
  /** 总 VRAM 需求（GB） */
  vramGb: number
  /** LLM：解码速度 tok/s（null 表示不可计算） */
  tokPerSec: number | null
  /** 图像：秒/张（null 表示不可计算） */
  secondsPerImage: number | null
  /** 附加说明（如"显存余量不足"），i18n key */
  noteKey: string | null
}

/** 详情页量化档位行 */
export interface QuantRow extends TierResult {
  quantName: QuantName
  format: QuantFormat
  url: string | null
  downloads: number | null
  /** 该档位是否有官方文件（无则留空显示） */
  available: boolean
}

/** 模型列表行 */
export interface ModelSummary {
  id: number
  source: Source
  source_id: string
  org: string
  name: string
  model_type: ModelType
  params: number | null
  context_length: number | null
  downloads: number
  likes: number | null
  license: string | null
  url: string
  /** 列表页分级 badge 数据（LLM/VLM 用 Q4_K_M 档，图像用 fp8 档） */
  badge: QuantRow | null
  /** badge 档位名（如 'Q4_K_M' / 'fp8'），无量化时为 null */
  badgeQuant: QuantName | null
}

/** 模型详情 */
export interface ModelDetail extends ModelSummary {
  architecture: string | null
  kv_cache_type: KvCacheType | null
  /** 各量化档位结果（按档位表顺序） */
  quantizations: QuantRow[]
  /** 本模型在目标硬件上需要的最小显存（GB），= 最佳档位（最低 bits）的 vram */
  minVramGb: number | null
  /** 换卡建议：显存刚够的最小卡；放得下则为 null */
  suggestedGpu: GpuSpec | null
  /** 建议卡是否足够容纳该模型；null 表示无需换卡 */
  suggestedFits: boolean | null
}

/** 白名单组织 */
export interface Organization {
  id: number
  name: string
  hf_author: string
  modelscope_org: string
  note: string | null
}

/** API 统一错误响应 */
export interface ApiError {
  error: string
}

/** 硬件页需要的 GPU 行（含可选按档位计算能力） */
export type GpuList = GpuSpec[]
