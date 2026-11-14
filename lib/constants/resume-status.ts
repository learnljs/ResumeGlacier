/**
 * 简历状态枚举 / 展示单点（B8）。
 *
 * 背景：list / screened 各维护一份 statusColors，且 list 另有 statusLabels 与
 * statusDotColor。本文件为唯一权威，页面统一从这里取，避免多处不一致。
 *
 * 状态集合对应 Resume.status 的合法值：
 * - UNASSIGNED 未分配（无锚定岗位）
 * - UNPARSED   未解析（邮件已收、附件尚未解析）
 * - PARSING    解析中
 * - PENDING    待筛选
 * - SCREENING  筛选中
 * - SCREENED   已评估
 * - ERROR      异常
 *
 * 补充（B9）：UNPARSED / PARSING 原仅存在于 detail 页自维护的 statusConfig，
 * 一并收敛到本文件，detail 页改用 statusLabel / statusColor。
 */

/** 简历状态字符串合集 */
export const RESUME_STATUSES = ['UNASSIGNED', 'UNPARSED', 'PARSING', 'PENDING', 'SCREENING', 'SCREENED', 'ERROR'] as const
export type ResumeStatus = (typeof RESUME_STATUSES)[number]

/** 状态 → 中文标签 */
export const STATUS_LABELS: Record<ResumeStatus, string> = {
  UNASSIGNED: '未分配',
  UNPARSED: '未解析',
  PARSING: '解析中',
  PENDING: '待筛选',
  SCREENING: '筛选中',
  SCREENED: '已评估',
  ERROR: '异常',
}

/** 状态 → 徽章/背景色类（令牌） */
export const STATUS_COLORS: Record<ResumeStatus, string> = {
  UNASSIGNED: 'bg-muted text-muted-foreground',
  UNPARSED: 'bg-warning/10 text-warning',
  PARSING: 'bg-info/10 text-info',
  PENDING: 'bg-warning/10 text-warning',
  SCREENING: 'bg-info/10 text-info',
  SCREENED: 'bg-success/10 text-success',
  ERROR: 'bg-destructive/10 text-destructive',
}

/** 未知状态兜底标签 */
const UNKNOWN_LABEL = '未知'

/** 状态 → 中文标签（未知状态兜底） */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return UNKNOWN_LABEL
  return STATUS_LABELS[status as ResumeStatus] ?? UNKNOWN_LABEL
}

/** 状态 → 徽章/背景色类（未知状态兜底） */
export function statusColor(status: string | null | undefined): string {
  if (!status) return STATUS_COLORS.UNASSIGNED
  return STATUS_COLORS[status as ResumeStatus] ?? STATUS_COLORS.UNASSIGNED
}

/** 状态 → 状态圆点颜色类（未知状态兜底 muted） */
export function statusDotColor(status: string | null | undefined): string {
  switch (status) {
    case 'PENDING': return 'bg-warning'
    case 'UNPARSED': return 'bg-warning'
    case 'PARSING': return 'bg-info'
    case 'SCREENING': return 'bg-info'
    case 'SCREENED': return 'bg-success'
    case 'ERROR': return 'bg-destructive'
    default: return 'bg-muted-foreground/40'
  }
}

/**
 * 状态 → 卡片左侧色条类（未知状态兜底 border）。
 * 供列表卡片用左缘 3px 色条表达状态，纵向扫视时比读徽章更快。
 */
export function statusEdgeColor(status: string | null | undefined): string {
  switch (status) {
    case 'PENDING': return 'border-l-warning'
    case 'UNPARSED': return 'border-l-warning'
    case 'PARSING': return 'border-l-info'
    case 'SCREENING': return 'border-l-info'
    case 'SCREENED': return 'border-l-success'
    case 'ERROR': return 'border-l-destructive'
    default: return 'border-l-border'
  }
}
