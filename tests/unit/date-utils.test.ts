import { describe, expect, it } from 'vitest'
import {
  buildDateWhere,
  parseBoardDateRange,
  receivedAtWhere,
} from '@/lib/services/date-utils'

const DAY = 24 * 60 * 60 * 1000

describe('receivedAtWhere — 接收时间快照优先、createdAt 兜底', () => {
  it('生成 OR 双分支，且结束端为开区间', () => {
    const start = new Date(2024, 5, 1)
    const end = new Date(2024, 6, 1)
    const where = receivedAtWhere(start, end)
    expect(where.OR).toHaveLength(2)
    expect(where.OR[0]).toEqual({ sourceEmailReceivedAt: { gte: start, lt: end } })
    expect(where.OR[1]).toEqual({ sourceEmailReceivedAt: null, createdAt: { gte: start, lt: end } })
  })
})

describe('buildDateWhere — 日期筛选条件', () => {
  it('无参数返回空数组', () => {
    expect(buildDateWhere()).toEqual([])
    expect(buildDateWhere(null, null)).toEqual([])
  })

  it('两端齐全时用 gte/lt 范围，结束日含尾（+1 天）', () => {
    const conditions = buildDateWhere('2024-06-01', '2024-06-30')
    expect(conditions).toHaveLength(1)
    const or = (conditions[0] as { OR: Array<Record<string, unknown>> }).OR
    expect(or).toHaveLength(2)
    const range = (or[0] as { sourceEmailReceivedAt: { gte: Date; lt: Date } }).sourceEmailReceivedAt
    expect(range.gte).toBeInstanceOf(Date)
    expect(range.lt).toBeInstanceOf(Date)
    // 必须是本地零点：早期用 UTC 解析会在 GMT+8 偏到 08:00
    expect(range.gte.getHours()).toBe(0)
    expect(range.lt.getHours()).toBe(0)
    expect(range.lt.getTime() - range.gte.getTime()).toBe(30 * DAY)
  })

  it('非法日期不生成条件，另一端合法时仍生效', () => {
    expect(buildDateWhere('bad')).toEqual([])
    expect(buildDateWhere('2024-02-30')).toEqual([])
    const conditions = buildDateWhere('bad', '2024-06-30')
    expect(conditions).toHaveLength(1)
    expect(JSON.stringify(conditions[0])).toContain('"lt"')
  })

  it('只有起始日期时用 gte', () => {
    const conditions = buildDateWhere('2024-06-01')
    expect(conditions).toHaveLength(1)
    expect(JSON.stringify(conditions[0])).toContain('"gte"')
    expect(JSON.stringify(conditions[0])).not.toContain('"lt"')
  })

  it('只有结束日期时用 lt 且为次日零点', () => {
    const conditions = buildDateWhere(undefined, '2024-06-30')
    expect(conditions).toHaveLength(1)
    const or = (conditions[0] as { OR: Array<Record<string, unknown>> }).OR
    const lt = (or[0] as { sourceEmailReceivedAt: { lt: Date } }).sourceEmailReceivedAt.lt
    expect(lt).toBeInstanceOf(Date)
    expect(lt.getHours()).toBe(0)
    expect(lt.getDate()).toBe(1) // 7 月 1 日 00:00
  })
})

describe('parseBoardDateRange — 看板时间段解析', () => {
  it('缺参 / 格式非法一律返回 null', () => {
    expect(parseBoardDateRange(null, null)).toBeNull()
    expect(parseBoardDateRange('2024-06-01', null)).toBeNull()
    expect(parseBoardDateRange('2024/06/01', '2024-06-30')).toBeNull()
    expect(parseBoardDateRange('2024-6-1', '2024-06-30')).toBeNull()
  })

  it('识别会溢出的非法日期（如 2 月 30 日）', () => {
    expect(parseBoardDateRange('2024-02-30', '2024-03-05')).toBeNull()
    expect(parseBoardDateRange('2024-06-01', '2024-13-01')).toBeNull()
  })

  it('起始晚于结束返回 null', () => {
    expect(parseBoardDateRange('2024-06-30', '2024-06-01')).toBeNull()
  })

  it('合法区间：from 为当日零点，to 为结束日次日零点（含尾日）', () => {
    const range = parseBoardDateRange('2024-06-01', '2024-06-30')
    expect(range).not.toBeNull()
    expect(range!.from.getFullYear()).toBe(2024)
    expect(range!.from.getMonth()).toBe(5)
    expect(range!.from.getDate()).toBe(1)
    expect(range!.from.getHours()).toBe(0)
    expect(range!.to.getTime() - range!.from.getTime()).toBe(30 * DAY)
  })

  it('单日区间跨度为 1 天', () => {
    const range = parseBoardDateRange('2024-06-01', '2024-06-01')
    expect(range!.to.getTime() - range!.from.getTime()).toBe(DAY)
  })
})
