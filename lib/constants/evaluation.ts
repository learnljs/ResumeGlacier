/**
 * 冰山模型评估维度常量定义
 */

/** 评估维度定义 */
export const EVALUATION_DIMENSIONS = {
  knowledge: { label: '知识', order: 1, icebergLayer: 'visible' },
  skill: { label: '技能', order: 2, icebergLayer: 'visible' },
  selfAwareness: { label: '自我认知', order: 3, icebergLayer: 'hidden' },
  personality: { label: '品质特质', order: 4, icebergLayer: 'hidden' },
  values: { label: '价值观', order: 5, icebergLayer: 'hidden' },
  motivation: { label: '动机', order: 6, icebergLayer: 'hidden' },
} as const

export type DimensionKey = keyof typeof EVALUATION_DIMENSIONS

/** 维度 key 列表，按固定顺序 */
export const DIMENSION_KEYS: DimensionKey[] = [
  'knowledge', 'skill', 'selfAwareness', 'personality', 'values', 'motivation'
]

/** 维度悬停提示说明，内容源自冰山模型文档"三.2 各维度定义说明" */
export const DIMENSION_DESCRIPTIONS: Record<DimensionKey, string> = {
  knowledge: '候选人在学习和实践中积累的认知储备，如行业知识、专业理论、业务流程等',
  skill: '可操作、可衡量的具体能力，如编程、沟通、数据分析、证书资质等',
  selfAwareness: '对自己的了解程度，如清楚自身优劣势、定位准确、情绪稳定',
  personality: '长期稳定的行为习惯，如责任心、抗压性、主动性、严谨性、团队协作',
  values: '对事物的判断标准和底线，如对质量与效率的取舍、合规意识、合作与奉献',
  motivation: '驱动候选人做事和择业的内在需求，如成就需求、成长需求、稳定性需求等',
}

/** 初筛模型包含的维度 */
export const INITIAL_DIMENSIONS: DimensionKey[] = ['knowledge', 'skill']

/** 冰山模型可见/隐藏层边界：隐藏层维度（用于判断是否已进入冰山模型评分） */
export const ICEBERG_HIDDEN_DIMENSIONS: readonly DimensionKey[] = [
  'selfAwareness', 'personality', 'values', 'motivation',
] as const

/** 参与冰山水下维度评分的最小证据维度结构 */
export interface RatedDimension {
  dimension: string
  rating: number | null | undefined
}

/**
 * 是否已进入冰山模型（B8 单点）。
 * 规则：冰山水下四维度（自我认知/品质特质/价值观/动机）任意一个已有评分，
 * 即判定进入冰山模型。由 follow-up getDisplayScore 与 detail determineActiveCategory 共用，
 * 替代各自硬编码的维度数组。
 */
export function isIcebergRated(evals: RatedDimension[] | null | undefined): boolean {
  if (!evals || evals.length === 0) return false
  return ICEBERG_HIDDEN_DIMENSIONS.some((dim) =>
    evals.some((e) => e.dimension === dim && e.rating != null && e.rating !== undefined)
  )
}

/** 冰山模型包含的维度 */
export const ICEBERG_DIMENSIONS: DimensionKey[] = DIMENSION_KEYS

/** 合法的评分来源 */
export const EVALUATION_SOURCES = ['ai', 'manual'] as const

/** 合法的模型分类 */
export const WEIGHT_MODEL_CATEGORIES = ['initial', 'iceberg'] as const

/** 新建职位时自动创建的默认权重模型模板 */
export const DEFAULT_WEIGHT_MODEL_TEMPLATES = {
  initial: {
    name: '初筛-默认模型',
    weights: { knowledge: 50, skill: 50 },
  },
  iceberg: {
    name: '冰山-默认模型',
    weights: { knowledge: 15, skill: 15, selfAwareness: 20, personality: 20, values: 15, motivation: 15 },
  },
} as const
