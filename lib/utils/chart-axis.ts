/**
 * 趋势图坐标轴纯函数（代码质量专项：自 PositionTrendCompareChart 抽出）。
 *
 * 与 React / Recharts 完全无关的算数逻辑，放在组件文件里既无法单测，
 * 也容易在多个图表间各写一份。此处作为坐标轴口径的唯一真相源。
 */

/**
 * X 轴标签均匀分布：超过 maxCount 个标签时等距抽样，始终包含首尾。
 *
 * maxCount <= 1 时只取首项，避免 (n - 1) / (maxCount - 1) 除零产生
 * NaN 索引（原本靠调用方保证 >= 2，现在由函数自己兜底）。
 */
export function getEvenlySpacedTicks(labels: string[], maxCount = 8): string[] {
  const n = labels.length
  if (n <= maxCount) return labels
  if (maxCount <= 1) return labels.length ? [labels[0]] : []
  const step = (n - 1) / (maxCount - 1)
  const ticks: string[] = []
  for (let i = 0; i < maxCount; i++) {
    ticks.push(labels[Math.round(i * step)])
  }
  return ticks
}

/**
 * 取「好看」的整数上限：1/2/5 × 10^n 再留 10% 顶部余量。
 *
 * Recharts 默认 domain 是 [0, auto]，能跟着数据变，但峰值会贴到图顶、
 * 刻度出现 13 / 27 这类无法一眼睛读数的值。这里显式算上限，
 * 保证收到 80 份简历时纵轴到 100 而不是被截断或压扁。
 */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const target = value * 1.1
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const normalized = target / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return Math.round(step * magnitude)
}

/**
 * 纵轴整数刻度：步长取 1/2/5 × 10^n，控制在 6 格以内。
 *
 * 交给 Recharts 的 tickCount 去分，会出现「5、4、2、0」这种整数过滤后
 * 数量跳着走的刻度，读图要先算差值；这里自己把刻度列出来。
 *
 * 非有限值 / 负数返回 [0]，避免 NaN 步长让循环静默产出空数组。
 */
export function integerTicks(max: number): number[] {
  if (!Number.isFinite(max) || max < 0) return [0]
  const step = (() => {
    const raw = Math.max(1, Math.ceil(max / 5))
    const magnitude = 10 ** Math.floor(Math.log10(raw))
    const n = raw / magnitude
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitude
  })()
  const ticks: number[] = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return ticks
}
