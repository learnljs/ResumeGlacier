/**
 * 本地标签检测器
 *
 * 基于简历结构化数据（structuredData JSON）识别硬性标签。
 * AI 负责规则覆盖不到的模糊标签（如"大厂背景""有潜力"）。
 */

import { getEffectiveGradYear } from '@/lib/services/hard-condition-filter'

// ==================== 高校名单 ====================

/** 985 高校（39 所） */
export const UNIVERSITIES_985 = new Set([
  '北京大学', '清华大学', '中国人民大学', '北京师范大学', '北京航空航天大学',
  '北京理工大学', '中国农业大学', '中央民族大学', '复旦大学', '上海交通大学',
  '同济大学', '华东师范大学', '南京大学', '东南大学', '浙江大学',
  '中国科学技术大学', '哈尔滨工业大学', '吉林大学', '大连理工大学', '东北大学',
  '南开大学', '天津大学', '山东大学', '中国海洋大学', '武汉大学',
  '华中科技大学', '中南大学', '湖南大学', '中山大学', '华南理工大学',
  '四川大学', '电子科技大学', '重庆大学', '西安交通大学', '西北工业大学',
  '西北农林科技大学', '兰州大学', '厦门大学', '国防科技大学',
  // 常见缩写/别名
  '北大', '清华', '人大', '北师大', '北航', '北理工', '中国农大',
  '复旦', '上交', '同济', '华师大', '南大', '东大', '浙大',
  '中科大', '哈工大', '吉大', '大工', '东大', '南开', '天大',
  '山大', '海大', '武大', '华科', '中南', '湖大', '中大', '华工',
  '川大', '成电', '电子科大', '重大', '西交', '西工大', '兰大', '厦大',
])

/** 211 高校（所有 112 所，含 985 的 39 所，此处列非 985 的 211） */
export const UNIVERSITIES_211 = new Set([
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
  // 常见缩写
  '北交大', '北工大', '北科大', '北化', '北邮', '北外', '中传', '央财',
  '对外经贸', '法大', '中国政法', '华电', '中国矿大', '中国地大',
  '上财', '上大', '上外', '华理', '东华', '南航', '南理', '南师',
  '河海', '江南', '南农', '药科大学', '苏大', '武理', '华师', '华农',
  '中南财大', '西电', '长安', '陕师大', '西南交大', '西南财大', '西大',
  '合工大', '安大', '福大', '昌大', '郑大', '湖师大', '暨大', '华师',
  '川农', '云大', '贵大', '新大', '石河子', '内大', '辽大',
  '大连海事', '延边', '东北师大', '哈工程', '东北林大', '东北农大',
  '太原理工', '河北工大', '天医',
])

/** 常见海外高校关键词（用于 海归 识别） */
export const OVERSEAS_KEYWORDS = [
  'university of', 'college of', 'institute of', 'school of',
  'university', 'college', '加州大学', '纽约大学', '哥伦比亚大学',
  '芝加哥大学', '宾夕法尼亚大学', '康奈尔大学', '杜克大学',
  '麻省理工', '斯坦福', '哈佛', '耶鲁', '普林斯顿', '剑桥', '牛津',
  '帝国理工', '伦敦大学', '伦敦政经', '曼彻斯特大学', '爱丁堡大学',
  '多伦多大学', '麦吉尔大学', '不列颠哥伦比亚', '墨尔本大学',
  '悉尼大学', '新南威尔士', '新加坡国立', '南洋理工', '东京大学',
  '早稻田', '庆应', '首尔大学', '高丽大学', '延世大学',
  '香港大学', '香港中文', '香港科技', '香港城市', '香港理工',
  'ETH', 'EPFL', '苏黎世联邦', '洛桑联邦',
]

// ==================== 大厂名单 ====================

const BIG_COMPANIES = new Set([
  // 中国互联网/科技
  '阿里巴巴', '阿里', '腾讯', '字节跳动', '抖音', '头条',
  '华为', '百度', '京东', '美团', '拼多多',
  '网易', '小米', '快手', '滴滴', '哔哩哔哩', 'B站',
  '蚂蚁集团', '蚂蚁金服', '360', '新浪', '搜狐', '携程',
  '商汤', '旷视', '科大讯飞', '大疆',
  // 外企
  'Google', '谷歌', 'Microsoft', '微软', 'Apple', '苹果',
  'Amazon', '亚马逊', 'Meta', 'Facebook', 'Netflix',
  'Uber', 'Airbnb', 'LinkedIn', 'Twitter',
  // 金融机构
  '中金', '中信证券', '华泰证券', '高盛', '摩根士丹利', '摩根大通',
  '花旗', '汇丰', '麦肯锡', '波士顿咨询', '贝恩', 'BCG',
  // 其他知名企业
  '字节', 'Tesla', '特斯拉', 'NVIDIA', '英伟达', 'AMD', 'Intel', '英特尔',
  'IBM', 'Oracle', 'SAP', 'Salesforce', 'Adobe', 'Cisco', '思科',
])

