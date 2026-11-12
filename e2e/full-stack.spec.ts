/**
 * 全栈冒烟测试：真实后端（磁盘库 + 真实模型）↔ 真实前端 UI。
 * 覆盖用户反馈的关键回归：选大显存显卡时模型数必须 > 0（空库 bug 已由数据管道修复）。
 */
import { test, expect } from '@playwright/test'

test.describe('首页 · 模型目录（真实数据）', () => {
  test('模型列表渲染非空，表头正确', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })

    const headers = await page.locator('table.grid th').allTextContents()
    expect(headers.map((h) => h.trim())).toEqual(['模型', '参数量', '量化档', '分级', 'VRAM 需求', '速度', '下载量'])
    expect(await page.locator('table.grid tbody tr').count()).toBeGreaterThan(0)
  })

  test('回归：选择大显存显卡（RTX 5090）模型数仍 > 0', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })

    const v5090 = await page
      .locator('#gpu-select option', { hasText: 'RTX 5090' })
      .getAttribute('value')
    expect(v5090).not.toBeNull()
    await page.selectOption('#gpu-select', v5090!)
    // 等待重新请求完成后列表仍有数据
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })
    const rows = await page.locator('table.grid tbody tr').count()
    expect(rows).toBeGreaterThan(0)
    // 摘要块应显示 5090 的带宽 / FP16
    await expect(page.locator('#picker-summary')).toContainText('1792')
  })

  test('搜索模型名过滤', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })

    await page.fill('#search-input', 'DeepSeek')
    // 搜索有 400ms 防抖 + 请求往返：轮询直到所有行命中（且非空）
    await expect
      .poll(
        async () => {
          const names = await page.locator('table.grid tbody tr .cell-model .name').allTextContents()
          return names.length > 0 && names.every((n) => n.toLowerCase().includes('deepseek'))
        },
        { timeout: 15_000 },
      )
      .toBe(true)
  })

  test('类型 tab 切换（LLM / VLM / 图像生成）', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })

    // LLM / VLM：真实库当前必有数据（前 11 组织同步结果）
    for (const tab of ['VLM', 'LLM']) {
      await page.click(`button[role="tab"]:has-text("${tab}")`)
      await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })
      const count = await page.locator('table.grid tbody tr').count()
      expect(count).toBeGreaterThan(0)
    }

    // 图像生成：全量同步后才有（Stability AI / BFL 在组织名单尾部）；
    // 当前允许空状态，但页面必须正常渲染（不报错、有提示文案）
    await page.click('button[role="tab"]:has-text("图像生成")')
    const rows = await page.locator('table.grid tbody tr').count()
    if (rows === 0) {
      await expect(page.locator('.empty')).toBeVisible({ timeout: 20_000 })
    }
  })

  test('自定义显存开关：输入显存后列表刷新', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })

    // switch 的 input 视觉隐藏（opacity:0），点击可见的 label 触发切换
    await page.locator('label.switch').click()
    await page.fill('input[aria-label*="自定义显存"]', '24')
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })
    expect(await page.locator('table.grid tbody tr').count()).toBeGreaterThan(0)
  })
})

test.describe('模型详情页', () => {
  test('从列表进入详情，量化表渲染，分级列有内容', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })

    const firstName = await page
      .locator('table.grid tbody tr .cell-model .name')
      .first()
      // 名字位于 monogram span 之后的文本节点（避免 textContent 拼接 monogram）
      .evaluate((el) => el.childNodes[el.childNodes.length - 1].textContent?.trim() ?? '')
    await page.locator('table.grid tbody tr .cell-model a').first().click()

    await expect(page.locator('.detail-head h1')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.detail-head h1')).toHaveText(firstName!.trim())
    // 量化表：LLM 固定 5 档（缺档显示"官方未发布"）
    await expect(page.locator('.quant-table tbody tr')).toHaveCount(5)
    // 至少有一个可用档位（真实官方量化）
    const available = await page.locator('.quant-table tbody tr:not(.unavailable)').count()
    expect(available).toBeGreaterThan(0)
  })

  test('上下文滑块联动：KV 估算随之更新', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table.grid tbody tr').first()).toBeVisible({ timeout: 20_000 })
    await page.locator('table.grid tbody tr .cell-model a').first().click()
    await expect(page.locator('.ctx-slider')).toBeVisible({ timeout: 20_000 })

    const before = (await page.locator('.kv-est').textContent()) ?? ''
    await page.locator('.ctx-slider').fill('16')
    await expect
      .poll(async () => (await page.locator('.kv-est').textContent()) ?? '', { timeout: 10_000 })
      .not.toBe(before)
  })
})

test.describe('硬件页 & 分档说明页', () => {
  test('硬件页：三类别分组表渲染', async ({ page }) => {
    await page.goto('/hardware')
    await expect(page.locator('.cat-section h2').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.cat-section')).toHaveCount(3)
    await expect(page.locator('.hw-table tbody tr').first()).toBeVisible()
    await expect(page.locator('.hw-table tbody tr')).toHaveCount(22)
  })

  test('分档页：4 档卡片 + 阈值表 + 白名单组织', async ({ page }) => {
    await page.goto('/tiers')
    await expect(page.locator('.tier-card')).toHaveCount(4)
    await expect(page.locator('.threshold-table tbody tr')).toHaveCount(4)
    await expect(page.locator('.org-chip').first()).toBeVisible()
    // 白名单组织来自真实接口（Qwen / DeepSeek / Meta 等）
    const chips = await page.locator('.org-chip').allTextContents()
    expect(chips.join(' ')).toContain('Qwen')
    expect(chips.join(' ')).toContain('Meta')
  })
})

test.describe('导航与全局', () => {
  test('顶部导航切换页面，active 态正确', async ({ page }) => {
    await page.goto('/')
    await page.click('.nav a:has-text("硬件")')
    await expect(page).toHaveURL(/\/hardware$/)
    await expect(page.locator('.nav a.active')).toHaveText('硬件')

    await page.click('.nav a:has-text("分档说明")')
    await expect(page).toHaveURL(/\/tiers$/)
    await expect(page.locator('.nav a.active')).toHaveText('分档说明')

    await page.click('.nav a:has-text("模型")')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.nav a.active')).toHaveText('模型')
  })

  test('不存在的模型 → 404 页', async ({ page }) => {
    await page.goto('/model/999999')
    await expect(page.locator('.not-found')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.not-found h1')).toHaveText('模型不存在')
  })
})
