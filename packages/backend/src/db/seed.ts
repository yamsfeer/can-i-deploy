/**
 * 初始化 seed 数据：
 * 1. 白名单组织（来自 shared ORGANIZATIONS）
 * 2. curated GPU 硬件库（手工维护规格表，口径统一：fp16_tflops ≈ 2×fp32 CUDA TFLOPS）
 * 3. 代表性 demo 模型 + 官方量化（真实结构参数，用于 M1~M4 联调；M2 同步管道会接管真实数据）
 *
 * 幂等：可重复执行。
 * 运行：pnpm --filter @can-i-deploy/backend seed
 */
import { ORGANIZATIONS } from '@can-i-deploy/shared'
import { getDb } from './index.js'
import type { KvCacheType, ModelType, QuantName } from '@can-i-deploy/shared'

const db = getDb()

// ---------- 1. 白名单组织 ----------
{
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO organizations (name, hf_author, modelscope_org, note) VALUES (?, ?, ?, ?)',
  )
  for (const o of ORGANIZATIONS) stmt.run(o.name, o.hf_author, o.modelscope_org, null)
}

// ---------- 2. curated GPU 硬件库 ----------
interface GpuSeed {
  name: string
  category: 'consumer' | 'pro' | 'cloud'
  vram_gb: number
  bandwidth: number
  fp16: number
  tier: number
  note?: string
}

const GPUS: GpuSeed[] = [
  // 消费级
  { name: 'RTX 4060', category: 'consumer', vram_gb: 8, bandwidth: 272, fp16: 30.2, tier: 8 },
  { name: 'RTX 3060 12GB', category: 'consumer', vram_gb: 12, bandwidth: 360, fp16: 25.4, tier: 12 },
  { name: 'RTX 3080', category: 'consumer', vram_gb: 10, bandwidth: 760, fp16: 59.6, tier: 8 },
  { name: 'RTX 2080 Ti', category: 'consumer', vram_gb: 11, bandwidth: 616, fp16: 27, tier: 8 },
  { name: 'RTX 4070', category: 'consumer', vram_gb: 12, bandwidth: 504, fp16: 58.4, tier: 12 },
  { name: 'RTX 4060 Ti 16GB', category: 'consumer', vram_gb: 16, bandwidth: 288, fp16: 44.2, tier: 16 },
  { name: 'RTX 4070 Ti Super', category: 'consumer', vram_gb: 16, bandwidth: 672, fp16: 88.8, tier: 16 },
  { name: 'RTX 4080 Super', category: 'consumer', vram_gb: 16, bandwidth: 736, fp16: 104.8, tier: 16 },
  { name: 'RTX 3090', category: 'consumer', vram_gb: 24, bandwidth: 936, fp16: 71.2, tier: 24 },
  { name: 'RTX 4090', category: 'consumer', vram_gb: 24, bandwidth: 1008, fp16: 165.2, tier: 24 },
  { name: 'RTX 5090', category: 'consumer', vram_gb: 32, bandwidth: 1792, fp16: 209.6, tier: 32 },
  // 专业级
  { name: 'V100 16GB', category: 'pro', vram_gb: 16, bandwidth: 900, fp16: 28.2, tier: 16, note: '老一代，HBM2 高带宽' },
  { name: 'RTX A5000', category: 'pro', vram_gb: 24, bandwidth: 768, fp16: 55.6, tier: 24 },
  { name: 'RTX A6000', category: 'pro', vram_gb: 48, bandwidth: 768, fp16: 77.4, tier: 48 },
  { name: 'RTX 6000 Ada', category: 'pro', vram_gb: 48, bandwidth: 960, fp16: 182.2, tier: 48 },
  // 云实例映射
  { name: 'T4 (云)', category: 'cloud', vram_gb: 16, bandwidth: 320, fp16: 16.2, tier: 16, note: '云上入门推理卡，带宽低' },
  { name: 'A10 (云)', category: 'cloud', vram_gb: 24, bandwidth: 600, fp16: 62.4, tier: 24, note: '常见推理卡，对标 RTX 3080Ti~3090 级带宽' },
  { name: 'A16 (云)', category: 'cloud', vram_gb: 64, bandwidth: 256, fp16: 36, tier: 64, note: '4×A2 组合，吞吐型，单卡算力弱' },
  { name: 'L40S (云)', category: 'cloud', vram_gb: 48, bandwidth: 864, fp16: 183.2, tier: 48, note: '新一代推理卡' },
  { name: 'A100 40GB (云)', category: 'cloud', vram_gb: 40, bandwidth: 1555, fp16: 39, tier: 48, note: 'HBM2e 高带宽' },
  { name: 'A100 80GB (云)', category: 'cloud', vram_gb: 80, bandwidth: 2039, fp16: 39, tier: 80, note: 'HBM2e 高带宽' },
  { name: 'H100 80GB (云)', category: 'cloud', vram_gb: 80, bandwidth: 3350, fp16: 134, tier: 80, note: 'HBM3 超高带宽' },
]

