/**
 * 每日定时任务 + 同步编排（M2 数据管道）。
 * PRD §5.6：每日一次（默认凌晨 03:30，SYNC_CRON 可配），遍历白名单组织 → 双源抓取 → upsert → 记录日志。
 *
 * 运行参数（环境变量，开发/演示时收敛请求量，防打爆源 API）：
 *   SYNC_ORG_LIMIT         处理前 N 个组织（0=全部）
 *   SYNC_MAX_MODELS_PER_ORG 每组织入库模型上限（默认 20，按下载量取头部）
 *   SYNC_SOURCE            'hf' | 'modelscope' | 'both'（默认 both）
 */
import cron from 'node-cron'
import { ORGANIZATIONS } from '@can-i-deploy/shared'
import type { Source } from '@can-i-deploy/shared'
import { getDb } from '../db/index.js'
import { fetchHfOrg } from './clients/hf.js'
import { fetchModelScopeOrg } from './clients/modelscope.js'
import { ingestCandidates } from './ingest.js'
import type { ModelCandidate } from './types.js'

const SYNC_SCHEDULE = process.env.SYNC_CRON ?? '30 3 * * *'

export interface SyncOptions {
  /** 处理前 N 个组织（0=全部） */
  orgLimit?: number
  maxModelsPerOrg?: number
  sources?: Source[]
  signal?: AbortSignal
}

export interface SyncSummary {
  startedAt: string
  finishedAt: string
  status: 'success' | 'partial' | 'failed'
  orgs: number
  candidates: number
  inserted: number
  quantRows: number
  skipped: { reason: string; count: number }[]
  errors: string[]
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

function parseSources(raw?: string): Source[] {
  switch ((raw ?? 'both').toLowerCase()) {
    case 'hf':
      return ['hf']
    case 'modelscope':
      return ['modelscope']
    default:
      return ['hf', 'modelscope']
  }
}

/** 全量同步：遍历白名单组织，双源抓取 → 入库 → 记录 sync_logs */
export async function runSync(options: SyncOptions = {}): Promise<SyncSummary> {
  const db = getDb()
  const startedAt = new Date().toISOString()

  const orgLimit = options.orgLimit ?? envInt('SYNC_ORG_LIMIT', 0)
  const maxModelsPerOrg = options.maxModelsPerOrg ?? envInt('SYNC_MAX_MODELS_PER_ORG', 20)
  const sources = options.sources ?? parseSources(process.env.SYNC_SOURCE)
  const orgs = orgLimit > 0 ? ORGANIZATIONS.slice(0, orgLimit) : [...ORGANIZATIONS]

  const allCandidates: ModelCandidate[] = []
  const skipped: SyncSummary['skipped'] = []
  const errors: string[] = []
  let inserted = 0
  let quantRows = 0

  const pushSkipped = (rows: SyncSummary['skipped']): void => {
    for (const s of rows) {
      const hit = skipped.find((x) => x.reason === s.reason)
      if (hit) hit.count += s.count
      else skipped.push(s)
    }
  }

  for (const org of orgs) {
    if (options.signal?.aborted) break
    console.log(`[sync] 抓取 ${org.name}…`)

    for (const source of sources) {
      if (options.signal?.aborted) break
      const result =
        source === 'hf'
          ? await fetchHfOrg(org.name, org.hf_author, { maxModelsPerOrg, signal: options.signal })
          : await fetchModelScopeOrg(org.name, org.modelscope_org, { maxModelsPerOrg, signal: options.signal })

      if (result.models.length > 0) {
        const stats = ingestCandidates(result.models)
        allCandidates.push(...result.models)
        inserted += stats.inserted
        quantRows += stats.quantRows
        console.log(
          `[sync]   ${source} → 候选 ${stats.candidates}，新增 ${stats.inserted}，量化 ${stats.quantRows}`,
        )
      }
      pushSkipped(result.skipped)
      errors.push(...result.errors.map((e) => `[${source}] ${e}`))
    }
  }

  const finishedAt = new Date().toISOString()
  const status: SyncSummary['status'] =
    allCandidates.length === 0 && errors.length > 0 ? 'failed' : errors.length > 0 ? 'partial' : 'success'

  const message = JSON.stringify({
    orgs: orgs.length,
    candidates: allCandidates.length,
    inserted,
    quantRows,
    skipped,
    errors: errors.slice(0, 20),
  })
  db.prepare(
    'INSERT INTO sync_logs (started_at, finished_at, status, message) VALUES (?, ?, ?, ?)',
  ).run(startedAt, finishedAt, status, message)

  console.log(
    `[sync] 完成（${status}）：${orgs.length} 组织 / ${allCandidates.length} 候选 / 新增 ${inserted} / 量化 ${quantRows} / 错误 ${errors.length}`,
  )
  return { startedAt, finishedAt, status, orgs: orgs.length, candidates: allCandidates.length, inserted, quantRows, skipped, errors }
}

/** 启动每日定时任务（node-cron） */
export function startSyncScheduler(): void {
  if (!cron.validate(SYNC_SCHEDULE)) {
    console.warn(`[sync] 无效的 cron 表达式: ${SYNC_SCHEDULE}`)
    return
  }
  cron.schedule(SYNC_SCHEDULE, async () => {
    console.log('[sync] 触发每日同步…')
    try {
      await runSync()
    } catch (err) {
      console.error('[sync] 同步失败:', err)
      getDb()
        .prepare(
          'INSERT INTO sync_logs (started_at, finished_at, status, message) VALUES (?, ?, ?, ?)',
        )
        .run(new Date().toISOString(), new Date().toISOString(), 'failed', String(err))
    }
  })
  console.log(`[sync] 每日同步已调度（${SYNC_SCHEDULE}）`)
}
