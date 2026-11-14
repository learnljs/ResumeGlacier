/**
 * 日期相关工具函数
 *
 * 提供简历时间筛选所需的 Prisma where 条件构建，
 * 供趋势服务、Dashboard 统计、简历列表 API 共用。
 */

/**
 * 构建接收时间的 Prisma where 条件
 * 优先使用 sourceEmailReceivedAt（邮件接收时间快照），为 null 时回退到 createdAt
 *
 * @param start 起始时间（含），Date 对象
 * @param end   结束时间（不含），Date 对象
 *
 * 用法示例：
 *   // 筛选 2024-06-01 ~ 2024-06-30（含首尾）
 *   const start = new Date('2024-06-01')
 *   const end = new Date('2024-07-01')  // 结束日期的次日 00:00
 *   const where = receivedAtWhere(start, end)
 */
export function receivedAtWhere(start: Date, end: Date) {
  return {
    OR: [
      { sourceEmailReceivedAt: { gte: start, lt: end } },
      { sourceEmailReceivedAt: null, createdAt: { gte: start, lt: end } },
    ],
  }
}

/**
 * 根据可选的起止日期字符串构建 Prisma where 条件数组。
 * 支持只传入一端（dateFrom / dateTo 可单独使用）。
 *
 * @param dateFrom YYYY-MM-DD 格式的起始日期（含），可选
 * @param dateTo   YYYY-MM-DD 格式的结束日期（含），可选
 * @returns Prisma where 条件数组，可直接 spread 到 AND 中；无日期参数时返回空数组
 *
 * 用法示例：
 *   const conditions: Record<string, unknown>[] = []
 *   conditions.push(...buildDateWhere(dateFrom, dateTo))
 *   // 最终 where: { AND: conditions }
 */
export function buildDateWhere(
  dateFrom?: string | null,
  dateTo?: string | null
): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = []

  if (!dateFrom && !dateTo) return conditions

  if (dateFrom && dateTo) {
    // 两端都有：使用 gte/lt 范围
    const start = new Date(dateFrom) // 当天 00:00:00（本地时区）
    const end = new Date(dateTo)
    end.setDate(end.getDate() + 1) // 结束日期的次日 00:00，实现「含尾日」
    conditions.push(receivedAtWhere(start, end))
  } else if (dateFrom) {
    // 只有起始日期：筛选 >= dateFrom
    const start = new Date(dateFrom)
    conditions.push({
      OR: [
        { sourceEmailReceivedAt: { gte: start } },
        { sourceEmailReceivedAt: null, createdAt: { gte: start } },
      ],
    })
  } else if (dateTo) {
    // 只有结束日期：筛选 < 次日（即 <= dateTo 当天末尾）
    const end = new Date(dateTo)
    end.setDate(end.getDate() + 1)
    conditions.push({
      OR: [
        { sourceEmailReceivedAt: { lt: end } },
        { sourceEmailReceivedAt: null, createdAt: { lt: end } },
      ],
    })
  }

  return conditions
}

/**
 * 解析跟进看板时间段的 from/to 参数（YYYY-MM-DD，含首尾）。
 *
 * @param fromStr 起始日期字符串（必填）
 * @param toStr   结束日期字符串（必填）
 * @returns 校验通过返回 { from, to }（to 为结束日次日 00:00，实现「含尾日」），否则返回 null
 */
export function parseBoardDateRange(
  fromStr: string | null,
  toStr: string | null
): { from: Date; to: Date } | null {
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
  if (!fromStr || !toStr) return null

  const fromMatch = DATE_RE.exec(fromStr)
  const toMatch = DATE_RE.exec(toStr)
  if (!fromMatch || !toMatch) return null

  const from = new Date(Number(fromMatch[1]), Number(fromMatch[2]) - 1, Number(fromMatch[3]))
  const to = new Date(Number(toMatch[1]), Number(toMatch[2]) - 1, Number(toMatch[3]))
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  if (from.getFullYear() !== Number(fromMatch[1]) || from.getMonth() !== Number(fromMatch[2]) - 1) {
    return null
  }
  if (to.getFullYear() !== Number(toMatch[1]) || to.getMonth() !== Number(toMatch[2]) - 1) {
    return null
  }
  if (from.getTime() > to.getTime()) return null

  // 结束日期次日 00:00，实现「含尾日」
  const toExclusive = new Date(to)
  toExclusive.setDate(toExclusive.getDate() + 1)
  return { from, to: toExclusive }
}
