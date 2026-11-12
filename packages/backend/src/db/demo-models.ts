/**
 * 测试 / E2E 专用演示模型数据 —— 只存在于测试代码，绝不写入产品数据库。
 *
 * 背景（2026-08-14）：产品数据库（packages/backend/data/*.db）只允许两类数据：
 *   1. 手工维护的产品基础数据（GPU 硬件库 / 白名单组织，见 seed.ts）
 *   2. M2 数据管道从 Hugging Face / ModelScope 抓取的真实模型
 * 演示模型原本混在 seed.ts 里，会随 `pnpm seed` 进入真实库。已拆出：
 * 本文件仅在测试进程中使用（e2e/server.ts 显式调用），保证真实库不被 mock 污染。
 *
 * 用法：
 *   import { seedDemoModels } from './demo-models.js'
 *   seedDemoModels()   // 需先 initDb（内存库或临时库）
 */
import { getDb } from './index.js'
import type { KvCacheType, ModelType, QuantName } from '@can-i-deploy/shared'

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

/** 向当前数据库连接写入 8 个演示模型及官方量化（幂等 upsert，可重复执行） */
export function seedDemoModels(): void {
  const db = getDb()

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
     ON CONFLICT(model_id, quant_name) DO UPDATE SET
       format=excluded.format, bits_per_param=excluded.bits_per_param,
       weight_bytes=excluded.weight_bytes, url=excluded.url, downloads=excluded.downloads`,
  )

  /** 每参数字节数（PRD §7.1 命名 bits_per_param，实为字节）：fp16=2B、fp8=1B、Q4=0.5B */
  const BYTES_PER_PARAM: Record<QuantName, number> = {
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
      const bytesPerParam = BYTES_PER_PARAM[q]
      const weightBytes = Math.round(m.params * 1e9 * bytesPerParam)
      const fmt = q === 'fp16' || q === 'fp8' ? 'safetensors' : 'gguf'
      insertQuant.run(row.id, fmt, q, bytesPerParam, weightBytes, baseUrl, Math.round(m.downloads * 0.1))
    }
  }
  console.log(`[demo-models] 插入 ${MODELS.length} 个演示模型及官方量化（仅测试环境）`)
}
