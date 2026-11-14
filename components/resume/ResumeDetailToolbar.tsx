'use client'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Loader2, Zap, RefreshCw, ArrowLeft, UserCheck, ThumbsDown, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { PositionOption } from '@/types/resume'

/** 连续浏览导航状态（由页面持有，本组件只渲染） */
export interface DetailNavState {
  /** 是否存在导航快照（决定上一份/下一份是否渲染） */
  visible: boolean
  /** 当前简历在快照中的下标 */
  index: number
  /** 快照内简历总数 */
  total: number
  /** 是否正在追加下一页 */
  appending: boolean
  /** 快照末尾是否还能继续追加 */
  canAppendMore: boolean
  onPrev: () => void
  onNext: () => void
}

/**
 * 简历详情页顶部工具条（B9 从 page.tsx 提取）。
 * 仅承载导航与操作按钮，候选人信息全部在下方 ResumeDetailHeader。
 */
export function ResumeDetailToolbar({
  backUrl,
  resumeStatus,
  positionTitle,
  positions,
  selectedPositionId,
  onSelectPosition,
  showPositionControls,
  hasExtractedText,
  screening,
  onScreen,
  refetching,
  reparsing,
  onRefetch,
  onReparse,
  isFromScreened,
  onFollowUp,
  onUnsuitable,
  nav,
}: {
  backUrl: string
  resumeStatus: string
  positionTitle: string | null
  positions: PositionOption[]
  selectedPositionId: string | null
  onSelectPosition: (id: string | null) => void
  /** 仅在「评估结果」Tab 下显示职位选择与开始评估 */
  showPositionControls: boolean
  hasExtractedText: boolean
  screening: boolean
  onScreen: () => void
  refetching: boolean
  reparsing: boolean
  onRefetch: () => void
  onReparse: () => void
  isFromScreened: boolean
  onFollowUp: () => void
  onUnsuitable: () => void
  nav: DetailNavState
}) {
  const busy = screening || resumeStatus === 'SCREENING'

  return (
    <div className="flex items-center justify-between sticky top-0 z-40 -mx-6 px-6 py-3 bg-background/90 backdrop-blur-sm border-b border-border/60">
      <div className="flex items-center gap-2">
        <Link href={backUrl}>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        {nav.visible && (
          <div className="flex items-center gap-1 ml-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={nav.index <= 0}
              onClick={nav.onPrev}
              title="上一份（←）"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={nav.index === nav.total - 1 && !nav.canAppendMore}
              onClick={nav.onNext}
              title="下一份（→）"
            >
              {nav.appending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <span className="ml-1 text-xs text-muted-foreground">
              {nav.index + 1} / {nav.total}
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-2 items-center">
        {showPositionControls && (
          <div className="flex items-center gap-2">
            {positions.length > 1 ? (
              <Select
                value={selectedPositionId || ''}
                onChange={(e) => onSelectPosition(e.target.value || null)}
                className="w-[180px] h-8 text-sm"
                title="评估职位"
              >
                <option value="">未分配职位</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </Select>
            ) : positionTitle ? (
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {positionTitle}
              </span>
            ) : null}
            <Button
              onClick={onScreen}
              disabled={busy || !selectedPositionId || !hasExtractedText}
              className="gap-1.5 h-8"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {busy
                ? '评估中...'
                : resumeStatus === 'SCREENED'
                ? '重新评估'
                : '开始评估'}
            </Button>
          </div>
        )}
        {resumeStatus === 'ERROR' && (
          <Button
            onClick={onRefetch}
            disabled={refetching || reparsing}
            variant="outline"
            size="icon"
            className="h-8 w-8 text-warning border-warning/40 hover:bg-warning/10 hover:text-warning"
            title="重新获取"
          >
            {refetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          onClick={onReparse}
          disabled={reparsing || refetching}
          variant="outline"
          size="icon"
          className="h-8 w-8 hover:bg-muted hover:text-foreground"
          title="重新解析"
        >
          {reparsing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
        {isFromScreened && (
          <Button
            variant="outline"
            onClick={onFollowUp}
            className="gap-2 text-success border-success/40 hover:bg-success/10 hover:text-success"
          >
            <UserCheck className="h-4 w-4" />
            跟进
          </Button>
        )}
        {isFromScreened && (
          <Button
            variant="outline"
            onClick={onUnsuitable}
            className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <ThumbsDown className="h-4 w-4" />
            不合适
          </Button>
        )}
      </div>
    </div>
  )
}
