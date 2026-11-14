import type { FragmentationStats } from '@/types/resume'

/**
 * 文本质量检测器
 * 通过 5 项加权指标评估 PDF 提取文本的质量
 * 低于 40 分判定为乱码，触发 OCR 回退
 */

export interface CheckDetail {
  name: string
  passed: boolean
  score: number
  weight: number
  detail: string
}

export interface TextQualityReport {
  score: number
  isGarbled: boolean
  checks: CheckDetail[]
}

// 各检测项权重之和为 1.0
const WEIGHTS = {
  recognizableRatio: 0.25,
  cidSequences: 0.15,
  unicodeAbnormal: 0.10,
  effectiveDensity: 0.20,
  repetitionPattern: 0.10,
  semanticContent: 0.20,
}

/**
 * 可识别字符正则
 * 覆盖: 中文基本区+扩展A区、英文、数字、全角字符、中英文标点、空白符
 */
const RECOGNIZABLE_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]|[a-zA-Z]|[0-9]|[\u3000-\u303f\uff00-\uffef]|[.,;:!?，。；：！？、""''（）【】《》\-—·\s]/g

// 文字层破碎检测阈值（由 §3.4 摸底校准，见 doc/dev/简历筛选与复用评估/PDF文字层破碎检测-开发方案.md）
// 触发条件（AND 组合）：totalItems >= MIN_TOTAL_ITEMS 且 emptyRatio > EMPTY_RATIO 且 singleCharRatio > SINGLE_CHAR_RATIO
const FRAGMENTATION = {
  MIN_TOTAL_ITEMS: 24,
  EMPTY_RATIO: 0.30,
  SINGLE_CHAR_RATIO: 0.40,
} as const

/**
 * CID 字体序列模式
 */
const CID_PATTERN = /\(cid:\d+\)/g

/**
 * Unicode 异常字符模式
 * 覆盖: U+FFFD 替换符、私有使用区、代理对区残留
 */
const ABNORMAL_PATTERN = /[\uFFFD\uE000-\uF8FF\uD800-\uDFFF]/g

/**
 * 连续重复字符模式 (6+ 次相同字符)
 */
const REPETITION_PATTERN = /(.)\1{5,}/g

/**
 * 简历相关关键词（用于检测语义内容）
 */
const RESUME_KEYWORDS = [
  // 基本信息
  '姓名', '性别', '年龄', '出生', '籍贯', '学历', '专业',
  // 联系方式
  '电话', '手机', '邮箱', '地址',
  // 教育背景
  '毕业', '学校', '大学', '学院', '本科', '硕士', '博士',
  // 工作经历
  '工作', '公司', '企业', '职位', '职责', '负责',
  // 项目经验
  '项目', '经验', '开发', '设计', '实现',
  // 技能
  '技能', '熟练', '掌握', '精通', '了解',
  // 英文关键词
  'name', 'phone', 'email', 'work', 'experience', 'project', 'skill',
  'education', 'company', 'position', 'resume', 'curriculum', 'vitae',
]

/**
 * 纯数字/符号行模式（无意义内容特征）
 */
const NUMBERS_ONLY_LINE = /^[\d\s.,:;%-]+$/

/**
 * 短行高频出现模式（乱码特征）
 */
const SHORT_LINE_THRESHOLD = 30

/**
 * 十六进制乱码模式（检测Base64编码或十六进制字符串）
 */
const HEX_GIBBERISH_PATTERN = /^[a-f0-9+/=]+$/i
const HEX_CHARS_ONLY = /^[a-f0-9]+$/i

/**
 * 检测是否为十六进制乱码的阈值
 */
const HEX_RATIO_THRESHOLD = 0.8

/**
 * 分析文本质量
 */
