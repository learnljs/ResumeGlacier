'use client'

import Link from 'next/link'
import { Copy, FileText, Clock, CheckCircle2, Loader2, Zap, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { statusLabel, statusColor, statusDotColor, statusEdgeColor } from '@/lib/constants/resume-status'
import { scoreColor } from '@/lib/constants/score'
import { ScoreBar } from '@/components/resume/ScoreBar'
import { formatDate, formatMonthDayTime } from '@/lib/utils/date'
import type { ResumeItem, PositionOption } from '@/types/resume'

/**
 * 取行内展示的初筛分：优先目标岗位的评估，其次首个评估
 * 替代后端扁平化字段 resume.initialScore（与废弃列同名，来源是 PositionEvaluation）
 */
function getPrimaryScore(
  resume: { positionScores?: Array<{ positionId: string; initialScore: number | null }> | null },
  positionId: string
): number | null {
  return (
    resume.positionScores?.find((s) => s.positionId === positionId)?.initialScore ??
    resume.positionScores?.[0]?.initialScore ??
    null
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

interface ResumeListItemCardProps {
  resume: ResumeItem
  /** 是否被勾选 */
  selected: boolean
  /** 当前职位筛选（决定显示哪个岗位的分数） */
  positionId: string
  /** 全部职位（未分配时展示分配下拉） */
  positions: PositionOption[]
  /** 正在自动匹配的简历 id */
  matchingId: string | null
  /** 正在分配岗位的简历 id */
  assigningId: string | null
  /** 详情页返回 URL */
  currentListUrl: string
  /** 勾选切换 */
  onToggleSelect: (id: string) => void
  /** 打开详情页（写导航快照 + 跳转） */
  onOpen: (resume: ResumeItem) => void
  /** 详情链接前写导航快照 */
  writeNavSnapshot: () => void
  /** 自动匹配职位 */
  onMatchPosition: (id: string) => void
  /** 手动分配职位 */
  onAssignPosition: (id: string, positionId: string) => void
}

/**
 * 简历列表单张候选人卡片：勾选 + 头像/状态点 + 主体信息 + 评分条 + 操作区。
 */
export function ResumeListItemCard({
  resume,
  selected,
  positionId,
  positions,
  matchingId,
  assigningId,
  currentListUrl,
  onToggleSelect,
  onOpen,
  writeNavSnapshot,
  onMatchPosition,
  onAssignPosition,
}: ResumeListItemCardProps) {
  const s = getPrimaryScore(resume, positionId)

  return (
    <div
      onClick={() => onOpen(resume)}
      className={`group flex items-start gap-3 rounded-xl border border-l-[3px] bg-card p-3.5 transition-colors cursor-pointer ${statusEdgeColor(resume.status)} ${
        selected
          ? 'border-primary/40 shadow-soft'
          : 'border-border hover:bg-muted/40'
      }`}
    >
      {/* 选择 */}
      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(resume.id)}
          className="h-4 w-4 rounded border-muted-foreground/30 text-primary accent-primary"
        />
      </div>

      {/* 头像 */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="h-10 w-10 rounded-full inline-flex items-center justify-center text-sm font-semibold bg-gradient-to-br from-accent/20 to-primary/10 text-foreground/80 ring-1 ring-inset ring-border">
          {(resume.candidateName || '未')[0]}
        </div>
        <span className={`h-1.5 w-1.5 rounded-full ${statusDotColor(resume.status)}`} title={statusLabel(resume.status)} />
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
          {resume.resumeSource && (
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {resume.resumeSource.name}
            </span>
          )}
          {resume.emailConfig && <span>{resume.emailConfig.alias}</span>}
          {!resume.resumeSource && !resume.emailConfig && (
            <span className="truncate max-w-[220px]">
              {resume.email?.subject || resume.sourceEmailSubject || '未知'}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {resume.email?.receivedAt
              ? formatDate(resume.email.receivedAt)
              : resume.sourceEmailReceivedAt
                ? formatDate(resume.sourceEmailReceivedAt)
                : '-'}
          </span>
          {resume.screenedAt && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {formatMonthDayTime(resume.screenedAt)}
            </span>
          )}
        </div>
        {/* 评分条 */}
        <div className="mt-2.5 flex items-center gap-2">
          <ScoreBar score={s} className="w-28" />
          {s !== null ? (
            <span className={`text-xs font-medium tabular-nums ${scoreColor(s)}`}>
              {s} 分
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">未评估</span>
          )}
        </div>
      </div>

      {/* 操作区 */}
      <div className="flex flex-col items-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {!resume.position && positions.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={matchingId === resume.id}
              onClick={() => onMatchPosition(resume.id)}
              title="自动匹配职位"
            >
              {matchingId === resume.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
            </Button>
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) onAssignPosition(resume.id, e.target.value)
              }}
              className="h-8 text-xs min-w-[130px]"
              disabled={assigningId === resume.id}
            >
              <option value="">选择职位...</option>
              {positions.map((pos) => (
                <option key={pos.id} value={pos.id}>
                  {pos.title}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Link
          onClick={writeNavSnapshot}
          href={`/resume/detail/${resume.id}?from=${encodeURIComponent(currentListUrl)}`}
          className="inline-flex"
        >
          <Button variant="ghost" size="sm" className="gap-1 h-7 px-2 text-xs rounded-md hover:bg-muted hover:text-foreground transition-colors">
            <Eye className="h-3 w-3" />
            查看
          </Button>
        </Link>
      </div>
    </div>
  )
}
