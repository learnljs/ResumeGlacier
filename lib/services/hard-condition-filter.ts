/**
 * 硬性条件过滤器
 *
 * 用于候选池查询：解析 structuredData JSON，逐条比对硬性条件。
 * 工作年限只计算 type="fulltime" 的正式工作经历，实习经历不计入。
 */

// ==================== 类型 ====================

export interface HardConditions {
  minEducation?: string       // "本科" | "硕士" | "博士" 等
  schoolTier?: string         // "985/211" | "985" | "211" | "海归"
  majors?: string             // 逗号分隔: "计算机科学,软件工程"
  minWorkYears?: number       // 最小工作年限
  minGraduationYears?: number // 最小毕业年限（毕业距今的年数）
  maxGraduationYears?: number // 最大毕业年限（毕业距今的年数）
  englishLevel?: string       // "四级" | "六级" | "专四" | "专八" 等
}

/** AI 提取的 experience 条目（对应 structuredData JSON） */
interface ExperienceEntry {
  company?: string
  position?: string
  type?: string
  startDate?: string
  endDate?: string
  description?: string
}

/** AI 提取的 education 条目 */
interface EducationEntry {
  school?: string
  degree?: string
  major?: string
  startDate?: string
  endDate?: string
  description?: string
}

/** AI 提取的 skills 对象 */
interface SkillsData {
  programming?: string[]
  tools?: string[]
  languages?: string[]
  certifications?: string[]
}

// ==================== 常量 ====================

/** 学历层级映射 */
const EDUCATION_RANK: Record<string, number> = {
  '其他': 0,
  '初中': 1,
  '高中': 2,
  '中专': 3,
  '大专': 4,
  '本科': 5,
  '硕士': 6,
  '博士': 7,
}

/** 英语等级映射 */
const ENGLISH_RANK: Record<string, number> = {
  '四级': 1,
  '六级': 2,
  '专四': 3,
  '专八': 4,
}

/** 院校档次关键词 */
const OVERSEAS_KEYWORDS = [
  'university of', 'college of', 'institute of',
  '加州大学', '纽约大学', '麻省理工', '斯坦福', '哈佛', '剑桥', '牛津',
  '帝国理工', '伦敦大学', '多伦多大学', '墨尔本大学', '悉尼大学',
  '新加坡国立', '南洋理工', '东京大学', '香港大学', '香港中文', '香港科技',
  'ETH', 'EPFL',
]

// ==================== 主函数 ====================

/**
 * 判断单条简历是否满足所有硬性条件
 * @param structuredData 解析后的结构化数据对象
 * @param conditions 硬性条件（所有字段可选，不传表示不限制）
 */
export function matchesHardConditions(
  structuredData: Record<string, unknown>,
  conditions: HardConditions
): boolean {
  // 学历
  if (conditions.minEducation) {
    if (!checkEducation(structuredData, conditions.minEducation)) return false
  }

  // 院校档次
  if (conditions.schoolTier) {
    if (!checkSchoolTier(structuredData, conditions.schoolTier)) return false
  }

  // 专业
  if (conditions.majors) {
    if (!checkMajor(structuredData, conditions.majors)) return false
  }

  // 工作年限
  if (conditions.minWorkYears && conditions.minWorkYears > 0) {
    if (!checkWorkYears(structuredData, conditions.minWorkYears)) return false
  }

  // 毕业年限
  if (
    conditions.minGraduationYears != null ||
    conditions.maxGraduationYears != null
  ) {
    if (!checkGraduationYears(structuredData, conditions.minGraduationYears, conditions.maxGraduationYears)) return false
  }

  // 英语等级
  if (conditions.englishLevel) {
    if (!checkEnglishLevel(structuredData, conditions.englishLevel)) return false
  }

  return true
}

// ==================== 各条件检查函数 ====================

/**
 * 从教育经历数组中找出最高学历的条目
 * 按 EDUCATION_RANK 排序，rank 最高的为最高学历
 */
export function getHighestEducation(
  education: Array<{ degree?: string; school?: string; major?: string }>
): (typeof education)[0] | null {
  if (education.length === 0) return null

  let best: (typeof education)[0] = education[0]
  let bestRank = -1

  for (const edu of education) {
    const rank = EDUCATION_RANK[edu.degree || ''] ?? 0
    if (rank > bestRank) {
      bestRank = rank
      best = edu
    }
  }

  return best
}

