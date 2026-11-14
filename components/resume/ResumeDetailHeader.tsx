'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { FileText, Phone, Mail, User } from 'lucide-react'
import { CandidatePhoto } from '@/components/resume/CandidatePhoto'
import NameEdit from '@/components/resume/NameEdit'
import { formatDate, formatMonthDayTime } from '@/lib/utils/date'
import { ScoreBar } from '@/components/resume/ScoreBar'
import { statusLabel, statusColor } from '@/lib/constants/resume-status'
import type { PositionOption } from '@/types/resume'
import type { ResumeDetail, ResumeDetailEvaluation } from '@/types/resume-detail'

/**
 * 简历详情页候选人卡片（B9 从 page.tsx 提取）。
 * 合并原头部信息与候选人信息：左（头像/姓名/状态/职位/文件）、中（联系方式/来源）、右（评分可视化）。
 */
export function ResumeDetailHeader({
  resume,
  positions,
  assigning,
  onAssign,
  result,
  onNameSaved,
}: {
  resume: ResumeDetail
  positions: PositionOption[]
  assigning: boolean
  onAssign: (positionId: string) => void
  /** 当前选中岗位对应的评估记录 */
  result: ResumeDetailEvaluation | null
  onNameSaved: () => void
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col md:flex-row gap-5">
          {/* 左：头像 + 姓名 + 状态 */}
          <div className="flex items-start gap-4 shrink-0">
            <CandidatePhoto
              resumeId={resume.id}
              photoUrl={resume.candidatePhoto}
              name={resume.candidateName || undefined}
              className="w-16 h-16 rounded-xl"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">
                  <NameEdit
                    resumeId={resume.id}
                    value={resume.candidateName || ''}
                    onSaved={onNameSaved}
                  />
                </h2>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(resume.status)}`}>
                  {statusLabel(resume.status)}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">职位:</span>
                  {resume.position ? (
                    <Badge variant="secondary">{resume.position.title}</Badge>
                  ) : (
                    <Select
                      className="w-[160px] h-8 text-xs"
                      onChange={(e) => onAssign(e.target.value)}
                      disabled={assigning}
                      defaultValue=""
                    >
                      <option value="" disabled>分配职位...</option>
                      {positions.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </Select>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="text-xs">{resume.fileName} ({(resume.fileSize / 1024).toFixed(0)}KB)</span>
                </div>
              </div>
            </div>
          </div>

          {/* 中：联系方式 + 来源 */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            {resume.candidatePhone && (
              <a href={`tel:${resume.candidatePhone}`} className="inline-flex items-center gap-2 text-sm hover:text-primary transition-colors w-fit">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{resume.candidatePhone}</span>
              </a>
            )}
            {resume.candidateEmail && (
              <a href={`mailto:${resume.candidateEmail}`} className="inline-flex items-center gap-2 text-sm hover:text-primary transition-colors w-fit">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="break-all">{resume.candidateEmail}</span>
              </a>
            )}
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {resume.resumeSource && (
                  <Badge variant="outline" className="text-xs mr-1.5">{resume.resumeSource.name}</Badge>
                )}
                {resume.emailConfig && (
                  <span className="mr-2">{resume.emailConfig.alias}</span>
                )}
                {resume.sourceEmailReceivedAt
                  ? formatMonthDayTime(resume.sourceEmailReceivedAt)
                  : resume.email?.receivedAt
                    ? formatMonthDayTime(resume.email.receivedAt)
                    : ''}
              </span>
            </div>
          </div>

          {/* 右：评分可视化（关键信息突出展示） */}
          <div className="shrink-0 flex items-center gap-6 md:border-l md:border-border/60 md:pl-6">
            {result?.initialScore != null && (
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">初筛得分</p>
                <p className="mt-1 text-3xl font-bold tabular-nums leading-none text-foreground">
                  {Math.round(result.initialScore)}
                </p>
                <ScoreBar score={result.initialScore} className="mt-2 w-20" />
              </div>
            )}
            {result?.compositeScore != null && (
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">综合得分</p>
                <p className="mt-1 text-3xl font-bold tabular-nums leading-none text-primary">
                  {Math.round(result.compositeScore)}
                </p>
                <ScoreBar score={result.compositeScore} className="mt-2 w-20" />
              </div>
            )}
            {result?.screenedAt && (
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">评估时间</p>
                <p className="mt-1 text-sm font-medium text-foreground whitespace-nowrap">
                  {formatDate(result.screenedAt)}
                </p>
                {result.aiConfig && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {result.aiConfig.alias || `${result.aiConfig.provider} ${result.aiConfig.model}`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
