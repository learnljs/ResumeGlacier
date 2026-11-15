import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type PageSkeletonVariant = 'table' | 'cards' | 'form' | 'detail'

/** 表格行骨架：给已有外框（Card / 表格容器）内部使用，不带页面内边距 */
export function TableRowsSkeleton({
  rows = 6,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div
      className={cn('overflow-hidden rounded-xl border border-border/60 bg-card', className)}
      role="status"
      aria-busy="true"
      aria-label="正在加载列表数据"
    >
      <span className="sr-only">正在加载列表数据…</span>
      <div className="flex items-center gap-4 border-b border-border/60 bg-muted/40 px-4 py-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="hidden h-4 w-24 sm:block" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64 max-w-[70%]" />
            </div>
            <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 页面级骨架屏：按真实内容的外框尺寸占位。
 *
 * 目的不是"转个圈表示在忙"，而是让首屏就有和最终页面同样的标题、卡片、
 * 表格行位置；数据到达时只是把灰块换成文字，不会出现「先空表格→突然填满」
 * 的跳动。所有页面共用一份，改版式只改这里。
 */
export function PageSkeleton({
  variant = 'table',
  rows = 6,
  className,
}: {
  variant?: PageSkeletonVariant
  rows?: number
  className?: string
}) {
  const keys = Array.from({ length: rows }, (_, i) => i)

  return (
    <div
      className={cn('p-6 lg:p-8 space-y-6', className)}
      role="status"
      aria-busy="true"
      aria-label="正在加载页面数据"
    >
      <span className="sr-only">正在加载页面数据…</span>

      {/* 标题 + 右上角主操作 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {variant === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {keys.map((i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border/60 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {variant === 'form' && (
        <div className="max-w-3xl space-y-5 rounded-xl border border-border/60 p-6">
          {keys.map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      )}

      {variant === 'detail' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4 rounded-xl border border-border/60 p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-[240px] w-full rounded-lg" />
          </div>
          <div className="space-y-3 rounded-xl border border-border/60 p-6">
            <Skeleton className="h-5 w-32" />
            {keys.slice(0, 4).map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {variant === 'table' && (
        <>
          {/* 筛选条 */}
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-9 w-56 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <div className="flex items-center gap-4 border-b border-border/60 bg-muted/40 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="hidden h-4 w-28 sm:block" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
            <div className="divide-y divide-border/60">
              {keys.map((i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64 max-w-[70%]" />
                  </div>
                  <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
