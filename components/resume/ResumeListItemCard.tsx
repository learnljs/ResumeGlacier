'use client'

import { useEffect, useState } from 'react'
import { Copy, FileText, Clock, CheckCircle2, Loader2, Zap, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { statusLabel, statusColor, statusDotColor, statusEdgeColor } from '@/lib/constants/resume-status'
import { scoreColor } from '@/lib/constants/score'
import { getIcebergProgress, pickPositionScore } from '@/lib/utils/resume-scores'
import { formatDate, formatMonthDayTime } from '@/lib/utils/date'
import type { ResumeItem, PositionOption } from '@/types/resume'

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

/**
 * 列表头像：优先展示详情页提取的候选人照片，未提取/加载失败时回退姓名首字。
 * 走 /api/resumes/[id]/photo 而非 public 静态路径——运行时新增的文件在
 * 生产模式下要重启才可见，API 读盘无此问题（与详情页 CandidatePhoto 一致）。
 */
function ResumeAvatar({
  resumeId,
  photoUrl,
  name,
}: {
  resumeId: string
  photoUrl?: string | null
  name: string | null
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [photoUrl, resumeId])

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full inline-flex items-center justify-center text-sm font-semibold bg-gradient-to-br from-accent/20 to-primary/10 text-foreground/80 ring-1 ring-inset ring-border">
      {photoUrl && !failed ? (
        <img
          src={`/api/resumes/${resumeId}/photo`}
          alt={name ? `${name}的头像` : '候选人头像'}
          onError={() => setFailed(true)}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        (name || '未')[0]
      )}
    </div>
  )
}

/** 单个分数列：标签 + 放大数字 + 可选的待评标注 */
function ScoreCell({
  label,
  titleLabel,
  score,
  note,
  noteTitle,
  className = '',
}: {
  label: string
  /** 悬浮提示用的完整名称（列表标注可写简称） */
  titleLabel?: string
  score: number | null
  note?: string | null
  noteTitle?: string
  className?: string
}) {
  const fullLabel = titleLabel ?? label
  return (
    <div className={`flex w-[88px] shrink-0 flex-col items-center justify-center gap-1 px-2 text-center ${className}`}>
      <span className="text-[11px] font-medium tracking-wide whitespace-nowrap text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-[26px] font-bold leading-none tabular-nums ${
          score === null ? 'text-muted-foreground/35' : scoreColor(score)
        }`}
        title={
          score === null
            ? '暂无评分'
            : note
              ? `${fullLabel}得分 ${score} 分（部分得分，${note}）`
              : `${fullLabel}得分 ${score} 分`
        }
      >
        {score === null ? '—' : Math.round(score)}
      </span>
      {/* 固定高度占位，保证两列数字基线对齐 */}
      <div className="flex h-[15px] items-center">
        {note && (
          <span
            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none font-medium bg-warning/10 text-warning whitespace-nowrap"
            title={noteTitle}
          >
            <AlertCircle className="h-2.5 w-2.5" />
            {note}
          </span>
        )}
      </div>
    </div>
  )
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
  /** 勾选切换 */
  onToggleSelect: (id: string) => void
  /** 打开详情页（写导航快照 + 跳转），整张卡片点击/回车都会触发 */
  onOpen: (resume: ResumeItem) => void
  /** 自动匹配职位 */
  onMatchPosition: (id: string) => void
  /** 手动分配职位 */
  onAssignPosition: (id: string, positionId: string) => void
}

/**
 * 简历列表单张候选人卡片：勾选 + 头像/状态点 + 主体信息 + 两列分数 + 未分配时的分配控件。
 * 整张卡片可点击进入详情页；卡片内的交互控件（勾选、复制、匹配、下拉）阻止冒泡。
 */
export function ResumeListItemCard({
  resume,
  selected,
  positionId,
  positions,
  matchingId,
  assigningId,
  onToggleSelect,
  onOpen,
  onMatchPosition,
  onAssignPosition,
}: ResumeListItemCardProps) {
  const score = pickPositionScore(resume.positionScores, positionId)
  const initialScore = score?.initialScore ?? null
  const compositeScore = score?.compositeScore ?? null
  const iceberg = getIcebergProgress(resume.evaluationDimensions, score?.positionId)

  // 已有初筛分、但冰山模型维度没打完：综合分此时只是「部分得分」，需要标注
  const hasAnyScore = initialScore !== null || compositeScore !== null
  const pending = iceberg.hasData && iceberg.missing > 0 && hasAnyScore
  const pendingNote = pending ? `待评 ${iceberg.missing} 项` : null
  const pendingTitle = pending
    ? `冰山模型未打分维度：${iceberg.missingLabels.join('、')}。当前综合分为部分得分。`
    : undefined

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`查看 ${resume.candidateName || '未知'} 的简历详情`}
      onClick={() => onOpen(resume)}
      onKeyDown={(e) => {
        // 焦点在复选框/下拉等子控件上时不接管按键
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(resume)
        }
      }}
      className={`flex items-center gap-3 rounded-xl border border-l-[3px] bg-card p-3.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${statusEdgeColor(resume.status)} ${
        selected
          ? 'border-primary/40 shadow-soft'
          : 'border-border hover:bg-muted/40'
      }`}
    >
      {/* 选择 */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(resume.id)}
          className="h-4 w-4 rounded border-muted-foreground/30 text-primary accent-primary"
        />
      </div>

      {/* 头像 + 状态点 */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <ResumeAvatar
          resumeId={resume.id}
          photoUrl={resume.candidatePhoto}
          name={resume.candidateName}
        />
        <span className={`h-1.5 w-1.5 rounded-full ${statusDotColor(resume.status)}`} title={statusLabel(resume.status)} />
      </div>

      {/* 主体：限定在卡片约 6 分位内，让分数块前移、右侧留白 */}
      <div className="min-w-0 basis-[54%]">
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
      </div>

      {/* 两列分数：初筛 / 冰山（紧跟主体，约在卡片 6 分位处） */}
      <div className="flex shrink-0 items-stretch border-l border-border/60 pl-3">
        <ScoreCell label="初筛" score={initialScore} />
        <ScoreCell
          label="冰山"
          titleLabel="冰山模型"
          score={compositeScore}
          note={pendingNote}
          noteTitle={pendingTitle}
          className="border-l border-border/60"
        />
      </div>

      {/* 未分配职位时的分配控件（仅控件本身拦截点击，其余区域仍可整框进入详情） */}
      {!resume.position && positions.length > 0 && (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={matchingId === resume.id}
            onClick={(e) => { e.stopPropagation(); onMatchPosition(resume.id) }}
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
            onClick={(e) => e.stopPropagation()}
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
    </div>
  )
}
