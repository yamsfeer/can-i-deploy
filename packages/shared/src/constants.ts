/**
 * 预测引擎工程常量（集中配置，上线后按反馈微调）。
 * 所有值来自 PRD §7 的公式说明。
 */

export const ENGINE_CONSTANTS = {
  /** LLM/VLM 显存带宽利用率（llama.cpp 实测 70~90%，取 0.8） */
  bandwidthUtilization: 0.8,
  /** 图像/算力受限场景的算力利用率 */
  computeUtilization: 0.8,
  /** 框架固定开销（CUDA context + 引擎常驻），约 0.75 GB */
  frameworkOverheadBytes: 0.75 * 1e9,
  /** VRAM 硬约束的系统预留（GB） */
  systemReserveGb: 0.5,
  /** 放得下但余量 < 1GB 时强制"勉强"档 */
  minFreeMarginGb: 1.0,
  /** 上下文长度默认值 */
  defaultContextLength: 8192,
  /** MLA（DeepSeek 系）压缩 KV 近似系数 */
  mlaCompressionFactor: 1 / 8,
  /** KV cache 每 K/V 使用 fp16，各 2 字节 */
  kvBytesPerElement: 2,
  /** 每 token 约 2×params 次 FLOPs（decode） */
  flopsPerTokenFactor: 2,
  /**
   * 图像生成单步 FLOPs 放大系数（经验校准，可调）。
   * 纯 2×params 会低估 diffusion 单步开销约千倍（attention + 每像素矩阵乘），
   * 以 SDXL 30 步 1024² 在 RTX 4090 ≈ 2s 为基准反推得到该常量。
   */
  imageFlopsFactor: 1200,
} as const

/** 图像生成：基准分辨率（平方像素），用于分辨率因子 */
export const IMAGE_BASE_RESOLUTION = 1024 * 1024

/** 各模型类型的默认采样步数（图像生成） */
export const IMAGE_DEFAULT_STEPS: Record<string, number> = {
  default: 30,
  flux: 30,
  sdxl: 30,
  sd: 30,
  'sd-turbo': 4,
  'sdxl-turbo': 4,
}

/** 白名单组织清单（订阅对象，HF + ModelScope 双源）。
 *  hf_author 与 modelscope_org 两侧 ID 可能不同，PRD §5.1 注明需逐一确认，
 *  当前为合理默认值，M2 数据管道阶段校准。 */
export const ORGANIZATIONS: ReadonlyArray<{
  name: string
  hf_author: string
  modelscope_org: string
}> = [
  // 国产
  { name: 'Qwen', hf_author: 'Qwen', modelscope_org: 'Qwen' },
  { name: 'DeepSeek', hf_author: 'deepseek-ai', modelscope_org: 'deepseek-ai' },
  { name: 'GLM', hf_author: 'zai-org', modelscope_org: 'ZhipuAI' },
  { name: 'MiniMax', hf_author: 'MiniMaxAI', modelscope_org: 'MiniMax' },
  { name: 'Moonshot', hf_author: 'moonshotai', modelscope_org: 'moonshotai' },
  { name: '01.AI', hf_author: '01-ai', modelscope_org: '01ai' },
  { name: 'BAAI', hf_author: 'BAAI', modelscope_org: 'BAAI' },
  { name: 'InternLM', hf_author: 'internlm', modelscope_org: 'Shanghai_AI_Laboratory' },
  { name: 'StepFun', hf_author: 'stepfun-ai', modelscope_org: 'stepfun-ai' },
  { name: 'Tencent', hf_author: 'Tencent-Hunyuan', modelscope_org: 'Tencent-Hunyuan' },
  // 国际
  { name: 'Meta', hf_author: 'meta-llama', modelscope_org: 'facebook' },
  { name: 'Google', hf_author: 'google', modelscope_org: 'google' },
  { name: 'Mistral', hf_author: 'mistralai', modelscope_org: 'mistralai' },
  { name: 'Microsoft', hf_author: 'microsoft', modelscope_org: 'microsoft' },
  { name: 'xAI', hf_author: 'xai-org', modelscope_org: 'xai-org' },
  { name: 'Cohere', hf_author: 'CohereForAI', modelscope_org: 'CohereForAI' },
  { name: 'NVIDIA', hf_author: 'nvidia', modelscope_org: 'nvidia' }, // ModelScope 无 NVIDIA 官方组织，MS 源自动跳过（2026-08-14 实测）
  { name: 'Amazon', hf_author: 'amazon', modelscope_org: 'amazon' },
  // 图像生成组织（PRD §4.1 覆盖图像，§5.1 白名单补充）
  { name: 'Stability AI', hf_author: 'stabilityai', modelscope_org: 'stabilityai' },
  { name: 'Black Forest Labs', hf_author: 'black-forest-labs', modelscope_org: 'black-forest-labs' },
]

/**
 * 架构名称 → KV cache 类型推断（匹配 config.json model_type / 架构类名）。
 * MLA：DeepSeek-V2/V3/R1/V4 系（config.model_type 如 'deepseek_v3'，架构类名不含 'mla'）。
 * GQA：现代主流架构（LLaMA/Qwen2/3/Gemma/Mistral/GLM/InternLM 等）。
 * 其余（如老 LLaMA-1、GPT-2）按 MHA 兜底。
 */
export function inferKvCacheType(architecture: string | null | undefined): 'mha' | 'gqa' | 'mla' {
  const a = (architecture ?? '').toLowerCase()
  if (a.includes('deepseek') && (a.includes('mla') || /v[234]/.test(a) || a.includes('r1'))) return 'mla'
  if (
    /llama|qwen2|qwen3|gemma|mistral|glm|intern|yi|phi|nemo|nemotron|deepseek|grok|falcon|command/.test(a)
  ) {
    return 'gqa'
  }
  return 'mha'
}

/** 架构 → 图像生成默认步数 */
export function inferImageSteps(architecture: string | null | undefined): number {
  const a = (architecture ?? '').toLowerCase()
  for (const key of ['flux', 'sdxl-turbo', 'sdxl', 'sd-turbo', 'sd']) {
    if (a.includes(key)) return IMAGE_DEFAULT_STEPS[key]
  }
  return IMAGE_DEFAULT_STEPS.default
}

/** 4 档分级定义（全站统一颜色约定，PRD §3 / §7.3） */
export const TIER_DEFS: ReadonlyArray<{
  key: 'smooth' | 'ok' | 'tight' | 'no'
  nameKey: string
  color: string
  llmMinToks: number | null
  imageMaxSeconds: number | null
  ruleKey: string
}> = [
  {
    key: 'smooth',
    nameKey: 'tier.smooth',
    color: '#16a34a',
    llmMinToks: 20,
    imageMaxSeconds: 10,
    ruleKey: 'tierRule.smooth',
  },
  {
    key: 'ok',
    nameKey: 'tier.ok',
    color: '#2563eb',
    llmMinToks: 5,
    imageMaxSeconds: 30,
    ruleKey: 'tierRule.ok',
  },
  {
    key: 'tight',
    nameKey: 'tier.tight',
    color: '#ca8a04',
    llmMinToks: 2,
    imageMaxSeconds: 60,
    ruleKey: 'tierRule.tight',
  },
  {
    key: 'no',
    nameKey: 'tier.no',
    color: '#dc2626',
    llmMinToks: null,
    imageMaxSeconds: null,
    ruleKey: 'tierRule.no',
  },
]
