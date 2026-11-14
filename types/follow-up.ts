/**
 * 跟进管理相关共享类型定义。
 */

/** 跟进标签（follow-up 页与筛选组件共用） */
export interface Tag {
  id: string
  name: string
  color: string
  source?: string
  category?: string
}

/** 评估维度评分 */
export interface EvaluationDimension {
  dimension: string
  rating: number | null
  comment: string | null
  source: string
}

/** 跟进记录行（follow-up 页表格与详情抽屉共用） */
export interface FollowUpRecordItem {
  id: string
  note: string | null
  status: string
  interviewTime: string | null
  startDate: string | null
  rejectReason: string | null
  contacted: string
  createdAt: string
  updatedAt: string
  unsuitableAt: string | null
  resignedAt: string | null
  resignReason: string | null
  tags: Array<{ followUpTag: Tag }>
  evaluation: {
    initialScore: number | null
    compositeScore: number | null
  } | null
  resume: {
    id: string
    candidateName: string | null
    candidatePhone: string | null
    candidateEmail: string | null
    status: string
    position: { id: string; title: string } | null
    evaluationPosition: { id: string; title: string } | null
    screeningResult: { summary: string } | null
    resumeSource: { id: string; name: string } | null
    email: { subject: string; fromAddress: string; receivedAt: string } | null
    evaluationDimensions: EvaluationDimension[]
  }
}

/** 分页状态 */
export interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}