// ==================== 管理经验检测 ====================

/** Tier 1 强信号正则 */
const STRONG_MGMT_PATTERNS: RegExp[] = [
  /(?:带[领过]?|管理|统[筹辖]|领导|负[责责])\s*(?:\d+\s*[多近约]?\s*[人位名个])?\s*(?:团[队组]|小[组]|部门|项目组)/,
  /下属\s*\d+\s*人/,
  /管理\s*\d+\s*[人位名]/,
  /团[队组]\s*(?:规[模模]|人[数员]|成[员员])\s*(?:约|近|达|超)?\s*\d+/,
  /(?:Team\s*Lead|Tech\s*Lead|Engineering\s*Manager|Project\s*Manager|Product\s*Manager|\bDirector\b|\bHead\s+of\b|Senior\s+Manager|\bVP\b|\bCTO\b|\bCEO\b|\bCOO\b|\bCFO\b)/i,
]

/** Tier 2 中信号：管理头衔 */
const MGMT_TITLE_PATTERNS = [
  /(?:技术|研发|工程|运营|市场|销售|财务|人事|行政|产品|项目|部门|区域|大区|分公[司司]|事业[部群])\s*(?:经理|主管|总监|负责人?)/,
  /(?:经理|主管|总监|负责人?)\s*(?:主管|经理|总监)?/,
  /(?:总[经理]|副总经理|总[监监]|副总监|事业部总|部门总)/,
]

const MGMT_ACTION_PATTERNS = [
  /(?:管理|负[责责]|带领|领导|统[筹辖]|规划|决[策策]|审批|考核|分[配配]|协调|指[导导]|培[养训])/,
]

/** 伪管理头衔（独立贡献者角色） */
const INDIVIDUAL_CONTRIBUTOR_TITLES = [
  /客户经理(?!.*(?:管理|带领|团队))/,
  /销售经理(?!.*(?:管理|带领|团队))/,
  /售后经理(?!.*(?:管理|带领|团队))/,
  /大堂经理/,
  /值班经理/,
]

// ==================== 结构化数据标签检测 ====================

/**
 * 结构化简历数据接口（对应 AI 提取的 JSON 格式）
 */
interface StructuredDataForTags {
  education?: Array<{
    school?: string
    degree?: string
    major?: string
    startDate?: string
    endDate?: string
  }>
  experience?: Array<{
    company?: string
    position?: string
    type?: string
    startDate?: string
    endDate?: string
    description?: string
  }>
  skills?: {
    programming?: string[]
    tools?: string[]
    languages?: string[]
    certifications?: string[]
  }
}

/**
 * 基于结构化数据检测标签
 */
