/**
 * 直接从 PDF 提取嵌入图片（阶段1：结构分析）
 *
 * 通过操作符列表定位内嵌图片对象，利用累乘后的 CTM 解析精确坐标，
 * 应用宽松布局过滤产出候选列表。不再自己做"是否头像"判定--
 * 判定权交给视觉模型（photo-vision-verifier）。
 *
 * v1 的两个关键缺陷已在此修正：
 *   1. paintImageXObject(85) / paintInlineImageXObject(86) 常量写反 -> 改用 pdfjs 导出的 OPS 符号
 *   2. 只记最近一个 transform，忽略 q/Q 嵌套 -> 改为维护 CTM 栈并矩阵累乘
 */

// pdfjs-dist v4 依赖 process.getBuiltinModule，polyfill 统一由 pdf-common 在模块顶层设置
import '@/lib/services/pdf-common'

export interface ExtractedPhoto {
  buffer: Buffer
  width: number
  height: number
  confidence: number
}

export interface ImageCandidate {
  buffer: Buffer
  pixelWidth: number
  pixelHeight: number
  pageX: number
  pageY: number
  pageW: number
  pageH: number
  pageHeight: number
}

// 头像筛选常量（v2 放宽：靠视觉确认兜底，降低漏检）
const PHOTO_MIN_SIZE = 50
const ASPECT_RATIO_MIN = 0.4
const ASPECT_RATIO_MAX = 2.0

/**
 * 基于PDF文档结构分析，提取候选内嵌图片列表
 *
 * 处理流程：
 * 1. 通过 page.getOperatorList() 获取页面操作符序列
 * 2. 维护 CTM 栈（OPS.save/restore/transform），正确处理 q/Q 嵌套与矩阵累乘
 * 3. 定位 OPS.paintImageXObject / OPS.paintInlineImageXObject 提取内嵌图片
 * 4. 应用宽松布局筛选（尺寸、宽高比、大图过滤）
 * 5. 按（上方优先 + 接近标准证件照尺寸优先）排序
 *
 * @returns 候选图片列表（已排序），由上层视觉模型做最终判定
 */
