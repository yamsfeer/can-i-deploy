/**
 * SQLite 连接与初始化。
 * 使用 Node 24 内置 node:sqlite（DatabaseSync），零原生编译依赖，部署省心。
 * 数据文件默认在 packages/backend/data/，可用环境变量 DATABASE_PATH 覆盖。
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_DB_PATH = resolve(__dirname, '../../data/can-i-deploy.db')

let db: DatabaseSync | null = null

/** 解析数据库文件路径（惰性：getDb 首次创建时读取 env，测试可用 DATABASE_PATH=:memory: 或临时文件） */
export function getDbPath(): string {
  return process.env.DATABASE_PATH ?? DEFAULT_DB_PATH
}

function applySchema(target: DatabaseSync): void {
  const schemaSql = readFileSync(resolve(__dirname, './schema.sql'), 'utf-8')
  target.exec(schemaSql)
}

/** 获取单例数据库连接（首次调用时创建文件 + 应用 schema） */
export function getDb(): DatabaseSync {
  if (!db) {
    const path = getDbPath()
    mkdirSync(dirname(path), { recursive: true })
    const conn = new DatabaseSync(path)
    conn.exec('PRAGMA journal_mode = WAL;')
    conn.exec('PRAGMA foreign_keys = ON;')
    applySchema(conn)
    db = conn
  }
  return db
}

/**
 * 重设单例连接（关闭旧连接并置空）。
 * 用途：测试中切换 DATABASE_PATH 后强制重建，避免 vitest worker 复用进程导致库状态残留。
 */
export function resetDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

/** 应用初始化（启动时调用） */
export function initDb(): DatabaseSync {
  return getDb()
}
