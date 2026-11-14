'use client'

import { UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ScreenedBatchActionsProps {
  /** 已选人数 */
  selectedCount: number
  /** 批量跟进（打开批量跟进弹窗） */
  onBatchFollowUp: () => void
  /** 取消选择 */
  onClearSelection: () => void
}

/**
 * 已筛选简历的内联批量操作条：选中时从右侧滑入，显示已选人数 + 批量跟进 / 取消。
 */
export function ScreenedBatchActions({
  selectedCount,
  onBatchFollowUp,
  onClearSelection,
}: ScreenedBatchActionsProps) {
  return (
    <div
      className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ease-out ${
        selectedCount > 0
          ? 'max-w-[500px] opacity-100 translate-x-0'
          : 'max-w-0 opacity-0 translate-x-4'
      }`}
    >
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        已选 <strong className="text-primary tabular-nums">{selectedCount}</strong> 人
      </span>
      <Button size="sm" onClick={onBatchFollowUp} className="gap-1.5 h-8">
        <UserCheck className="h-3.5 w-3.5" />
        批量跟进
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="h-8 text-muted-foreground hover:text-foreground"
      >
        取消
      </Button>
    </div>
  )
}
