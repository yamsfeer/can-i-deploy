/**
 * 每日定时任务（node-cron）。
 * PRD §5.6：每日一次（默认凌晨 03:30），拉取白名单组织 → upsert 模型/量化 → 记录日志。
 * M2 阶段接入真实拉取逻辑，当前记录占位日志。
 */
import cron from 'node-cron'
import { getDb } from '../db/index.js'

const SYNC_SCHEDULE = process.env.SYNC_CRON ?? '30 3 * * *'

export async function runSync(): Promise<string> {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO sync_logs (started_at, finished_at, status, message) VALUES (?, ?, ?, ?)',
  ).run(now, now, 'skipped', 'M2 数据管道未实现，定时同步暂为占位')
  return 'M2 数据管道未实现（占位）'
}

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
    }
  })
  console.log(`[sync] 每日同步已调度（${SYNC_SCHEDULE}）`)
}
