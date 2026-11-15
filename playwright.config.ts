import { defineConfig, devices } from '@playwright/test'

/**
 * 端到端冒烟测试配置。
 *
 * 运行前需准备本地环境（.env + `npm run db:setup`），首次还需
 * `npx playwright install chromium`。`npm test` 只跑 vitest 纯函数单测，
 * 不会触发这里的 webServer。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // 冒烟只验证页面路由本身，登录鉴权另有单测覆盖。
    // 关掉全站拦截，否则未登录访问根路径会先跳 /login，断言必然失败。
    env: { AUTH_ENABLED: 'false' },
  },
})
