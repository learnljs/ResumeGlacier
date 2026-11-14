/**
 * 得分公式纯函数（代码质量专项：自 evaluation-service 抽出）。
 *
 * evaluation-service 会连带导入 Prisma 客户端，导致这段纯算数逻辑无法在
 * 单测中单独加载。抽到这里后，公式本身有唯一真相源且可直接测试；
 * 原模块通过 re-export 保持既有导入路径不变。
 */

/**
 * 按权重模型计算单个维度的得分（B7-6：算分公式单点）。
 * 5 星制：score = rating × (weight / 5)，保留 1 位小数。
 * preview 预览算分与正式维度评分共用此公式，避免双源漂移。
 */
export function computeWeightedScore(rating: number, weight: number): number {
  return Number((rating * (weight / 5)).toFixed(1))
}