export function detectTagsFromStructuredData(data: StructuredDataForTags): string[] {
  const tags = new Set<string>()
  const now = new Date()
  const currentYear = now.getFullYear()

  // --- 学校层级：遍历 education[].school 匹配高校名单 ---
  const schools = (data.education || []).map(e => e.school || '').filter(Boolean)

  // 985 检测
  const is985 = schools.some(s => UNIVERSITIES_985.has(s))
  if (is985) tags.add('985')

  // 211 检测（与 985 互斥）
  if (!is985) {
    const is211 = schools.some(s => UNIVERSITIES_211.has(s))
    if (is211) tags.add('211')
  }

  // 海归 检测
  const hasOverseas = schools.some(s =>
    OVERSEAS_KEYWORDS.some(kw => s.toLowerCase().includes(kw.toLowerCase()))
  )
  if (hasOverseas) tags.add('海归')

  // --- 工作经历统计（按 type 区分） ---
  let formalJobCount = 0
  let formalWorkYears = 0
  let hasInternship = false
  const allPositions: string[] = []
  const allDescriptions: string[] = []
  const allCompanies: string[] = []
  const workSegments: Array<{ start: Date; end: Date }> = []

  for (const exp of data.experience || []) {
    const type = exp.type || 'fulltime' // 兼容旧数据：无 type 默认 fulltime
    const position = exp.position || ''
    const description = exp.description || ''
    const company = exp.company || ''

    allPositions.push(position)
    allDescriptions.push(description)
    allCompanies.push(company)

    if (type === 'internship') {
      hasInternship = true
      continue
    }

    // fulltime（含旧数据无 type 的条目）
    formalJobCount++

    const start = parseDateFromString(exp.startDate)
    const end = exp.endDate === '至今' || exp.endDate === '现在' || exp.endDate === '目前'
      ? new Date()
      : parseDateFromString(exp.endDate)

    if (start && end) {
      workSegments.push({ start, end })
    }
  }

  // 计算正式工作年限：逐段累加，重叠部分去重
  formalWorkYears = sumWorkSegments(workSegments)

  // 如果无法从日期计算，尝试从 description 提取 N年 声明
  if (formalWorkYears < 0.5) {
    for (const desc of allDescriptions) {
      const yearsMatch = desc.match(/(\d+)\s*(?:多|余|个)?\s*年\s*(?:以[上内])?\s*(?:工作|从业|职场)/)
      if (yearsMatch) {
        formalWorkYears = Math.max(formalWorkYears, parseInt(yearsMatch[1]))
        break
      }
    }
  }

  // --- 计算有效毕业年份 ---
  // 取最高学历：degree 最高 → endDate 最晚优先
  const effectiveGradYear = getEffectiveGradYear(data.education || [], currentYear)

  // --- 应届/往届 决策树 ---
  // 规则：
  //   毕业年份 == 当前年份 → 应届（除非有 ≥2 年正式工作）
  //   毕业年份 <  当前年份 → 往届
  //   毕业年份 >  当前年份 → 不打标签（未来毕业生/在校生）
  //   无法判断毕业年份 + 有正式工作 → 往届
  //   无法判断毕业年份 + 无工作     → 不打标签
  const hasFormalWork = formalJobCount >= 1 && formalWorkYears >= 0.5
  let isFresh = false
  let isExperienced = false

  if (effectiveGradYear !== null) {
    if (effectiveGradYear === currentYear) {
      // 今年毕业 → 应届
      // 例外：已有 ≥2 年正式工作经历 → 往届（读书期间长期工作）
      if (hasFormalWork && formalWorkYears >= 2) {
        isExperienced = true
      } else {
        isFresh = true
      }
    } else if (effectiveGradYear < currentYear) {
      // 已毕业 → 往届
      isExperienced = true
    }
    // effectiveGradYear > currentYear → 未来毕业，不打标签
  } else {
    // 无法判断毕业年份
    if (hasFormalWork) {
      isExperienced = true
    }
    // 否则不打标签
  }

  if (isExperienced) isFresh = false
  if (isFresh) tags.add('应届')
  if (isExperienced) tags.add('往届')

  // --- 经验段位 ---
  if (formalWorkYears >= 10) {
    tags.add('10年+经验')
  } else if (formalWorkYears >= 5) {
    tags.add('5-10年经验')
  } else if (formalWorkYears >= 3) {
    tags.add('3-5年经验')
  } else if (formalWorkYears >= 1) {
    tags.add('1-3年经验')
  }

  // --- 大厂背景 ---
  for (const company of allCompanies) {
    if (BIG_COMPANIES.has(company)) {
      tags.add('大厂背景')
      break
    }
  }

  // --- 管理经验（在职位和描述中检测） ---
  const combinedText = [...allPositions, ...allDescriptions].join('\n')
  let hasManagement = false

  // Tier 1: 强信号
  for (const pattern of STRONG_MGMT_PATTERNS) {
    if (pattern.test(combinedText)) {
      hasManagement = true
      break
    }
  }

  // Tier 2: 中信号
  if (!hasManagement) {
    for (const titlePattern of MGMT_TITLE_PATTERNS) {
      const titleMatches = combinedText.matchAll(new RegExp(titlePattern.source, 'g'))
      for (const tm of titleMatches) {
        const titleStr = tm[0]
        const isIC = INDIVIDUAL_CONTRIBUTOR_TITLES.some(p => p.test(titleStr))
        if (isIC) continue

        const titlePos = tm.index!
        const titleLen = tm[0].length
        const checkStart = Math.max(0, titlePos - 30)
        const checkEnd = Math.min(combinedText.length, titlePos + titleLen + 30)
        const nearContext = combinedText.slice(checkStart, checkEnd)

        if (MGMT_ACTION_PATTERNS.some(p => p.test(nearContext))) {
          hasManagement = true
          break
        }
      }
      if (hasManagement) break
    }
  }

  if (hasManagement) {
    tags.add('管理经验')
  }

  return Array.from(tags)
}

// ==================== 工具函数 ====================

/**
 * 逐段累加工作年限，合并重叠区间避免重复计算
 * @param segments 工作经历的时间段数组
 * @returns 总工作年限（年）
 */
function sumWorkSegments(segments: Array<{ start: Date; end: Date }>): number {
  if (segments.length === 0) return 0

  // 按开始时间排序
  const sorted = [...segments].sort((a, b) => a.start.getTime() - b.start.getTime())

  let totalMs = 0
  let cursor = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    const seg = sorted[i]
    if (seg.start <= cursor.end) {
      // 重叠或相邻 → 扩展当前区间
      if (seg.end > cursor.end) {
        cursor.end = seg.end
      }
    } else {
      // 无重叠 → 结算当前区间，开始新区间
      totalMs += cursor.end.getTime() - cursor.start.getTime()
      cursor = seg
    }
  }
  // 结算最后一段
  totalMs += cursor.end.getTime() - cursor.start.getTime()

  return Math.max(0, totalMs / (365.25 * 24 * 60 * 60 * 1000))
}

/** 解析日期字符串，返回 Date 对象。格式: "YYYY-MM" 或 "YYYY" */
function parseDateFromString(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === '至今' || dateStr === '现在' || dateStr === '目前' || dateStr === '在读') {
    return null
  }
  // "2021-06" → 2021-06-01
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
