import * as fs from 'fs'
import * as path from 'path'
import { analyzeTextQuality } from './text-quality-detector'
import { resolveLocalFilePath } from '@/lib/utils/file-path'
import type { ParseResult, ParseOptions, ItemProgress, FragmentationStats } from '@/types/resume'

export async function parseResume(
  filePath: string,
  fileType: string,
  options?: ParseOptions
): Promise<ParseResult> {
  const warnings: string[] = []
  const onProgress = options?.onProgress
  const skipOcr = options?.skipOcr ?? false

  // v2: 文字层破碎检测状态（§4.4）——顶层声明,供 Step 2 赋值与 OCR 降级决策区读取
  let sourceTextBroken = false
  let fragmentationStats: FragmentationStats | undefined

  // 路径解析：处理生产环境绝对路径在本地不可用的情况
  const resolvedPath = resolveLocalFilePath(filePath)

  // [Guard] 文件读取
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`简历文件不存在: ${resolvedPath}`)
  }

  const stats = fs.statSync(resolvedPath)
  if (stats.size === 0) {
    throw new Error('简历文件为空 (0字节)')
  }

  // 读取文件 buffer
  let buffer: Buffer
  try {
    buffer = fs.readFileSync(resolvedPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    throw new Error(`文件读取失败: ${msg}`)
  }

  // Step 1: 文本提取
  onProgress?.({ stage: '文本提取', percent: 0 })
  let text = ''
  let ocrFallbackText = ''
  let extractorLabel = 'PDF'
  try {
    if (fileType === 'pdf') {
      // 阶段3：所有 PDF 一律走视觉排序提取（pdfjs-dist v4），废弃 pdf-parse
      const { extractTextByVisualOrder } = await import('./pdf-visual-extractor')
      // v2: includeStats 透传 PDF 文字层破碎统计（重载返回 { text, stats }）
      // ⚠ text = rawText 是重赋值外层 let text；不能用 let text = rawText（会在 try 块内遮蔽外层变量）
      const { text: rawText, stats } = await extractTextByVisualOrder(buffer, {
        onProgress: (page, total) => {
          onProgress?.({ stage: `PDF解析 ${page}/${total}页`, percent: Math.round((page / total) * 4) })
        },
        includeStats: true as const,
      })
      fragmentationStats = stats
      text = rawText
    } else if (fileType === 'docx') {
      extractorLabel = 'DOCX'
      text = await parseDocx(buffer)
    } else {
      throw new Error(`不支持的文件类型: ${fileType}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    warnings.push(`${extractorLabel}文本提取失败: ${msg}`)
    text = ''
  }

  if (!text || text.trim().length === 0) {
    warnings.push('未提取到文字')
  }

  onProgress?.({ stage: '文本质量检测', percent: 5 })

  // 保存原始文本用于 fallback
  const fallbackText = text

  // Step 2: 文本质量检测
  // v2: 透传 PDF 文字层破碎统计;sourceTextBroken 记录"原始 PDF 文本被判乱码"（仅 PDF 提取路径）
  const qualityReport = analyzeTextQuality(text, fragmentationStats)
  const { score: qualityScore, isGarbled, checks } = qualityReport
  sourceTextBroken = fragmentationStats !== undefined && qualityReport.isGarbled
  if (sourceTextBroken && fragmentationStats) {
    warnings.push(
      `文本层破碎检测命中(emptyRatio=${(fragmentationStats.emptyItemRatio * 100).toFixed(1)}%, ` +
      `singleCharRatio=${(fragmentationStats.singleCharItemRatio * 100).toFixed(1)}%),进入OCR回退`
    )
  }

  let parseMethod: 'text' | 'ocr' | 'vision' = 'text'
  let finalText = text

  // 质量不合格或文本过短（< 20 字符），进入增强解析流程
  if (isGarbled || text.trim().length < 20) {
    if (skipOcr) {
      warnings.push(`文本质量不合格(score=${qualityScore})，已跳过OCR`)
    } else {
    const reasons = checks
      .filter((c) => c.score < 50)
      .map((c) => c.detail)
      .join('; ')
    warnings.push(`文本质量不合格(score=${qualityScore}): ${reasons}`)
    let ocrText = ''
    let ocrConfidence = 0
    try {
      const { ocrPdfPages } = await import('./ocr-engine')
      const ocrResult = await ocrPdfPages(buffer, {
        maxPages: 10,
        onProgress: (page, total) => {
          const percent = 10 + Math.round((page / total) * 60)
          onProgress?.({ stage: `OCR识别 ${page}/${total}页`, percent })
        },
      })
      ocrText = ocrResult.text
      ocrConfidence = ocrResult.confidence

      if (ocrResult.pagesProcessed === 0) {
        warnings.push('OCR识别未处理任何页面')
      } else {
        warnings.push(
          `OCR识别完成: 处理${ocrResult.pagesProcessed}/${ocrResult.pageCount}页, 置信度${(ocrConfidence * 100).toFixed(0)}%`
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      warnings.push(`本地OCR失败: ${msg}`)
    }

    // 检查 OCR 结果质量
    if (ocrText.trim().length >= 20 && ocrConfidence >= 0.5) {
      parseMethod = 'ocr'
      finalText = ocrText
    } else {
      // 保存低质量 OCR 结果作为 fallback
      if (ocrText.trim().length > 0) {
        ocrFallbackText = ocrText
        warnings.push('OCR结果置信度较低，走最终降级决策')
      }

      // Step 4: 最终降级决策（增加质量检查）
      const fallbackQualityCheck = analyzeTextQuality(finalText)
      if (finalText.trim().length < 20 || fallbackQualityCheck.isGarbled) {
        // 优先级1: 低质量 OCR 结果（至少 30 字符）
        if (ocrFallbackText.trim().length >= 30) {
          parseMethod = 'ocr'
          finalText = ocrFallbackText
          warnings.push('使用低置信度OCR结果，文本可能不完整')
        }
        // 优先级2: 原始文本（至少 30 字符）
        else if (fallbackText.trim().length >= 30) {
          // v2: 原始 PDF 文本若已被判乱码（含文字层破碎），拒绝静默回退——
          // 否则脏文本绕过破碎检测直接入库，掩盖"提取失败"的事实
          if (sourceTextBroken) {
            warnings.push('OCR失败,原始文本存在文字层破碎,拒绝入库')
            throw new Error(
              '简历文本提取失败:OCR无法恢复文字层破碎的PDF文本,原始文本残缺不可用'
            )
          }
          parseMethod = 'text'
          finalText = fallbackText
          warnings.push('文本可能包含乱码，建议配置OCR或多模态AI后重新解析')
        }
        // 全部失败
        else {
          const allWarnings = warnings
            .map((w, i) => `${i + 1}. ${w}`)
            .join('\n')
          throw new Error(
            `简历文本提取失败。\n尝试路径:\n${allWarnings}\n建议: 1.检查PDF是否为有效文件 2.配置OCR或多模态AI后重新解析`
          )
        }
      }

      // v2: sourceTextBroken 最终保护——
      // OCR 全部失败时,若最终文本仍是原始破碎文本(fallbackText),拒绝静默入库。
      // 注意:降级决策区仅在 finalText 为空或单参数检测乱码时才进入;当 finalText 仍是原始
      // 文本(224 字符非空)时不会进入,必须在此兜底拦截。
      if (sourceTextBroken && finalText === text) {
        warnings.push('OCR失败,原始文本存在文字层破碎,拒绝入库')
        throw new Error(
          '简历文本提取失败:OCR无法恢复文字层破碎的PDF文本,原始文本残缺不可用'
        )
      }
    }
    }
  }

  // Step 6: 增强文本清洗
  onProgress?.({ stage: '文本清洗', percent: 70 })
  const cleanedText = cleanText(finalText)
  if (cleanedText.trim().length === 0 && finalText.trim().length > 0) {
    warnings.push('文本清洗后为空，已保留原始文本')
  }
  finalText = cleanedText.trim().length > 0 ? cleanedText : finalText

  // Step 7: 文本截断
  if (finalText.length > 50000) {
    warnings.push('文本超过50000字符，已截断')
    finalText = finalText.substring(0, 50000)
  }

  // Step 8: 提取联系信息
  onProgress?.({ stage: '提取联系信息', percent: 75 })
  const contactInfo = extractContactInfo(finalText)

  // Step 9: 照片提取（独立隔离）
  onProgress?.({ stage: '照片提取', percent: 80 })
  let photoPath: string | null = null
  if (options?.emailId && options?.resumeId) {
    try {
      photoPath = await extractAndSavePhoto(buffer, fileType, options)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      warnings.push(`照片提取失败: ${msg}`)
    }
  }

  // 重新评估最终文本质量
  const finalQualityReport = analyzeTextQuality(finalText)

  return {
    text: finalText,
    name: contactInfo.name,
    phone: contactInfo.phone,
    email: contactInfo.email,
    photoPath,
    parseMethod,
    warnings,
    textQualityScore: finalQualityReport.score,
    isGarbled: finalQualityReport.isGarbled,
    hadFragmentation: sourceTextBroken,
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ''
}

/**
 * 增强版文本清洗
 */
function cleanText(text: string): string {
  return text
    // === 噪音字符清除（先于归一化） ===
    // A: 字体子集标识符残留（40-60 字符 base62 + ~~ 后缀）
    .replace(/[A-Za-z0-9_-]{40,60}~~/g, '')
    // A 补充：孤立 ~ 行
    .replace(/^~+\s*$/gm, '')
    // A 补充2：孤立 ~ 项（泄漏串 ~~ 后缀残留）被 buildRows 合并到正文行行首，形成"~服务执行"等。
    // 删除行首 ~（后跟非空白）。~ 在中文简历是合法区间符（"3~5年"）但位于数字间，不会出现在行首；
    // 行首 ~ 恒为泄漏串残留。避免 AI 因 ~ 前缀对同一项目的职责点处理不一致（有的当描述、有的当独立项目）。
    .replace(/^~+(?=\S)/gm, '')
    // B: PUA 区字符
    .replace(/[-]/g, '')
    // C: 清理联系信息中的格式噪音（如电话中的分隔符、邮箱中的空格）
    //    在清洗阶段先把常见的手机号/邮箱格式统一，便于后续正则匹配
    //    此处理放在文本提取前，仅作用于联系信息模式
    // === 统一换行符 ===
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 移除 CID 字体序列
    .replace(/\(cid:\d+\)/g, ' ')
    // Unicode 规范化 (NFC)
    .normalize('NFC')
    // 移除控制字符（保留换行和 tab）
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // D: 清理孤立的字母碎片行（PDF 文字层破碎特征：1-2 个字母单独成行）
    //    出现在中文简历中时大概率是字体子集泄漏
    .replace(/^[A-Za-z]{1,2}\s*$/gm, '')
    // E: 清理纯符号行（不含任何有效文字内容的装饰行）
    .replace(/^[\s\-_=|·•*~`'"]+$/gm, '')
    // F: 压缩联系信息中的多余空格（如 "138 0013 8000" → "13800138000" 的中间格式已由提取函数处理）
    //    保留自然文本中的空格，仅清理标点和数字之间的异常空格
    // 移除过多的连续换行
    .replace(/\n{3,}/g, '\n\n')
    // 压缩连续空白（保留换行）
    .replace(/[^\S\n]{2,}/g, ' ')
    // G: 清理孤立的空行（全是空白字符的行）
    .replace(/^\s+$/gm, '')
    // 合并多余空行
    .replace(/\n{2,}/g, '\n')
    // 最终 trim
    .trim()
}

/**
 * 提取联系信息（增强版）
 *
 * 改进要点：
 *   1. 手机号：支持多种分隔符格式、+86 前缀、座机号码，按置信度排序取最佳
 *   2. 邮箱：增强正则兼容性，添加域名合法性校验，过滤明显无效的匹配
 *   3. 姓名：6 种策略融合，含标签匹配、位置启发式、多候选验证
 */
export function extractContactInfo(text: string): {
  name: string | null
  phone: string | null
  email: string | null
} {
  const lines = text.split('\n')

  // === 手机号提取 ===
  const phone = extractPhone(text)

  // === 邮箱提取 ===
  const email = extractEmail(text)

  // === 姓名提取 ===
  const name = extractName(text, lines)

  return { name, phone, email }
}

/**
 * 多策略手机号提取
 * 优先级：带标签 > 纯净11位 > 带分隔符 > 带国家码 > 座机
 */
function extractPhone(text: string): string | null {
  const phonePatterns: { pattern: RegExp; clean: (m: RegExpMatchArray) => string | null; score: number }[] = [
    // 1. 带明确标签的手机号（含可选 +86 前缀）
    {
      pattern: /(?:电话|手机|Tel|Phone|Mobile|联系方式)[：:\s]*(?:\+?86[-\s]?)?(1[3-9]\d{1}[-\s]?\d{4}[-\s]?\d{4})/i,
      clean: (m) => m[1].replace(/[-\s]/g, ''),
      score: 100,
    },
    // 2. 带 +86 前缀
    {
      pattern: /\+?86[-\s]?(1[3-9]\d{9})/,
      clean: (m) => m[1],
      score: 90,
    },
    // 3. 标准11位连续手机号
    {
      pattern: /(?<!\d)(1[3-9]\d{9})(?!\d)/,
      clean: (m) => m[1],
      score: 85,
    },
    // 4. 带分隔符的手机号 (138 0013 8000 / 138-0013-8000)
    {
      pattern: /(?<!\d)(1[3-9]\d)[-\s](\d{4})[-\s](\d{4})(?!\d)/,
      clean: (m) => m[1] + m[2] + m[3],
      score: 80,
    },
    // 5. 座机号码（固话）
    {
      pattern: /(?:电话|座机|Tel|Phone)[：:\s]*(0\d{2,3}[-\s]?\d{7,8})/i,
      clean: (m) => m[1].replace(/[-\s]/g, ''),
      score: 50,
    },
  ]

  let best: { phone: string; score: number } | null = null

  for (const { pattern, clean, score } of phonePatterns) {
    const match = text.match(pattern)
    if (match) {
      const candidate = clean(match)
      if (!candidate) continue
      // 验证手机号基本合法性
      if (/^1[3-9]\d{9}$/.test(candidate) || /^0\d{2,3}\d{7,8}$/.test(candidate)) {
        if (!best || score > best.score) {
          best = { phone: candidate, score }
        }
      }
    }
  }

  return best?.phone ?? null
}

/**
 * 邮箱提取
 */
function extractEmail(text: string): string | null {
  // 更精确的邮箱正则，支持多种域名和子域名
  const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?)+/

  const matches = text.match(new RegExp(emailPattern.source, 'g'))
  if (!matches) return null

  // 过滤无效邮箱：域名部分含明显非字符或 TLD 太短
  const valid = matches.filter((e) => {
    const parts = e.split('@')
    if (parts.length !== 2) return false
    const domainParts = parts[1].split('.')
    // TLD 至少 2 个字符
    if (domainParts[domainParts.length - 1].length < 2) return false
    // 用户名至少 1 个字符
    if (parts[0].length === 0) return false
    // 排除明显的假阳性（如路径/代码片段）
    if (/[<>{}[\]|\\/]/.test(e)) return false
    return true
  })

  if (valid.length === 0) return null

  // 优先选择带标签的邮箱
  const labelMatch = text.match(/(?:邮箱|Email|E-mail|E-Mail|Mail|EmailAddress)[：:\s]*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+)/i)
  if (labelMatch && valid.includes(labelMatch[1])) {
    return labelMatch[1]
  }

  return valid[0]
}

/**
 * 区块标题黑名单：常见简历 section 标题不可作为姓名
 */
const SECTION_HEADERS = new Set([
  '基本信息', '个人信息', '个人资料', '联系方式', '个人优势', '个人特长',
  '教育经历', '教育背景', '工作经历', '工作背景', '项目经历', '项目经验',
  '实习经历', '校园经历', '社会实践', '技能证书', '技能特长', '专业技能',
  '自我评价', '个人评价', '自我介绍', '兴趣爱好', '语言能力', '培训经历',
  '求职意向', '求职信息', '个人简介', '个人总结', '获奖情况', '荣誉奖项',
  '姓名', '性别', '年龄', '出生', '籍贯', '学历', '电话', '手机', '邮箱',
  '地址', '身高', '体重', '政治面貌', '民族', '国籍',
])

/**
 * 判断字符串是否为已知的简历区块标题
 */
function isSectionHeader(s: string): boolean {
  return SECTION_HEADERS.has(s.trim())
}

/**
 * 多策略姓名提取
 * 策略按优先级：标签匹配 > 首行验证 > 头部区域扫描 > 性别上方 > 基本信息区 > 全量
 */
function extractName(text: string, lines: string[]): string | null {
  const chineseNamePattern = /^[\u4e00-\u9fa5]{2,4}$/
  const chineseNameExtended = /^[\u4e00-\u9fa5]{2,6}$/
  const englishNamePattern = /^[A-Z][A-Za-z.'\-]+(?:\s[A-Z][A-Za-z.'\-]+){0,3}$/

  const candidates: { name: string; score: number }[] = []
  const seen = new Set<string>()

  const addCandidate = (name: string, score: number) => {
    if (!name || seen.has(name)) return
    seen.add(name)
    candidates.push({ name, score })
  }

  // 策略 1: 明确标签匹配 "姓名：xxx" / "姓 名: xxx"
  const labelPatterns = [
    /姓\s*名[：:\s]+([^\n]{1,8})/,
    /姓\s*名\s*([^\s\n]{2,8})/,
    /Name[：:\s]+([A-Za-z\u4e00-\u9fa5]{1,20})/i,
  ]
  for (const pat of labelPatterns) {
    const match = text.match(pat)
    if (match) {
      const cand = match[1].trim()
      if (isValidName(cand) && !isSectionHeader(cand)) {
        addCandidate(cand, 100)
        break
      }
    }
  }

  // 策略 2: 首行短文本验证
  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    if (firstLine && firstLine.length <= 15) {
      const cleanFirst = firstLine.replace(/^[\s\u3000]+/, '').trim()
      if (!/[\d@http%]/.test(cleanFirst) && !isSectionHeader(cleanFirst)) {
        if (chineseNameExtended.test(cleanFirst)) {
          addCandidate(cleanFirst, 85)
        } else if (englishNamePattern.test(cleanFirst) && cleanFirst.length >= 2) {
          addCandidate(cleanFirst, 80)
        }
      }
    }
  }

  // 策略 3: 性别/年龄字段上方最近的短行（高置信度）
  const genderAgePattern = /(性\s*别|年\s*龄|出生|籍贯|学历)[：:]/
  const gasMatch = text.match(genderAgePattern)
  if (gasMatch) {
    const idx = text.indexOf(gasMatch[0])
    const beforeText = text.substring(0, idx)
    const beforeLines = beforeText.split('\n').filter((l) => l.trim().length > 0)
    for (let i = beforeLines.length - 1; i >= Math.max(0, beforeLines.length - 5); i--) {
      const cand = beforeLines[i].trim()
      if (cand.length <= 8 && chineseNameExtended.test(cand) && !containsNoiseChars(cand) && !isSectionHeader(cand)) {
        addCandidate(cand, 90)
        break
      }
    }
  }

  // 策略 4: 头部区域扫描（前20行，排除区块标题）
  const headLines = lines.slice(0, 20)
  for (const line of headLines) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.length > 10) continue
    if (isSectionHeader(trimmed)) continue
    if (chineseNameExtended.test(trimmed) && !containsNoiseChars(trimmed)) {
      const isStandalone = !line.includes(' ')
      addCandidate(trimmed, isStandalone ? 75 : 55)
    } else if (englishNamePattern.test(trimmed) && trimmed.length >= 2 && !isSectionHeader(trimmed)) {
      addCandidate(trimmed, 65)
    }
  }

  // 策略 5: 基本信息区域关键词附近扫描
  const basicInfoKeywords = ['基本信息', '个人信息', '个人资料', '联系方式', 'Profile', 'Basic Info']
  for (const kw of basicInfoKeywords) {
    const kwIdx = text.indexOf(kw)
    if (kwIdx === -1) continue
    const region = text.substring(kwIdx, kwIdx + 200)
    for (const line of region.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length <= 8 && chineseNameExtended.test(trimmed) && !containsNoiseChars(trimmed) && !isSectionHeader(trimmed)) {
        addCandidate(trimmed, 70)
      }
    }
  }

  // 策略 6: 全量扫描（前30行，兜底）
  if (candidates.length === 0) {
    for (const line of lines.slice(0, 30)) {
      const trimmed = line.trim()
      if (trimmed.length === 0 || isSectionHeader(trimmed)) continue
      if (chineseNamePattern.test(trimmed) && !containsNoiseChars(trimmed)) {
        addCandidate(trimmed, 60)
        break
      }
    }
  }

  // 取置信度最高的
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].name
}

