/**
 * Webhook 集成 - 常量定义
 *
 * 包含：
 * - HR 系统可供映射的字段列表（供配置页下拉选择、映射引擎取值）
 * - Webhook 字段类型枚举
 * - 转换方式枚举
 * - 同步状态枚举
 * - 特殊 hrField 标记（Webhook URL 配置行）
 */

import { STATUS_CN } from '@/lib/services/follow-up-transitions'
import { CONTACT_RESULT_OPTIONS } from '@/lib/constants/contact-result'

// ========== 特殊配置行标记 ==========
// hrField 为此值时，该行表示 Webhook URL 配置，transformConfig 存 URL 字符串
export const WEBHOOK_URL_FIELD = '__webhook_url__'

// 默认配置分组 key
export const DEFAULT_CONFIG_KEY = 'default'

// ========== Webhook 字段类型 ==========
// 参考 https://developer.work.weixin.qq.com/document/path/101240 Value 部分
export const TARGET_FIELD_TYPES = [
  'TEXT',              // 文本
  'NUMBER',            // 数字
  'CHECKBOX',          // 复选框
  'DATE_TIME',         // 日期
  'IMAGE',             // 图片
  'USER',              // 成员
  'URL',               // 链接
  'SELECT',            // 多选
  'PROGRESS',          // 进度
  'PHONE_NUMBER',      // 电话
  'EMAIL',             // 邮箱
  'SINGLE_SELECT',     // 单选
  'LOCATION',          // 地理位置
  'CURRENCY',          // 货币
  'PERCENTAGE',        // 百分数
  'BARCODE',           // 条码
  'REFERENCE',         // 关联（跨表）
] as const

export type TargetFieldType = (typeof TARGET_FIELD_TYPES)[number]

// 不支持 Webhook 写入的字段类型，配置页提示并跳过
export const UNSUPPORTED_TARGET_FIELD_TYPES = new Set<string>([
  'FORMULA',           // 公式
  'AUTO_NUMBER',       // 自动编号
  'CREATOR',           // 创建人
  'CREATED_TIME',      // 创建时间
  'LAST_MODIFIER',     // 最后编辑人
  'LAST_MODIFIED_TIME',// 最后编辑时间
  'GROUP_CHAT',        // 群聊
  'FILE',              // 文件
  'LOOKUP',            // 查找引用
])

// ========== 转换方式 ==========
export const TRANSFORM_TYPES = [
  'DIRECT',    // 直接取 HR 字段值
  'ENUM_MAP',  // 查字典翻译（HR 枚举 -> Webhook枚举文本）
  'TIMESTAMP', // 转时间格式
  'CONCAT',    // 多字段拼接（从 transformConfig 模板解析 {字段路径}）
  'FIXED',     // 固定值
  'WORK_YEARS_RANGE', // 工作年限档位（应届/在校/1-3年等，结合 graduationYear + workYears）
] as const

export type TransformType = (typeof TRANSFORM_TYPES)[number]

export const TRANSFORM_TYPE_LABELS: Record<TransformType, string> = {
  DIRECT: '直接取值',
  ENUM_MAP: '枚举映射',
  TIMESTAMP: '时间格式',
  CONCAT: '字段拼接',
  FIXED: '固定值',
  WORK_YEARS_RANGE: '工作年限档位',
}

// ========== 同步状态 ==========
export const WEBHOOK_SYNC_STATUS = {
  NOT_SYNCED: 'NOT_SYNCED',
  SYNCED: 'SYNCED',
  SYNC_FAILED: 'SYNC_FAILED',
} as const

export type WebhookSyncStatus = (typeof WEBHOOK_SYNC_STATUS)[keyof typeof WEBHOOK_SYNC_STATUS]

export const WEBHOOK_SYNC_STATUS_LABELS: Record<WebhookSyncStatus, string> = {
  NOT_SYNCED: '未同步',
  SYNCED: '已同步',
  SYNC_FAILED: '同步失败',
}

// ========== 同步动作 ==========
export type SyncAction = 'ADD' | 'UPDATE'

// ========== HR 可供映射字段定义 ==========
// 字段路径规则：顶层为表名（resume / position / followUpRecord / evaluation）
// 映射引擎通过此路径从嵌套对象取值
export interface HrFieldDef {
  path: string          // 字段路径，如 "resume.candidateName"
  label: string         // 中文名，配置页展示
  type: 'string' | 'number' | 'datetime' | 'enum' | 'text' | 'tags' | 'structured'
  table: string         // 所在表名
  enumValues?: Record<string, string>  // enum 类型时的可选值映射（HR 内部值 -> 中文）
}

