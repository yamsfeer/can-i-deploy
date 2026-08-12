/**
 * E2E 辅助：以子进程拉起真实后端（backend/e2e/server.ts），等待就绪并返回 base URL。
 *
 * 前端数据层（api client / hooks）通过真实 HTTP 访问它，从而验证
 * 「前端 → 真实网络请求 → Fastify 路由 → 预测引擎 → SQLite」整条链路。
 * 这里刻意用子进程而非同进程 import：保证后端以真实进程、真实端口方式跑起来，
 * 与正式 `pnpm --filter backend dev` 一致；前端测试文件也不再依赖后端内部模块。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 注意：不要用 `new URL(相对路径, import.meta.url)` 构造路径——Vite 会把这种
// "资源引用"模式特殊改写，在 vitest 转换下会得到非 file: scheme 的 URL。
// 这里用 fileURLToPath(import.meta.url) + path 工具手动拼接，稳定可靠。
const HERE = dirname(fileURLToPath(import.meta.url)) // .../packages/frontend/e2e
const BACKEND_DIR = resolve(HERE, '../../backend')
const E2E_SERVER_TS = join(BACKEND_DIR, 'e2e/server.ts')
const TSX_BIN = join(BACKEND_DIR, 'node_modules/.bin/tsx')

const READY_TIMEOUT_MS = 20_000
/** close() 等待子进程退出的上限（SIGTERM 后应瞬时退出，兜底防挂起） */
const CLOSE_TIMEOUT_MS = 3_000

export interface E2eBackend {
  /** 后端完整地址，如 http://127.0.0.1:34567 */
  baseUrl: string
  close: () => Promise<void>
}

/** 拉起真实后端进程并等待其把端口写入 E2E_PORT_FILE（就绪信号） */
export async function startE2eBackend(): Promise<E2eBackend> {
  const dir = mkdtempSync(join(tmpdir(), 'can-i-deploy-e2e-'))
  const portFile = join(dir, 'port.json')

  const child = spawn(TSX_BIN, [E2E_SERVER_TS], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_PATH: ':memory:', E2E_PORT_FILE: portFile },
    // stdin/out 丢弃：就绪信息走文件而非 stdout（避免与 fastify 日志竞争解析）
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  let exitInfo: string | null = null
  child.on('exit', (code, signal) => {
    exitInfo = `code=${code} signal=${signal ?? 'SIGTERM'}`
  })

  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  try {
    const port = await waitForPortFile(portFile, READY_TIMEOUT_MS, () => exitInfo)
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      close: () => closeBackend(child, dir, () => exitInfo),
    }
  } catch (err) {
    child.kill('SIGKILL')
    rmSync(dir, { recursive: true, force: true })
    const detail = stderr.trim() ? `，stderr:\n${stderr.trim()}` : ''
    throw new Error(
      `${(err as Error).message}${exitInfo ? `（子进程已退出 ${exitInfo}）` : ''}${detail}`,
    )
  }
}

async function waitForPortFile(
  path: string,
  timeoutMs: number,
  exitInfo: () => string | null,
): Promise<number> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (existsSync(path)) {
      try {
        const { port } = JSON.parse(readFileSync(path, 'utf-8')) as { port: number }
        return port
      } catch {
        // 文件仍在写入中，稍后重读
      }
    }
    if (exitInfo() !== null) throw new Error('后端 E2E 进程提前退出')
    if (Date.now() > deadline) throw new Error(`后端 E2E 进程启动超时（${timeoutMs}ms）`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function closeBackend(
  child: ChildProcess,
  dir: string,
  exitInfo: () => string | null,
): Promise<void> {
  if (exitInfo() === null) child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    if (exitInfo() !== null) return resolve()
    const timer = setTimeout(resolve, CLOSE_TIMEOUT_MS)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  rmSync(dir, { recursive: true, force: true })
}