/** 检查学历 */
function checkEducation(data: Record<string, unknown>, minEducation: string): boolean {
  const targetRank = EDUCATION_RANK[minEducation] ?? 0
  if (targetRank === 0) return true // 未知条件，不限制

  const education = getArrayField(data, 'education') as EducationEntry[]
  let highestRank = 0

  for (const edu of education) {
    const degree = edu.degree || ''
    const rank = EDUCATION_RANK[degree] ?? 0
    if (rank > highestRank) highestRank = rank
  }

  // 如果 education 数组为空，尝试从 selfEvaluation 推测
  if (highestRank === 0) {
    const selfEval = data.selfEvaluation as string | undefined
    if (selfEval) {
      for (const [key, rank] of Object.entries(EDUCATION_RANK)) {
        if (selfEval.includes(key) && rank > highestRank) {
          highestRank = rank
        }
      }
    }
  }

  return highestRank >= targetRank
}

/** 检查院校档次 */
function checkSchoolTier(data: Record<string, unknown>, tier: string): boolean {
  const education = getArrayField(data, 'education') as EducationEntry[]
  const schools = education.map(e => e.school || '').filter(Boolean)

  // 需要从 tag-detector 引入的高校名单 —— 这里做轻量判断
  // 完整判断应在候选池 API 层引入 UNIVERSITIES_985/211
  const is985 = schools.some(s => is985School(s))
  const is211 = schools.some(s => is211School(s))
  const isOverseas = schools.some(s =>
    OVERSEAS_KEYWORDS.some(kw => s.toLowerCase().includes(kw.toLowerCase()))
  )

  switch (tier) {
    case '985':
      return is985
    case '211':
      return is211 || is985
    case '985/211':
      return is985 || is211
    case '海归':
      return isOverseas
    default:
      return true
  }
}

/** 检查专业 */
function checkMajor(data: Record<string, unknown>, majors: string): boolean {
  const conditionMajors = majors.split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
  if (conditionMajors.length === 0) return true

  const education = getArrayField(data, 'education') as EducationEntry[]
  const candidateMajors = education.map(e => e.major || '').filter(Boolean)

  // 任意一个候选人专业包含任意一个条件专业关键词
  return conditionMajors.some(cm =>
    candidateMajors.some(candidate => candidate.includes(cm) || cm.includes(candidate))
  )
}

/** 检查工作年限（只计算 type="fulltime" 的条目） */
function checkWorkYears(data: Record<string, unknown>, minYears: number): boolean {
  const years = calculateWorkYears(data)
  return years >= minYears
}

/** 检查毕业年限 */
function checkGraduationYears(data: Record<string, unknown>, minYears?: number, maxYears?: number): boolean {
  const years = calculateGraduationYears(data)
  // 无法确定毕业年份 → 保守策略：不满足条件
  if (years === null) return false
  // 尚未毕业（在读）→ 不满足条件
  if (years < 0) return false
  if (minYears != null && years < minYears) return false
  if (maxYears != null && years > maxYears) return false
  return true
}

/** 检查英语等级 */
function checkEnglishLevel(data: Record<string, unknown>, level: string): boolean {
  const targetRank = ENGLISH_RANK[level] ?? 0
  if (targetRank === 0) {
    // 也支持雅思/托福
    if (level.includes('雅思') || level.includes('IELTS')) {
      return checkEnglishByExam(data, 'ielts')
    }
    if (level.includes('托福') || level.includes('TOEFL')) {
      return checkEnglishByExam(data, 'toefl')
    }
    return true
  }

  const languages = getLanguages(data)
  const candidateRank = getEnglishRank(languages)

  return candidateRank >= targetRank
}

// ==================== 工具函数 ====================

/** 计算正式工作年限（逐段累加，重叠去重，实习不计入） */
export function calculateWorkYears(data: Record<string, unknown>): number {
  const experience = getArrayField(data, 'experience') as ExperienceEntry[]
  const segments: Array<{ start: Date; end: Date }> = []

  for (const exp of experience) {
    if (exp.type === 'internship') continue
    if (exp.type && exp.type !== 'fulltime') continue

    const start = parseDate(exp.startDate)
    const end = exp.endDate === '至今' || exp.endDate === '现在' || exp.endDate === '目前'
      ? new Date()
      : parseDate(exp.endDate)

    if (start && end) {
      segments.push({ start, end })
    }
  }

  return sumWorkSegments(segments)
}

/**
 * 逐段累加工作年限，合并重叠区间避免重复计算
 */
