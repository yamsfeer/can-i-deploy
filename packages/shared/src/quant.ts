import type { ModelType, QuantLevel, QuantName } from './types.js'

/**
 * 量化档位静态表（PRD §5.4 / §7.1）。
 * bitsPerParam 为每参数字节数：fp16=2B、fp8/Q8_0=1B、Q6=0.75B、Q5=0.625B、Q4=0.5B。
 * LLM/VLM：fp16 + GGUF Q8_0 / Q6_K / Q5_K_M / Q4_K_M（砍掉 Q3/Q2，决策回顾 Q5）
 * 图像生成：fp16 + fp8
 */

export const LLM_QUANT_LEVELS: ReadonlyArray<QuantLevel> = [
  { name: 'fp16', bitsPerParam: 2.0, format: 'safetensors' },
  { name: 'Q8_0', bitsPerParam: 1.0, format: 'gguf' },
  { name: 'Q6_K', bitsPerParam: 0.75, format: 'gguf' },
  { name: 'Q5_K_M', bitsPerParam: 0.625, format: 'gguf' },
  { name: 'Q4_K_M', bitsPerParam: 0.5, format: 'gguf' },
]

export const IMAGE_QUANT_LEVELS: ReadonlyArray<QuantLevel> = [
  { name: 'fp16', bitsPerParam: 2.0, format: 'safetensors' },
  { name: 'fp8', bitsPerParam: 1.0, format: 'safetensors' },
]

/** 获取某模型类型对应的量化档位表 */
export function getQuantLevels(type: ModelType): ReadonlyArray<QuantLevel> {
  return type === 'image' ? IMAGE_QUANT_LEVELS : LLM_QUANT_LEVELS
}

/** 列表页分级展示所用档位：LLM/VLM 用 Q4_K_M，图像用 fp8（PRD §7.3 附加规则） */
export const LIST_BADGE_QUANT: Record<ModelType, QuantName> = {
  llm: 'Q4_K_M',
  vlm: 'Q4_K_M',
  image: 'fp8',
}