export function analyzeTextQuality(text: string, fragmentationStats?: FragmentationStats): TextQualityReport {
  const checks: CheckDetail[] = []

  // 检测项 1: 可识别字符比率 (权重 0.40)
  const recognizableResult = checkRecognizableRatio(text)
  checks.push(recognizableResult)

  // 检测项 2: CID 字体序列 (权重 0.20)
  const cidResult = checkCidSequences(text)
  checks.push(cidResult)

  // 检测项 3: Unicode 异常字符密度 (权重 0.15)
  const unicodeResult = checkUnicodeAbnormal(text)
  checks.push(unicodeResult)

  // 检测项 4: 有效文本密度 (权重 0.15)
  const densityResult = checkEffectiveDensity(text)
  checks.push(densityResult)

  // 检测项 5: 重复模式检测 (权重 0.10)
  const repetitionResult = checkRepetitionPattern(text)
  checks.push(repetitionResult)

  // 检测项 6: 语义内容检测 (权重 0.20)
  const semanticResult = checkSemanticContent(text)
  checks.push(semanticResult)

  // 检测项 7: 文字层破碎（硬短路，weight=0，不参与加权 score）
  // 仅在传入 PDF item 级统计（fragmentationStats）时生效；OCR 文本上下文不传 → 自动跳过
  const fragmentationResult = computeFragmentationResult(fragmentationStats)
  checks.push(fragmentationResult.check)

  // 计算加权总分
  const score = checks.reduce(
    (sum, check) => sum + check.score * check.weight,
    0
  )

  // 硬性短路规则: 有效文本密度不足 (去空白后 < 20 字符) 判定为乱码
  const densityScore = checks.find((c) => c.name === '有效文本密度')?.score ?? 100
  const hardCutoff = densityScore < 40

  // CID 字体序列过多也判定为乱码
  const cidCheck = checks.find((c) => c.name === 'CID字体序列')
  const cidScore = cidCheck?.score ?? 100
  const tooManyCids = cidScore < 30

  // 重复模式得分为 0 也判定为乱码（严重重复模式）
  const repetitionScore = checks.find((c) => c.name === '重复模式')?.score ?? 100
  const severeRepetition = repetitionScore === 0

  // 语义内容过差也判定为乱码
  const semanticScore = checks.find((c) => c.name === '语义内容')?.score ?? 100
  const poorSemantic = semanticScore < 30

  const isGarbled = score < 40 || hardCutoff || tooManyCids || severeRepetition || poorSemantic || fragmentationResult.hardGarbled

  return {
    score: Math.round(score),
    isGarbled,
    checks,
  }
}

/**
 * 检测项 7: 文字层破碎（硬短路）
 *
 * PDF 文字层破碎检测：pdfjs getTextContent 返回大量空字符串 item 和单字碎片 item
 * 时，文本内容残缺但长度/关键词仍足够，6 项加权检测无法识别（见
 * doc/dev/简历筛选与复用评估/PDF文字层破碎检测-开发方案.md）。
 *
 * 判定规则（§3.4 摸底校准，AND 组合）：
 *   触发（hardGarbled=true）⇔ totalItems >= MIN_TOTAL_ITEMS
 *                          && emptyItemRatio > EMPTY_RATIO
 *                          && singleCharItemRatio > SINGLE_CHAR_RATIO
 *   累计值同时超阈值才破碎；任一指标正常即不破碎（覆盖空格排版/逐字排版两类正常简历）。
 *   maxPageRatio 仅作诊断字段，不参与判定。
 *
 * weight 恒为 0：不参与加权 score，历史评分零变化；仅作为可观测的报告字段。
 */
function computeFragmentationResult(stats?: FragmentationStats): {
  check: CheckDetail
  hardGarbled: boolean
} {
  if (!stats || stats.totalItems < FRAGMENTATION.MIN_TOTAL_ITEMS) {
    return {
      check: {
        name: '文字层破碎',
        passed: true,
        score: 100,
        weight: 0,
        detail: '样本不足或非PDF文本,跳过破碎检测',
      },
      hardGarbled: false,
    }
  }

  const { emptyItemRatio, singleCharItemRatio } = stats
  const bothExceed =
    emptyItemRatio > FRAGMENTATION.EMPTY_RATIO &&
    singleCharItemRatio > FRAGMENTATION.SINGLE_CHAR_RATIO

  if (bothExceed) {
    return {
      check: {
        name: '文字层破碎',
        passed: false,
        score: 0,
        weight: 0,
        detail: `检测到文字层破碎(empty=${(emptyItemRatio * 100).toFixed(1)}%, single=${(singleCharItemRatio * 100).toFixed(1)}%),强制走OCR回退`,
      },
      hardGarbled: true,
    }
  }

  return {
    check: {
      name: '文字层破碎',
      passed: true,
      score: 100,
      weight: 0,
      detail: `未检测到文字层破碎(empty=${(emptyItemRatio * 100).toFixed(1)}%, single=${(singleCharItemRatio * 100).toFixed(1)}%)`,
    },
    hardGarbled: false,
  }
}

/**
 * 检测项 1: 可识别字符比率
 */
