/**
 * 图表配色与通用样式的单点定义。
 *
 * 颜色一律走 `--chart-1..10` 令牌（globals.css 定义 / tailwind.config.ts 注册），
 * 组件里不要再写十六进制色值 —— 否则换主题时图表会串色。
 * SVG 的 stroke / fill 支持 `var()`，所以这里直接返回 CSS 变量表达式。
 */

/** 图表色序列长度 */
export const CHART_SERIES_COUNT = 10

/** 取第 n 个图表色（1 起，超界自动循环） */
export function chartColor(index: number): string {
  const i = ((Math.round(index) - 1) % CHART_SERIES_COUNT + CHART_SERIES_COUNT) % CHART_SERIES_COUNT
  return `hsl(var(--chart-${i + 1}))`
}

/** 带透明度的图表色（recharts 的渐变 stopOpacity 不方便时用这个） */
export function chartColorAlpha(index: number, alpha: number): string {
  const i = ((Math.round(index) - 1) % CHART_SERIES_COUNT + CHART_SERIES_COUNT) % CHART_SERIES_COUNT
  return `hsl(var(--chart-${i + 1}) / ${alpha})`
}

/** 语义色（与 tokens 同源，供图表按含义取色） */
export const CHART_SEMANTIC = {
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  info: 'hsl(var(--info))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground))',
  grid: 'hsl(var(--border))',
  axis: 'hsl(var(--muted-foreground))',
} as const
