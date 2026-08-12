/**
 * REST API 集成测试（fastify inject + 内存 SQLite seed）。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { getDb } from '../src/db/index.js'
import { useMemoryDb } from './helpers.js'

useMemoryDb()

let app: ReturnType<typeof buildApp>

beforeAll(async () => {
  const db = getDb()
  // 清空相关表，保证文件可重复运行（内存库可能与其他 DB 测试共享 worker 状态）
  db.exec('DELETE FROM quantizations; DELETE FROM models; DELETE FROM gpus;')
  const gs = db.prepare('SELECT id, name, vram_gb FROM gpus').all()
  console.error('[debug] gpus rows:', JSON.stringify(gs))
  db.exec(`INSERT INTO gpus (name, category, vram_gb, memory_bandwidth_gbps, fp16_tflops, tier, note) VALUES
    ('RTX 4060', 'consumer', 8, 272, 30, 8, NULL),
    ('RTX 4090', 'consumer', 24, 1008, 165, 24, NULL)`)
  db.exec(`INSERT INTO models
    (source, source_id, org, name, model_type, params, active_params, context_length,
     architecture, kv_cache_type, num_layers, num_heads, head_dim, kv_heads,
     license, downloads, likes, url)
    VALUES
    ('hf', 'Qwen/Qwen2.5-7B-Instruct', 'Qwen', 'Qwen2.5-7B-Instruct', 'llm', 7.62, 7.62, 32768,
     'qwen2', 'gqa', 28, 28, 128, 4, 'apache-2.0', 1000, 100, 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct'),
    ('hf', 'Qwen/Qwen3-8B', 'Qwen', 'Qwen3-8B', 'llm', 8.19, 8.19, 40960,
     'qwen2', 'gqa', 36, 32, 128, 8, 'apache-2.0', 5000, 50, 'https://huggingface.co/Qwen/Qwen3-8B')`)

  const modelId = (db.prepare("SELECT id FROM models WHERE source_id = ?").get('Qwen/Qwen2.5-7B-Instruct') as { id: number }).id
  db.prepare(
    `INSERT INTO quantizations (model_id, format, quant_name, bits_per_param, weight_bytes, official, url, downloads)
     VALUES (?, 'safetensors', 'fp16', 2.0, ?, 1, ?, 100)`,
  ).run(modelId, 7.62 * 1e9 * 2, 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct')

  app = buildApp()
  await app.ready()
})

describe('基础接口', () => {
  it('GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  it('GET /api/hardware → GPU 列表', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/hardware' })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data).toHaveLength(2)
    expect(data.map((g: { name: string }) => g.name)).toContain('RTX 4090')
  })

  it('GET /api/tiers → 4 档定义', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tiers' })
    const { data } = res.json()
    expect(data).toHaveLength(4)
    expect(data.map((t: { key: string }) => t.key)).toEqual(['smooth', 'ok', 'tight', 'no'])
  })

  it('GET /api/organizations → 数组', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/organizations' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().data)).toBe(true)
  })
})

describe('GET /api/models 列表', () => {
  it('返回模型 + badge（有量化 → fp16 档，weight 已修正）', async () => {
    // 用 q 过滤确保取到带量化的 Qwen2.5-7B（而非 downloads 更高的 Qwen3-8B）
    const res = await app.inject({
      method: 'GET',
      url: '/api/models?type=llm&gpu_id=2&q=Qwen2.5-7B&limit=1',
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data).toHaveLength(1)
    const m = data[0]
    expect(m.badgeQuant).toBe('fp16')
    expect(m.badge.tier).toBe('smooth')
    // fp16 7.62B → weightGb ≈ 15.24（回归 ÷8 bug）
    expect(m.badge.weightGb).toBeCloseTo(15.24, 1)
  })

  it('无量化档的模型 → badge=null', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/models?type=llm&q=Qwen3-8B&limit=1',
    })
    const m = res.json().data[0]
    expect(m.badge).toBeNull()
    expect(m.badgeQuant).toBeNull()
  })

  it('gpu_id=1（4060 8GB）时 Qwen2.5-7B fp16 放不下 → tier=no', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/models?type=llm&gpu_id=1&q=Qwen2.5-7B&limit=1',
    })
    expect(res.json().data[0].badge.tier).toBe('no')
  })

  it('类型过滤：非 llm 类型返回空', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/models?type=image' })
    expect(res.json().data).toHaveLength(0)
  })
})

describe('GET /api/models/:id 详情', () => {
  let id: number
  beforeAll(() => {
    id = (getDb().prepare("SELECT id FROM models WHERE source_id = ?").get('Qwen/Qwen2.5-7B-Instruct') as { id: number }).id
  })

  it('量化表按档位展开，无官方数据留空', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/models/${id}?gpu_id=2&context=8192` })
    expect(res.statusCode).toBe(200)
    const d = res.json().data
    expect(d.quantizations).toHaveLength(5) // fp16 + Q8/Q6/Q5/Q4
    const fp16 = d.quantizations.find((q: { quantName: string }) => q.quantName === 'fp16')
    expect(fp16.available).toBe(true)
    expect(fp16.vramGb).toBeGreaterThan(15) // 15.24 + kv + overhead
    const q4 = d.quantizations.find((q: { quantName: string }) => q.quantName === 'Q4_K_M')
    expect(q4.available).toBe(false)
    expect(q4.tier).toBe('no')
  })

  it('换卡建议：4060 放不下 → 建议 4090（显存刚够的最小卡）', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/models/${id}?gpu_id=1` })
    const d = res.json().data
    expect(d.suggestedGpu).not.toBeNull()
    expect(d.suggestedGpu.name).toBe('RTX 4090')
    expect(d.suggestedFits).toBe(true)
  })

  it('放得下时无换卡建议', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/models/${id}?gpu_id=2` })
    expect(res.json().data.suggestedGpu).toBeNull()
  })

  it('不存在 → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/models/999999' })
    expect(res.statusCode).toBe(404)
  })
})
