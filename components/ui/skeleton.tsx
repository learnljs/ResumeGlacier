import { cn } from '@/lib/utils'

/**
 * 骨架占位块。
 *
 * 用法：按真实内容的外框尺寸给 className（高度、圆角、宽度），
 * 让加载态与最终布局同形，避免数据到达时页面跳动。
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}
