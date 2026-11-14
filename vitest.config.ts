import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    // 纯函数单测不需要 DOM / jsdom，node 环境启动更快
    environment: 'node',
    include: ['tests/unit/**/*.{test,spec}.ts'],
    // E2E 由 Playwright 单独运行，避免 vitest 误收集 spec 文件
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})
