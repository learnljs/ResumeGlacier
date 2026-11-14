'use client'

import { cn } from '@/lib/utils'
import { scoreTone, scoreToneBg } from '@/lib/constants/score'

interface ScoreBarProps {
  /** 0-100 的得分；null 表示未评估（整条留灰） */
  score: number | null
  /** 段数，默认 10 段（每段 10 分） */
  segments?: number
  /** 单段高度类，默认 h-1.5 */
  heightClassName?: string
  className?: string
}

/**
 * 分段刻度得分条。
 *
 * 与连续进度条的区别：用 10 个格子表达量级，78 分一眼看出「七格多」，
 * 不必去读数字。最后一段按小数比例填充，保留精度。
 * 颜色走 lib/constants/score.ts 的档位令牌（success/info/warning/destructive）。
 */
export function ScoreBar({
  score,
  segments = 10,
  heightClassName = 'h-1.5',
  className,
}: ScoreBarProps) {
  const safe = score === null ? null : Math.max(0, Math.min(100, score))
  const tone = safe === null ? null : scoreTone(safe)
  const step = 100 / segments

  return (
    <div
      className={cn('flex items-center gap-[3px]', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe ?? 0}
      aria-label={safe === null ? '未评估' : `得分 ${safe} 分`}
    >
      {Array.from({ length: segments }).map((_, i) => {
        const ratio = safe === null ? 0 : Math.max(0, Math.min(1, (safe - i * step) / step))
        return (
          <div
            key={i}
            className={cn('flex-1 overflow-hidden rounded-[2px] bg-muted', heightClassName)}
          >
            <div
              className={cn(
                'h-full rounded-[2px] transition-[width] duration-500 ease-out',
                tone && scoreToneBg(tone)
              )}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}
