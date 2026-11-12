/**
 * 初始化产品基础数据（不含任何演示/mock 模型）：
 * 1. 白名单组织（来自 shared ORGANIZATIONS，订阅对象，产品数据）
 * 2. curated GPU 硬件库（手工维护规格表，产品数据）
 *
 * ⚠️ 模型数据不在此处初始化：真实模型由 M2 数据管道（src/sync/）从
 * Hugging Face / ModelScope 抓取入库；演示模型只存在于测试代码
 * （src/db/demo-models.ts，仅供 e2e/单测使用），绝不写入产品数据库。
 *
 * 幂等：可重复执行。
 * 运行：pnpm --filter @can-i-deploy/backend seed
 */
import { ORGANIZATIONS } from '@can-i-deploy/shared'
import { getDb } from './index.js'

const db = getDb()

// ---------- 1. 白名单组织 ----------
{
  const stmt = db.prepare(
    `INSERT INTO organizations (name, hf_author, modelscope_org, note) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       hf_author=excluded.hf_author, modelscope_org=excluded.modelscope_org, note=excluded.note`,
  )
  for (const o of ORGANIZATIONS) stmt.run(o.name, o.hf_author, o.modelscope_org, null)
  console.log(`[seed] 白名单组织 ${ORGANIZATIONS.length} 个（upsert，含 HF/MS 两侧 ID 映射）`)
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

// ---------- 结果预览 ----------
{
  const o = db.prepare('SELECT COUNT(*) AS c FROM organizations').get() as { c: number }
  const g = db.prepare('SELECT COUNT(*) AS c FROM gpus').get() as { c: number }
  const m = db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }
  console.log(`[seed] 完成：${o.c} 组织 / ${g.c} GPU / ${m.c} 模型（模型由 M2 数据管道抓取，此处不初始化）`)
}