function checkRecognizableRatio(text: string): CheckDetail {
  if (text.length === 0) {
    return {
      name: '可识别字符比率',
      passed: false,
      score: 0,
      weight: WEIGHTS.recognizableRatio,
      detail: '文本为空',
    }
  }

  // 剥离 CID 序列后再计算可识别比率，避免 CID 中的 ASCII 字符被误判为可识别文本
  const textWithoutCid = text.replace(CID_PATTERN, '')
  const recognizableMatches = textWithoutCid.match(RECOGNIZABLE_PATTERN) || []
  // 分母仍使用原始文本长度，CID 字符被视为不可识别
  const ratio = recognizableMatches.length / text.length

  let score: number
  if (ratio >= 0.85) {
    score = 100
  } else if (ratio >= 0.70) {
    score = 75
  } else if (ratio >= 0.50) {
    score = 45
  } else if (ratio >= 0.30) {
    score = 20
  } else {
    score = 0
  }

  return {
    name: '可识别字符比率',
    passed: score >= 75,
    score,
    weight: WEIGHTS.recognizableRatio,
    detail: `${(ratio * 100).toFixed(1)}% 字符可识别`,
  }
}

/**
 * 检测项 2: CID 字体序列
 */
function checkCidSequences(text: string): CheckDetail {
  const matches = text.match(CID_PATTERN) || []
  const count = matches.length

  let score: number
  if (count === 0) {
    score = 100
  } else if (count <= 2) {
    score = 60
  } else if (count <= 5) {
    score = 30
  } else if (count <= 10) {
    score = 10
  } else {
    score = 0
  }

  return {
    name: 'CID字体序列',
    passed: count === 0,
    score,
    weight: WEIGHTS.cidSequences,
    detail: count === 0 ? '无CID序列' : `发现${count}处CID序列`,
  }
}

/**
 * 检测项 3: Unicode 异常字符密度
 */
function checkUnicodeAbnormal(text: string): CheckDetail {
  if (text.length === 0) {
    return {
      name: 'Unicode异常字符',
      passed: true,
      score: 100,
      weight: WEIGHTS.unicodeAbnormal,
      detail: '文本为空',
    }
  }

  const abnormalMatches = text.match(ABNORMAL_PATTERN) || []
  const density = abnormalMatches.length / text.length

  let score: number
  if (density < 0.01) {
    score = 100
  } else if (density < 0.05) {
    score = 60
  } else if (density < 0.15) {
    score = 25
  } else {
    score = 0
  }

  return {
    name: 'Unicode异常字符',
    passed: density < 0.01,
    score,
    weight: WEIGHTS.unicodeAbnormal,
    detail:
      abnormalMatches.length === 0
        ? '无异常字符'
        : `密度${(density * 100).toFixed(1)}% (${abnormalMatches.length}处)`,
  }
}

/**
 * 检测项 4: 有效文本密度
 */
function checkEffectiveDensity(text: string): CheckDetail {
  // 去除所有空白和控制字符
  const strippedText = text.replace(/[\s\x00-\x1f\x7f]/g, '')
  const length = strippedText.length

  let score: number
  if (length >= 100) {
    score = 100
  } else if (length >= 50) {
    score = 70
  } else if (length >= 20) {
    score = 40
  } else if (length >= 10) {
    score = 15
  } else {
    score = 0
  }

  return {
    name: '有效文本密度',
    passed: length >= 50,
    score,
    weight: WEIGHTS.effectiveDensity,
    detail: `去空白后${length}字符`,
  }
}

/**
 * 检测项 5: 重复模式检测
 */
function checkRepetitionPattern(text: string): CheckDetail {
  if (text.length === 0) {
    return {
      name: '重复模式',
      passed: true,
      score: 100,
      weight: WEIGHTS.repetitionPattern,
      detail: '文本为空',
    }
  }

  // 检测连续重复字符
  const repetitions = text.match(REPETITION_PATTERN) || []
  const repetitionCharCount = repetitions.reduce((sum, m) => sum + m.length, 0)
  const repetitionRatio = repetitionCharCount / text.length

  // 检测短序列高频重复 (1-3 字符块)
  const chunks = text.match(/.{1,3}/g) || []
  const chunkFreq = new Map<string, number>()
  chunks.forEach((c) => chunkFreq.set(c, (chunkFreq.get(c) || 0) + 1))
  const maxFreq = chunks.length > 0 ? Math.max(...chunkFreq.values(), 0) : 0
  const dominantRatio = chunks.length > 0 ? maxFreq / chunks.length : 0

  // 检测行重复模式（多行相同 = 乱码特征）
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  let lineRepetition = false
  if (lines.length >= 3) {
    const firstLine = lines[0]
    const sameLineCount = lines.filter(l => l === firstLine).length
    const sameLineRatio = sameLineCount / lines.length
    // 如果超过 60% 的非空行完全相同，判定为乱码
    if (sameLineRatio > 0.6) {
      lineRepetition = true
    }
  }

  let score: number
  // 如果检测到行重复，直接判定为乱码（0分）
  if (lineRepetition) {
    score = 0
  } else if (repetitionRatio < 0.05 && dominantRatio < 0.15) {
    score = 100
  } else if (repetitionRatio < 0.20 && dominantRatio < 0.40) {
    score = 50
  } else {
    score = 0
  }

  const details: string[] = []
  if (repetitions.length > 0) {
    details.push(`${repetitions.length}处连续重复`)
  }
  if (dominantRatio >= 0.15) {
    details.push(`最高频字符占比${(dominantRatio * 100).toFixed(1)}%`)
  }
  if (lineRepetition) {
    details.push('检测到多行完全相同（疑似加密/乱码）')
  }

  return {
    name: '重复模式',
    passed: score === 100,
    score,
    weight: WEIGHTS.repetitionPattern,
    detail:
      details.length === 0
        ? '无明显重复模式'
        : details.join(', '),
  }
}

