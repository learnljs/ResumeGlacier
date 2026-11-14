/**
 * 评估提示词组装服务
 *
 * 职责（开发方案 5.1）：
 * 1. parseDimensionMarkdown：解析单个维度的 Markdown 为结构化数据（方向 + 问题 + 评分规则）
 * 2. assemblePrompt：纯函数，将四个编辑区内容 + 占位符值拼接为完整 prompt
 * 3. loadAndAssemblePrompt：运行时入口，读 DB（PromptRecord + Position + WeightModel）后调用 assemblePrompt
 * 4. validateAIOutput：根据结构化数据动态生成 schema，逐方向逐题校验 AI 返回的 answer/evidence
 *
 * 维度结构（开发方案 2.2 代码锁死）：维度(knowledge/skill) -> 方向 -> 问题 三级层级，不可扁平化。
 */

import { prisma } from '@/lib/prisma'

// === 结构化类型 ===

export interface QuestionItem {
  text: string
  criteria: string
}

export interface DirectionData {
  name: string
  questions: QuestionItem[]
}

export interface DimensionData {
  scoringRules: string // 该维度的专属评分规则文本（### 评分规则 段落内容）
  directions: DirectionData[]
}

// === 占位符 ===

/** 评估时自动替换的占位符（开发方案 2.1） */
export const PLACEHOLDERS = {
  positionTitle: '{{positionTitle}}',
  positionDescription: '{{positionDescription}}',
  requirements: '{{requirements}}',
  resumeText: '{{resumeText}}',
  knowledgeWeight: '{{knowledgeWeight}}',
  skillWeight: '{{skillWeight}}',
} as const

/** bodyText 中必须包含的占位符（保存时强制校验） */
export const REQUIRED_PLACEHOLDER = PLACEHOLDERS.resumeText

// === Markdown 解析 ===

const SCORING_RULES_HEADING = '评分规则'

/**
 * 解析单个维度的 Markdown 为结构化数据（开发方案 3.1）
 *
 * Markdown 语法（2.1）：
 * - `## 知识维度` / `## 技能维度` -> 维度边界（可选，存在则跳过）
 * - `### 评分规则` -> 保留名，其内容为该维度的专属评分规则
 * - `### xxx`（非"评分规则"）-> 方向名
 * - `数字.数字 问题文本` -> 一道题（编号仅辅助阅读，系统按解析顺序自动重算）
 * - 紧跟在问题后的缩进行 `评判标准：xxx` -> 该题的评判标准
 *
 * 解析后问题编号按"方向序.题序"自动生成（知识/技能各自从 1 开始）。
 */
