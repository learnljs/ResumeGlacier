import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** 顶部图标（lucide 组件） */
  icon?: LucideIcon
  title: string
  description?: string
  /** 可选行动区，例如「去配置邮箱」按钮 */
  action?: React.ReactNode
  className?: string
}

/**
 * 空状态占位。
 *
 * 统一各页「没有数据 / 加载失败」的留白与文案层级，
 * 避免每个列表各写一套 <div> 拼出来的提示。
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
