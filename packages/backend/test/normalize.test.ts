/**
 * 归一化测试：类型映射 / 精度兜底 / 候选组装。
 */
import { describe, expect, it } from 'vitest'
import type { ExtractedStructure } from '../src/sync/estimate.js'
import {
  buildHfCandidate,
  buildModelScopeCandidate,
  classifyModelType,
  inferPrecision,
} from '../src/sync/normalize.js'
import type { HfModelSummary, ModelScopeModel } from '../src/sync/types.js'

const STRUCTURE: ExtractedStructure = {
  paramsB: 7.62,
  activeParamsB: 7.62,
  contextLength: 32768,
  architecture: 'qwen2',
  kvCacheType: 'gqa',
  numLayers: 28,
  numHeads: 28,
  headDim: 128,
  kvHeads: 4,
  visionOverheadBytes: null,
}

describe('classifyModelType 类型映射', () => {
  it.each([
    [{ pipelineTag: 'text-generation' }, 'llm'],
    [{ tasks: ['text-generation'] }, 'llm'],
    [{ pipelineTag: 'image-text-to-text' }, 'vlm'],
    [{ tasks: ['image-text-to-text'] }, 'vlm'],
    [{ pipelineTag: 'text-to-image' }, 'image'],
    [{ tasks: ['text-to-image'] }, 'image'],
    [{ pipelineTag: 'text-to-video' }, null], // 二期，一期不收
    [{ pipelineTag: 'automatic-speech-recognition' }, null],
    [{}, null],
  ] as const)('%j → %s', (input, expected) => {
    expect(classifyModelType(input)).toBe(expected)
  })
})

describe('inferPrecision 精度兜底', () => {
  it('≈2 → fp16', () => {
    expect(inferPrecision(7.62 * 1e9 * 2, 7.62)).toBe('fp16')
  })
  it('≈1 → fp8', () => {
    expect(inferPrecision(7.62 * 1e9, 7.62)).toBe('fp8')
  })
  it('≈0.5 → int4', () => {
    expect(inferPrecision(7.62 * 1e9 * 0.5, 7.62)).toBe('int4')
  })
  it('file_size 缺失/为 0 → null', () => {
    expect(inferPrecision(null, 7.62)).toBeNull()
    expect(inferPrecision(0, 7.62)).toBeNull()
  })
})

describe('buildModelScopeCandidate 候选组装', () => {
  const base: ModelScopeModel = {
    id: 'Qwen/Qwen2.5-7B-Instruct',
    display_name: 'Qwen2.5-7B-Instruct',
    downloads: 1000,
    likes: 100,
    license: 'apache-2.0',
    tasks: ['text-generation'],
    params: 7_620_000_000,
  }

  it('params 直给，fp16 档权重 = file_size 纠偏', () => {
    const cand = buildModelScopeCandidate(
      { ...base, file_size: 7_620_000_000 * 2 },
      STRUCTURE,
      'Qwen',
    )!
    expect(cand.params).toBe(7.62)
    expect(cand.source_id).toBe('Qwen/Qwen2.5-7B-Instruct')
    expect(cand.org).toBe('Qwen')
    expect(cand.model_type).toBe('llm')
    expect(cand.precision).toBe('fp16')
    expect(cand.quants).toHaveLength(1)
    expect(cand.quants[0].quantName).toBe('fp16')
    expect(cand.quants[0].weightBytes).toBe(7_620_000_000 * 2) // 用 file_size
    expect(cand.url).toBe('https://modelscope.cn/models/Qwen/Qwen2.5-7B-Instruct')
  })

  it('file_size 显示 fp8 精度时，原版档降为 fp8', () => {
    const cand = buildModelScopeCandidate(
      { ...base, file_size: 7_620_000_000 }, // ≈1B/param
      STRUCTURE,
      'Qwen',
    )!
    expect(cand.precision).toBe('fp8')
    expect(cand.quants[0].quantName).toBe('fp8')
    expect(cand.quants[0].bitsPerParam).toBe(1.0)
  })

  it('无 file_size：权重按 params×bytes 估算', () => {
    const cand = buildModelScopeCandidate(base, STRUCTURE, 'Qwen')!
    expect(cand.quants[0].weightBytes).toBe(7.62 * 1e9 * 2)
  })

  it('params 缺失/为 0 → 返回 null（不可计算）', () => {
    expect(buildModelScopeCandidate({ ...base, params: 0 }, STRUCTURE, 'Qwen')).toBeNull()
    expect(buildModelScopeCandidate({ ...base, params: undefined }, STRUCTURE, 'Qwen')).toBeNull()
  })

  it('非目标类型 → null', () => {
    expect(
      buildModelScopeCandidate({ ...base, tasks: ['text-to-video'] }, STRUCTURE, 'Qwen'),
    ).toBeNull()
  })

  it('image 类型：生成 fp16 档（回归：曾因 image 无档位导致 badge/详情为空）', () => {
    const cand = buildModelScopeCandidate(
      { ...base, id: 'stabilityai/sdxl', tasks: ['text-to-image'], params: 3_500_000_000 },
      STRUCTURE,
      'Stability AI',
    )!
    expect(cand.model_type).toBe('image')
    expect(cand.activation_gb).toBe(1.5)
    expect(cand.image_steps).toBe(30)
    expect(cand.quants).toHaveLength(1)
    expect(cand.quants[0].quantName).toBe('fp16')
  })

  it('display_name 为空时用 id 末段做展示名', () => {
    const cand = buildModelScopeCandidate(
      { ...base, display_name: '' },
      STRUCTURE,
      'Qwen',
    )!
    expect(cand.name).toBe('Qwen2.5-7B-Instruct')
  })
})

describe('buildHfCandidate 候选组装', () => {
  const hf: HfModelSummary = {
    id: 'Qwen/Qwen3-0.6B',
    downloads: 5000,
    likes: 50,
    pipeline_tag: 'text-generation',
    tags: ['transformers', 'qwen3', 'license:apache-2.0'],
  }

  it('参数量取 config 估算，fp16 档，license 从 tags 提取', () => {
    const cand = buildHfCandidate(hf, STRUCTURE, 'Qwen')!
    expect(cand.params).toBe(7.62)
    expect(cand.source).toBe('hf')
    expect(cand.quants[0].quantName).toBe('fp16')
    expect(cand.quants[0].weightBytes).toBe(7.62 * 1e9 * 2)
    expect(cand.url).toBe('https://huggingface.co/Qwen/Qwen3-0.6B')
    expect(cand.license).toBe('apache-2.0')
  })

  it('无 license tag → license 为 null（不崩）', () => {
    const noTag: HfModelSummary = { ...hf, tags: ['transformers'] }
    expect(buildHfCandidate(noTag, STRUCTURE, 'Qwen')!.license).toBeNull()
  })

  it('config 估算失败（params null）→ null', () => {
    const empty: ExtractedStructure = {
      paramsB: null,
      activeParamsB: null,
      contextLength: null,
      architecture: null,
      kvCacheType: null,
      numLayers: null,
      numHeads: null,
      headDim: null,
      kvHeads: null,
      visionOverheadBytes: null,
    }
    expect(buildHfCandidate(hf, empty, 'Qwen')).toBeNull()
  })

  it('VLM：视觉开销取估算值', () => {
    const vlm: HfModelSummary = { ...hf, pipeline_tag: 'image-text-to-text' }
    const cand = buildHfCandidate(vlm, { ...STRUCTURE, visionOverheadBytes: 1e9 }, 'Qwen')!
    expect(cand.vision_overhead_bytes).toBe(1e9)
  })
})