export function parseDimensionMarkdown(markdown: string): DimensionData {
  const lines = markdown.split('\n')
  const directions: DirectionData[] = []
  let scoringRules = ''
  let scoringRulesLines: string[] = []
  let inScoringRules = false
  let currentDirection: DirectionData | null = null
  let currentQuestion: QuestionItem | null = null

  const finalizeQuestion = () => {
    if (currentDirection && currentQuestion) {
      currentDirection.questions.push(currentQuestion)
      currentQuestion = null
    }
  }
  const finalizeDirection = () => {
    finalizeQuestion()
    if (currentDirection) {
      directions.push(currentDirection)
      currentDirection = null
    }
  }
  const finalizeScoringRules = () => {
    if (inScoringRules) {
      scoringRules = scoringRulesLines.join('\n').trim()
      scoringRulesLines = []
      inScoringRules = false
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    const trimmed = line.trim()

    // 维度边界头（## 知识维度 / ## 技能维度）- 字段已表明维度，此处跳过
    if (/^##\s+[^#]/.test(trimmed)) {
      continue
    }

    // 三级标题 ### xxx
    const h3Match = trimmed.match(/^###\s+(.+)$/)
    if (h3Match) {
      const name = h3Match[1].trim()
      finalizeScoringRules()
      finalizeDirection()
      if (name === SCORING_RULES_HEADING) {
        inScoringRules = true
      } else {
        currentDirection = { name, questions: [] }
      }
      continue
    }

    // 问题：数字.数字 文本（行首，非缩进）
    const qMatch = line.match(/^(\d+\.\d+)\s+(.+)$/)
    if (qMatch && currentDirection) {
      finalizeQuestion()
      currentQuestion = { text: qMatch[2].trim(), criteria: '' }
      continue
    }

    // 评判标准（缩进行）
    const critMatch = line.match(/^\s+评判标准[：:]\s*(.*)$/)
    if (critMatch && currentQuestion) {
      currentQuestion.criteria = critMatch[1].trim()
      continue
    }

    // 评分规则正文
    if (inScoringRules) {
      scoringRulesLines.push(line)
      continue
    }
    // 其他行（空行、说明等）忽略
  }

  finalizeScoringRules()
  finalizeDirection()

  return { scoringRules, directions }
}

/**
 * 校验解析后的维度结构是否合法（开发方案 8 静态校验）
 * - 至少 1 个非评分规则方向
 * - 每个方向至少 1 道题
 */
export function validateDimensionStructure(data: DimensionData): string[] {
  const errors: string[] = []
  if (data.directions.length === 0) {
    errors.push('至少需要 1 个方向（### 方向名）')
    return errors
  }
  data.directions.forEach((d, i) => {
    if (d.questions.length === 0) {
      errors.push(`第 ${i + 1} 个方向「${d.name}」没有问题`)
    }
  })
  return errors
}

/** 校验单个维度 Markdown 是否可解析为合法结构 */
export function validateDimensionMarkdown(markdown: string): string[] {
  return validateDimensionStructure(parseDimensionMarkdown(markdown))
}

// === 占位符替换 ===

export interface PlaceholderValues {
  positionTitle: string
  positionDescription: string
  requirements: string
  resumeText: string
  knowledgeWeight: number
  skillWeight: number
}

/** 替换文本中的占位符为实际值 */
export function replacePlaceholders(text: string, values: PlaceholderValues): string {
  return text
    .replaceAll(PLACEHOLDERS.positionTitle, values.positionTitle)
    .replaceAll(PLACEHOLDERS.positionDescription, values.positionDescription)
    .replaceAll(PLACEHOLDERS.requirements, values.requirements)
    .replaceAll(PLACEHOLDERS.resumeText, values.resumeText)
    .replaceAll(PLACEHOLDERS.knowledgeWeight, String(values.knowledgeWeight))
    .replaceAll(PLACEHOLDERS.skillWeight, String(values.skillWeight))
}

// === prompt 拼接 ===

export interface AssembleParams extends PlaceholderValues {
  bodyText: string
  knowledgeContent: string
  skillContent: string
  overallRules: string
}

export interface AssembledPrompt {
  systemPrompt: string
  userPrompt: string
  knowledgeData: DimensionData
  skillData: DimensionData
}

/** 渲染单道题为一行说明（供 AI 阅读） */
function renderQuestion(key: string, q: QuestionItem): string {
  const criteria = q.criteria ? `\n  评判标准：${q.criteria}` : ''
  return `${key} ${q.text}${criteria}`
}

/** 生成维度段落文本：维度边界标题 + 评分规则 + 方向列表（带系统重算编号，供 AI 对齐输出 key） */
function renderDimensionSection(dimLabel: string, data: DimensionData): string {
  const lines: string[] = [`## ${dimLabel}`, '']
  if (data.scoringRules) {
    lines.push('### 评分规则', data.scoringRules, '')
  }
  data.directions.forEach((dir, di) => {
    lines.push(`### ${dir.name}`)
    dir.questions.forEach((q, qi) => {
      lines.push(renderQuestion(`${di + 1}.${qi + 1}`, q))
    })
    lines.push('')
  })
  return lines.join('\n')
}

/** 根据当前方向/问题列表动态生成 JSON 输出模板（开发方案 5.2 "代码自动生成，不可编辑"） */
export function generateJsonTemplate(knowledgeData: DimensionData, skillData: DimensionData): string {
  return JSON.stringify(
    {
      knowledge: {
        star: '<1-5整数>',
        comment: '<该维度评语>',
        directions: buildDirectionsExample(knowledgeData),
      },
      skill: {
        star: '<1-5整数>',
        comment: '<该维度评语>',
        directions: buildDirectionsExample(skillData),
      },
      extracted_tags: ['<从简历识别的硬性标签：大厂背景/管理经验，无则空数组>'],
    },
    null,
    2,
  )
}

function buildDirectionsExample(data: DimensionData): Array<{
  star: string
  questions: Array<{ key: string; answer: string; evidence: string }>
}> {
  return data.directions.map((dir, di) => ({
    star: '<1-5整数>',
    questions: dir.questions.map((q, qi) => ({
      key: `${di + 1}.${qi + 1}`,
      answer: '<true或false>',
      evidence: '<简历原文或null>',
    })),
  }))
}

/**
 * 拼接完整 prompt（开发方案 5.2 拼接顺序）
 * bodyText -> 知识维度 -> 技能维度 -> 通用评分规则 -> 输出格式(JSON 模板)
 */
export function assemblePrompt(params: AssembleParams): AssembledPrompt {
  const knowledgeData = parseDimensionMarkdown(params.knowledgeContent)
  const skillData = parseDimensionMarkdown(params.skillContent)

  // bodyText 按 {{resumeText}} 拆分：前段+后段为固定说明（进 system），简历文本单独作为 user 内容。
  // 重组目的：让 system 全固定，启用 DeepSeek 自动 context caching（批量评估时第 2 份起前缀缓存命中）。
  const resumePlaceholder = PLACEHOLDERS.resumeText
  const occurrences = params.bodyText.split(resumePlaceholder).length - 1
  if (occurrences !== 1) {
    throw new Error(
      `bodyText 必须且只能包含一个 ${resumePlaceholder} 占位符，当前找到 ${occurrences} 个`,
    )
  }
  const [bodyBefore, bodyAfter] = params.bodyText.split(resumePlaceholder)
  // 前段/后段已不含 {{resumeText}}，replacePlaceholders 仅替换职位/权重等固定占位符
  const bodyBeforeFilled = replacePlaceholders(bodyBefore, params).trim()
  const bodyAfterFilled = replacePlaceholders(bodyAfter, params).trim()

  const knowledgeSection = renderDimensionSection('知识维度', knowledgeData)
  const skillSection = renderDimensionSection('技能维度', skillData)
  const jsonTemplate = generateJsonTemplate(knowledgeData, skillData)

  const systemPrompt = [
    bodyBeforeFilled,
    bodyAfterFilled,
    '---',
    knowledgeSection,
    '---',
    skillSection,
    '---',
    '## 通用评分规则',
    '',
    params.overallRules,
    '---',
    '## 输出格式',
    '',
    '请严格按照以下 JSON 格式输出，不要输出 JSON 之外的任何内容：',
    '',
    jsonTemplate,
  ].filter(Boolean).join('\n')

  const userPrompt = params.resumeText

  return { systemPrompt, userPrompt, knowledgeData, skillData }
}

// === 运行时：从 DB 读取并组装 ===

/** 读取职位初筛 WeightModel 中的 knowledge/skill 权重（开发方案 2.1 权重占位符替换说明） */
export async function getInitialWeights(
  positionId: string,
): Promise<{ knowledgeWeight: number; skillWeight: number }> {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: { defaultInitialModelId: true },
  })
  let knowledgeWeight = 50
  let skillWeight = 50
  if (position?.defaultInitialModelId) {
    const model = await prisma.weightModel.findUnique({
      where: { id: position.defaultInitialModelId },
    })
    if (model) {
      try {
        const w = JSON.parse(model.weights) as Record<string, number>
        if (typeof w.knowledge === 'number') knowledgeWeight = w.knowledge
        if (typeof w.skill === 'number') skillWeight = w.skill
      } catch {
        // 权重 JSON 损坏，使用默认 50/50
      }
    }
  }
  return { knowledgeWeight, skillWeight }
}

