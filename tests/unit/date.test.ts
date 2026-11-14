import { describe, expect, it } from 'vitest'
import {
  dateToWeekStr,
  formatDate,
  formatDateTime,
  formatDateTimeFull,
  formatInterviewTime,
  formatMonthDayTime,
  formatYMD,
  getCurrentWeekStr,
  isoWeekOf,
  parseYMD,
  relativeTime,
  shiftWeekStr,
  weekStrToPeriod,
} from '@/lib/utils/date'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('显示格式化', () => {
  it('空值与非法值返回空串', () => {
    for (const fn of [formatDateTime, formatDate, formatMonthDayTime, formatDateTimeFull]) {
      expect(fn(null)).toBe('')
      expect(fn(undefined)).toBe('')
      expect(fn('')).toBe('')
      expect(fn('not-a-date')).toBe('')
    }
  })

  it('Date / 时间戳 / 可解析字符串都能格式化且含年份', () => {
    const d = new Date(2024, 5, 1, 9, 30, 0)
    expect(formatDateTime(d)).toContain('2024')
    expect(formatDate(d)).toContain('2024')
    expect(formatDateTimeFull(d)).toContain('2024')
    expect(formatDateTime(d.getTime())).toContain('2024')
    expect(formatDateTime(d.toISOString())).toContain('2024')
  })

  it('短格式不含年份，完整格式与短格式长度不同', () => {
    const d = new Date(2024, 5, 1, 9, 30, 0)
    const short = formatMonthDayTime(d)
    expect(short).not.toContain('2024')
    expect(short.length).toBeLessThan(formatDateTimeFull(d).length)
  })
})

describe('formatInterviewTime — datetime-local 展示', () => {
  it('把 T 替换为空格，空值显示占位符', () => {
    expect(formatInterviewTime('2026-06-03T09:45')).toBe('2026-06-03 09:45')
    expect(formatInterviewTime('2026-06-03T09:45:30')).toBe('2026-06-03 09:45:30')
    expect(formatInterviewTime(null)).toBe('-')
    expect(formatInterviewTime('')).toBe('-')
  })

  it('只替换首个 T，不改动其余内容', () => {
    expect(formatInterviewTime('2026-06-03 09:45')).toBe('2026-06-03 09:45')
  })
})

describe('relativeTime — 相对时间文案', () => {
  it('按分钟 / 小时 / 天分档', () => {
    expect(relativeTime(0, 0)).toBe('刚刚')
    expect(relativeTime(0, 30_000)).toBe('刚刚')
    expect(relativeTime(0, 5 * MINUTE)).toBe('5 分钟前')
    expect(relativeTime(0, 59 * MINUTE)).toBe('59 分钟前')
    expect(relativeTime(0, HOUR)).toBe('1 小时前')
    expect(relativeTime(0, 23 * HOUR)).toBe('23 小时前')
    expect(relativeTime(0, DAY)).toBe('1 天前')
    expect(relativeTime(0, 10 * DAY)).toBe('10 天前')
  })

  it('未来时间兜底为「刚刚」', () => {
    expect(relativeTime(DAY, 0)).toBe('刚刚')
  })
})

describe('YYYY-MM-DD 与 ISO 周', () => {
  it('formatYMD / parseYMD 往返一致，且补零', () => {
    expect(formatYMD(new Date(2024, 0, 5))).toBe('2024-01-05')
    expect(formatYMD(new Date(2024, 11, 31))).toBe('2024-12-31')
    const d = parseYMD('2024-02-29')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(1)
    expect(d.getDate()).toBe(29)
    expect(d.getHours()).toBe(0)
    expect(formatYMD(parseYMD('2024-01-05'))).toBe('2024-01-05')
  })

  it('isoWeekOf 处理跨年周', () => {
    expect(isoWeekOf(new Date(2021, 0, 4))).toEqual({ year: 2021, week: 1 })
    expect(isoWeekOf(new Date(2021, 0, 1))).toEqual({ year: 2020, week: 53 })
    expect(isoWeekOf(new Date(2020, 11, 31))).toEqual({ year: 2020, week: 53 })
    expect(isoWeekOf(new Date(2021, 11, 31))).toEqual({ year: 2021, week: 52 })
  })

  it('getCurrentWeekStr / dateToWeekStr 输出 YYYY-Www', () => {
    expect(getCurrentWeekStr()).toMatch(/^\d{4}-W\d{2}$/)
    expect(dateToWeekStr('2021-01-04')).toBe('2021-W01')
    expect(dateToWeekStr('2021-01-01')).toBe('2020-W53')
  })

  it('weekStrToPeriod 返回周一到周日，非法输入返回 null', () => {
    expect(weekStrToPeriod('2021-W01')).toEqual({ from: '2021-01-04', to: '2021-01-10' })
    expect(weekStrToPeriod('2024-W01')).toEqual({ from: '2024-01-01', to: '2024-01-07' })
    expect(weekStrToPeriod('bad')).toBeNull()
    expect(weekStrToPeriod('2021-W00')).toBeNull()
    expect(weekStrToPeriod('2021-W54')).toBeNull()
    expect(weekStrToPeriod('2021-W1')).toBeNull()
  })

  it('shiftWeekStr 支持跨年，非法输入原样返回', () => {
    expect(shiftWeekStr('2021-W01', 1)).toBe('2021-W02')
    expect(shiftWeekStr('2021-W02', -1)).toBe('2021-W01')
    expect(shiftWeekStr('2021-W01', -1)).toBe('2020-W53')
    expect(shiftWeekStr('2021-W52', 1)).toBe('2022-W01')
    expect(shiftWeekStr('bad', 1)).toBe('bad')
  })

  it('周字符串与周期区间互为逆运算', () => {
    for (const w of ['2021-W01', '2024-W26', '2020-W53']) {
      const period = weekStrToPeriod(w)
      expect(period).not.toBeNull()
      expect(dateToWeekStr(period!.from)).toBe(w)
    }
  })
})
