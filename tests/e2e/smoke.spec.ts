import { expect, test } from '@playwright/test'

/**
 * 最小冒烟用例：根路径应重定向到简历工作台。
 * 只校验路由契约，不断言数据库里的业务数据，避免把 E2E 变成数据快照测试。
 */
test('根路径重定向到简历工作台', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/resume\//)
})
