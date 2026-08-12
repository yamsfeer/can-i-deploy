/**
 * 手动触发全量同步（CLI）。
 * 运行：pnpm --filter @can-i-deploy/backend sync:run
 * 收敛请求量示例：
 *   SYNC_ORG_LIMIT=2 SYNC_MAX_MODELS_PER_ORG=3 pnpm --filter @can-i-deploy/backend sync:run
 */
import { initDb } from '../db/index.js'
import { runSync } from './index.js'

initDb()
const summary = await runSync()
console.log(`\n=== 同步摘要 ===`)
console.log(`状态: ${summary.status}`)
console.log(`组织: ${summary.orgs} | 候选: ${summary.candidates} | 新增: ${summary.inserted} | 量化: ${summary.quantRows}`)
if (summary.skipped.length > 0) {
  console.log('跳过:')
  for (const s of summary.skipped) console.log(`  ${s.reason} ×${s.count}`)
}
if (summary.errors.length > 0) {
  console.log(`错误 (${summary.errors.length}):`)
  for (const e of summary.errors.slice(0, 10)) console.log(`  ${e}`)
}
