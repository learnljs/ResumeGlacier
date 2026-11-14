/**
 * pdfjs-dist Node.js polyfill
 *
 * 解决 pdfjs-dist v4 在 Next.js/Webpack/Turbopack 环境中
 * process.getBuiltinModule 不可用的问题
 *
 * 此文件需要在所有其他模块之前加载
 */

// 立即设置 polyfill（在任何代码之前）
if (typeof globalThis.process.getBuiltinModule !== 'function') {
  // 使用 __filename 模拟 import.meta.url
  const { createRequire } = require('module')
  const polyfillRequire = createRequire(__filename)

  globalThis.process.getBuiltinModule = (name) => {
    try {
      return polyfillRequire(name)
    } catch {
      return undefined
    }
  }
}
