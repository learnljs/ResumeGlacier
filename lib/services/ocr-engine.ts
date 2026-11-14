/**
 * OCR 引擎
 * 使用 pdfjs-dist 渲染 PDF 页面为图片，再用 tesseract.js 进行 OCR 识别
 */

import type { OcrResult, OcrOptions } from '@/types/resume'
import { pdfjsConfig, getTesseractWorker } from '@/lib/services/pdf-common'

/**
 * 渲染 PDF 页面为图片（使用 pdfjs-dist + canvas）
 */
async function renderPdfPageToImage(
  pdfPath: string,
  pageIndex: number,
  dpi: number = 300
): Promise<Buffer> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas, Image } = await import('canvas')

  // 加载 PDF 文档
  const loadingTask = getDocument({
    ...pdfjsConfig,
    data: new Uint8Array(require('fs').readFileSync(pdfPath)),
  })
  const pdfDoc = await loadingTask.promise

  // 获取页面（pdfjs-dist 使用 1-based 索引）
  const page = await pdfDoc.getPage(pageIndex + 1)

  // 计算缩放比例 (96 DPI 为基准)
  const viewport = page.getViewport({ scale: 1 })
  const scale = (dpi / 96)
  const scaledViewport = page.getViewport({ scale })

  const width = Math.floor(scaledViewport.width)
  const height = Math.floor(scaledViewport.height)

  // 创建 Canvas
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // canvas drawImage 兼容性补丁：处理 pdfjs-dist 内部创建的 CanvasElement
  const originalDrawImage = ctx.drawImage.bind(ctx)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(ctx as any).drawImage = function(this: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any[] = Array.from(arguments)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const srcImg: any = args[0]
    // 如果是原生 Image 或 Canvas，直接调用
    if (srcImg instanceof Image || srcImg?.constructor?.name === 'Canvas') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalDrawImage as any).apply(this, args)
    }

    // 处理 pdfjs-dist 内部创建的对象
    if (srcImg && typeof srcImg === 'object' && typeof srcImg.getContext === 'function') {
      try {
        const w = srcImg.width || 100
        const h = srcImg.height || 100
        const tempCanvas = createCanvas(w, h)
        const tempCtx = tempCanvas.getContext('2d')
        try { tempCtx.drawImage(srcImg, 0, 0) } catch {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (originalDrawImage as any).apply(this, args)
      } catch {}
    }

    // 最后尝试直接调用
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalDrawImage as any).apply(this, args)
    } catch {}
  }

  // 白色背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // 渲染页面
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport: scaledViewport,
  }).promise

  // 转换为 PNG 格式
  const buffer = canvas.toBuffer('image/png')
  return buffer
}

/**
 * 使用 sharp 预处理图片（灰度化、增强对比度）
 */
async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(imageBuffer)
    .greyscale()
    .normalise()
    .sharpen()
    .toBuffer()
}

/**
 * 执行 OCR 识别
 */
async function performOcr(
  imageBuffer: Buffer,
  worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>>
): Promise<{ text: string; confidence: number }> {
  const { data } = await worker.recognize(imageBuffer)
  return {
    text: data.text,
    confidence: data.confidence / 100, // tesseract 返回 0-100，标准化到 0-1
  }
}

/**
 * OCR PDF 文件
 */
export async function ocrPdfPages(
  buffer: Buffer,
  options: OcrOptions = {}
): Promise<OcrResult> {
  const maxPages = options.maxPages ?? 10
  const dpi = options.dpi ?? 300

  const pageTexts: string[] = []
  let totalConfidence = 0
  let pagesProcessed = 0

  // 将 buffer 写入临时文件（pdfjs-dist 需要文件路径或 ArrayBuffer）
  const tmpFile = `${process.cwd()}/data/tmp_ocr_${Date.now()}.pdf`
  require('fs').writeFileSync(tmpFile, buffer)

  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')

    // 加载 PDF 文档
    const loadingTask = getDocument({
      ...pdfjsConfig,
      data: new Uint8Array(buffer),
    })
    const pdfDoc = await loadingTask.promise

    const totalPages = pdfDoc.numPages
    const pageCount = Math.min(totalPages, maxPages)

    // 获取 Tesseract Worker
    let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>>
    try {
      worker = await getTesseractWorker()
    } catch (err) {
      throw new Error(`OCR引擎初始化失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }

    // 逐页处理
    for (let i = 0; i < pageCount; i++) {
      try {
        // 渲染页面为图片
        let imageBuffer: Buffer
        try {
          imageBuffer = await renderPdfPageToImage(tmpFile, i, dpi)
        } catch (err) {
          console.warn(`[OCR] 第${i + 1}页渲染失败:`, err)
          options.onProgress?.(i + 1, pageCount)
          continue
        }

        // 预处理图片
        let preprocessedBuffer: Buffer
        try {
          preprocessedBuffer = await preprocessImage(imageBuffer)
        } catch {
          preprocessedBuffer = imageBuffer
        }

        // OCR 识别（设置超时 30 秒）
        const ocrResult = await Promise.race([
          performOcr(preprocessedBuffer, worker),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('OCR超时')), 30000)
          ),
        ])

        if (ocrResult.text.trim().length > 0) {
          pageTexts.push(ocrResult.text)
          totalConfidence += ocrResult.confidence
          pagesProcessed++
        }
      } catch (err) {
        console.warn(`[OCR] 第${i + 1}页处理失败:`, err)
      }

      options.onProgress?.(i + 1, pageCount)
    }

    const finalText = pageTexts.join('\n\n')
    const avgConfidence = pagesProcessed > 0 ? totalConfidence / pagesProcessed : 0

    return {
      text: finalText,
      confidence: avgConfidence,
      pageCount: totalPages,
      pagesProcessed,
    }
  } finally {
    // 清理临时文件
    try {
      require('fs').unlinkSync(tmpFile)
    } catch {}
  }
}

/**
 * OCR 图片文件
 */
export async function ocrImage(
  buffer: Buffer,
  options: OcrOptions = {}
): Promise<{ text: string; confidence: number }> {
  let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>>
  try {
    worker = await getTesseractWorker()
  } catch (err) {
    throw new Error(`OCR引擎初始化失败: ${err instanceof Error ? err.message : '未知错误'}`)
  }

  // 预处理
  let preprocessedBuffer: Buffer
  try {
    preprocessedBuffer = await preprocessImage(buffer)
  } catch {
    preprocessedBuffer = buffer
  }

  return Promise.race([
    performOcr(preprocessedBuffer, worker),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('OCR超时')), 30000)
    ),
  ])
}