/** 读取某职位的当前生效 PromptRecord（isCurrent=true，version 最大） */
export async function getCurrentPromptRecord(positionId: string) {
  return prisma.promptRecord.findFirst({
    where: { positionId, isCurrent: true },
    orderBy: { version: 'desc' },
  })
}

/**
 * 运行时主入口：读 DB -> 解析两维度 -> 拼接完整 prompt（开发方案 5.1 assemblePrompt）
 * 无 PromptRecord 时抛错（开发方案 10.2，不走硬编码 fallback）
 */
export async function loadAndAssemblePrompt(
  positionId: string,
  resumeText: string,
): Promise<AssembledPrompt> {
  const [position, record, weights] = await Promise.all([
    prisma.position.findUnique({ where: { id: positionId } }),
    getCurrentPromptRecord(positionId),
    getInitialWeights(positionId),
  ])

  if (!position) {
    throw new Error('职位不存在')
  }
  if (!record) {
    throw new Error(`职位「${position.title}」未配置评估提示词，请在提示词管理中初始化`)
  }

  return assemblePrompt({
    bodyText: record.bodyText,
    knowledgeContent: record.knowledgeContent,
    skillContent: record.skillContent,
    overallRules: record.overallRules,
    positionTitle: position.title,
    positionDescription: position.description,
    requirements: position.requirements,
    resumeText,
    knowledgeWeight: weights.knowledgeWeight,
    skillWeight: weights.skillWeight,
  })
}

