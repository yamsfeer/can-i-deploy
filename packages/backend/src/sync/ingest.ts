/**
 * 入库：ModelCandidate → models / quantizations（upsert，幂等）。
 * models 以 UNIQUE(source, source_id) 冲突更新；quantizations 以 UNIQUE(model_id, quant_name) 冲突更新。
 * 不删除历史模型（curated 目录增量为导向）。
 *
 * 注意：prepared 语句按 getDb() 实例惰性缓存——不在模块顶层绑定连接，
 * 避免测试 resetDb() 换库后旧语句失效（statement has been finalized）。
 */
import type { DatabaseSync } from 'node:sqlite'
import { getDb } from '../db/index.js'
import type { ModelCandidate } from './types.js'

export interface IngestStats {
  /** 本次处理的候选数 */
  candidates: number
  /** 新增模型数（入库前后 count 差） */
  inserted: number
  /** 写入的量化条目数 */
  quantRows: number
}

interface Prepared {
  db: DatabaseSync
  insertModel: ReturnType<DatabaseSync['prepare']>
  getModelId: ReturnType<DatabaseSync['prepare']>
  upsertQuant: ReturnType<DatabaseSync['prepare']>
}

let prepared: Prepared | null = null

function getPrepared(): Prepared {
  const db = getDb()
  if (!prepared || prepared.db !== db) {
    prepared = {
      db,
      insertModel: db.prepare(
        `INSERT INTO models
          (source, source_id, org, name, model_type, params, active_params, context_length,
           architecture, kv_cache_type, num_layers, num_heads, head_dim, kv_heads,
           vision_overhead_bytes, activation_gb, image_steps, license, downloads, likes,
           file_size, precision, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source, source_id) DO UPDATE SET
           org=excluded.org, name=excluded.name, model_type=excluded.model_type,
           params=excluded.params, active_params=excluded.active_params,
           context_length=excluded.context_length, architecture=excluded.architecture,
           kv_cache_type=excluded.kv_cache_type, num_layers=excluded.num_layers,
           num_heads=excluded.num_heads, head_dim=excluded.head_dim,
           kv_heads=excluded.kv_heads, vision_overhead_bytes=excluded.vision_overhead_bytes,
           activation_gb=excluded.activation_gb, image_steps=excluded.image_steps,
           license=excluded.license, downloads=excluded.downloads, likes=excluded.likes,
           file_size=excluded.file_size, precision=excluded.precision, url=excluded.url,
           updated_at=datetime('now')`,
      ),
      getModelId: db.prepare('SELECT id FROM models WHERE source = ? AND source_id = ?'),
      upsertQuant: db.prepare(
        `INSERT INTO quantizations
          (model_id, format, quant_name, bits_per_param, weight_bytes, official, url, downloads)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(model_id, quant_name) DO UPDATE SET
           format=excluded.format, bits_per_param=excluded.bits_per_param,
           weight_bytes=excluded.weight_bytes, url=excluded.url, downloads=excluded.downloads`,
      ),
    }
  }
  return prepared
}

export function ingestCandidates(candidates: ModelCandidate[]): IngestStats {
  const db = getDb()
  const { insertModel, getModelId, upsertQuant } = getPrepared()
  const before = (db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }).c

  let quantRows = 0
  for (const m of candidates) {
    insertModel.run(
      m.source, m.source_id, m.org, m.name, m.model_type, m.params, m.active_params,
      m.context_length, m.architecture, m.kv_cache_type, m.num_layers, m.num_heads,
      m.head_dim, m.kv_heads, m.vision_overhead_bytes, m.activation_gb, m.image_steps,
      m.license, m.downloads, m.likes, m.file_size, m.precision, m.url,
    )
    const row = getModelId.get(m.source, m.source_id) as { id: number }
    for (const q of m.quants) {
      upsertQuant.run(row.id, q.format, q.quantName, q.bitsPerParam, q.weightBytes, q.url, q.downloads)
      quantRows += 1
    }
  }

  const after = (db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }).c
  return { candidates: candidates.length, inserted: after - before, quantRows }
}
