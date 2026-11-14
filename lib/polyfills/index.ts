/**
 * pdfjs-dist Node.js polyfill 入口
 *
 * 在应用启动时首先加载此模块以设置必要的 polyfill
 */

// 动态导入 CommonJS polyfill
import './pdfjs-polyfill.cjs'