// 可同步到Webhook的跟进状态枚举（不含 CONTACTING 沟通中——沟通中仅内部管理，预约面试后才同步）
// 状态英文值与 lib/services/follow-up-transitions.ts 的 STATUS_CN 保持一致（派生，勿手工改）
export const FOLLOWUP_STATUS_ENUM: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_CN).filter(([k]) => k !== 'CONTACTING')
)

// 联系结果枚举（派生自 lib/constants/contact-result 单点，勿手工改）
export const CONTACTED_ENUM: Record<string, string> = Object.fromEntries(
  CONTACT_RESULT_OPTIONS.map((o) => [o.value, o.label])
)

export const HR_FIELDS: HrFieldDef[] = [
  // ===== Resume 候选人基本信息 =====
  { path: 'resume.candidateName', label: '候选人', type: 'string', table: 'Resume' },
  // 敏感字段，配置页默认不推荐
  { path: 'resume.candidatePhone', label: '候选人电话（敏感）', type: 'string', table: 'Resume' },
  { path: 'resume.candidateEmail', label: '候选人邮箱（敏感）', type: 'string', table: 'Resume' },

  // ===== Resume 结构化数据（从 structuredData JSON 解析） =====
  // 这些字段不存在于 DB 字段，通过解析 structuredData JSON 取值
  // 路径格式：resume.structuredData.<key>，映射引擎自动解析 JSON
  { path: 'resume.structuredData.education', label: '学历', type: 'structured', table: 'Resume' },
  { path: 'resume.structuredData.school', label: '院校', type: 'structured', table: 'Resume' },
  { path: 'resume.structuredData.workYears', label: '工作年限', type: 'structured', table: 'Resume' },

  // ===== Position 应聘信息 =====
  { path: 'position.title', label: '应聘岗位名称', type: 'string', table: 'Position' },
  { path: 'position.webhookTargetRecordId', label: 'Webhook岗位记录ID', type: 'string', table: 'Position' },

  // ===== FollowUpRecord 跟进信息 =====
  { path: 'followUpRecord.status', label: '面试状态', type: 'enum', table: 'FollowUpRecord', enumValues: FOLLOWUP_STATUS_ENUM },
  { path: 'followUpRecord.interviewTime', label: '一面面试时间', type: 'datetime', table: 'FollowUpRecord' },
  { path: 'followUpRecord.note', label: '一面评价', type: 'text', table: 'FollowUpRecord' },
  { path: 'followUpRecord.startDate', label: '拟入职时间', type: 'datetime', table: 'FollowUpRecord' },
  { path: 'followUpRecord.scheduledAt', label: '建档日期（进入待面试时间）', type: 'datetime', table: 'FollowUpRecord' },
  { path: 'followUpRecord.createdAt', label: '跟进创建日期', type: 'datetime', table: 'FollowUpRecord' },
  { path: 'followUpRecord.tagNames', label: '能力标签', type: 'tags', table: 'FollowUpRecord' },

  // ===== 其他可选字段 =====
  { path: 'followUpRecord.salaryRange', label: '薪资范围', type: 'string', table: 'FollowUpRecord' },
  { path: 'followUpRecord.jobLevel', label: '岗位级别', type: 'string', table: 'FollowUpRecord' },
  { path: 'followUpRecord.rejectReason', label: '拒绝原因', type: 'string', table: 'FollowUpRecord' },
  { path: 'followUpRecord.resignedAt', label: '离职日期', type: 'datetime', table: 'FollowUpRecord' },
  { path: 'followUpRecord.resignReason', label: '离职原因', type: 'string', table: 'FollowUpRecord' },
  { path: 'followUpRecord.contacted', label: '联系结果', type: 'enum', table: 'FollowUpRecord', enumValues: CONTACTED_ENUM },
  { path: 'followUpRecord.updatedAt', label: '最近更新时间', type: 'datetime', table: 'FollowUpRecord' },

  // ===== PositionEvaluation 评估信息 =====
  { path: 'evaluation.initialScore', label: '初筛得分', type: 'number', table: 'PositionEvaluation' },
  { path: 'evaluation.compositeScore', label: '综合得分', type: 'number', table: 'PositionEvaluation' },
  { path: 'evaluation.summary', label: 'AI 评估摘要', type: 'text', table: 'PositionEvaluation' },
  { path: 'evaluation.screenedAt', label: '评估时间', type: 'datetime', table: 'PositionEvaluation' },
]

// 按路径快速查找
export const HR_FIELD_MAP: Record<string, HrFieldDef> = HR_FIELDS.reduce(
  (map, field) => {
    map[field.path] = field
    return map
  },
  {} as Record<string, HrFieldDef>
)
