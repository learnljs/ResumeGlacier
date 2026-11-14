/**
 * 跟进状态流转状态机
 *
 * 唯一真相源：正向流转（11 条）与回退路径（9 条）均在此定义。
 * 后端 PATCH 校验、前端按钮/弹窗渲染均以此为准。
 *
 * 对应文档：doc/dev/跟进管理模块/跟进状态v2-开发文档.md
 */

// ==================== 状态枚举 ====================

/** 跟进状态英文枚举值 */
export const FOLLOW_UP_STATUSES = [
  'CONTACTING',          // 沟通中
  'INTERVIEW_SCHEDULED', // 待面试
  'INTERVIEWED',         // 已面试
  'OFFER_SENT',          // 已发offer
  'PENDING_ONBOARD',     // 待入职
  'HIRED',               // 已入职
  'RESIGNED',            // 已离职
  'OFFER_REJECTED',      // 拒offer
  'INTERVIEW_CANCELLED', // 取消面试
  'UNSUITABLE',          // 不合适
] as const

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]

/** 状态 -> 中文标签（用于日志详情等后端文案） */
export const STATUS_CN: Record<string, string> = {
  CONTACTING: '沟通中',
  INTERVIEW_SCHEDULED: '待面试',
  INTERVIEWED: '已面试',
  OFFER_SENT: '已发offer',
  PENDING_ONBOARD: '待入职',
  HIRED: '已入职',
  RESIGNED: '已离职',
  OFFER_REJECTED: '拒offer',
  INTERVIEW_CANCELLED: '取消面试',
  UNSUITABLE: '不合适',
}

// ==================== 流转配置 ====================

/** 正向流转：当前状态 -> 可到达的目标状态及必填字段 */
export const FORWARD_TRANSITIONS: Record<string, { target: string; requiredFields: string[] }[]> = {
  CONTACTING: [
    { target: 'INTERVIEW_SCHEDULED', requiredFields: ['interviewTime'] },
    { target: 'UNSUITABLE', requiredFields: ['rejectReason'] },
  ],
  INTERVIEW_SCHEDULED: [
    { target: 'INTERVIEWED', requiredFields: [] },
    { target: 'INTERVIEW_CANCELLED', requiredFields: ['rejectReason'] },
  ],
  INTERVIEWED: [
    { target: 'OFFER_SENT', requiredFields: ['startDate'] },
    { target: 'UNSUITABLE', requiredFields: ['rejectReason'] },
  ],
  OFFER_SENT: [
    { target: 'PENDING_ONBOARD', requiredFields: ['startDate'] },
    { target: 'OFFER_REJECTED', requiredFields: ['rejectReason'] },
  ],
  PENDING_ONBOARD: [
    { target: 'HIRED', requiredFields: ['startDate'] },
    { target: 'OFFER_REJECTED', requiredFields: ['rejectReason'] },
  ],
  HIRED: [
    { target: 'RESIGNED', requiredFields: ['resignedAt', 'resignReason'] },
  ],
  RESIGNED: [],
  OFFER_REJECTED: [],
  INTERVIEW_CANCELLED: [],
  UNSUITABLE: [],
}

/** 回退路径：当前状态 -> 可回退到的上游状态 */
export const ROLLBACK_TRANSITIONS: Record<string, string[]> = {
  CONTACTING: [], // 起点，无回退
  INTERVIEW_SCHEDULED: ['CONTACTING'],
  INTERVIEWED: ['INTERVIEW_SCHEDULED'],
  OFFER_SENT: ['INTERVIEWED'],
  PENDING_ONBOARD: ['OFFER_SENT'],
  HIRED: ['PENDING_ONBOARD'],
  RESIGNED: ['HIRED'],
  OFFER_REJECTED: ['PENDING_ONBOARD', 'OFFER_SENT'],
  INTERVIEW_CANCELLED: ['INTERVIEW_SCHEDULED'],
  UNSUITABLE: ['INTERVIEWED', 'CONTACTING'],
}

// ==================== 流转 UI 元数据（B8 A5 单点） ====================

export type ForwardTransitionKind = 'schedule' | 'interviewEnd' | 'hire' | 'unsuitable' | 'resign'

