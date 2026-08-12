/**
 * 测试辅助：内存 SQLite。
 * getDb() 为惰性单例，且 vitest 可能复用 worker 进程导致模块级单例跨文件残留，
 * 因此每次切换 DATABASE_PATH 时调用 resetDb() 强制重建全新库。
 */
import { resetDb } from '../src/db/index.js'

export function useMemoryDb(): void {
  process.env.DATABASE_PATH = ':memory:'
  resetDb()
}