function sumWorkSegments(segments: Array<{ start: Date; end: Date }>): number {
  if (segments.length === 0) return 0

  const sorted = [...segments].sort((a, b) => a.start.getTime() - b.start.getTime())

  let totalMs = 0
  let cursor = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    const seg = sorted[i]
    if (seg.start <= cursor.end) {
      if (seg.end > cursor.end) {
        cursor.end = seg.end
      }
    } else {
      totalMs += cursor.end.getTime() - cursor.start.getTime()
      cursor = seg
    }
  }
  totalMs += cursor.end.getTime() - cursor.start.getTime()

  return Math.max(0, totalMs / (365.25 * 24 * 60 * 60 * 1000))
}

/** 解析日期字符串 "YYYY-MM" → Date */
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{4})(?:[-./](\d{1,2}))?/)
  if (match) {
    const year = parseInt(match[1])
    const month = match[2] ? parseInt(match[2]) : 1
    if (year >= 1990 && year <= 2100) {
      return new Date(year, month - 1, 1)
    }
  }
  return null
}

/** 兼容两种格式：扁平 和 basicInfo 嵌套 */
function getArrayField(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const direct = data[key]
  if (Array.isArray(direct)) return direct as Record<string, unknown>[]

  // 嵌套格式: basicInfo 下无数组，仅用于 experience/education/projects
  return []
}

/** 获取语言列表 */
function getLanguages(data: Record<string, unknown>): string[] {
  const skills = data.skills as SkillsData | undefined
  if (skills?.languages) return skills.languages

  // 兼容嵌套格式
  const languages = data.languages
  if (Array.isArray(languages)) {
    return (languages as Array<{ language?: string; proficiency?: string }>)
      .map(l => `${l.language || ''} ${l.proficiency || ''}`.trim())
  }

  return []
}

/** 从语言列表获取英语等级 rank */
function getEnglishRank(languages: string[]): number {
  let maxRank = 0
  for (const lang of languages) {
    const lower = lang.toLowerCase()
    if (/四级|cet-?\s*4/i.test(lower)) maxRank = Math.max(maxRank, 1)
    if (/六级|cet-?\s*6/i.test(lower)) maxRank = Math.max(maxRank, 2)
    if (/专四|tem-?\s*4/i.test(lower)) maxRank = Math.max(maxRank, 3)
    if (/专八|tem-?\s*8/i.test(lower)) maxRank = Math.max(maxRank, 4)
  }
  return maxRank
}

/** 检查雅思/托福 */
function checkEnglishByExam(data: Record<string, unknown>, exam: 'ielts' | 'toefl'): boolean {
  const languages = getLanguages(data)
  for (const lang of languages) {
    if (exam === 'ielts') {
      const match = lang.match(/雅思\s*(\d+(?:\.\d+)?)/i) || lang.match(/IELTS\s*(\d+(?:\.\d+)?)/i)
      if (match && parseFloat(match[1]) >= 6.0) return true
    }
    if (exam === 'toefl') {
      const match = lang.match(/托福\s*(\d+)/i) || lang.match(/TOEFL\s*(\d+)/i)
      if (match && parseInt(match[1]) >= 80) return true
    }
  }
  return false
}

// ==================== 轻量学校判断（不依赖 tag-detector 导入） ====================

function is985School(school: string): boolean {
  const top985 = [
    '北京大学', '清华大学', '中国人民大学', '北京师范大学', '北京航空航天大学',
    '北京理工大学', '中国农业大学', '中央民族大学', '复旦大学', '上海交通大学',
    '同济大学', '华东师范大学', '南京大学', '东南大学', '浙江大学',
    '中国科学技术大学', '哈尔滨工业大学', '吉林大学', '大连理工大学', '东北大学',
    '南开大学', '天津大学', '山东大学', '中国海洋大学', '武汉大学',
    '华中科技大学', '中南大学', '湖南大学', '中山大学', '华南理工大学',
    '四川大学', '电子科技大学', '重庆大学', '西安交通大学', '西北工业大学',
    '西北农林科技大学', '兰州大学', '厦门大学', '国防科技大学',
    '北大', '清华', '人大', '北师大', '北航', '北理工', '中国农大',
    '复旦', '上交', '同济', '华师大', '南大', '东大', '浙大',
    '中科大', '哈工大', '吉大', '大工', '南开', '天大',
    '山大', '海大', '武大', '华科', '中南', '湖大', '中大', '华工',
    '川大', '成电', '电子科大', '重大', '西交', '西工大', '兰大', '厦大',
  ]
  return top985.includes(school)
}

