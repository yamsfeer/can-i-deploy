/**
 * Vitest 配置。
 * - node 环境（Node 24 内置 node:sqlite / fetch / undici）
 * - @can-i-deploy/shared 走源码（与 tsx/tsconfig paths 一致），避免依赖构建产物
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@can-i-deploy/shared': sharedSrc,
    },
  },
  test: {
    environment: 'node',
    // 每文件独立 fork，隔离模块级单例（getDb 等），避免测试间库状态互相污染
    pool: 'forks',
    isolate: true,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/app.ts', 'src/sync/run.ts'],
    },
  },
})
