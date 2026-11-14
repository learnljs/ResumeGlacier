import { describe, expect, it } from 'vitest'
import { computeWeightedScore } from '@/lib/utils/score-math'
import {
  scoreBarColor,
  scoreColor,
  scoreEdgeColor,
  scoreTone,
  scoreToneBg,
} from '@/lib/constants/score'

describe('computeWeightedScore — 5 星制维度得分', () => {
  it('满分 5 星时得分等于权重', () => {
    expect(computeWeightedScore(5, 100)).toBe(100)
    expect(computeWeightedScore(5, 20)).toBe(20)
    expect(computeWeightedScore(5, 0)).toBe(0)
  })

  it('按 rating × (weight / 5) 计算并保留 1 位小数', () => {
    expect(computeWeightedScore(3, 25)).toBe(15)
    expect(computeWeightedScore(4, 33)).toBe(26.4)
    expect(computeWeightedScore(1, 1)).toBe(0.2)
    expect(computeWeightedScore(0, 40)).toBe(0)
    expect(computeWeightedScore(2, 7)).toBe(2.8)
  })

  it('结果始终是数字且无浮点尾数', () => {
    for (const [rating, weight] of [[1, 3], [2, 13], [4, 17], [5, 33]] as const) {
      const score = computeWeightedScore(rating, weight)
      expect(typeof score).toBe('number')
      expect(Number.isFinite(score)).toBe(true)
      expect(Number((score * 10).toFixed(6)) % 1).toBe(0)
    }
  })
})

describe('scoreTone — 得分档位唯一真相源', () => {
  it('四档边界（含等号归入高档）', () => {
    expect(scoreTone(100)).toBe('success')
    expect(scoreTone(80)).toBe('success')
    expect(scoreTone(79.9)).toBe('info')
    expect(scoreTone(60)).toBe('info')
    expect(scoreTone(59.9)).toBe('warning')
    expect(scoreTone(40)).toBe('warning')
    expect(scoreTone(39.9)).toBe('destructive')
    expect(scoreTone(0)).toBe('destructive')
  })

  it('颜色类全部走设计令牌，不返回 Tailwind 裸色', () => {
    for (const score of [95, 70, 50, 20]) {
      expect(scoreColor(score)).toMatch(/^text-(success|info|warning|destructive)$/)
      expect(scoreBarColor(score)).toMatch(/^bg-(success|info|warning|destructive)$/)
      expect(scoreEdgeColor(score)).toMatch(/^border-l-(success|info|warning|destructive)$/)
    }
    expect(scoreEdgeColor(null)).toBe('border-l-border')
    expect(scoreToneBg('success')).toBe('bg-success')
    expect(scoreToneBg('destructive')).toBe('bg-destructive')
  })
})
