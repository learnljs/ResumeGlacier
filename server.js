/**
 * 自定义服务器入口
 * 在应用启动前设置必要的 polyfill
 */

import { createServer } from 'node:http'
import { createRequire } from 'node:module'

// 在任何其他代码之前设置 polyfill
const { createRequire: cr } = require('module')
const polyfillRequire = cr(__filename)

if (typeof globalThis.process.getBuiltinModule !== 'function') {
  globalThis.process.getBuiltinModule = (name) => {
    try {
      return polyfillRequire(name)
    } catch {
      return undefined
    }
  }
  console.log('[Polyfill] process.getBuiltinModule 已设置')
}

// 延迟导入 Next.js 应用
const { default: next } = require('next')
const app = next({ dir: __dirname, dev: process.env.NODE_ENV !== 'production' })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const port = process.env.PORT || 3001
  const server = createServer((req, res) => handle(req, res))

  server.listen(port, () => {
    console.log(`> ResumeGlacier 已启动 http://localhost:${port}`)
  })
})
