'use client'

import { useMemo } from 'react'
import { Plus, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EVALUATION_DIMENSIONS,
  DIMENSION_KEYS,
  DIMENSION_DESCRIPTIONS,
} from '@/lib/constants/evaluation'

interface EvaluationRadarProps {
  evaluations: {
    dimension: string
    rating: number | null
    comment: string | null
  }[]
  editableDimensions?: string[]
  onDimensionClick?: (dimension: string) => void
  /** 维度列数：卡片整宽时用 2 列，避免每行被拉出大片空白 */
  columns?: 1 | 2 | 3
}

/**
 * 评估维度点阵
 *
 * 替代原六边形雷达图，也收掉了上一版的横向进度条：
 * 每行只用「维度名 + 5 格方块 + 评分」表达，评的本来就是 1-5 分，
 * 5 格比百分比条更贴合语义，竖向高度也省一半。
 * 评语收进右侧气泡，hover 展开，避免每行多占一行文字。
 */
export function EvaluationRadar({
  evaluations,
  editableDimensions = [],
  onDimensionClick,
  columns = 1,
}: EvaluationRadarProps) {
  const data = useMemo(() => {
    return DIMENSION_KEYS.map((key) => {
      const evalData = evaluations.find((e) => e.dimension === key)
      return {
        dimensionKey: key,
        label: EVALUATION_DIMENSIONS[key].label,
        description: DIMENSION_DESCRIPTIONS[key] || '',
        rating: evalData?.rating ?? null,
        comment: evalData?.comment ?? null,
        isEditable: editableDimensions.includes(key),
      }
    })
  }, [evaluations, editableDimensions])

  return (
    <div
      className={cn(
        'grid gap-y-0.5',
        columns === 2 && 'gap-x-10 sm:grid-cols-2',
        columns === 3 && 'gap-x-8 sm:grid-cols-2 lg:grid-cols-3'
      )}
    >
      {data.map((item) => {
        const rated = item.rating !== null
        const clickable = item.isEditable && !!onDimensionClick

        return (
          <div
            key={item.dimensionKey}
            className={cn(
              'group relative flex items-center gap-3 rounded-lg px-2 py-2 transition-colors',
              clickable && 'cursor-pointer hover:bg-muted/50'
            )}
            title={item.description}
            onClick={() => {
              if (clickable) onDimensionClick(item.dimensionKey)
            }}
          >
            <span
              className={cn(
                'w-[76px] shrink-0 text-sm',
                rated ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {item.label}
            </span>

            {/* 5 格点阵：有几格填几格 */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'h-2.5 w-2.5 rounded-[3px] transition-colors',
                    rated && i <= item.rating! ? 'bg-accent' : 'bg-muted',
                    clickable && 'group-hover:ring-1 group-hover:ring-accent/20'
                  )}
                />
              ))}
            </div>

            {/* 评分紧跟点阵，避免中间留出空洞 */}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {rated ? `${item.rating}/5` : clickable ? (
                <span className="inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  <Plus className="h-3 w-3" />
                  点击评分
                </span>
              ) : (
                '未评分'
              )}
            </span>

            {/* 评语气泡：有评语才出现，hover 展开 */}
            {item.comment && (
              <span className="relative ml-1.5 flex items-center">
                <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground/70 transition-colors group-hover:text-foreground" />
                <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-56 rounded-lg border border-border bg-popover p-2 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-soft group-hover:block">
                  {item.comment}
                </span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
