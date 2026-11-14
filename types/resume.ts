/**
 * 简历相关的类型定义
 */

// 解析结果接口（扩展版）
export interface ParseResult {
  text: string
  name: string | null
  phone: string | null
  email: string | null
  photoPath: string | null
  parseMethod: 'text' | 'ocr' | 'vision'
  warnings: string[]
  textQualityScore: number
  isGarbled: boolean
  /** PDF 文字层破碎检测命中（来自 pdf-visual-extractor 的 fragmentation stats）：
   *  true 表示 PDF 文字层本身碎片化（emptyRatio > 0.30 且 singleCharRatio > 0.40 同时满足）。
   *  这类 PDF 即使后续 OCR/vision 走通，也是 garbage in, garbage out（spec §6.4 已知限制，
   *  tesseract 把已经错位的字形重新认一遍拿到 0.75 自信度但还是碎文本），
   *  任何 parseMethod 都不应入库。门禁必须基于此字段而非 warnings 字符串。 */
  hadFragmentation: boolean
}

// 解析选项
export interface ParseOptions {
  emailId?: string
  resumeId?: string
  onProgress?: (progress: ItemProgress) => void
  skipOcr?: boolean
}

// 结构化简历数据
export interface StructuredResumeData {
  basicInfo: BasicInfo
  education: EducationEntry[]
  workExperience: WorkExperienceEntry[]
  projectExperience: ProjectExperienceEntry[]
  skills: string[]
  certificates: string[]
  languages: LanguageAbility[]
  selfEvaluation: string | null
}

export interface BasicInfo {
  name: string | null
  gender: string | null
  birthDate: string | null
  age: number | null
  phone: string | null
  email: string | null
  currentCity: string | null
  hometown: string | null
  politicalStatus: string | null
}

export interface EducationEntry {
  school: string
  major: string
  degree: string
  startDate: string | null
  endDate: string | null
}

export interface WorkExperienceEntry {
  company: string
  title: string
  department: string | null
  type?: "internship" | "fulltime"
  startDate: string | null
  endDate: string | null
  responsibilities: string
}

export interface ProjectExperienceEntry {
  name: string
  role: string | null
  startDate: string | null
  endDate: string | null
  description: string
  techStack: string[]
}

export interface LanguageAbility {
  language: string
  proficiency: string
}

// AI 配置用途类型
export type AIPurpose = 'screening' | 'extraction' | 'ocr' | 'vision'

// 解析方式
export type ParseMethod = 'text' | 'ocr' | 'vision'

// OCR 结果
export interface OcrResult {
  text: string
  confidence: number
  pageCount: number
  pagesProcessed: number
}

// 单简历进度
export interface ItemProgress {
  stage: string
  percent: number
}

// PDF 文字层破碎统计（由 pdf-visual-extractor 输出）
export interface FragmentationStats {
  totalItems: number            // pdfjs 返回的原始 item 数（含空 item，跨页累加）
  emptyItems: number            // str.trim() === '' 的 item 数（跨页累加，含纯空格 item，见 §3.1）
  singleCharItems: number       // str.trim().length === 1 的 item 数（跨页累加）
  emptyItemRatio: number        // emptyItems / totalItems（跨页累计比值）
  singleCharItemRatio: number   // singleCharItems / totalItems（跨页累计比值）
  maxPageEmptyRatio: number     // 单页 emptyItemRatio 最大值（防跨页稀释漏检）
  maxPageSingleCharRatio: number // 单页 singleCharItemRatio 最大值
}

// OCR 选项
export interface OcrOptions {
  maxPages?: number
  language?: string
  dpi?: number
  onProgress?: (page: number, total: number) => void
}

// ==================== 简历列表页共享类型 ====================

/** 简历列表项（list 页卡片流与卡片组件共用） */
export interface ResumeItem {
  id: string
  candidateName: string | null
  candidateEmail: string | null
  candidatePhone: string | null
  fileName: string
  fileType: string
  status: string
  createdAt: string
  screenedAt: string | null
  /** 详情页提取的头像路径；实际图片走 /api/resumes/[id]/photo 读取 */
  candidatePhoto?: string | null
  /** 目标岗位的维度评分，用于判断冰山模型是否打完 */
  evaluationDimensions?: Array<{
    dimension: string
    rating: number | null
    positionId?: string | null
  }> | null
  positionScores: Array<{
    positionId: string
    positionTitle: string
    initialScore: number | null
    compositeScore: number | null
  }> | null
  email: {
    subject: string
    fromAddress: string
    fromName: string | null
    receivedAt: string
  } | null
  sourceEmailSubject: string | null
  sourceEmailReceivedAt: string | null
  position: { id: string; title: string } | null
  screeningResult: { decision: string; score: number; summary: string } | null
  resumeSource: { id: string; name: string } | null
  emailConfig: { id: string; alias: string } | null
  followUpRecord: { id: string } | null
}

/** 简历列表分页状态 */
export interface ResumeListPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** 已筛选简历项（screened 页卡片流用） */
export interface ScreenedResumeItem {
  id: string
  candidateName: string | null
  candidateEmail: string | null
  candidatePhone: string | null
  fileName: string
  fileType: string
  status: string
  createdAt: string
  screenedAt: string | null
  email: {
    subject: string
    fromAddress: string
    fromName: string | null
    receivedAt: string
  } | null
  sourceEmailReceivedAt: string | null
  position: { id: string; title: string } | null
  screeningResult: { summary: string; aiTags: string | null } | null
  resumeSource: { id: string; name: string } | null
  emailConfig: { id: string; alias: string } | null
  evaluationDimensions: { dimension: string; rating: number | null; comment: string | null; source: string; positionId?: string }[]
  positionScores?: { positionId: string; positionTitle: string; evaluationId?: string; hasFollowUp?: boolean; initialScore: number | null; compositeScore: number | null }[]
}

/** 职位选项 */
export interface PositionOption {
  id: string
  title: string
}

/** 筛选项（来源 / 邮箱） */
export interface FilterOption {
  id: string
  name?: string
  alias?: string
}
