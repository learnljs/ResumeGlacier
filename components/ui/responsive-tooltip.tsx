'use client'

import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface ResponsiveTooltipProps {
  /** 展示内容（Tooltip 和 Popover 共用） */
  content: React.ReactNode
  /** 弹出方向，默认 top */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** 对齐方式 */
  align?: 'start' | 'center' | 'end'
  /** Tooltip 最大宽度，默认 240 */
  tooltipMaxWidth?: number
  /** Popover 最大宽度，默认 320 */
  popoverMaxWidth?: number
  /** 触发元素 */
  children: React.ReactNode
}

/**
 * 响应式提示组件
 * - 桌面端（hover: hover + pointer: fine）：hover 触发 Tooltip
 * - 移动端（触屏）：click 触发 Popover
 */
export function ResponsiveTooltip({
  content,
  side = 'top',
  align = 'center',
  tooltipMaxWidth = 240,
  popoverMaxWidth = 320,
  children,
}: ResponsiveTooltipProps) {
  const isHoverDevice = useMediaQuery('(hover: hover) and (pointer: fine)')

  if (isHoverDevice) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className="text-xs leading-relaxed"
          style={{ maxWidth: tooltipMaxWidth }}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="text-xs leading-relaxed py-2 px-3"
        style={{ maxWidth: popoverMaxWidth }}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
