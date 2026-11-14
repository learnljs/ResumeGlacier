/**
 * 简历复用评估（reevaluate）页共享类型（B9 从 page.tsx 下沉）。
 */

/** 岗位选项（含部门，用于「投递岗位」按部门联动过滤） */
export interface ReevaluatePosition {
  id: string
  title: string
  department?: string | null
  hasModel?: boolean
}

/** 候选池候选人行 */
export interface ReevaluateCandidate {
  id: string
  sourceEmailReceivedAt: string | null
  candidateName: string
  gender: string | null
  candidatePhone: string | null
  education: string | null
  school: string | null
  major: string | null
  graduationYear: number | null
  workYears: number
  positionTitle: string | null
  knowledgeRating: number | null
  skillRating: number | null
  initialScore: number | null
  evaluated: boolean
  evaluationId: string | null
  aiTags: string[]
}

/** 硬性筛选条件（发给 candidate-pool / reevaluate 接口） */
export interface ReevaluateConditions {
  minEducation?: string
  schoolTier?: string
  majors?: string
  minWorkYears?: number
  minGraduationYears?: number
  maxGraduationYears?: number
  englishLevel?: string
}

/** 表单中的筛选值（全部为字符串，空串表示不限） */
export interface ReevaluateFilterValues {
  minEducation: string
  schoolTier: string
  majors: string
  minWorkYears: string
  minGraduationYears: string
  maxGraduationYears: string
  englishLevel: string
}

/** 持久化的评估批次状态（跨页面导航恢复轮询） */
export interface SavedReevaluateBatch {
  batchId: string
  positionId: string
  evaluating: boolean
}

/** 持久化的筛选状态 */
export interface SavedReevaluateFilters {
  selectedPositionId: string
  appliedPositionIds: string[]
  minEducation: string
  schoolTier: string
  majors: string
  minWorkYears: string
  minGraduationYears: string
  maxGraduationYears: string
  englishLevel: string
  showFilters: boolean
  hasCandidates: boolean
}
