/**
 * 日期工具 / 显示格式化单点（B8-4）。
 *
 * 背景：10+ 页面零散 `toLocaleString('zh-CN', {...})`，且 BoardPeriodPicker
 * 自建整套周历工具。本文件为唯一真相源：
 * - 显示格式化：formatDateTime / formatMonthDayTime 替代散落的 toLocaleString
 * - 周历工具：pad / formatYMD / parseYMD / isoWeekOf / weekStrToPeriod /
 *   getCurrentWeekStr / getDefaultBoardPeriod / dateToWeekStr / shiftWeekStr，
 *   自 BoardPeriodPicker 迁入，行为与迁移前一致（本地时区口径）。
 */

// ==================== 显示格式化 ====================

/**
 * 完整日期时间字符串（本地时区）。入参可为 Date / 数字 / 可解析字符串 / null/undefined。
 * 非法或空值返回空串。
 */
export function formatDateTime(value: unknown): string {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(value as string | number)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN')
}

/** 仅日期（年/月/日，本地时区），替代直接调用 `toLocaleDateString('zh-CN')` */
export function formatDate(value: unknown): string {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(value as string | number)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN')
}

/** 短格式（月/日 时:分），替代 `{ month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }` */
export function formatMonthDayTime(value: unknown): string {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(value as string | number)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 完整格式（年/月/日 时:分:秒），替代 task-batches 的 formatFullTime */
export function formatDateTimeFull(value: unknown): string {
  if (value == null || value === '') return ''
  const date = value instanceof Date ? value : new Date(value as string | number)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * 相对时间文案（刚刚 / N 分钟前 / N 小时前 / N 天前）。
 * 自 reevaluate 页迁入（B9）；now 可注入便于测试。
 */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

// ==================== 日期（YYYY-MM-DD）工具 ====================

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Date → YYYY-MM-DD（本地时区） */
export function formatYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** YYYY-MM-DD → 本地 00:00 的 Date */
export function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 给定日期的 ISO 周编号（year = 所属 ISO 年，week = 1~53） */
export function isoWeekOf(d: Date): { year: number; week: number } {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayNum = target.getDay() === 0 ? 7 : target.getDay() // 1=周一 ... 7=周日
  // 移至本周四（ISO 周所属年份由周四决定）
  target.setDate(target.getDate() - dayNum + 4)
  const year = target.getFullYear()
  const yearStart = new Date(year, 0, 1)
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year, week }
}

/** 当前日期对应的 ISO 周字符串（YYYY-Www） */
export function getCurrentWeekStr(): string {
  const { year, week } = isoWeekOf(new Date())
  return `${year}-W${pad(week)}`
}

/** 日期所在的 ISO 周字符串（YYYY-Www） */
export function dateToWeekStr(dateStr: string): string {
  const { year, week } = isoWeekOf(parseYMD(dateStr))
  return `${year}-W${pad(week)}`
}

/** YYYY-Www → 该周周一~周日的 [from, to]（YYYY-MM-DD），非法返回 null */
export function weekStrToPeriod(weekStr: string): { from: string; to: string } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekStr)
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  if (week < 1 || week > 53) return null
  // 第 week 周的周一 = 1 月 4 日（ISO 第 1 周内）所在周的周一 + (week-1) 周
  const jan4 = new Date(year, 0, 4)
  const jan4Day = jan4.getDay() === 0 ? 7 : jan4.getDay()
  const monday = new Date(year, 0, 4 - (jan4Day - 1) + (week - 1) * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: formatYMD(monday), to: formatYMD(sunday) }
}

/** 周字符串 ±delta 周 */
export function shiftWeekStr(weekStr: string, delta: number): string {
  const period = weekStrToPeriod(weekStr)
  if (!period) return weekStr
  const base = parseYMD(period.from)
  base.setDate(base.getDate() + delta * 7)
  return dateToWeekStr(formatYMD(base))
}

/**
 * datetime-local 值 → 展示文本：`2026-06-03T09:45` → `2026-06-03 09:45`。
 * 自 follow-up/page.tsx 迁入（B13），空值显示占位符 '-'。
 */
export function formatInterviewTime(time: string | null): string {
  if (!time) return '-'
  return time.replace('T', ' ')
}
