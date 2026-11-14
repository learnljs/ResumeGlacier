/**
 * 得分档位 / 颜色单点（B8）。
 *
 * 背景：list / screened / follow-up / reevaluate 四处得分阈值不一致
 * （list 80/60，screened/follow-up 80/60/40，reevaluate 80/60）。本文件为唯一权威，
 * 统一为四档，并基于设计令牌返回类名（勿再在页面硬编码 Tailwind 裸色）。
 *
 * 档位：
 * - >= 80  → success（高，绿色）
 * - >= 60  → info（中高，蓝色）
 * - >= 40  → warning（中，黄色）
 * - <  40  → destructive（低，红色）
 */

export type ScoreTone = 'success' | 'info' | 'warning' | 'destructive'

/** 得分 → 语义档位 */
export function scoreTone(score: number): ScoreTone {
  if (score >= 80) return 'success'
  if (score >= 60) return 'info'
  if (score >= 40) return 'warning'
  return 'destructive'
}

/**
 * 档位 → 类名（显式字面量）。
 * 不能写成 `text-${tone}`：Tailwind 只扫描源码里的完整类名字符串，
 * 模板拼接出来的类名不会进入产物，生产构建时样式会丢失。
 */
const TONE_TEXT: Record<ScoreTone, string> = {
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  destructive: 'text-destructive',
}

const TONE_BG: Record<ScoreTone, string> = {
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
}

const TONE_BORDER: Record<ScoreTone, string> = {
  success: 'border-l-success',
  info: 'border-l-info',
  warning: 'border-l-warning',
  destructive: 'border-l-destructive',
}

/** 得分 → 文字颜色类（令牌） */
export function scoreColor(score: number): string {
  return TONE_TEXT[scoreTone(score)]
}

/** 得分 → 背景/进度条颜色类（令牌） */
export function scoreBarColor(score: number): string {
  return TONE_BG[scoreTone(score)]
}

/** 档位 → 背景色类（供分段刻度等直接按档位取色） */
export function scoreToneBg(tone: ScoreTone): string {
  return TONE_BG[tone]
}

/** 得分 → 卡片左侧色条类（未评估兜底默认边框色） */
export function scoreEdgeColor(score: number | null): string {
  return score === null ? 'border-l-border' : TONE_BORDER[scoreTone(score)]
}
