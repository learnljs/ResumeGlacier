/**
 * 简历详情页共享类型（B9 从 page.tsx 下沉）。
 */

/** 详情页单条岗位评估 */
export interface ResumeDetailEvaluation {
  id: string
  positionId: string
  summary: string
  strengths: string
  weaknesses: string
  aiTags: string | null
  aiModel: string
  tokenUsage: number | null
  promptTokens: number | null
  completionTokens: number | null
  cachedTokens: number | null
  reasoningTokens: number | null
  processingTime: number | null
  initialScore: number | null
  compositeScore: number | null
  screenedAt: string | null
  createdAt: string
  aiConfig: { id: string; alias: string; provider: string; model: string } | null
  position: { id: string; title: string } | null
  followUpRecord: { id: string } | null
}

/** 详情页简历实体 */
export interface ResumeDetail {
  id: string
  candidateName: string | null
  candidatePhone: string | null
  candidateEmail: string | null
  candidatePhoto: string | null
  fileName: string
  fileType: string
  fileSize: number
  extractedText: string | null
  errorMessage: string | null
  status: string
  parseMethod: string | null
  structuredData: string | null
  createdAt: string
  email: {
    id: string
    messageId: string
    fromAddress: string
    fromName: string | null
    subject: string
    receivedAt: string
  } | null
  sourceEmailFrom: string | null
  sourceEmailSubject: string | null
  sourceEmailReceivedAt: string | null
  position: {
    id: string
    title: string
    department: string | null
  } | null
  evaluations: ResumeDetailEvaluation[]
  resumeSource: { id: string; name: string } | null
  emailConfig: { id: string; alias: string; user: string } | null
}

/** 详情页单维度评估数据（雷达图 / 评分编辑共用） */
export interface EvaluationData {
  id: string
  dimension: string
  rating: number | null
  comment: string | null
  aiDetail: Record<string, unknown> | null
  source: string
}

/** 权重模型原始记录（weights 为 JSON 字符串，直接来自 API / Prisma） */
export interface WeightModelRecord {
  id: string
  name: string
  category: string
  weights: string
}

/** 详情页 Tab 键 */
export type ResumeDetailTab = 'evaluation' | 'text' | 'error' | 'structured'
