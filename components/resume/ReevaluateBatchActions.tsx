'use client'

import { CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, UserPlus, Clock } from 'lucide-react'
import { relativeTime } from '@/lib/utils/date'

/**
 * 简历复用评估页列表条头：标题 / 选中计数 / 数据新鲜度 / 发起评估 / 批量跟进 / 进度条。
 * B9 从 page.tsx 提取。
 */
export function ReevaluateBatchActions({
  candidateCount,
  selectedCount,
  batchFollowUpCount,
  hasModel,
  selectedPositionId,
  evaluating,
  progress,
  fetchedAt,
  onStartEvaluation,
  onOpenBatchFollowUp,
}: {
  candidateCount: number
  selectedCount: number
  batchFollowUpCount: number
  hasModel: boolean
  selectedPositionId: string
  evaluating: boolean
  progress: number
  /** 上次拉取时间戳（相对时间指示器） */
  fetchedAt: number | null
  onStartEvaluation: () => void
  onOpenBatchFollowUp: () => void
}) {
  return (
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">候选人列表</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {candidateCount} 位
          </Badge>
          {selectedCount > 0 && (
            <Badge variant="default" className="text-xs">
              已选 {selectedCount} 位
            </Badge>
          )}
          {/* 数据新鲜度指示器 */}
          {fetchedAt != null && (
            <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1 ml-1">
              <Clock className="h-3 w-3" />
              {relativeTime(fetchedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={onStartEvaluation}
            disabled={evaluating || selectedCount === 0 || !hasModel}
            size="sm"
            variant={selectedCount > 0 && hasModel ? 'default' : 'outline'}
            className={`transition-all duration-300 ${
              selectedCount > 0 && hasModel
                ? 'shadow-soft hover:shadow-card'
                : ''
            }`}
          >
            {evaluating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                评估中 {progress}%
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                发起 AI 评估 ({selectedCount})
              </>
            )}
          </Button>
          {selectedCount > 0 && (
            <Button
              onClick={onOpenBatchFollowUp}
              size="sm"
              variant="default"
              className="transition-all duration-300 shadow-soft hover:shadow-card"
              disabled={batchFollowUpCount === 0}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              批量跟进 ({batchFollowUpCount})
            </Button>
          )}
        </div>
      </div>
      {/* 进度条 */}
      {evaluating && (
        <div className="mt-3 w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary via-info to-info/80 rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_hsl(var(--info)/0.3)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {!hasModel && selectedPositionId && (
        <p className="text-sm text-destructive mt-2 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" />
          目标岗位未配置默认初筛模型，无法发起评估
        </p>
      )}
    </CardHeader>
  )
}
