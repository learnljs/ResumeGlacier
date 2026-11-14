import { scoreColor } from '@/lib/constants/score'

/**
 * 得分徽章：分数 + 模型标签（冰山/初筛），无色值时显示「-」。
 * 由 follow-up 页表格得分列提取（B9）；颜色接 B8 单点 scoreColor，高分加粗。
 */
export function ScoreBadge({ score, label }: { score: number | null; label?: string }) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  const weight = score >= 80 ? 'font-bold' : score >= 60 ? 'font-semibold' : ''

  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm tabular-nums ${scoreColor(score)} ${weight}`.trim()}>{score}分</span>
      {label && <span className="text-[10px] tabular-nums text-muted-foreground">{label}</span>}
    </div>
  )
}