// === AI 输出校验 ===

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/** 将 AI 返回的 star 字段容错为 1-5 的整数；非法返回 null */
function coerceStar(raw: unknown): number | null {
  // 字符串数字（如 "4"）-> number
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(n)) return null
  const int = Math.round(n)
  return int >= 1 && int <= 5 ? int : null
}

/** 将 AI 返回的 answer 字段容错为 boolean（兼容 "true"/"false" 字符串） */
function coerceAnswer(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

/** 校验单个维度的 AI 输出（逐方向逐题检查 answer/evidence），并就地 coerce 修正类型 */
function validateDimensionOutput(
  raw: unknown,
  expected: DimensionData,
  label: string,
): string[] {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') {
    errors.push(`缺少 ${label} 对象`)
    return errors
  }
  const dim = raw as Record<string, unknown>
  const kStar = coerceStar(dim.star)
  if (kStar === null) {
    errors.push(`${label}.star 不是 1-5 的整数`)
  } else {
    dim.star = kStar
  }
  if (typeof dim.comment !== 'string') {
    errors.push(`${label}.comment 不是字符串`)
  }
  if (!Array.isArray(dim.directions)) {
    errors.push(`${label}.directions 不是数组`)
    return errors
  }
  const dirs = dim.directions as unknown[]
  if (dirs.length !== expected.directions.length) {
    errors.push(
      `${label}.directions 数量不符（期望 ${expected.directions.length}，实际 ${dirs.length}）`,
    )
  }
  const count = Math.min(dirs.length, expected.directions.length)
  for (let i = 0; i < count; i++) {
    const dir = dirs[i] as Record<string, unknown>
    const expDir = expected.directions[i]
    const dStar = coerceStar(dir.star)
    if (dStar === null) {
      errors.push(`${label}.directions[${i}].star 不是 1-5 的整数`)
    } else {
      dir.star = dStar
    }
    if (!Array.isArray(dir.questions)) {
      errors.push(`${label}.directions[${i}].questions 不是数组`)
      continue
    }
    const qs = dir.questions as unknown[]
    if (qs.length !== expDir.questions.length) {
      errors.push(
        `${label}.directions[${i}]「${expDir.name}」问题数量不符（期望 ${expDir.questions.length}，实际 ${qs.length}）`,
      )
    }
    const qcount = Math.min(qs.length, expDir.questions.length)
    for (let j = 0; j < qcount; j++) {
      const q = qs[j] as Record<string, unknown>
      // key 容错：AI 可能 key 写错或缺失，按顺序重映射为正确 key，保证前端按 key 对齐取题面可靠
      q.key = `${i + 1}.${j + 1}`
      const ans = coerceAnswer(q.answer)
      if (ans === null) {
        errors.push(`${label}.directions[${i}].questions[${j}].answer 不是布尔值`)
      } else {
        q.answer = ans
      }
      if (q.evidence !== null && typeof q.evidence !== 'string') {
        errors.push(`${label}.directions[${i}].questions[${j}].evidence 不是字符串或 null`)
      }
    }
  }
  return errors
}

/**
 * 校验 AI 返回的完整 JSON（开发方案 4.4 / 5.1 validateAIOutput）
 * 逐方向逐题校验 answer（boolean）和 evidence（string|null），并检查 overall/summary 等
 */
export function validateAIOutput(
  parsed: unknown,
  knowledgeData: DimensionData,
  skillData: DimensionData,
): ValidationResult {
  const errors: string[] = []
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['AI 返回不是合法 JSON 对象'] }
  }
  const data = parsed as Record<string, unknown>

  errors.push(...validateDimensionOutput(data.knowledge, knowledgeData, 'knowledge'))
  errors.push(...validateDimensionOutput(data.skill, skillData, 'skill'))

  // summary/strengths/weaknesses 已从 AI 输出模板移除（阶段二输出瘦身），改为可选：存在时校验类型
  if (data.summary !== undefined && typeof data.summary !== 'string') errors.push('summary 不是字符串')
  if (data.strengths !== undefined && !Array.isArray(data.strengths)) errors.push('strengths 不是数组')
  if (data.weaknesses !== undefined && !Array.isArray(data.weaknesses)) errors.push('weaknesses 不是数组')

  return { valid: errors.length === 0, errors }
}
