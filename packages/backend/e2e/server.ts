/**
 * E2E 专用后端进程：内存 SQLite + seed 演示数据 + 真实 HTTP 监听（port 0 自动分配）。
 *
 * 由 packages/frontend/e2e 测试以子进程方式拉起，验证「前端数据层 → 真实 HTTP →
 * 真实 DB + 预测引擎」整条链路跑通。这不是正式服务入口（正式入口见 src/index.ts，
 * 含磁盘库 + 定时同步），这里刻意去掉定时任务与磁盘写，保证测试快速、离线、可重复。
 *
 * 启动流程：
 *   1. DATABASE_PATH=:memory:（内存库，不触碰仓库里的数据文件）
 *   2. 副作用导入 seed.ts（产品基础数据：22 GPU / 20 白名单组织）
 *      + 显式调用 seedDemoModels()（演示模型，仅测试环境，见 src/db/demo-models.ts）
 *   3. buildApp 监听随机空闲端口
 *   4. 将 { "port": N } 写入 E2E_PORT_FILE（父进程轮询该文件感知就绪）
 *   5. 保持运行，收到 SIGTERM / SIGINT 时优雅关闭
 */
import { writeFileSync } from 'node:fs'
import { buildApp } from '../src/app.js'
import '../src/db/seed.js' // 副作用：向内存库写入产品基础数据（GPU / 组织）
import { seedDemoModels } from '../src/db/demo-models.js' // 演示模型：仅测试环境

seedDemoModels()

const app = buildApp()
await app.listen({ port: 0, host: '127.0.0.1' })

const addr = app.server.address()
if (!addr || typeof addr === 'string') {
  throw new Error('未能获取监听端口')
}
const port = addr.port
const portFile = process.env.E2E_PORT_FILE
if (portFile) writeFileSync(portFile, JSON.stringify({ port }))
console.log(`[e2e] 后端就绪 → http://127.0.0.1:${port}`)

const shutdown = async (): Promise<void> => {
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
