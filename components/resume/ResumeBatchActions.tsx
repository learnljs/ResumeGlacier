'use client'

import { Zap, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ResumeBatchActionsProps {
  /** 已选数量（0 时批量按钮隐藏） */
  selectedCount: number
  /** 各批量任务进行中标记 */
  batchMatching: boolean
  batchReparsing: boolean
  batchScreening: boolean
  /** 批量匹配职位 */
  onBatchMatchPosition: () => void
  /** 批量强制解析 */
  onBatchForceReparse: () => void
  /** 批量 AI 筛选 */
  onBatchScreen: () => void
  /** 全部 AI 筛选（打开确认弹窗） */
  onScreenAll: () => void
}

/**
 * 简历列表头部的批量操作条：批量匹配职位 / 批量解析 / 批量 AI 筛选 / 全部 AI 筛选。
 * 选中数 > 0 时才显示前三个批量按钮（行为与原页面一致）。
 */
export function ResumeBatchActions({
  selectedCount,
  batchMatching,
  batchReparsing,
  batchScreening,
  onBatchMatchPosition,
  onBatchForceReparse,
  onBatchScreen,
  onScreenAll,
}: ResumeBatchActionsProps) {
  return (
    <div className="flex gap-2">
      {selectedCount > 0 && (
        <Button
          onClick={onBatchMatchPosition}
          disabled={batchMatching}
          variant="outline"
          className="gap-2"
        >
          {batchMatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {batchMatching ? '匹配中...' : `批量匹配职位 (${selectedCount})`}
        </Button>
      )}
      {selectedCount > 0 && (
        <Button
          onClick={onBatchForceReparse}
          disabled={batchReparsing}
          variant="outline"
          className="gap-2"
        >
          {batchReparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          {batchReparsing ? '解析中...' : `批量解析 (${selectedCount})`}
        </Button>
      )}
      {selectedCount > 0 && (
        <Button
          onClick={onBatchScreen}
          disabled={batchScreening}
          variant="outline"
          className="gap-2 hover:bg-muted hover:text-foreground"
        >
          {batchScreening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {batchScreening ? '筛选中...' : `批量AI筛选 (${selectedCount})`}
        </Button>
      )}
      <Button
        onClick={onScreenAll}
        disabled={batchScreening}
        variant="outline"
        className="gap-2"
      >
        {batchScreening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {batchScreening ? '筛选中...' : '全部AI筛选'}
      </Button>
    </div>
  )
}
