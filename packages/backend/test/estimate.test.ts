/**
 * 参数量估算与结构提取测试（真实 config 数据校准）。
 * Qwen3-0.6B 真实 ≈0.6B；DeepSeek-V3 真实 671B 总 / ~37B 激活。
 */
import { describe, expect, it } from 'vitest'
import {
  estimateParams,
  extractStructure,
  normalizeArchitecture,
} from '../src/sync/estimate.js'
import type { HfConfig } from '../src/sync/types.js'

/** 真实 Qwen/Qwen3-0.6B config.json（实测） */
const QWEN3_06B: HfConfig = {
  model_type: 'qwen3',
  architectures: ['Qwen3ForCausalLM'],
  hidden_size: 1024,
  num_hidden_layers: 28,
  num_attention_heads: 16,
  num_key_value_heads: 8,
  head_dim: 128,
  max_position_embeddings: 40960,
  intermediate_size: 3072,
  vocab_size: 151936,
  tie_word_embeddings: true,
  hidden_act: 'silu',
}

/** 嵌套 LLM 的 VLM config（如 Qwen2-VL） */
const VLM_NESTED: HfConfig = {
  model_type: 'qwen2_vl',
  architectures: ['Qwen2VLForConditionalGeneration'],
  text_config: {
    model_type: 'qwen2',
    hidden_size: 1024,
    num_hidden_layers: 28,
    num_attention_heads: 16,
    num_key_value_heads: 8,
    head_dim: 128,
    max_position_embeddings: 32768,
    intermediate_size: 3072,
    vocab_size: 151936,
    tie_word_embeddings: true,
    hidden_act: 'silu',
  },
  vision_config: { hidden_size: 1280, num_hidden_layers: 32 },
}

/** MoE（DeepSeek-V3 结构参数） */
const DEEPSEEK_V3: HfConfig = {
  model_type: 'deepseek_v3',
  architectures: ['DeepseekV3ForCausalLM'],
  hidden_size: 7168,
  num_hidden_layers: 61,
  num_attention_heads: 128,
  head_dim: 128,
  max_position_embeddings: 163840,
  intermediate_size: 18432,
  vocab_size: 129280,
  tie_word_embeddings: false,
  hidden_act: 'silu',
  num_local_experts: 256,
  num_experts_per_tok: 8,
  moe_intermediate_size: 2048,
}

describe('estimateParams 参数量估算', () => {
  it('Qwen3-0.6B：估算 ≈0.596B（真实 0.6B）', () => {
    const { paramsB } = estimateParams(QWEN3_06B)
    expect(paramsB).not.toBeNull()
    expect(paramsB!).toBeCloseTo(0.596, 2)
  })

  it('非 MoE：激活参数量 = 总参数量', () => {
    const { paramsB, activeParamsB } = estimateParams(QWEN3_06B)
    expect(activeParamsB).toBe(paramsB)
  })

  it('DeepSeek-V3（MoE）：总参数 ~700B 量级，激活参数显著小于总量', () => {
    const { paramsB, activeParamsB } = estimateParams(DEEPSEEK_V3)
    expect(paramsB).not.toBeNull()
    expect(paramsB!).toBeGreaterThan(400)
    expect(paramsB!).toBeLessThan(1100)
    expect(activeParamsB!).toBeLessThan(paramsB!)
    expect(activeParamsB!).toBeGreaterThan(30) // 激活 ~37B 量级
  })

  it('嵌套 text_config（VLM）：从 LLM 部分估算', () => {
    const { paramsB } = estimateParams(VLM_NESTED)
    expect(paramsB).not.toBeNull()
    expect(paramsB!).toBeCloseTo(0.596, 2)
  })

  it('缺结构字段：返回 null（不抛错）', () => {
    expect(estimateParams({ model_type: 'llama' }).paramsB).toBeNull()
    expect(estimateParams({}).paramsB).toBeNull()
  })
})

describe('extractStructure 结构提取', () => {
  it('Qwen3-0.6B：KV 结构 + gqa + 上下文', () => {
    const s = extractStructure(QWEN3_06B)
    expect(s.numLayers).toBe(28)
    expect(s.numHeads).toBe(16)
    expect(s.headDim).toBe(128)
    expect(s.kvHeads).toBe(8)
    expect(s.contextLength).toBe(40960)
    expect(s.kvCacheType).toBe('gqa')
    expect(s.architecture).toBe('qwen2')
  })

  it('DeepSeek-V3：识别为 mla', () => {
    expect(extractStructure(DEEPSEEK_V3).kvCacheType).toBe('mla')
  })

  it('VLM：LLM 结构取自 text_config，视觉开销从 vision_config 估算', () => {
    const s = extractStructure(VLM_NESTED)
    expect(s.numLayers).toBe(28)
    expect(s.kvCacheType).toBe('gqa')
    // 1280² × 32 层 × 2 bytes = 104.8MB
    expect(s.visionOverheadBytes).toBe(1280 * 1280 * 32 * 2)
  })

  it('缺 head_dim：按 hidden/heads 兜底', () => {
    const cfg: HfConfig = { ...QWEN3_06B, head_dim: undefined }
    expect(extractStructure(cfg).headDim).toBe(1024 / 16)
  })
})

describe('normalizeArchitecture 架构简写', () => {
  it.each([
    ['qwen3', 'qwen2'],
    ['qwen2_5_vl', 'qwen2-vl'],
    ['deepseek_v3', 'deepseek-v3-mla'],
    ['flux', 'flux'],
    ['stablediffusionxl', 'sdxl'],
    ['llama', 'llama'],
    [undefined, null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeArchitecture(input)).toBe(expected)
  })
})
