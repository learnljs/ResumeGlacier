'use client'

import Link from 'next/link'
import { Copy, Eye, UserCheck, ThumbsDown } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StarRating } from '@/components/resume/StarRating'
import { statusLabel, statusColor } from '@/lib/constants/resume-status'
import { scoreColor, scoreEdgeColor } from '@/lib/constants/score'
import { ScoreBar } from '@/components/resume/ScoreBar'
import { formatDate, formatMonthDayTime } from '@/lib/utils/date'
import type { ScreenedResumeItem } from '@/types/resume'

/** 勾选图标（比 lucide Check 更粗的描边） */
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

/** 复制姓名到剪贴板（兼容不支持 clipboard API 的浏览器） */
function copyName(name: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(name).then(() => toast.success('已复制姓名')).catch(() => toast.error('复制失败'))
  } else {
    const ta = document.createElement('textarea')
    ta.value = name; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy'); toast.success('已复制姓名') } catch { toast.error('复制失败') }
    document.body.removeChild(ta)
  }
}

interface ScreenedResumeCardProps {
  resume: ScreenedResumeItem
  /** 是否被勾选 */
  selected: boolean
  /** 当前完整查询串（详情页返回 URL） */
  currentQueryString: string
  /** 勾选切换 */
  onToggleSelect: (id: string) => void
  /** 详情链接前写导航快照 */
  writeNavSnapshot: () => void
  /** 维度评分变更 */
  onRatingChange: (resumeId: string, dimension: string, rating: number) => void
  /** 发起跟进 */
  onFollowUp: (resume: ScreenedResumeItem) => void
  /** 标记不合适 */
  onUnsuitable: (resume: ScreenedResumeItem) => void
}

/**
 * 已筛选简历单张卡片：勾选 + 头像 + 主体（姓名/岗位/状态/来源时间）+ 知识技能星级与评分条 + 操作区。
 */
export function ScreenedResumeCard({
  resume,
  selected,
  currentQueryString,
  onToggleSelect,
  writeNavSnapshot,
  onRatingChange,
  onFollowUp,
  onUnsuitable,
}: ScreenedResumeCardProps) {
  const knowledgeRating = resume.evaluationDimensions.find((e) => e.dimension === 'knowledge')?.rating ?? null
  const skillRating = resume.evaluationDimensions.find((e) => e.dimension === 'skill')?.rating ?? null
  const s = resume.positionScores?.[0]?.initialScore ?? null

  return (
    <div
      className={`group flex items-start gap-3 rounded-xl border border-l-[3px] border-border bg-card p-3.5 transition-colors hover:bg-muted/40 ${scoreEdgeColor(s)} ${
        selected ? 'bg-primary/[0.04]' : ''
      }`}
    >
      {/* 选择 */}
      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onToggleSelect(resume.id)}
          className="p-0.5 rounded"
          aria-label="选择"
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            selected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
          }`}>
            {selected && <CheckIcon className="w-3 h-3 text-primary-foreground" />}
          </div>
        </button>
      </div>

      {/* 头像 */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="h-10 w-10 rounded-full inline-flex items-center justify-center text-sm font-semibold bg-gradient-to-br from-accent/20 to-primary/10 text-foreground/80 ring-1 ring-inset ring-border">
          {(resume.candidateName || '未')[0]}
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{resume.candidateName || '未知名称'}</span>
          {resume.candidateName && (
            <button
              className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
              title="复制姓名"
              onClick={(e) => { e.stopPropagation(); copyName(resume.candidateName!) }}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {resume.position ? (
            <Badge variant="secondary" className="text-xs">{resume.position.title}</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">未分配</Badge>
          )}
          <Badge className={`text-xs ${statusColor(resume.status)}`}>
            {statusLabel(resume.status)}
          </Badge>
        </div>
        <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground flex-wrap">
          <span>{resume.resumeSource?.name || '-'}</span>
          <span>
            {resume.screenedAt
              ? formatDate(resume.screenedAt)
              : '-'}
          </span>
          <span>
            {resume.email?.receivedAt
              ? formatMonthDayTime(resume.email.receivedAt)
              : resume.sourceEmailReceivedAt
                ? formatMonthDayTime(resume.sourceEmailReceivedAt)
                : '-'}
          </span>
        </div>
        {/* 维度星级 + 评分 */}
        <div className="mt-2.5 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">知识</span>
            <StarRating
              rating={knowledgeRating}
              onChange={(rating) => onRatingChange(resume.id, 'knowledge', rating)}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">技能</span>
            <StarRating
              rating={skillRating}
              onChange={(rating) => onRatingChange(resume.id, 'skill', rating)}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <ScoreBar score={s} className="w-20" />
            {s !== null ? (
              <span className={`text-xs font-medium tabular-nums ${scoreColor(s)}`}>
                {s} 分
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">未评估</span>
            )}
          </div>
        </div>
      </div>

      {/* 操作区 */}
      <div className="flex flex-col items-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <Link onClick={writeNavSnapshot} href={`/resume/detail/${resume.id}?from=${encodeURIComponent(currentQueryString ? `/resume/screened?${currentQueryString}` : '/resume/screened')}`}>
            <Button variant="ghost" size="sm" className="gap-1 h-7 px-2 text-xs rounded-md hover:bg-muted hover:text-foreground transition-colors">
              <Eye className="h-3 w-3" />
              查看
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 h-7 px-2 text-xs rounded-md text-primary hover:bg-muted hover:text-foreground transition-colors"
            onClick={() => onFollowUp(resume)}
          >
            <UserCheck className="h-3 w-3" />
            跟进
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 h-7 px-2 text-xs rounded-md text-destructive hover:bg-muted hover:text-foreground transition-colors"
            onClick={() => onUnsuitable(resume)}
          >
            <ThumbsDown className="h-3 w-3" />
            不合适
          </Button>
        </div>
      </div>
    </div>
  )
}
