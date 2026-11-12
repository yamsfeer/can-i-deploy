/**
 * M2 数据管道：数据源原始响应与归一化中间类型。
 * 管道：源 API（HF / ModelScope）→ 归一化候选 → ingest 入库。
 * 归一化候选与数据库表结构解耦，便于两侧字段差异在客户端收敛。
 */
import type {
  KvCacheType,
  ModelType,
  QuantFormat,
  QuantName,
  Source,
} from '@can-i-deploy/shared'

/** ---------- 归一化后的模型候选（管道核心数据结构） ---------- */

export interface QuantCandidate {
  /** 档位名：'fp16' | 'fp8' | 'Q8_0' | 'Q6_K' | 'Q5_K_M' | 'Q4_K_M' */
  quantName: QuantName
  format: QuantFormat
  /** 每参数比特数 */
  bitsPerParam: number
  /** 该档位权重实际字节（原版取 file_size，兜底用 params×bits/8） */
  weightBytes: number | null
  downloads: number | null
  url: string | null
}

export interface ModelCandidate {
  source: Source
  /** 平台侧模型 ID，如 'Qwen/Qwen3-0.6B' */
  source_id: string
  /** 白名单组织名（如 'Qwen'），用于对齐 organizations 表 */
  org: string
  name: string
  model_type: ModelType
  /** 总参数量（十亿） */
  params: number | null
  /** 激活参数量（十亿）；MoE 用，非 MoE = params */
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
  /** 权重文件总大小（字节），兜底纠偏用 */
  file_size: number | null
  /** 兜底纠偏后的实际精度（fp16/fp8/…） */
  precision: string | null
  url: string
  quants: QuantCandidate[]
}

/** ---------- Hugging Face 原始响应（/api/models 列表 + config.json） ---------- */

/** HF 列表接口单条返回（实测字段） */
export interface HfModelSummary {
  id: string
  downloads: number
  likes: number
  pipeline_tag?: string | null
  tags?: string[]
  library_name?: string | null
  /** 某些响应（如详情接口）可能直接给 license；列表接口走 tags 提取 */
  license?: string | null
  createdAt?: string | null
  private?: boolean
  gated?: boolean
}

/** HF config.json 中与结构参数相关的字段（LLM 部分可能在 text_config 内） */
export interface HfConfig {
  model_type?: string
  architectures?: string[]
  hidden_size?: number
  num_hidden_layers?: number
  num_attention_heads?: number
  num_key_value_heads?: number
  head_dim?: number
  max_position_embeddings?: number
  intermediate_size?: number
  vocab_size?: number
  tie_word_embeddings?: boolean
  hidden_act?: string
  /** MoE 字段（LLaMA/Qwen 系命名不一） */
  num_experts?: number | null
  num_local_experts?: number | null
  moe_intermediate_size?: number | null
  /** MoE 每 token 激活 expert 数 */
  num_experts_per_tok?: number | null
  /** VLM/图像模型：LLM 与视觉部分嵌套 */
  text_config?: HfConfig | null
  vision_config?: Record<string, unknown> | null
  [key: string]: unknown
}

/** ---------- ModelScope 原始响应（openapi/v1/models） ---------- */

export interface ModelScopeModel {
  id: string
  display_name?: string | null
  downloads?: number
  likes?: number
  license?: string | null
  tasks?: string[]
  tags?: string[]
  params?: number
  file_size?: number
  gated?: boolean
  private?: boolean
}

export interface ModelScopePage {
  models: ModelScopeModel[]
  total_count: number
  page_number: number
  page_size: number
}

export interface ModelScopeResponse {
  success: boolean
  request_id?: string
  data: ModelScopePage
}

/** 单个数据源抓取结果（编排层汇总用） */
export interface SyncSourceResult {
  /** 归一化后、准备入库的候选 */
  models: ModelCandidate[]
  /** 跳过统计（非目标类型 / 缺参数 / gated 等） */
  skipped: { reason: string; count: number }[]
  /** 抓取过程中的错误信息 */
  errors: string[]
}
