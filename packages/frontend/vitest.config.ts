/**
 * vitest 配置：与 vite.config.ts 共享 shared 源码 alias，测试环境用 jsdom。
 * 后端 API 一律 mock 全局 fetch（见各测试文件），不改动后端代码。
 */
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@can-i-deploy/shared': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // 只统计应用源码；单测文件、E2E 目录、测试工具与类型声明不算覆盖率
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-utils/**', 'src/vite-env.d.ts'],
    },
  },
})
