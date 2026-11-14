/**
 * 邮箱配置（system-config/email）共享类型（B9 从 page.tsx 下沉）。
 */

/** 邮箱配置列表项 */
export interface EmailConfigItem {
  id: string
  alias: string
  host: string
  port: number
  secure: boolean
  user: string
  mailbox: string
  resumeSourceId: string | null
  resumeSource: { id: string; name: string } | null
  lastFetchedAt: string | null
  isActive: boolean
  _count: { emails: number; resumes: number }
}

/** 简历来源下拉项 */
export interface ResumeSourceOption {
  id: string
  name: string
}

/** 邮箱配置表单值（新增 / 编辑共用） */
export interface EmailConfigFormValues {
  alias: string
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  mailbox: string
  resumeSourceId: string
}
