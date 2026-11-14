import { cn } from '@/lib/utils'

export interface ProgressSegment {
  /** 该段数量（与 total 同一量纲） */
  value: number
  /** 段的填充色类，如 bg-success */
  className?: string
  /** 进行中的段加脉动，表示还在跑 */
  pulse?: boolean
}

interface SegmentedProgressProps {
  segments: ProgressSegment[]
  total: number
  className?: string
}

/**
 * 分段进度条。
 *
 * 与单色进度条的区别：它展示「进度由什么构成」——已完成 / 处理中 / 失败各占多宽，
 * 而不只是一个总百分比。数量为 0 的段不渲染，避免出现 0 宽的空隙。
 */
export function SegmentedProgress({ segments, total, className }: SegmentedProgressProps) {
  const safeTotal = total > 0 ? total : 1

  return (
    <div
      className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <div
            key={i}
            className={cn('h-full transition-all duration-500 ease-out', s.pulse && 'animate-pulse', s.className)}
            style={{ width: `${(s.value / safeTotal) * 100}%` }}
          />
        ))}
    </div>
  )
}
