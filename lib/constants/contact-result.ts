/**
 * 联系结果枚举（候选人跟进-联系结果）单点（B8）。
 *
 * 背景：联系结果枚举散落在 4 处 —— webhook-fields 的 CONTACTED_ENUM、
 * follow-up 页 CONTACT_RESULT_LABELS、ContactResultSelector 的
 * CONTACT_RESULT_OPTIONS，及 follow-up-board 的局部映射。本文件为唯一真相源，
 * 各方统一从这里取（value / label / srLabel），避免枚举漂移。
 */

/** 联系结果英文枚举值 */
export const CONTACT_RESULTS = ['NOT_CONTACTED', 'CONTACTED', 'CONTACT_FAILED'] as const
export type ContactResult = (typeof CONTACT_RESULTS)[number]

/** 联系结果选项定义（value + 中文标签 + 无障碍屏读标签） */
export const CONTACT_RESULT_OPTIONS: {
  value: ContactResult
  label: string
  srLabel: string
}[] = [
  { value: 'NOT_CONTACTED', label: '未尝试', srLabel: '未尝试联系' },
  { value: 'CONTACTED', label: '已联系上', srLabel: '已成功联系' },
  { value: 'CONTACT_FAILED', label: '未联系上', srLabel: '未能联系上' },
]

/** 联系结果 -> 中文标签（未知值兜底原样返回） */
export function contactResultLabel(value: string | null | undefined): string {
  if (!value) return '未尝试'
  return CONTACT_RESULT_OPTIONS.find((o) => o.value === value)?.label ?? value
}
