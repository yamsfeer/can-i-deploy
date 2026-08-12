/**
 * 预测引擎测试：权重 / KV cache / 速度 / 4 档分级 / 换卡建议。
 * 重点回归：权重字节 ÷8 修复（fp16=每参数字节 2.0，非比特）。
 */
import { describe, expect, it } from 'vitest'
import { ENGINE_CONSTANTS } from '@can-i-deploy/shared'
import type { GpuSpec, TierKey } from '@can-i-deploy/shared'
import {
  computeImageSeconds,
  computeKvBytes,
  computeLlmToksPerSec,
  computeTierResult,
  computeWeightBytes,
  suggestGpu,
} from '../src/services/engine.js'
import type { GpuLike, ModelRow } from '../src/services/engine.js'

function makeModel(over: Partial<ModelRow> = {}): ModelRow {
  return {
    id: 1,
    source: 'hf',
    source_id: 'Qwen/Qwen2.5-7B-Instruct',
    org: 'Qwen',
    name: 'Qwen2.5-7B-Instruct',
    model_type: 'llm',
    params: 7.62,
    active_params: 7.62,
    context_length: 32768,
    architecture: 'qwen2',
    kv_cache_type: 'gqa',
    num_layers: 28,
    num_heads: 28,
    head_dim: 128,
    kv_heads: 4,
    vision_overhead_bytes: null,
    activation_gb: null,
    image_steps: null,
    license: 'apache-2.0',
    downloads: 0,
    likes: null,
    url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct',
    ...over,
  }
}

/** RTX 4090 */
const GPU_4090: GpuLike = { vram_gb: 24, memory_bandwidth_gbps: 1008, fp16_tflops: 165.2 }

describe('computeWeightBytes 权重字节（÷8 修复回归）', () => {
  it('fp16 7.62B → 15.24GB（修复前误算 1.9GB）', () => {
    expect(computeWeightBytes(7.62, 2.0)).toBeCloseTo(15.24e9, -6)
  })
  it('Q4 0.5B/param → 3.81GB', () => {
    expect(computeWeightBytes(7.62, 0.5)).toBeCloseTo(3.81e9, -6)
  })
})

describe('computeKvBytes KV cache', () => {
  const base = { num_layers: 32, num_heads: 32, head_dim: 128, kv_cache_type: 'mha' as const }

  it('MHA：kv_heads = num_heads', () => {
    // 2 × 32 × (32×128) × 2 bytes/token × 8192
    const expectBytes = 2 * 32 * (32 * 128) * 2 * 8192
    expect(computeKvBytes(makeModel({ ...base }), 8192)).toBe(expectBytes)
  })

  it('GQA：用 kv_heads', () => {
    const expectBytes = 2 * 32 * (8 * 128) * 2 * 8192
    expect(
      computeKvBytes(makeModel({ ...base, kv_cache_type: 'gqa', kv_heads: 8 }), 8192),
    ).toBe(expectBytes)
  })

  it('MLA：压缩系数 1/8', () => {
    const mhaBytes = 2 * 32 * (1 * 128) * 2 * 8192
    const mlaBytes = computeKvBytes(makeModel({ ...base, kv_cache_type: 'mla', kv_heads: 1 }), 8192)
    expect(mlaBytes).toBeCloseTo(mhaBytes * ENGINE_CONSTANTS.mlaCompressionFactor, -6)
  })

  it('缺结构字段 → 0（不阻塞计算）', () => {
    expect(computeKvBytes(makeModel({ num_layers: null, head_dim: null }), 8192)).toBe(0)
  })
})

describe('computeLlmToksPerSec 解码速度（带宽约束主导）', () => {
  it('4090 + Qwen2.5-7B fp16 → ≈52.9 tok/s', () => {
    const weight = computeWeightBytes(7.62, 2.0)
    const toks = computeLlmToksPerSec(7.62, weight, GPU_4090)
    expect(toks).toBeCloseTo(52.9, 0)
  })
  it('带宽约束 = min 上限', () => {
    const weight = computeWeightBytes(7.62, 2.0)
    const bandwidth = (1008e9 * ENGINE_CONSTANTS.bandwidthUtilization) / weight
    expect(computeLlmToksPerSec(7.62, weight, GPU_4090)).toBeLessThanOrEqual(bandwidth)
  })
})

