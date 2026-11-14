'use client'

import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResponsiveTooltip } from '@/components/ui/responsive-tooltip'
import {
  EVALUATION_DIMENSIONS,
  DIMENSION_DESCRIPTIONS,
  type DimensionKey,
} from '@/lib/constants/evaluation'

interface DimensionLabelProps {
  dimension: DimensionKey
  /** 是否只显示标签文本（不显示 tip 图标），默认 false */
  noTip?: boolean
  className?: string
}

/**
 * 维度标签组件
 * - 渲染维度名称 + Info tip 图标
 * - hover 图标时显示维度描述
 */
export function DimensionLabel({ dimension, noTip = false, className }: DimensionLabelProps) {
  const label = EVALUATION_DIMENSIONS[dimension]?.label || dimension
  const description = DIMENSION_DESCRIPTIONS[dimension]

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {label}
      {!noTip && description && (
        <ResponsiveTooltip content={description} side="top">
          <Info
            className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0 active:scale-90 transition-transform"
            aria-label={`${label}说明`}
          />
        </ResponsiveTooltip>
      )}
    </span>
  )
}
