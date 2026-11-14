/**
 * 任务批次页面数据类型（代码质量专项：自 task-batches/page.tsx 抽出）。
 * 与 /api/task-batches 的响应结构对应，页面与后续拆出的子组件共用。
 */

export interface BatchEmailConfig {
  id: string
  alias: string
  user: string
}

export interface TaskBatch {
  id: string
  batchNo: string
  source: string
  sourceDetail: string | null
  emailConfigId: string | null
  emailConfig: BatchEmailConfig | null
  totalResumes: number
  parsedCount: number
  screenedCount: number
  errorCount: number
  screenErrorCount: number
  screeningCount: number
  status: string
  startedAt: string
  completedAt: string | null
  createdAt: string
  progress: {
    parsing: number
    screening: number
  }
}

export interface BatchResumeItem {
  id: string
  fileName: string
  candidateName: string | null
  status: string
  errorMessage: string | null
  createdAt: string
}

export interface BatchDetail extends TaskBatch {
  resumes: BatchResumeItem[]
  resumesPagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}