describe('computeImageSeconds 图像生成', () => {
  it('SDXL 30 步 4090 → 秒/张 < 10', () => {
    const sec = computeImageSeconds(3.5, 30, GPU_4090)
    expect(sec).toBeGreaterThan(0)
    expect(sec).toBeLessThan(10)
  })
})

describe('computeTierResult 4 档分级', () => {
  it('VRAM 放不下 → no（fp16 权重 15.24GB > 8GB 卡可用 7.5GB）', () => {
    const r = computeTierResult(makeModel(), { ...GPU_4090, vram_gb: 8 }, 8192, 2.0)
    expect(r.tier).toBe('no')
    expect(r.noteKey).toBe('tierRule.noVram')
  })

  it('放得下且速度 > 20 → smooth', () => {
    const r = computeTierResult(makeModel(), GPU_4090, 8192, 0.5)
    expect(r.tier).toBe('smooth')
    expect(r.tokPerSec).not.toBeNull()
  })

  it('余量 < 1GB → 强制 tight', () => {
    // 6GB 卡 + Q4 7.62B（权重 3.81GB + kv ~0.47 + overhead 0.75 ≈ 5.03GB）
    // available = 5.5GB，放得下但余量 ~0.47GB < 1GB → 强制 tight
    const r = computeTierResult(makeModel(), { vram_gb: 6, memory_bandwidth_gbps: 300, fp16_tflops: 20 }, 8192, 0.5)
    expect(r.tier).toBe('tight')
    expect(r.noteKey).toBe('tierRule.lowMargin')
  })

  it('自定义 VRAM（无法估速）→ ok', () => {
    const r = computeTierResult(makeModel(), { vram_gb: 32, memory_bandwidth_gbps: 0, fp16_tflops: 0 }, 8192, 0.5, {
      estimateSpeed: false,
    })
    expect(r.tier).toBe('ok')
    expect(r.noteKey).toBe('tierRule.customVram')
  })

  it('VRAM 需求由权重+KV+开销组成', () => {
    const r = computeTierResult(makeModel(), GPU_4090, 8192, 2.0)
    expect(r.weightGb).toBeCloseTo(15.24, 1)
    expect(r.kvGb).toBeGreaterThan(0)
    expect(r.overheadGb).toBeCloseTo(0.75, 1)
  })
})

describe('suggestGpu 换卡建议', () => {
  const gpus: GpuSpec[] = [
    { id: 1, name: 'RTX 4060', category: 'consumer', vram_gb: 8, memory_bandwidth_gbps: 272, fp16_tflops: 30, tier: 8, note: null },
    { id: 2, name: 'RTX 4090', category: 'consumer', vram_gb: 24, memory_bandwidth_gbps: 1008, fp16_tflops: 165, tier: 24, note: null },
    { id: 3, name: 'A100 80GB', category: 'cloud', vram_gb: 80, memory_bandwidth_gbps: 2039, fp16_tflops: 39, tier: 80, note: null },
  ]

  it('给显存刚够的最小卡', () => {
    const s = suggestGpu(gpus, 16)
    expect(s?.gpu.id).toBe(2) // 4090 24GB（8GB 不够，4090 是刚够的最小）
  })

  it('排除当前卡', () => {
    const s = suggestGpu(gpus, 16, 2)
    expect(s?.gpu.id).toBe(3)
  })

  it('都放不下 → 最大卡 + fits=false', () => {
    const s = suggestGpu(gpus, 200)
    expect(s?.gpu.id).toBe(3)
    expect(s?.fits).toBe(false)
  })

  it('无候选卡 → null', () => {
    expect(suggestGpu([], 16)).toBeNull()
  })
})

describe('分级阈值与 TIER_DEFS 对齐', () => {
  it('档位 key 类型安全', () => {
    const tier: TierKey = computeTierResult(makeModel(), GPU_4090, 8192, 0.5).tier
    expect(['smooth', 'ok', 'tight', 'no']).toContain(tier)
  })
})
