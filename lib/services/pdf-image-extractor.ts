/**
 * PDF 头像提取器（级联入口）
 *
 * 阶段1 - 结构分析（快速路径）：直接提取内嵌图片候选（pdf-image-extractor-direct）
 * 场景A - 候选视觉确认（模板 PDF）：视觉模型批量判定哪张是头像
 * 场景B - 渲染 + 视觉找 bbox（扫描件）：渲染整页，视觉模型定位头像区域
 *
 * 判定权统一交给视觉模型（photo-vision-verifier），删除 v1 的肤色/边缘启发式评分。
 * 无视觉确认 -> 返回 null（宁缺毋滥）；视觉服务不可用 -> 抛错。
 */

import sharp from 'sharp'
import type OpenAI from 'openai'
import { extractPhotoByStructure } from './pdf-image-extractor-direct'
import type { ExtractedPhoto, ImageCandidate } from './pdf-image-extractor-direct'
import { getAIConfigByPurpose } from './ai-config-helper'
import { pdfjsConfig } from './pdf-common'
import {
  verifyCandidatesByVision,
  findPhotoBboxByVision,
  expandBbox,
  type Bbox,
} from './photo-vision-verifier'

export type { ExtractedPhoto }

/** 输出头像最大边长（像素） */
const MAX_PHOTO_SIZE = 600

/** 场景A 采纳置信度阈值 */
const CONFIDENCE_THRESHOLD = 0.7

/** 场景A 批量送视觉的候选上限 */
const MAX_CANDIDATES_FOR_VISION = 6

/**
 * 从 PDF 中提取人物照片（级联入口）
 *
 * @returns 提取的照片，或 null（无照片）；视觉服务不可用抛错
 */
export async function extractPhotoFromPdf(pdfBuffer: Buffer): Promise<ExtractedPhoto | null> {
  // 获取视觉模型配置（未配置/不可用 -> 抛错，由上层转错误提示）
  const { client, model } = await getAIConfigByPurpose('vision')

  // 阶段1：结构分析，产出候选内嵌图列表
  let candidates: ImageCandidate[] = []
  try {
    candidates = await extractPhotoByStructure(pdfBuffer)
  } catch {
    // 结构分析失败 -> 候选为空，走场景B
    candidates = []
  }

  // 场景A：候选批量视觉确认（模板 PDF）
  if (candidates.length > 0) {
    const top = candidates.slice(0, MAX_CANDIDATES_FOR_VISION)
    // verifyCandidatesByVision: faceIndex=null 表示无头像（不抛错）；服务异常抛错
    const result = await verifyCandidatesByVision(
      top.map((c) => c.buffer),
      client,
      model
    )
    if (result.faceIndex !== null && result.confidence >= CONFIDENCE_THRESHOLD) {
      return await finalizePhoto(top[result.faceIndex].buffer, result.confidence)
    }
    // 视觉未确认 -> 不回落场景B（阶段1已穷尽内嵌图），返回 null
    return null
  }

  // 场景B：渲染整页 + 视觉找 bbox（扫描件，阶段1 零候选）
  return await extractPhotoByRendering(pdfBuffer, client, model)
}

/**
 * 场景B：渲染 PDF 页面，视觉模型定位头像 bbox 并裁剪
 */
async function extractPhotoByRendering(
  pdfBuffer: Buffer,
  client: OpenAI,
  model: string
): Promise<ExtractedPhoto | null> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas, Image } = await import('canvas')

  const loadingTask = getDocument({
    ...pdfjsConfig,
    data: new Uint8Array(pdfBuffer),
  })
  const pdfDoc = await loadingTask.promise

  const maxPages = Math.min(pdfDoc.numPages, 2)

  for (let i = 0; i < maxPages; i++) {
    const page = await pdfDoc.getPage(i + 1)
    const viewport = page.getViewport({ scale: 1.5 })

    const width = Math.min(Math.floor(viewport.width), 1200)
    const height = Math.min(Math.floor(viewport.height), 1600)
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    // canvas drawImage 兼容性补丁：处理 pdfjs 内部创建的非标准图片源
    patchDrawImage(ctx, createCanvas, Image)

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    try {
      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise
    } catch {
      continue // 渲染失败 -> 试下一页
    }

    const pageImage = canvas.toBuffer('image/png')

    // 视觉找头像 bbox：null 表示本页无头像（试下一页）；服务异常抛错（向上传播）
    const bbox: Bbox | null = await findPhotoBboxByVision(pageImage, width, height, client, model)
    if (!bbox) continue

    // 扩边裁剪（覆盖头发+肩）
    const expanded = expandBbox(bbox, width, height, 1.3)
    const cropped = await sharp(pageImage)
      .extract({
        left: expanded.x,
        top: expanded.y,
        width: expanded.w,
        height: expanded.h,
      })
      .resize(MAX_PHOTO_SIZE, MAX_PHOTO_SIZE, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()

    const meta = await sharp(cropped).metadata()
    return {
      buffer: cropped,
      width: meta.width || MAX_PHOTO_SIZE,
      height: meta.height || MAX_PHOTO_SIZE,
      confidence: 0.85, // 场景B found=true 即采纳
    }
  }

  return null
}

/**
 * 把提取到的图片缓冲缩放为最终头像
 */
async function finalizePhoto(buffer: Buffer, confidence: number): Promise<ExtractedPhoto> {
  const processed = await sharp(buffer)
    .resize(MAX_PHOTO_SIZE, MAX_PHOTO_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  const meta = await sharp(processed).metadata()
  return {
    buffer: processed,
    width: meta.width || MAX_PHOTO_SIZE,
    height: meta.height || MAX_PHOTO_SIZE,
    confidence,
  }
}

/**
 * canvas drawImage 兼容性补丁：pdfjs 在 Node 渲染时可能传入非标准图片源（如 canvas-like 对象）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchDrawImage(ctx: any, createCanvas: any, Image: any): void {
  const originalDrawImage = ctx.drawImage.bind(ctx)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.drawImage = function (this: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any[] = Array.from(arguments)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const srcImg: any = args[0]
    if (srcImg instanceof Image || srcImg?.constructor?.name === 'Canvas') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalDrawImage as any).apply(this, args)
    }
    if (srcImg && typeof srcImg === 'object' && typeof srcImg.getContext === 'function') {
      try {
        const w = srcImg.width || 100
        const h = srcImg.height || 100
        const tempCanvas = createCanvas(w, h)
        const tempCtx = tempCanvas.getContext('2d')
        try {
          tempCtx.drawImage(srcImg, 0, 0)
        } catch {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (originalDrawImage as any).apply(this, args)
      } catch {}
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalDrawImage as any).apply(this, args)
    } catch {}
  }
}

/**
 * 保存照片到指定路径
 */
export async function savePhoto(photo: ExtractedPhoto, outputPath: string): Promise<void> {
  await sharp(photo.buffer).toFile(outputPath)
}

/**
 * 将照片转换为 base64
 */
export function photoToBase64(photo: ExtractedPhoto): string {
  return `data:image/png;base64,${photo.buffer.toString('base64')}`
}
