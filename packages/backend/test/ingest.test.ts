/**
 * 入库 upsert 测试（内存 SQLite）：新增、更新、量化幂等。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/db/index.js'
import { ingestCandidates } from '../src/sync/ingest.js'
import type { ModelCandidate } from '../src/sync/types.js'
import { useMemoryDb } from './helpers.js'

useMemoryDb()

function makeCandidate(over: Partial<ModelCandidate> = {}): ModelCandidate {
  return {
    source: 'hf',
    source_id: 'Qwen/Qwen3-0.6B',
    org: 'Qwen',
    name: 'Qwen3-0.6B',
    model_type: 'llm',
    params: 0.596,
    active_params: 0.596,
    context_length: 40960,
    architecture: 'qwen2',
    kv_cache_type: 'gqa',
    num_layers: 28,
    num_heads: 16,
    head_dim: 128,
    kv_heads: 8,
    vision_overhead_bytes: null,
    activation_gb: null,
    image_steps: null,
    license: 'apache-2.0',
    downloads: 100,
    likes: 10,
    file_size: null,
    precision: 'fp16',
    url: 'https://huggingface.co/Qwen/Qwen3-0.6B',
    quants: [
      {
        quantName: 'fp16',
        format: 'safetensors',
        bitsPerParam: 2.0,
        weightBytes: 0.596 * 1e9 * 2,
        downloads: null,
        url: 'https://huggingface.co/Qwen/Qwen3-0.6B',
      },
    ],
    ...over,
  }
}

beforeEach(() => {
  const db = getDb()
  db.exec('DELETE FROM quantizations; DELETE FROM models;')
})

describe('ingestCandidates 入库', () => {
  it('新候选：入库并返回新增数', () => {
    const stats = ingestCandidates([makeCandidate()])
    expect(stats.candidates).toBe(1)
    expect(stats.inserted).toBe(1)
    expect(stats.quantRows).toBe(1)

    const row = getDb().prepare('SELECT * FROM models').get() as { source_id: string; params: number }
    expect(row.source_id).toBe('Qwen/Qwen3-0.6B')
    expect(row.params).toBe(0.596)
  })

  it('重复入库（同 source_id）：upsert 不新增，更新 downloads', () => {
    ingestCandidates([makeCandidate({ downloads: 100 })])
    const stats = ingestCandidates([makeCandidate({ downloads: 999 })])
    expect(stats.inserted).toBe(0) // 不新增
    expect(stats.quantRows).toBe(1) // 量化仍写入/更新

    const row = getDb().prepare('SELECT downloads FROM models WHERE source_id=?').get('Qwen/Qwen3-0.6B') as {
      downloads: number
    }
    expect(row.downloads).toBe(999)
  })

  it('相同 (source, source_id) 双源共存不冲突', () => {
    ingestCandidates([
      makeCandidate({ source: 'hf' }),
      makeCandidate({ source: 'modelscope', source_id: 'Qwen/Qwen3-0.6B' }),
    ])
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }
    expect(count.c).toBe(2)
  })

  it('空候选：安全返回', () => {
    const stats = ingestCandidates([])
    expect(stats.candidates).toBe(0)
    expect(stats.inserted).toBe(0)
  })

  it('多量化档：每个模型一条 quant 记录', () => {
    const cand = makeCandidate({
      quants: [
        { quantName: 'fp16', format: 'safetensors', bitsPerParam: 2.0, weightBytes: 1.19e9, downloads: null, url: 'u' },
        { quantName: 'Q4_K_M', format: 'gguf', bitsPerParam: 0.5, weightBytes: 0.3e9, downloads: 5, url: 'u2' },
      ],
    })
    const stats = ingestCandidates([cand])
    expect(stats.quantRows).toBe(2)
    const qs = getDb().prepare('SELECT quant_name FROM quantizations').all() as { quant_name: string }[]
    expect(qs.map((q) => q.quant_name).sort()).toEqual(['Q4_K_M', 'fp16'])
  })

  it('入库后可被 models 主键 UNIQUE(source, source_id) 约束保护', () => {
    ingestCandidates([makeCandidate()])
    // 再次用同一 source+source_id 不同 case 的 ID 不应产生第三行
    ingestCandidates([makeCandidate()])
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }
    expect(count.c).toBe(1)
  })
})