/**
 * 检测项 6: 语义内容检测
 * 判断文本是否包含有意义的简历相关内容
 */
function checkSemanticContent(text: string): CheckDetail {
  if (text.length === 0) {
    return {
      name: '语义内容',
      passed: false,
      score: 0,
      weight: WEIGHTS.semanticContent,
      detail: '文本为空',
    }
  }

  // 检测十六进制乱码（Base64或纯十六进制字符串）
  const strippedText = text.replace(/\s/g, '')
  
  // 如果文本主要由十六进制字符组成（>80%），且长度较长，判定为乱码
  const hexChars = (strippedText.match(/[a-f0-9]/gi) || []).length
  const hexRatio = strippedText.length > 0 ? hexChars / strippedText.length : 0
  
  if (strippedText.length >= 50 && hexRatio > HEX_RATIO_THRESHOLD) {
    return {
      name: '语义内容',
      passed: false,
      score: 0,
      weight: WEIGHTS.semanticContent,
      detail: `检测到十六进制乱码（十六进制字符占比${(hexRatio * 100).toFixed(0)}%）`,
    }
  }

  const lowerText = text.toLowerCase()
  
  // 1. 检测简历相关关键词
  let keywordCount = 0
  for (const keyword of RESUME_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      keywordCount++
    }
  }

  // 2. 检测纯数字行比例（乱码特征）
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  const numberOnlyLines = lines.filter(l => NUMBERS_ONLY_LINE.test(l.trim()))
  const numberLineRatio = lines.length > 0 ? numberOnlyLines.length / lines.length : 0

  // 3. 检测短行比例（乱码特征）
  const shortLines = lines.filter(l => l.length < SHORT_LINE_THRESHOLD)
  const shortLineRatio = lines.length > 0 ? shortLines.length / lines.length : 0

  // 4. 检测平均词长（乱码通常词长很短或很长）
  const words = lowerText.split(/\s+/).filter(w => w.length > 0)
  const avgWordLength = words.length > 0 
    ? words.reduce((sum, w) => sum + w.length, 0) / words.length 
    : 0

  // 5. 检测中文字符比例（简历通常包含中文）
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const chineseRatio = text.length > 0 ? chineseChars / text.length : 0

  // 综合评分
  let score: number
  const reasons: string[] = []

  // 如果超过 70% 的行为纯数字，判定为无效
  if (numberLineRatio > 0.7) {
    score = 0
    reasons.push(`纯数字行占比${(numberLineRatio * 100).toFixed(0)}%`)
  }
  // 如果超过 80% 的行为短行，且关键词很少，判定为无效
  else if (shortLineRatio > 0.8 && keywordCount === 0) {
    score = 0
    reasons.push('短行过多且无关键词')
  }
  // 如果完全没有中文且关键词很少，判定为低质量
  else if (chineseRatio < 0.05 && keywordCount < 2) {
    score = 10
    reasons.push('缺少中文内容')
  }
  // 如果关键词很多，判定为高质量
  else if (keywordCount >= 5) {
    score = 100
  }
  // 如果有一些关键词
  else if (keywordCount >= 2) {
    score = 70
  }
  // 如果有少量关键词
  else if (keywordCount >= 1) {
    score = 40
  }
  // 没有关键词但看起来不像乱码
  else {
    // 检查平均词长是否合理（正常英文单词平均4-10个字符）
    if (avgWordLength > 0 && avgWordLength < 3) {
      score = 10
      reasons.push('词长过短，疑似乱码')
    } else {
      score = 25
      reasons.push('未检测到简历相关关键词')
    }
  }

  return {
    name: '语义内容',
    passed: score >= 40,
    score,
    weight: WEIGHTS.semanticContent,
    detail: keywordCount > 0
      ? `发现${keywordCount}个简历关键词`
      : (reasons.length > 0 ? reasons.join(', ') : '未识别到语义内容'),
  }
}