{
  const count = db.prepare('SELECT COUNT(*) AS c FROM gpus').get() as { c: number }
  if (count.c === 0) {
    const stmt = db.prepare(
      'INSERT INTO gpus (name, category, vram_gb, memory_bandwidth_gbps, fp16_tflops, tier, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const g of GPUS) stmt.run(g.name, g.category, g.vram_gb, g.bandwidth, g.fp16, g.tier, g.note ?? null)
    console.log(`[seed] 插入 ${GPUS.length} 张 GPU`)
  } else {
    console.log('[seed] GPU 表已存在，跳过')
  }
}

// ---------- 3. demo 模型 ----------
interface ModelSeed {
  source: 'hf' | 'modelscope'
  source_id: string
  org: string
  name: string
  model_type: ModelType
  params: number
  active_params?: number
  context_length: number | null
  architecture: string
  kv_cache_type: KvCacheType
  layers: number
  heads: number
  head_dim: number
  kv_heads: number
  vision_overhead_bytes?: number
  activation_gb?: number
  image_steps?: number
  license: string
  downloads: number
  likes?: number
  quants: QuantName[]
}

const MODELS: ModelSeed[] = [
  {
    source: 'hf', source_id: 'Qwen/Qwen2.5-7B-Instruct', org: 'Qwen', name: 'Qwen2.5-7B-Instruct',
    model_type: 'llm', params: 7.62, context_length: 32768, architecture: 'qwen2', kv_cache_type: 'gqa',
    layers: 28, heads: 28, head_dim: 128, kv_heads: 4, license: 'apache-2.0', downloads: 1_800_000, likes: 12000,
    quants: ['fp16', 'Q8_0', 'Q6_K', 'Q5_K_M', 'Q4_K_M'],
  },
  {
    source: 'modelscope', source_id: 'deepseek-ai/DeepSeek-V3', org: 'DeepSeek', name: 'DeepSeek-V3',
    model_type: 'llm', params: 671, active_params: 37, context_length: 131072, architecture: 'deepseek-v3-mla', kv_cache_type: 'mla',
    layers: 61, heads: 128, head_dim: 128, kv_heads: 1, license: 'deepseek-license', downloads: 620_000, likes: 3000,
    quants: ['fp16'],
  },
  {
    source: 'hf', source_id: 'meta-llama/Llama-3.1-8B-Instruct', org: 'Meta', name: 'Llama-3.1-8B-Instruct',
    model_type: 'llm', params: 8.03, context_length: 131072, architecture: 'llama', kv_cache_type: 'gqa',
    layers: 32, heads: 32, head_dim: 128, kv_heads: 8, license: 'llama3.1', downloads: 3_200_000, likes: 25000,
    quants: ['fp16'],
  },
  {
    source: 'hf', source_id: 'zai-org/GLM-4-9B-Chat', org: 'GLM', name: 'GLM-4-9B-Chat',
    model_type: 'llm', params: 9.3, context_length: 131072, architecture: 'glm4', kv_cache_type: 'gqa',
    layers: 40, heads: 32, head_dim: 128, kv_heads: 2, license: 'glm-4', downloads: 950_000, likes: 8000,
    quants: ['fp16', 'Q4_K_M'],
  },
  {
    source: 'hf', source_id: 'Qwen/Qwen2.5-VL-7B-Instruct', org: 'Qwen', name: 'Qwen2.5-VL-7B-Instruct',
    model_type: 'vlm', params: 8.3, context_length: 32768, architecture: 'qwen2-vl', kv_cache_type: 'gqa',
    layers: 28, heads: 28, head_dim: 128, kv_heads: 4, vision_overhead_bytes: 1.6e9, license: 'apache-2.0',
    downloads: 420_000, likes: 4000, quants: ['fp16', 'Q4_K_M'],
  },
  {
    source: 'hf', source_id: 'OpenGVLab/InternVL3-8B', org: 'BAAI', name: 'InternVL3-8B',
    model_type: 'vlm', params: 8.1, context_length: 32768, architecture: 'internvl3', kv_cache_type: 'gqa',
    layers: 32, heads: 32, head_dim: 128, kv_heads: 8, vision_overhead_bytes: 1.4e9, license: 'mit',
    downloads: 110_000, likes: 900, quants: ['fp16'],
  },
  {
    source: 'hf', source_id: 'stabilityai/stable-diffusion-xl-base-1.0', org: 'Stability AI', name: 'Stable Diffusion XL',
    model_type: 'image', params: 3.5, context_length: null, architecture: 'sdxl', kv_cache_type: 'mha',
    layers: 0, heads: 0, head_dim: 0, kv_heads: 0, activation_gb: 1.6, image_steps: 30, license: 'sdxl-1.0',
    downloads: 1_050_000, likes: 20000, quants: ['fp16', 'fp8'],
  },
  {
    source: 'hf', source_id: 'black-forest-labs/FLUX.1-schnell', org: 'Black Forest Labs', name: 'FLUX.1-schnell',
    model_type: 'image', params: 12, context_length: null, architecture: 'flux', kv_cache_type: 'mha',
    layers: 0, heads: 0, head_dim: 0, kv_heads: 0, activation_gb: 2.5, image_steps: 4, license: 'apache-2.0',
    downloads: 780_000, likes: 15000, quants: ['fp16', 'fp8'],
  },
]

const insertModel = db.prepare(
  `INSERT INTO models
    (source, source_id, org, name, model_type, params, active_params, context_length, architecture,
     kv_cache_type, num_layers, num_heads, head_dim, kv_heads, vision_overhead_bytes, activation_gb,
     image_steps, license, downloads, likes, url)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(source, source_id) DO UPDATE SET
     name=excluded.name, model_type=excluded.model_type, params=excluded.params,
     active_params=excluded.active_params, context_length=excluded.context_length,
     architecture=excluded.architecture, kv_cache_type=excluded.kv_cache_type,
     num_layers=excluded.num_layers, num_heads=excluded.num_heads, head_dim=excluded.head_dim,
     kv_heads=excluded.kv_heads, vision_overhead_bytes=excluded.vision_overhead_bytes,
     activation_gb=excluded.activation_gb, image_steps=excluded.image_steps, license=excluded.license,
     downloads=excluded.downloads, likes=excluded.likes, updated_at=datetime('now')`,
)

const getModelId = db.prepare('SELECT id FROM models WHERE source = ? AND source_id = ?')

const insertQuant = db.prepare(
  `INSERT INTO quantizations (model_id, format, quant_name, bits_per_param, weight_bytes, official, url, downloads)
   VALUES (?, ?, ?, ?, ?, 1, ?, ?)
   ON CONFLICT(model_id, quant_name) DO NOTHING`,
)

const BITS: Record<QuantName, number> = {
  fp16: 2.0, fp8: 1.0, Q8_0: 1.0, Q6_K: 0.75, Q5_K_M: 0.625, Q4_K_M: 0.5,
}

for (const m of MODELS) {
  const baseUrl =
    m.source === 'hf'
      ? `https://huggingface.co/${m.source_id}`
      : `https://modelscope.cn/models/${m.source_id}`
  insertModel.run(
    m.source, m.source_id, m.org, m.name, m.model_type, m.params, m.active_params ?? m.params,
    m.context_length, m.architecture, m.kv_cache_type, m.layers, m.heads, m.head_dim, m.kv_heads,
    m.vision_overhead_bytes ?? null, m.activation_gb ?? null, m.image_steps ?? null,
    m.license, m.downloads, m.likes ?? null, baseUrl,
  )
  const row = getModelId.get(m.source, m.source_id) as { id: number }
  for (const q of m.quants) {
    const bits = BITS[q]
    const weightBytes = Math.round((m.params * 1e9 * bits) / 8)
    const fmt = q === 'fp16' || q === 'fp8' ? 'safetensors' : 'gguf'
    insertQuant.run(row.id, fmt, q, bits, weightBytes, baseUrl, Math.round(m.downloads * 0.1))
  }
}
console.log(`[seed] 插入 ${MODELS.length} 个 demo 模型及官方量化`)

// ---------- 结果预览 ----------
{
  const m = db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }
  const q = db.prepare('SELECT COUNT(*) AS c FROM quantizations').get() as { c: number }
  const g = db.prepare('SELECT COUNT(*) AS c FROM gpus').get() as { c: number }
  console.log(`[seed] 完成：${g.c} GPU / ${m.c} 模型 / ${q.c} 量化条目`)
}