export async function extractPhotoByStructure(pdfBuffer: Buffer): Promise<ImageCandidate[]> {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('canvas')

  const loadingTask = getDocument({
    isEvalSupported: false,
    useSystemFonts: true,
    data: new Uint8Array(pdfBuffer),
  })
  const pdfDoc = await loadingTask.promise

  const maxPages = Math.min(pdfDoc.numPages, 2)
  const candidates: ImageCandidate[] = []

  for (let i = 0; i < maxPages; i++) {
    const page = await pdfDoc.getPage(i + 1)
    const viewport = page.getViewport({ scale: 1 })
    const pageWidth = viewport.width
    const pageHeight = viewport.height

    const operatorList = await page.getOperatorList()
    const fnArray = operatorList.fnArray
    const argsArray = operatorList.argsArray

    // CTM 栈：维护 graphics state，正确处理 q/Q/cm 嵌套
    const ctmStack: number[][] = []
    let ctm: number[] = [1, 0, 0, 1, 0, 0]

    for (let j = 0; j < fnArray.length; j++) {
      const fn = fnArray[j]

      if (fn === OPS.save) {
        ctmStack.push(ctm.slice())
        continue
      }
      if (fn === OPS.restore) {
        ctm = ctmStack.pop() ?? ctm
        continue
      }
      if (fn === OPS.transform) {
        ctm = multiplyMatrix(ctm, argsArray[j] as number[])
        continue
      }

      const isNamed = fn === OPS.paintImageXObject
      const isInline = fn === OPS.paintInlineImageXObject
      if (!isNamed && !isInline) continue

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let imgData: any = null

        if (isNamed) {
          // paintImageXObject：命名图片对象存储在 page.objs 中，按 name 异步获取
          // objs.get 无 callback 时同步抛 "isn't resolved yet"，用 callback 形式等待 worker 解析
          const imgName = argsArray[j]?.[0]?.name ?? argsArray[j]?.[0]
          if (imgName) {
            imgData = await resolveObjWithTimeout(page.objs, imgName, 5000)
            if (!imgData) {
              // 兜底：共享图片对象可能在 commonObjs（pdfjs v4 类型未在 PDFDocumentProxy 上暴露）
              imgData = await resolveObjWithTimeout(
                (pdfDoc as unknown as { commonObjs: unknown }).commonObjs,
                imgName,
                2000
              )
            }
          }
        } else {
          // paintInlineImageXObject：内联图片数据直接在参数中
          imgData = argsArray[j]?.[0]
        }

        if (!imgData || !imgData.data || !imgData.width || !imgData.height) continue

        const { data, width, height, kind } = imgData

        // 像素尺寸过滤：跳过过小或过大的图片
        if (width < PHOTO_MIN_SIZE || height < PHOTO_MIN_SIZE) continue
        if (width > 2000 || height > 2000) continue

        // 宽高比过滤（放宽，交给视觉判定）
        const ratio = width / height
        if (ratio < ASPECT_RATIO_MIN || ratio > ASPECT_RATIO_MAX) continue

        // 从当前 CTM 解析页面坐标（AABB，兼容旋转/倾斜）
        const rect = imageRectFromCtm(ctm, pageHeight)

        // 大图过滤：宽度超过页面 60% 视为背景/横幅（且省视觉 token）
        if (rect.pageW > pageWidth * 0.6) continue

        const imgBuffer = await imageDataToBuffer(data, width, height, kind || 3, createCanvas)

        candidates.push({
          buffer: imgBuffer,
          pixelWidth: width,
          pixelHeight: height,
          pageX: rect.pageX,
          pageY: rect.pageY,
          pageW: rect.pageW,
          pageH: rect.pageH,
          pageHeight,
        })
      } catch {
        // 跳过提取失败的图片
      }
    }
  }

  // 排序：上方优先 + 接近标准证件照尺寸（150x200 pt）优先
  candidates.sort((a, b) => {
    const aTop = a.pageY < a.pageHeight * 0.3 ? 0 : 1
    const bTop = b.pageY < b.pageHeight * 0.3 ? 0 : 1
    if (aTop !== bTop) return aTop - bTop
    const aSizeDiff = Math.abs(a.pageW - 150) + Math.abs(a.pageH - 200)
    const bSizeDiff = Math.abs(b.pageW - 150) + Math.abs(b.pageH - 200)
    return aSizeDiff - bSizeDiff
  })

  return candidates
}

/**
 * 用 callback 形式等待 pdfjs 对象解析
 * PDFObjects.get(id) 无 callback 时同步抛 "isn't resolved yet"；callback 形式会等 worker resolve
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveObjWithTimeout(objs: any, objId: string, timeoutMs: number): Promise<any> {
  return Promise.race([
    new Promise<any>((resolve) => {
      try {
        objs.get(objId, (data: any) => resolve(data))
      } catch {
        resolve(null)
      }
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

/**
 * PDF 变换矩阵相乘（PDF 行向量约定：先应用 m2，再应用 m1）
 * 矩阵 [a,b,c,d,e,f] 对应 [[a,b,0],[c,d,0],[e,f,1]]
 */
function multiplyMatrix(m1: number[], m2: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ]
}

/**
 * 从 CTM 推导图片在页面的轴对齐包围盒（AABB，兼容旋转/倾斜）
 * PDF 坐标系 Y 轴向上，转换为屏幕坐标系 Y 轴向下
 */
function imageRectFromCtm(
  ctm: number[],
  pageHeight: number
): { pageX: number; pageY: number; pageW: number; pageH: number } {
  const [a, b, c, d, e, f] = ctm
  // 图片单位正方形四角经 CTM 变换后的坐标
  const xs = [e, a + e, c + e, a + c + e]
  const ys = [f, b + f, d + f, b + d + f]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    pageX: minX,
    pageY: pageHeight - maxY, // PDF Y轴向上 -> 屏幕Y轴向下（取顶部）
    pageW: maxX - minX,
    pageH: maxY - minY,
  }
}

