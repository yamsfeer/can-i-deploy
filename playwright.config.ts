/**
 * Playwright 全栈 E2E 配置 —— 真实后端（磁盘库）+ 真实前端（Vite 代理）+ 无头 Chromium。
 *
 * 与 frontend/e2e（vitest 数据层链路）的区别：
 * - vitest e2e：内存库 + seed 演示数据，验证「数据层 hooks → 真实 HTTP」链路
 * - 本 Playwright e2e：真实产品库（含 M2 管道抓取的真实模型）+ 完整 UI 交互
 *
 * 数据前置：global-setup 检查模型表，为空时触发小规模真实同步（SYNC_ORG_LIMIT=2）。
 * 运行：pnpm test:e2e:ui（需先装浏览器：pnpm exec playwright install chromium）
 */
import { defineConfig } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // 全栈串行：避免并发请求打爆本地源 API / SQLite 锁
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
  },
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      // 真实后端：磁盘库 + 定时任务（端口 3001，Vite 代理目标）
      command: 'pnpm --filter @can-i-deploy/backend exec tsx src/index.ts',
      url: 'http://127.0.0.1:3001/api/tiers',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // 真实前端：Vite dev（/api 代理到 3001）
      command: 'pnpm exec vite --host 127.0.0.1 --port 5173',
      cwd: './packages/frontend',
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
