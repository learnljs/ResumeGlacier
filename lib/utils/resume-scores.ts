/**
 * 简历列表得分展示的纯计算（不依赖 React / 数据库，便于单测）。
 *
 * 背景：列表卡片要同时展示「初筛」「冰山模型」两个分数，并在冰山维度未打完时标注。
 * 判定逻辑放在这里，避免散落在组件里各处硬编码维度数组。
 */
import { DIMENSION_KEYS, EVALUATION_DIMENSIONS } from '@/lib/constants/evaluation'

/** 岗位评估摘要的最小结构（对应 API 返回的 positionScores 元素） */
export interface PositionScoreLike {
  positionId: string
  initialScore: number | null
  compositeScore: number | null
}

/** 维度评分的最小结构（对应 API 返回的 evaluationDimensions 元素） */
export interface DimensionLike {
  dimension: string
  rating: number | null | undefined
  positionId?: string | null
}

/**
 * 选中用于展示的岗位评估：优先当前筛选岗位，其次首个评估。
 * 行为与旧版 getPrimaryScore 一致，只是同时返回初筛分与冰山（综合）分。
 */
export function pickPositionScore<T extends PositionScoreLike>(
  scores: T[] | null | undefined,
  positionId: string
): T | null {
  if (!scores || scores.length === 0) return null
  return scores.find((s) => s.positionId === positionId) ?? scores[0] ?? null
}

export interface IcebergProgress {
  /** 是否存在维度数据。false 表示无法判断，调用方不应显示「待评」标注 */
  hasData: boolean
  /** 冰山模型 6 个维度中未打分的数量 */
  missing: number
  /** 未打分维度的中文名，用于 tooltip */
  missingLabels: string[]
}

/**
 * 冰山模型评分完成度。
 *
 * 冰山模型权重覆盖全部 6 个维度（知识/技能 + 水下四维度），任一维度 rating 为 null
 * 即视为未打分。注意综合分（compositeScore）在未打分维度按 0 计入时仍可能 > 0，
 * 因此不能单靠「有无综合分」判断是否评完。
 *
 * 没有任何维度记录时返回 hasData=false：演示数据只有评估总分、没有维度行，
 * 此时不能反过来断言「6 项全未评」，否则每条都会误报。
 */
export function getIcebergProgress(
  dims: DimensionLike[] | null | undefined,
  positionId?: string | null
): IcebergProgress {
  const relevant = (dims ?? []).filter(
    (d) => !positionId || !d.positionId || d.positionId === positionId
  )
  if (relevant.length === 0) return { hasData: false, missing: 0, missingLabels: [] }

  const rated = new Set(
    relevant.filter((d) => d.rating != null).map((d) => d.dimension)
  )
  const missingKeys = DIMENSION_KEYS.filter((key) => !rated.has(key))
  return {
    hasData: true,
    missing: missingKeys.length,
    missingLabels: missingKeys.map((key) => EVALUATION_DIMENSIONS[key].label),
  }
}
