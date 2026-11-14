/**
 * 跟进记录导出字段单点（B9 遗留）。
 *
 * 背景：导出弹窗（FollowUpDialogs 的 EXPORT_FIELDS）与导出 API
 * （api/follow-up/export 的 ALL_FIELDS）各维护一份完全相同的字段表，
 * 任一侧改动都会造成「UI 能勾选、后端不认」的漂移。本文件为唯一权威。
 */

export interface ExportFieldConfig {
  /** 字段键，对应导出 API 的 selectedFields */
  key: string
  /** 中文列名 */
  label: string
}

/** 跟进记录可导出字段（顺序即 CSV 列顺序） */
export const EXPORT_FIELDS: ExportFieldConfig[] = [
  { key: 'candidateName', label: '候选人姓名' },
  { key: 'candidatePhone', label: '手机号' },
  { key: 'rejectReason', label: '拒绝原因' },
  { key: 'initialScore', label: '初筛得分' },
  { key: 'compositeScore', label: '综合得分' },
  { key: 'interviewTime', label: '面试时间' },
  { key: 'unsuitableAt', label: '不合适时间' },
  { key: 'tags', label: '标签' },
  { key: 'note', label: '备注' },
  { key: 'contacted', label: '联系结果' },
  { key: 'position', label: '职位' },
  { key: 'receivedAt', label: '接收时间' },
  { key: 'followUpCreatedAt', label: '跟进时间' },
]

/** 全部字段的 key（默认导出全集用） */
export const EXPORT_FIELD_KEYS: string[] = EXPORT_FIELDS.map((f) => f.key)

/** key → label 映射（生成 CSV 表头用） */
export const EXPORT_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  EXPORT_FIELDS.map((f) => [f.key, f.label])
)
