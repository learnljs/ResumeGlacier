'use client'

import { Badge } from '@/components/ui/badge'
import { scoreTone, type ScoreTone } from '@/lib/constants/score'

/**
 * 复用评估页得分徽章（B9 从 page.tsx 提取）。
 *
 * 档位阈值走 lib/constants/score 的 scoreTone 单点（四档），本组件只负责
 * 「档位 → Badge 变体」的外观映射，不再自建 80/60 阈值。
 */
const TONE_VARIANT: Record<ScoreTone, 'success' | 'info' | 'warning' | 'destructive'> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  destructive: 'destructive',
}

export function ReevaluateScoreBadge({
  score,
  size = 'default',
}: {
  score: number | null
  size?: 'sm' | 'default'
}) {
  if (score == null) return <span className="text-muted-foreground">-</span>

  const variant = TONE_VARIANT[scoreTone(score)]

  return (
    <Badge variant={variant} className={size === 'sm' ? 'text-xs px-2' : 'px-2.5 py-0.5 font-mono tabular-nums'}>
      {score}
    </Badge>
  )
}
