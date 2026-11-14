import { describe, it, expect } from 'vitest'
import { getIcebergProgress, pickPositionScore } from '@/lib/utils/resume-scores'

const scores = [
  { positionId: 'p1', initialScore: 64, compositeScore: null },
  { positionId: 'p2', initialScore: 80, compositeScore: 88 },
]

describe('pickPositionScore — 列表按岗位取分', () => {
  it('优先返回当前筛选岗位的评估', () => {
    expect(pickPositionScore(scores, 'p2')).toEqual(scores[1])
  })

  it('当前岗位无评估时回退首个评估', () => {
    expect(pickPositionScore(scores, 'p-unknown')).toEqual(scores[0])
  })

  it('无评分数据时返回 null', () => {
    expect(pickPositionScore(null, 'p1')).toBeNull()
    expect(pickPositionScore(undefined, 'p1')).toBeNull()
    expect(pickPositionScore([], 'p1')).toBeNull()
  })

  it('两个分数都保留，初筛有分而综合分为 null 是合法状态', () => {
    expect(pickPositionScore(scores, 'p1')).toMatchObject({
      initialScore: 64,
      compositeScore: null,
    })
  })
})

const allRated = [
  { dimension: 'knowledge', rating: 4 },
  { dimension: 'skill', rating: 5 },
  { dimension: 'selfAwareness', rating: 3 },
  { dimension: 'personality', rating: 4 },
  { dimension: 'values', rating: 4 },
  { dimension: 'motivation', rating: 5 },
]

describe('getIcebergProgress — 冰山模型评分完成度', () => {
  it('没有维度数据时无法判断，不应显示待评标注', () => {
    expect(getIcebergProgress(null)).toEqual({ hasData: false, missing: 0, missingLabels: [] })
    expect(getIcebergProgress([]).hasData).toBe(false)
  })

  it('6 个维度全部打完：missing 为 0', () => {
    const p = getIcebergProgress(allRated)
    expect(p.hasData).toBe(true)
    expect(p.missing).toBe(0)
    expect(p.missingLabels).toEqual([])
  })

  it('只有初筛两个维度有分：标注缺 4 项并给出中文维度名', () => {
    const p = getIcebergProgress(allRated.slice(0, 2))
    expect(p.missing).toBe(4)
    expect(p.missingLabels).toEqual(['自我认知', '品质特质', '价值观', '动机'])
  })

  it('rating 为 null / undefined 均算未打分', () => {
    expect(getIcebergProgress([
      { dimension: 'knowledge', rating: 4 },
      { dimension: 'skill', rating: null },
      { dimension: 'values', rating: undefined },
    ]).missing).toBe(5)
  })

  it('按岗位过滤，忽略其他岗位的维度数据', () => {
    expect(getIcebergProgress(
      allRated.map((d) => ({ ...d, positionId: 'p1' })),
      'p2'
    ).hasData).toBe(false)
    expect(getIcebergProgress(
      [{ dimension: 'knowledge', rating: 4, positionId: 'p2' }],
      'p2'
    ).missing).toBe(5)
  })

  it('未带 positionId 的历史维度记录不参与过滤', () => {
    expect(getIcebergProgress(
      [{ dimension: 'knowledge', rating: 4 }],
      'p2'
    ).hasData).toBe(true)
  })

  it('同一维度多条记录（ai + manual）只要有一条有分就算已打分', () => {
    expect(getIcebergProgress([
      { dimension: 'knowledge', rating: null },
      { dimension: 'knowledge', rating: 4 },
    ]).missing).toBe(5)
  })
})
