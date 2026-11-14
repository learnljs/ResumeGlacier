/**
 * PDF 渲染与 OCR 共享运行时
 *
 * 收敛多份重复实现（审计 B4）：
 * - process.getBuiltinModule polyfill：原 5 个 service 各自内联，现统一走 lib/polyfills 正典模块
 * - pdfjsConfig：原 ocr-engine / vision-ocr / pdf-image-extractor 三处一致副本
 * - Tesseract.js Worker 单例：原 ocr-engine / vision-ocr 两份，合并为带 60s 超时与失败重置的健壮版
 */

// 模块顶层：先加载正典 polyfill（在任何 pdfjs-dist 导入之前）
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@/lib/polyfills/pdfjs-polyfill.cjs')

/**
 * PDF.js 配置
 * isEvalSupported: false 避免字体加载问题
 * isOffscreenSupported: false 避免 Node.js 环境兼容性问题
 */
export const pdfjsConfig = {
  isEvalSupported: false,
  useSystemFonts: true,
  isOffscreenSupported: false,
}

// Tesseract.js Worker 单例类型
type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>

declare global {
  // eslint-disable-next-line no-var
  var __tesseractWorker: TesseractWorker | null
  // eslint-disable-next-line no-var
  var __workerInitPromise: Promise<TesseractWorker> | null
}

/**
 * 初始化 Tesseract Worker（globalThis 单例，避免 HMR 重复创建）
 *
 * 含 60s 初始化超时兜底：worker thread 加载 worker-script 若隐式依赖缺失，
 * createWorker 的 Promise 可能永久 pending，超时避免整个解析队列卡死。
 * 初始化失败时清理 pending Promise，允许后续重试。
 */
export async function getTesseractWorker(): Promise<TesseractWorker> {
  if (globalThis.__tesseractWorker) {
    return globalThis.__tesseractWorker
  }

  if (globalThis.__workerInitPromise) {
    return globalThis.__workerInitPromise
  }

  globalThis.__workerInitPromise = (async () => {
    const { createWorker, OEM } = await import('tesseract.js')

    console.log('[OCR] 初始化 Tesseract Worker...')

    // tesseract.js 资源路径全部指向本地，避免运行时从 CDN 下载失败（容器可能无外网）：
    // - workerPath 不传：Node 环境默认使用本地 worker-script；显式传 undefined 会覆盖默认值，
    //   导致 tesseract.js v7 spawnWorker 直接 new Worker(undefined) 崩溃
    //   （"The filename argument must be of type string or an instance of URL"）
    // - corePath：本地 node_modules/tesseract.js-core（wasm 引擎）
    // - langPath：本地语言包目录（chi_sim.traineddata / eng.traineddata 在项目根，已 git 跟踪）
    const tessCorePath = process.cwd() + '/node_modules/tesseract.js-core'
    const tessLangPath = process.cwd()

    const worker = await Promise.race([
      createWorker('chi_sim+eng', OEM.LSTM_ONLY, {
        logger: (m) => {
          if (m.status) {
            console.log(`[OCR] ${m.status}: ${m.progress ? (m.progress * 100).toFixed(0) + '%' : ''}`)
          }
        },
        langPath: tessLangPath,
        corePath: tessCorePath,
        // 本地语言包未压缩（chi_sim.traineddata 无 .gz 后缀），必须关闭 gzip 查找
        gzip: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tesseract Worker 初始化超时（60s），可能 worker-script 加载失败')), 60000)
      ),
    ])

    globalThis.__tesseractWorker = worker
    console.log('[OCR] Tesseract Worker 初始化完成')
    return worker
  })().catch((err) => {
    // 初始化失败：清理 pending Promise，允许后续重试
    globalThis.__workerInitPromise = null
    throw err
  })

  return globalThis.__workerInitPromise
}