/** 正向流转 UI 元数据：映射 (from, target) → 中文标签与弹窗类型（图标/颜色/弹窗标题等页面对应） */
export const FORWARD_UI_METADATA: Record<string, Record<string, {
  label: string
  kind: ForwardTransitionKind
  hireTitle?: string
  hireConfirmLabel?: string
  unsuitableTitle?: string
}>> = {
  CONTACTING: {
    INTERVIEW_SCHEDULED: { label: '预约面试', kind: 'schedule' },
    UNSUITABLE: { label: '不合适', kind: 'unsuitable', unsuitableTitle: '不合适' },
  },
  INTERVIEW_SCHEDULED: {
    INTERVIEWED: { label: '面试结束', kind: 'interviewEnd' },
    INTERVIEW_CANCELLED: { label: '取消面试', kind: 'unsuitable', unsuitableTitle: '取消面试' },
  },
  INTERVIEWED: {
    OFFER_SENT: { label: '发offer', kind: 'hire', hireTitle: '发 offer', hireConfirmLabel: '确认' },
    UNSUITABLE: { label: '不合适', kind: 'unsuitable', unsuitableTitle: '不合适' },
  },
  OFFER_SENT: {
    PENDING_ONBOARD: { label: '接受offer', kind: 'hire', hireTitle: '接受 offer', hireConfirmLabel: '确认' },
    OFFER_REJECTED: { label: '拒offer', kind: 'unsuitable', unsuitableTitle: '拒 offer' },
  },
  PENDING_ONBOARD: {
    HIRED: { label: '入职', kind: 'hire', hireTitle: '入职', hireConfirmLabel: '确认入职' },
    OFFER_REJECTED: { label: '拒offer', kind: 'unsuitable', unsuitableTitle: '拒 offer' },
  },
  HIRED: {
    RESIGNED: { label: '离职', kind: 'resign' },
  },
  RESIGNED: {},
  OFFER_REJECTED: {},
  INTERVIEW_CANCELLED: {},
  UNSUITABLE: {},
}

// ==================== 校验函数 ====================

export type TransitionType = 'forward' | 'rollback'

export interface ValidateResult {
  valid: boolean
  /** 流转类型，仅在校验通过时返回 */
  type?: TransitionType
  /** 错误信息，仅在校验失败时返回 */
  error?: string
  /** 缺失的必填字段，仅正向流转缺字段时返回 */
  missingFields?: string[]
}

/** 字段值是否视为"已填写"（非 undefined / null / 空字符串） */
function isFilled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

/**
 * 校验状态流转是否合法
 *
 * @param currentStatus 当前状态
 * @param targetStatus  目标状态
 * @param providedFields 请求体中携带的字段值
 */
export function validateTransition(
  currentStatus: string,
  targetStatus: string,
  providedFields: Record<string, unknown> = {}
): ValidateResult {
  if (!targetStatus) {
    return { valid: false, error: '缺少目标状态' }
  }

  if (currentStatus === targetStatus) {
    return { valid: false, error: '目标状态与当前状态相同' }
  }

  // 1. 正向匹配
  const forward = (FORWARD_TRANSITIONS[currentStatus] || []).find(
    (t) => t.target === targetStatus
  )
  if (forward) {
    const missing = forward.requiredFields.filter((f) => !isFilled(providedFields[f]))
    if (missing.length > 0) {
      return {
        valid: false,
        error: `缺少必填字段: ${missing.join(', ')}`,
        missingFields: missing,
      }
    }
    return { valid: true, type: 'forward' }
  }

  // 2. 回退匹配
  const rollbackTargets = ROLLBACK_TRANSITIONS[currentStatus] || []
  if (rollbackTargets.includes(targetStatus)) {
    // 回退必填回退原因（仅用于审计日志，不落库）
    if (!isFilled(providedFields.rollbackReason)) {
      return { valid: false, error: '请填写回退原因' }
    }
    return { valid: true, type: 'rollback' }
  }

  // 3. 非法流转
  return {
    valid: false,
    error: `不允许从「${STATUS_CN[currentStatus] || currentStatus}」转换到「${STATUS_CN[targetStatus] || targetStatus}」`,
  }
}

/** 获取指定状态可回退到的目标列表（供前端回退弹窗渲染选项） */
export function getRollbackTargets(currentStatus: string): string[] {
  return ROLLBACK_TRANSITIONS[currentStatus] || []
}