function is211School(school: string): boolean {
  if (is985School(school)) return true
  const top211 = [
    '北京交通大学', '北京工业大学', '北京科技大学', '北京化工大学', '北京邮电大学',
    '北京林业大学', '北京中医药大学', '北京外国语大学', '中国传媒大学', '中央财经大学',
    '对外经济贸易大学', '北京体育大学', '中国政法大学', '华北电力大学', '中国矿业大学',
    '中国石油大学', '中国地质大学', '上海财经大学', '上海大学', '上海外国语大学',
    '华东理工大学', '东华大学', '南京航空航天大学', '南京理工大学', '南京师范大学',
    '河海大学', '江南大学', '南京农业大学', '中国药科大学', '苏州大学',
    '武汉理工大学', '华中师范大学', '华中农业大学', '中南财经政法大学',
    '西安电子科技大学', '长安大学', '陕西师范大学', '西南交通大学', '西南财经大学',
    '西南大学', '合肥工业大学', '安徽大学', '福州大学', '南昌大学',
    '郑州大学', '湖南师范大学', '暨南大学', '华南师范大学', '广西大学',
    '海南大学', '四川农业大学', '云南大学', '贵州大学', '西藏大学',
    '青海大学', '宁夏大学', '新疆大学', '石河子大学', '内蒙古大学',
    '辽宁大学', '大连海事大学', '延边大学', '东北师范大学', '哈尔滨工程大学',
    '东北林业大学', '东北农业大学', '太原理工大学', '河北工业大学', '天津医科大学',
    '北交大', '北工大', '北科大', '北化', '北邮', '北外', '中传', '央财',
    '对外经贸', '法大', '中国政法', '华电', '中国矿大', '中国地大',
    '上财', '上大', '上外', '华理', '东华', '南航', '南理', '南师',
  ]
  return top211.includes(school)
}

// ==================== 毕业年份计算 ====================

/** 学历 → 学制（年）映射，用于推断在读学生的毕业年份 */
const DEGREE_DURATION: Record<string, number> = {
  '博士': 4,
  '硕士': 3,
  '本科': 4,
  '大专': 3,
  '中专': 3,
  '高中': 3,
}
const DEFAULT_DURATION = 4

/** 从日期字符串提取年份 */
function extractYear(dateStr: string | null | undefined): number | null {
  if (!dateStr || dateStr === '在读' || dateStr === '在学' || dateStr === '至今') return null
  const match = dateStr.match(/(\d{4})/)
  return match ? parseInt(match[1]) : null
}

/**
 * 获取有效毕业年份
 * - 最高学历有明确 endDate → 取该年份
 * - 最高学历为"在读" → 用 startDate + 学制推断
 * - 返回 null 表示无法判断
 */
export function getEffectiveGradYear(
  education: Array<{ degree?: string; startDate?: string; endDate?: string }>,
  currentYear: number
): number | null {
  if (education.length === 0) return null

  const DEGREE_RANK: Record<string, number> = {
    '博士': 7, '硕士': 6, '本科': 5, '大专': 4,
    '中专': 3, '高中': 2, '初中': 1, '其他': 0,
  }

  let best: (typeof education)[0] | null = null
  let bestRank = -1

  for (const edu of education) {
    const rank = DEGREE_RANK[edu.degree || ''] ?? 0
    if (rank > bestRank) {
      bestRank = rank
      best = edu
    } else if (rank === bestRank && best) {
      const bestEnd = extractYear(best.endDate) ?? 0
      const curEnd = extractYear(edu.endDate) ?? 0
      if (curEnd > bestEnd) best = edu
    }
  }

  if (!best) return null

  const endYear = extractYear(best.endDate)
  if (endYear !== null) return endYear

  // 在读/至今/现在/目前：尚未毕业，用 startDate + 学制推断毕业年份
  // 注：calculateWorkYears 也把这些值当作「进行中」，此处保持口径一致
  if (best.endDate === '在读' || best.endDate === '在学' || best.endDate === '至今' || best.endDate === '现在' || best.endDate === '目前') {
    const startYear = extractYear(best.startDate)
    if (startYear !== null) {
      const duration = DEGREE_DURATION[best.degree || ''] || DEFAULT_DURATION
      return startYear + duration
    }
  }

  return null
}

/**
 * 计算毕业距今的年数
 * @returns 毕业年数，无法确定返回 null
 */
export function calculateGraduationYears(data: Record<string, unknown>): number | null {
  const education = getArrayField(data, 'education') as Array<{
    degree?: string; startDate?: string; endDate?: string
  }>
  const gradYear = getEffectiveGradYear(education, new Date().getFullYear())
  if (gradYear === null) return null
  return new Date().getFullYear() - gradYear
}