/**
 * 将 pdfjs-dist 图片像素数据转为 PNG Buffer
 * pdfjs ImageKind: 1=GRAYSCALE_1BPP(1位打包), 2=RGB_24BPP(3字节/像素), 3=RGBA_32BPP(4字节/像素)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function imageDataToBuffer(data: Uint8Array, width: number, height: number, kind: number, createCanvas: any): Promise<Buffer> {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(width, height)
  const dest = imageData.data
  const totalPixels = width * height

  if (kind === 3 /* RGBA_32BPP */) {
    // 4 字节/像素，直接复制
    const src = data.subarray(0, Math.min(data.length, dest.length))
    dest.set(src)
  } else if (kind === 2 /* RGB_24BPP */) {
    // 3 字节/像素 RGB -> RGBA
    for (let k = 0, l = 0; k + 2 < data.length && l < dest.length; k += 3, l += 4) {
      dest[l] = data[k]
      dest[l + 1] = data[k + 1]
      dest[l + 2] = data[k + 2]
      dest[l + 3] = 255
    }
  } else if (kind === 1 /* GRAYSCALE_1BPP */) {
    // 1 位/像素打包（每字节 8 像素），bit=1 白，bit=0 黑
    for (let p = 0; p < totalPixels; p++) {
      const srcByte = data[p >> 3] | 0
      const bit = (srcByte >> (7 - (p & 7))) & 1
      const l = p * 4
      const v = bit ? 255 : 0
      dest[l] = v
      dest[l + 1] = v
      dest[l + 2] = v
      dest[l + 3] = 255
    }
  } else {
    // 未知 kind，按 RGB 兜底
    for (let k = 0, l = 0; k + 2 < data.length && l < dest.length; k += 3, l += 4) {
      dest[l] = data[k]
      dest[l + 1] = data[k + 1]
      dest[l + 2] = data[k + 2]
      dest[l + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toBuffer('image/png')
}

/**
 * 从 PDF 直接提取所有嵌入图片（供调试/其他用途使用）
 */
export async function extractImagesFromPdf(
  pdfBuffer: Buffer,
  options: { maxImages?: number } = {}
): Promise<{ buffers: Buffer[]; dimensions: { width: number; height: number }[] }> {
  const maxImages = options.maxImages ?? 5
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('canvas')

  const loadingTask = getDocument({
    isEvalSupported: false,
    useSystemFonts: true,
    data: new Uint8Array(pdfBuffer),
  })

  const pdfDoc = await loadingTask.promise
  const pageCount = Math.min(pdfDoc.numPages, maxImages)
  const allImages: Buffer[] = []
  const allDimensions: { width: number; height: number }[] = []

  for (let i = 0; i < pageCount; i++) {
    const page = await pdfDoc.getPage(i + 1)
    const operatorList = await page.getOperatorList()
    const fnArray = operatorList.fnArray
    const argsArray = operatorList.argsArray

    for (let j = 0; j < fnArray.length; j++) {
      const fn = fnArray[j]
      if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject) continue

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let imgData: any = null
        if (fn === OPS.paintImageXObject) {
          // 命名图片：按 name 从 page.objs 异步获取
          const imgName = argsArray[j]?.[0]?.name ?? argsArray[j]?.[0]
          if (imgName) {
            imgData = await Promise.race([
              page.objs.get(imgName),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ])
          }
        } else {
          // 内联图片：数据直接在参数中
          imgData = argsArray[j]?.[0]
        }

        if (imgData && imgData.data) {
          const { data, width, height, kind } = imgData
          const imgBuffer = await imageDataToBuffer(data, width, height, kind || 3, createCanvas)
          allImages.push(imgBuffer)
          allDimensions.push({ width, height })
        }
      } catch {
        // skip
      }
    }

    // 如果没有找到内嵌图片，尝试渲染页面
    if (allImages.length === 0) {
      const viewport = page.getViewport({ scale: 2.0 })
      const width = Math.floor(viewport.width)
      const height = Math.floor(viewport.height)

      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      try {
        await page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise

        const imgBuffer = canvas.toBuffer('image/png')
        allImages.push(imgBuffer)
        allDimensions.push({ width, height })
      } catch {
        // skip
      }
    }
  }

  return { buffers: allImages, dimensions: allDimensions }
}
