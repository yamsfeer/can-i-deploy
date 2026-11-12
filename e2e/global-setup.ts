/**
 * Playwright 全局前置：确保产品库有真实模型数据。
 * 模型表为空 → 触发一次小规模真实同步（Qwen + DeepSeek 双源），
 * 让测试跑在「真实爬取的数据」上，而非依赖手工准备。
 *
 * 注：不直接 import node:sqlite（Playwright 加载器环境下行为不稳定），
 * 统一走子进程 node --experimental-sqlite 查询，与仓库其他工具一致。
 */
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const DB_PATH = resolve(process.cwd(), 'packages/backend/data/can-i-deploy.db')

function countModels(): number {
  // 单行脚本：避免 JSON.stringify 转义换行导致 node -e 语法错误
  const script =
    `const { DatabaseSync } = require('node:sqlite');` +
    ` const db = new DatabaseSync(${JSON.stringify(DB_PATH)}, { readOnly: true });` +
    ` console.log(db.prepare('SELECT COUNT(*) AS c FROM models').get().c);`
  try {
    const out = execSync(`node --experimental-sqlite -e ${JSON.stringify(script)}`, {
      encoding: 'utf-8',
    })
    return Number(out.trim().split('\n').pop())
  } catch {
    return 0 // 库不存在 / 不可读 → 视为空库
  }
}

export default function globalSetup(): void {
  const count = countModels()

  if (count === 0) {
    console.log('[playwright setup] 产品库无模型，初始化基础数据 + 小规模真实同步（Qwen/DeepSeek 双源）…')
    execSync('pnpm --filter @can-i-deploy/backend seed', { stdio: 'inherit' })
    execSync(
      'SYNC_ORG_LIMIT=2 SYNC_MAX_MODELS_PER_ORG=3 pnpm --filter @can-i-deploy/backend sync:run',
      { stdio: 'inherit', timeout: 300_000 },
    )
  } else {
    console.log(`[playwright setup] 产品库已有 ${count} 个模型，跳过同步`)
  }
}
