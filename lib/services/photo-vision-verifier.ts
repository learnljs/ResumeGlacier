/**
 * 头像视觉验证服务
 *
 * 用 AI 视觉模型做"是否人脸"的最终确认，替代 v1 的肤色/边缘启发式判定。
 * 两个场景：
 *   场景A verifyCandidatesByVision：批量确认候选图哪张是头像（模板 PDF，阶段1 有候选）
 *   场景B findPhotoBboxByVision  ：在整页渲染图中中找头像 bbox（扫描件，阶段1 零候选）
 *
 * 约定：
 *   - "简历无照片"（模型明确说没有）-> 返回 null / faceIndex=null，不抛错
 *   - "视觉服务不可用"（未配置/超时/HTTP错误/返回非JSON）-> 抛错，由上层转为错误提示
 */

import sharp from 'sharp'
import type OpenAI from 'openai'

/** 视觉调用单次超时 */
const VISION_TIMEOUT_MS = 60_000

/** 候选图送视觉前缩放到的最大边长（控制 token，分类无需高分辨率） */
const CANDIDATE_MAX_DIM = 512

export interface VisionFaceResult {
  /** 命中候选的索引；null 表示模型判定都不是头像 */
  faceIndex: number | null
  confidence: number
}

export interface Bbox {
  x: number
  y: number
  w: number
  h: number
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'high' } }

/**
 * 场景A：批量确认候选图中哪张是人物头像
 *
 * @returns faceIndex=null 表示无头像（不抛错）；视觉服务异常抛错
 */
export async function verifyCandidatesByVision(
  candidateBuffers: Buffer[],
  client: OpenAI,
  model: string
): Promise<VisionFaceResult> {
  if (candidateBuffers.length === 0) return { faceIndex: null, confidence: 0 }

  // 缩放候选图，控制 token
  const prepared: Buffer[] = []
  for (const buf of candidateBuffers) {
    prepared.push(await downscaleForVision(buf, CANDIDATE_MAX_DIM))
  }

  const prompt =
    `以下是从简历中提取的 ${prepared.length} 张图片（按顺序编号 0 到 ${prepared.length - 1}）。` +
    `请判断其中哪一张是人物头像照片（正面或侧面的人脸证件照/半身照，不含 logo、图标、装饰图、纯文字、二维码）。` +
    `仅返回 JSON：找到返回 {"faceIndex": <索引>, "confidence": <0到1>}；都没有返回 {"faceIndex": null}。`

  const content: ContentPart[] = [
    { type: 'text', text: prompt },
    ...prepared.map((b) => ({
      type: 'image_url' as const,
      image_url: { url: dataUri(b), detail: 'high' as const },
    })),
  ]

  const json = await callVisionJsonWithRetry(client, model, content)

  if (json.faceIndex === null || json.faceIndex === undefined) {
    return { faceIndex: null, confidence: 0 }
  }
  const idx = Number(json.faceIndex)
  const conf = Number(json.confidence)
  // 越界索引视为未确认（不抛错，避免误阻断）
  if (!Number.isFinite(idx) || idx < 0 || idx >= prepared.length) {
    return { faceIndex: null, confidence: 0 }
  }
  return { faceIndex: idx, confidence: Number.isFinite(conf) ? conf : 0 }
}

/**
 * 场景B：在整页渲染图中找出头像 bbox
 *
 * @param pageImage 渲染后的整页 PNG（坐标基准即此图像素）
 * @param width     页面图宽度（像素）
 * @param height    页面图高度（像素）
 * @returns bbox，或 null 表示无头像；视觉服务异常抛错
 */
export async function findPhotoBboxByVision(
  pageImage: Buffer,
  width: number,
  height: number,
  client: OpenAI,
  model: string
): Promise<Bbox | null> {
  const prompt =
    `这是一页简历截图，宽 ${width} 像素，高 ${height} 像素。` +
    `请找出其中的人物头像照片区域（正面/侧面人脸证件照或半身照，不含 logo/图标）。` +
    `仅返回 JSON：找到返回 {"found": true, "bbox": {"x": <number>, "y": <number>, "w": <number>, "h": <number>}}` +
    `（坐标为像素绝对值，基于给定宽高，x/y 为左上角）；无返回 {"found": false}。`

  const content: ContentPart[] = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: dataUri(pageImage), detail: 'high' } },
  ]

  const json = await callVisionJsonWithRetry(client, model, content)

  if (!json.found) return null
  const b = json.bbox
  if (!b) return null

  const bbox: Bbox = {
    x: Math.round(Number(b.x)),
    y: Math.round(Number(b.y)),
    w: Math.round(Number(b.w)),
    h: Math.round(Number(b.h)),
  }
  return clampBbox(bbox, width, height)
}

/**
 * 扩展 bbox（覆盖头发+肩），并 clamp 到图片边界
 */
export function expandBbox(bbox: Bbox, imgW: number, imgH: number, factor = 1.3): Bbox {
  const cx = bbox.x + bbox.w / 2
  const cy = bbox.y + bbox.h / 2
  let w = bbox.w * factor
  let h = bbox.h * factor
  let x = cx - w / 2
  let y = cy - h / 2
  if (x < 0) x = 0
  if (y < 0) y = 0
  if (x + w > imgW) w = imgW - x
  if (y + h > imgH) h = imgH - y
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

// ===== 内部工具 =====

/** 单次视觉调用（含超时），返回原始文本 */
async function callVisionRaw(
  client: OpenAI,
  model: string,
  content: ContentPart[]
): Promise<string> {
  const response = await Promise.race([
    client.chat.completions.create({
      model,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_tokens: 800,
      // 不设 response_format：兼容各 OpenAI 兼容视觉端点（部分不支持 json_object）
      // 不设 reasoning_effort：视觉模型不一定支持，保持兼容
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('头像识别视觉调用超时')), VISION_TIMEOUT_MS)
    ),
  ])
  // message.content 通常为字符串，兼容少数返回数组的情况
  const raw = response.choices[0]?.message?.content
  const text = typeof raw === 'string' ? raw : ''
  if (!text) throw new Error('视觉模型返回内容为空')
  return text
}

/** 视觉调用 + 容错 JSON 解析 + 非JSON重试1次；最终失败抛错 */
async function callVisionJsonWithRetry(
  client: OpenAI,
  model: string,
  content: ContentPart[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callVisionRaw(client, model, content)
      const json = extractJsonObject(text)
      if (json !== null) return json
      lastError = new Error('视觉模型返回无法解析为 JSON')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('头像识别视觉调用失败')
}

/** 容错提取首个 JSON 对象（兼容 markdown 代码块包裹） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJsonObject(text: string): any | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

/** 缩放图片到最大边长，控制视觉调用 token */
async function downscaleForVision(buffer: Buffer, maxDim: number): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
  } catch {
    return buffer
  }
}

/** 校验并 clamp bbox 到图片边界；过小返回 null */
function clampBbox(bbox: Bbox, width: number, height: number): Bbox | null {
  let { x, y, w, h } = bbox
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null
  }
  // clamp 到边界
  if (x < 0) x = 0
  if (y < 0) y = 0
  if (x + w > width) w = width - x
  if (y + h > height) h = height - y
  // 最小尺寸
  if (w < 30 || h < 30) return null
  if (w > width || h > height) return null
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

function dataUri(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`
}