/**
 * 判断是否为有效姓名候选
 */
function isValidName(s: string): boolean {
  const trimmed = s.trim()
  if (trimmed.length === 0 || trimmed.length > 20) return false
  // 排除无效占位词
  const invalidWords = ['暂无', '未知', '无', 'null', 'none', 'name']
  if (invalidWords.includes(trimmed.toLowerCase())) return false
  // 中文姓名验证（2-6 汉字）或英文姓名
  if (/^[\u4e00-\u9fa5]{2,6}$/.test(trimmed)) return true
  if (/^[A-Za-z][A-Za-z\s.'-]{1,30}$/.test(trimmed)) return true
  return false
}

/**
 * 检查字符串是否含有噪音字符
 */
function containsNoiseChars(s: string): boolean {
  return /[\d@#$%^&*()=\[\]{}|\\<>/,.!?~`]/.test(s)
}

/**
 * 提取并保存简历照片
 */
async function extractAndSavePhoto(
  buffer: Buffer,
  fileType: string,
  options: ParseOptions
): Promise<string | null> {
  // 动态导入 sharp（用于图片处理）
  const sharp = await import('sharp')
  const { extractPhotoFromPdf, savePhoto } = await import('./pdf-image-extractor')
  const path = await import('path')

  let photoBuffer: Buffer | null = null

  if (fileType === 'pdf') {
    try {
      const photo = await extractPhotoFromPdf(buffer)
      if (photo) {
        photoBuffer = photo.buffer
      }
    } catch {
      // PDF 图片提取失败，忽略
    }
  }
  // DOCX 暂不支持照片提取

  if (!photoBuffer) {
    return null
  }

  // 使用 sharp 处理: 缩放到最大 400x400, 转为 JPEG
  const processed = await sharp.default(photoBuffer)
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  // 保存到 public/photos 目录
  const photoDir = path.join(process.cwd(), 'public', 'photos')
  fs.mkdirSync(photoDir, { recursive: true })

  const photoFileName = `${options.resumeId}_${Date.now()}.jpg`
  const photoFilePath = path.join(photoDir, photoFileName)
  fs.writeFileSync(photoFilePath, processed)

  // 返回公开访问路径
  return `/photos/${photoFileName}`
}

/**
 * 从邮件主题中通过正则提取候选人姓名
 */
export function extractCandidateNameFromSubject(
  subject: string,
  pattern: string
): string | null {
  try {
    const regex = new RegExp(pattern)
    const match = subject.match(regex)
    if (match && match[1]) {
      return match[1].trim()
    }
  } catch {
    // invalid regex, ignore
  }
  return null
}

/**
 * 从邮件主题中通过半角 | 分割提取候选人姓名
 */
function extractNameFromSubjectByPipe(subject: string): string | null {
  const pipeIndex = subject.indexOf('|')
  if (pipeIndex > 0) {
    const name = subject.substring(0, pipeIndex).trim()
    return name || null
  }
  return null
}

/**
 * 统一的 candidateName 解析函数
 * 优先级：subjectPattern 正则 > 半角 | 分割 > 简历文本提取 > "未知名称"
 */
export function resolveCandidateName(
  subject: string | null,
  subjectPattern: string | null,
  textName: string | null
): string {
  // 优先级1：subjectPattern 正则提取
  if (subject && subjectPattern) {
    const name = extractCandidateNameFromSubject(subject, subjectPattern)
    if (name) return name
  }
  // 优先级2：默认 | 分割规则
  if (subject) {
    const name = extractNameFromSubjectByPipe(subject)
    if (name) return name
  }
  // 优先级3：从简历文本提取的名字
  if (textName) return textName
  // 优先级4：兜底
  return '未知名称'
}

/**
 * 从 AI 结构化提取结果中提取候选人姓名
 * 兼容两种格式：basicInfo.name（TypeScript 类型）和顶层 name（prompt 实际输出）
 */
export function extractAiName(data: unknown): string | undefined {
  const d = data as Record<string, unknown> | undefined
  if (!d) return undefined
  const bi = d.basicInfo as Record<string, unknown> | undefined
  return (bi?.name || d.name) as string | undefined
}

/**
 * AI 提取姓名的无效值黑名单：LLM 在 PDF 文本层缺失姓名时，可能把 prompt 模板
 * 里的字段标签（"姓名"）或占位文案当值返回。真实姓名不会是这些词。
 */
const INVALID_NAME_LITERALS = new Set([
  '姓名', '名字', 'name', '姓名字符串',
  '未知', '未知名称', '无', '暂无', '未提供', '未填写', '暂无信息', 'null', 'none',
])

/**
 * 判断 AI 提取的姓名是否为有效真实姓名。
 * 无效：非字符串、空、超长（>20）、命中标签词/占位符黑名单。
 * 标签词比对前去除常见标点，兼容 "姓名：" / "姓名（字符串）" 等模板残留。
 */
export function isValidPersonName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  const n = name.trim()
  if (n.length === 0 || n.length > 20) return false
  const normalized = n.replace(/[\s：:，,。.、（）()【】\[\]]/g, '').toLowerCase()
  return !INVALID_NAME_LITERALS.has(normalized)
}

/**
 * 校正 AI 结构化提取的姓名（确定性逻辑，不交给模型）。
 *
 * 背景：PDF 文本层缺失姓名时，LLM 可能把 prompt 模板里的字段标签 "姓名" 当值
 * 返回（age 等有对应文本的字段则正常）。原逻辑 `aiName || candidateName` 只要
 * aiName 为 truthy 就采用，导致脏值 "姓名" 覆盖正确的兜底姓名（邮件主题/正则提取）。
 *
 * 规则：
 *   - aiName 有效 -> 采用 aiName，rawJson 不变
 *   - aiName 无效 -> 回退到 fallbackName（candidateName）；并把 rawJson.name 同步为
 *     fallbackName（fallback 无效时置 null），避免前端 StructuredDataView 仍展示脏值
 *
 * 返回最终姓名（用于 candidateName 字段，可能为空串）与同步后的 rawJson。
 */
export function correctAiName(
  aiName: string | undefined,
  fallbackName: string,
  rawJson: string,
): { name: string; rawJson: string } {
  if (isValidPersonName(aiName)) {
    return { name: aiName as string, rawJson }
  }
  const finalName = fallbackName || ''
  let correctedJson = rawJson
  try {
    const data = JSON.parse(rawJson) as Record<string, unknown>
    const structName = isValidPersonName(finalName) ? finalName : null
    if (data.name !== structName) {
      data.name = structName
      correctedJson = JSON.stringify(data)
    }
  } catch {
    // rawJson 解析失败，保持原样
  }
  return { name: finalName, rawJson: correctedJson }
}
