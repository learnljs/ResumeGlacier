import { describe, expect, it } from 'vitest'
import { getEvenlySpacedTicks, integerTicks, niceCeil } from '@/lib/utils/chart-axis'

describe('niceCeil — Y 轴「好看」上限', () => {
  it('非法值与非正数统一兜底为 1', () => {
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(-10)).toBe(1)
    expect(niceCeil(Number.NaN)).toBe(1)
    expect(niceCeil(Number.POSITIVE_INFINITY)).toBe(1)
    expect(niceCeil(Number.NEGATIVE_INFINITY)).toBe(1)
  })

  it('按 1/2/5 × 10^n 取档并留 10% 顶部余量', () => {
    expect(niceCeil(1)).toBe(2)
    expect(niceCeil(2)).toBe(5)
    expect(niceCeil(5)).toBe(10)
    expect(niceCeil(8)).toBe(10)
    expect(niceCeil(10)).toBe(20)
    expect(niceCeil(80)).toBe(100) // 组件注释里的示例：80 份 → 纵轴 100
    expect(niceCeil(100)).toBe(200)
    expect(niceCeil(1000)).toBe(2000)
  })

  it('任意正整数输入都返回不小于自身的整数', () => {
    for (const v of [1, 3, 7, 13, 27, 66, 99, 123, 999, 1234, 6500]) {
      const ceil = niceCeil(v)
      expect(Number.isInteger(ceil)).toBe(true)
      expect(ceil).toBeGreaterThanOrEqual(v)
    }
  })
})

describe('integerTicks — 纵轴整数刻度', () => {
  it('常见上限的刻度序列', () => {
    expect(integerTicks(0)).toEqual([0])
    expect(integerTicks(1)).toEqual([0, 1])
    expect(integerTicks(5)).toEqual([0, 1, 2, 3, 4, 5])
    expect(integerTicks(10)).toEqual([0, 2, 4, 6, 8, 10])
    expect(integerTicks(20)).toEqual([0, 5, 10, 15, 20])
    expect(integerTicks(50)).toEqual([0, 10, 20, 30, 40, 50])
    expect(integerTicks(100)).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('刻度从 0 起、等差、不超过上限，且不超过 6 格', () => {
    for (const max of [1, 7, 13, 42, 80, 100, 200, 1000]) {
      const ticks = integerTicks(max)
      expect(ticks[0]).toBe(0)
      expect(ticks.length).toBeLessThanOrEqual(6)
      expect(ticks.at(-1)).toBeLessThanOrEqual(max)
      const step = ticks[1] - ticks[0]
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i] - ticks[i - 1]).toBe(step)
      }
    }
  })

  it('非有限值与负数兜底为 [0]，不产出 NaN 步长', () => {
    expect(integerTicks(Number.NaN)).toEqual([0])
    expect(integerTicks(Number.POSITIVE_INFINITY)).toEqual([0])
    expect(integerTicks(-5)).toEqual([0])
  })
})

describe('getEvenlySpacedTicks — X 轴标签抽样', () => {
  it('标签数不超过上限时原样返回', () => {
    const labels = ['a', 'b', 'c']
    expect(getEvenlySpacedTicks(labels, 8)).toEqual(labels)
    expect(getEvenlySpacedTicks(labels, 8)).toBe(labels)
    expect(getEvenlySpacedTicks([], 8)).toEqual([])
  })

  it('超过上限时等距抽样且保留首尾', () => {
    const labels = Array.from({ length: 10 }, (_, i) => `d${i}`)
    expect(getEvenlySpacedTicks(labels, 4)).toEqual(['d0', 'd3', 'd6', 'd9'])
    expect(getEvenlySpacedTicks(labels, 8)).toHaveLength(8)
    expect(getEvenlySpacedTicks(labels, 8).at(-1)).toBe('d9')
  })

  it('maxCount <= 1 不会除零，只返回首项', () => {
    const labels = ['a', 'b', 'c']
    expect(getEvenlySpacedTicks(labels, 1)).toEqual(['a'])
    expect(getEvenlySpacedTicks(labels, 0)).toEqual(['a'])
    expect(getEvenlySpacedTicks([], 1)).toEqual([])
  })
})
