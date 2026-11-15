'use client'

import React from 'react'
import Link from 'next/link'
import {
  Calendar,
  ThumbsUp,
  ThumbsDown,
  XCircle,
  CheckCircle,
  UserPlus,
  UserMinus,
  RotateCcw,
  X,
  CircleCheck,
  CircleX,
  Circle,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { TableRowsSkeleton } from '@/components/ui/page-skeleton'
import { Pagination } from '@/components/ui/pagination'
import { StarRating } from '@/components/resume/StarRating'
import { DimensionLabel } from '@/components/resume/DimensionLabel'
import { ScoreBadge } from '@/components/resume/ScoreBadge'
import { NoteCell } from '@/components/resume/NoteCell'
import { InlineTimeEdit } from '@/components/resume/InlineTimeEdit'
import { ContactResultSelector } from '@/components/resume/ContactResultSelector'
import { TagEditPopover, TagBadgeList } from '@/components/resume/TagEditPopover'
import { contactResultLabel } from '@/lib/constants/contact-result'
import { formatDateTime } from '@/lib/utils/date'
import {
  FORWARD_TRANSITIONS,
  FORWARD_UI_METADATA,
  ROLLBACK_TRANSITIONS,
} from '@/lib/services/follow-up-transitions'
import { apiPost } from '@/lib/api/client'
import type { Tag, EvaluationDimension, FollowUpRecordItem, PaginationState } from '@/types/follow-up'
import { apiErrorMessage } from '@/lib/utils/api-message'

// ==================== 操作列配置（派生自 lib/services/follow-up-transitions，B8 A5） ====================

export interface FollowUpAction {
  target: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  kind: 'schedule' | 'interviewEnd' | 'hire' | 'unsuitable' | 'resign'
  hireTitle?: string
  hireConfirmLabel?: string
  unsuitableTitle?: string
}

/** 图标映射（保持原 UI 视觉） */
const UI_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  INTERVIEW_SCHEDULED: Calendar,
  INTERVIEWED: ThumbsUp,
  OFFER_SENT: ThumbsUp,
  PENDING_ONBOARD: CheckCircle,
  HIRED: UserPlus,
  RESIGNED: UserMinus,
  UNSUITABLE: ThumbsDown,
  OFFER_REJECTED: ThumbsDown,
  INTERVIEW_CANCELLED: XCircle,
}

/** 颜色类映射（保持原颜色，优先 from->target，其次 target） */
const UI_COLOR_CLASS_MAP: Record<string, string> = {
  INTERVIEW_SCHEDULED: 'text-info hover:bg-info/10 hover:text-info',
  INTERVIEWED: 'text-success hover:bg-success/10 hover:text-success',
  OFFER_SENT: 'text-success hover:bg-success/10 hover:text-success',
  PENDING_ONBOARD: 'text-success hover:bg-success/10 hover:text-success',
  HIRED: 'text-success hover:bg-success/10 hover:text-success',
  RESIGNED: 'text-warning hover:bg-warning/10 hover:text-warning',
  UNSUITABLE: 'text-destructive hover:bg-destructive/10 hover:text-destructive',
  OFFER_REJECTED: 'text-destructive hover:bg-destructive/10 hover:text-destructive',
  INTERVIEW_CANCELLED: 'text-warning hover:bg-warning/10 hover:text-warning',
  'CONTACTING->UNSUITABLE': 'text-warning hover:bg-warning/10 hover:text-warning',
  'INTERVIEW_SCHEDULED->INTERVIEW_CANCELLED': 'text-warning hover:bg-warning/10 hover:text-warning',
  'INTERVIEWED->UNSUITABLE': 'text-destructive hover:bg-destructive/10 hover:text-destructive',
}

const ALL_TABS = ['CONTACTING', 'INTERVIEW_SCHEDULED', 'INTERVIEWED', 'OFFER_SENT', 'PENDING_ONBOARD', 'HIRED', 'RESIGNED', 'OFFER_REJECTED', 'INTERVIEW_CANCELLED', 'UNSUITABLE'] as const

/** 操作列配置 */
export const FOLLOW_UP_ACTIONS: Record<string, { forward: FollowUpAction[]; rollback: boolean }> =
  Object.fromEntries(
    ALL_TABS.map((status) => {
      const forwardTransitions = FORWARD_TRANSITIONS[status] || []
      const uiMetadata = FORWARD_UI_METADATA[status] || {}
      const forward = forwardTransitions.map(({ target }) => {
        const meta = uiMetadata[target]!
        const colorKey =
          (status === 'CONTACTING' && target === 'UNSUITABLE') ? 'CONTACTING->UNSUITABLE' :
          (status === 'INTERVIEW_SCHEDULED' && target === 'INTERVIEW_CANCELLED') ? 'INTERVIEW_SCHEDULED->INTERVIEW_CANCELLED' :
          (status === 'INTERVIEWED' && target === 'UNSUITABLE') ? 'INTERVIEWED->UNSUITABLE' :
          target
        const colorClass = UI_COLOR_CLASS_MAP[colorKey] || UI_COLOR_CLASS_MAP[target] || 'text-muted hover:bg-muted/10 hover:text-muted'
        const icon = UI_ICON_MAP[target] || Calendar
        return {
          target,
          label: meta.label,
          icon,
          colorClass,
          kind: meta.kind,
          hireTitle: meta.hireTitle,
          hireConfirmLabel: meta.hireConfirmLabel,
          unsuitableTitle: meta.unsuitableTitle,
        }
      })
      const rollback = (ROLLBACK_TRANSITIONS[status] || []).length > 0
      return [status, { forward, rollback }]
    })
  )

/** 表格采用固定布局的状态（列数多、需要等宽列） */
const COMPACT_TABS = ['UNSUITABLE', 'HIRED', 'RESIGNED', 'OFFER_SENT', 'PENDING_ONBOARD', 'OFFER_REJECTED', 'INTERVIEW_CANCELLED']
/** 显示备注列的状态 */
const NOTE_TABS = ['CONTACTING', 'INTERVIEW_SCHEDULED', 'INTERVIEWED', 'UNSUITABLE', 'HIRED', 'OFFER_SENT', 'PENDING_ONBOARD', 'OFFER_REJECTED', 'INTERVIEW_CANCELLED']
/** 显示 6 维度评分的状态 */
const SIX_DIM_TABS = ['INTERVIEW_SCHEDULED', 'INTERVIEWED']

const SIX_DIMS = ['knowledge', 'skill', 'selfAwareness', 'personality', 'values', 'motivation'] as const

// ==================== Props ====================

interface FollowUpTableProps {
  activeTab: string
  /** 当前 tab 中文名（空状态文案） */
  currentTabLabel: string
  /** 当前 tab 对应的默认来源（详情页返回链接） */
  currentTabFrom: string
  loading: boolean
  records: FollowUpRecordItem[]
  /** 派生：显示得分（初筛 / 冰山） */
  getDisplayScore: (record: FollowUpRecordItem) => { score: number; label: string } | null
  /** 派生：某维度评分 */
  getRating: (evals: EvaluationDimension[], dim: string) => number | null
  /** 面试时间显示格式化 */
  formatInterviewTime: (value: string | null) => string
  /** 评分变更 */
  onRatingChange: (recordId: string, resumeId: string, dim: string, rating: number) => void
  /** 双击行打开日志抽屉 */
  onOpenLog: (record: FollowUpRecordItem) => void
  /** 详情页返回前写导航快照 */
  writeNavSnapshot: () => void
  /** 当前完整查询串（详情页返回 URL） */
  currentQueryString: string
  /** 全部标签 */
  allTags: Tag[]
  setAllTags: React.Dispatch<React.SetStateAction<Tag[]>>
  /** 变更前保存滚动位置 */
  saveScrollPos: () => void
  /** 重新加载记录 */
  reload: () => void | Promise<void>
  /** 备注编辑 */
  onNoteClick: (recordId: string, candidateName: string, note: string | null) => void
  /** 原因编辑（拒绝/离职/取消） */
  onReasonEditClick: (recordId: string, candidateName: string, note: string | null, field: 'rejectReason' | 'resignReason', label: string) => void
  /** 联系结果变更 */
  onContactedChange: (record: FollowUpRecordItem, newValue: string) => Promise<void>
  /** 正向流转操作（预约面试 / 面试结束 / 发offer / 不合适 / 离职） */
  onForwardAction: (record: FollowUpRecordItem, action: FollowUpAction) => void
  /** 回退 */
  onRollback: (record: FollowUpRecordItem) => void
  /** 取消跟进（仅沟通中） */
  onCancelFollowUp: (record: FollowUpRecordItem) => void
  /** 分页 */
  pagination: PaginationState
  pageSize: number
  setPage: (page: number) => void
  updateParams: (updates: Record<string, string>) => void
}

/**
 * 跟进页表格：表头条件列 + 记录行 + 空状态/加载 + 分页。
 * 纯展示 + 回调透传，数据获取与业务动作保留在页面。
 */
export function FollowUpTable({
  activeTab,
  currentTabLabel,
  currentTabFrom,
  loading,
  records,
  getDisplayScore,
  getRating,
  formatInterviewTime,
  onRatingChange,
  onOpenLog,
  writeNavSnapshot,
  currentQueryString,
  allTags,
  setAllTags,
  saveScrollPos,
  reload,
  onNoteClick,
  onReasonEditClick,
  onContactedChange,
  onForwardAction,
  onRollback,
  onCancelFollowUp,
  pagination,
  pageSize,
  setPage,
  updateParams,
}: FollowUpTableProps) {
  const isCompact = COMPACT_TABS.includes(activeTab)

  if (loading) {
    return <TableRowsSkeleton rows={6} />
  }

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">暂无{currentTabLabel}记录</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className={`w-full min-w-[1000px] text-sm${isCompact ? ' table-fixed' : ''}`}>
          <thead>
            <tr className="border-b border-border/60">
              <th className={`sticky left-0 z-20 table-frozen-cell table-frozen-left text-left py-3 pl-4 pr-2 font-medium min-w-[120px]${isCompact ? ' w-[140px]' : ''}`}>候选人</th>
              {activeTab === 'CONTACTING' && (
                <>
                  <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground"><DimensionLabel dimension="knowledge" /></th>
                  <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground"><DimensionLabel dimension="skill" /></th>
                  <th className="whitespace-nowrap text-center py-3 px-2 font-medium text-xs text-muted-foreground">得分</th>
                </>
              )}
              {SIX_DIM_TABS.includes(activeTab) && (
                <>
                  {SIX_DIMS.map((dim) => (
                    <th key={dim} className="text-center py-3 px-1.5 font-medium text-xs text-muted-foreground"><DimensionLabel dimension={dim} /></th>
                  ))}
                  <th className="whitespace-nowrap text-center py-3 px-2 font-medium text-xs text-muted-foreground">得分</th>
                </>
              )}
              {(activeTab === 'INTERVIEW_SCHEDULED' || activeTab === 'INTERVIEWED') && (
                <th className="whitespace-nowrap text-center py-3 px-2 font-medium text-xs text-muted-foreground">面试时间</th>
              )}
              <th className={`whitespace-nowrap text-center py-3 px-1.5 font-medium${isCompact ? ' w-[250px]' : ''}`}>标签</th>
              <th className={`text-center py-3 px-2 font-medium hidden md:table-cell${isCompact ? ' w-[250px]' : ''}`}>职位</th>
              {activeTab === 'CONTACTING' && (
                <th className="text-center py-3 px-1.5 font-medium text-xs text-muted-foreground hidden md:table-cell">联系结果</th>
              )}
              {NOTE_TABS.includes(activeTab) && (
                <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground hidden lg:table-cell">备注</th>
              )}
              {activeTab === 'UNSUITABLE' && (
                <>
                  <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground whitespace-nowrap">不合适时间</th>
                  <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground">拒绝原因</th>
                </>
              )}
              {activeTab === 'HIRED' && (
                <th className="text-center py-3 pr-4 font-medium text-xs text-muted-foreground">入职时间</th>
              )}
              {activeTab === 'RESIGNED' && (
                <>
                  <th className="text-center py-3 pr-4 font-medium text-xs text-muted-foreground">离职日期</th>
                  <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground">离职原因</th>
                </>
              )}
              {(activeTab === 'OFFER_SENT' || activeTab === 'PENDING_ONBOARD') && (
                <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground">入职时间(预计)</th>
              )}
              {activeTab === 'OFFER_REJECTED' && (
                <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground">拒绝原因</th>
              )}
              {activeTab === 'INTERVIEW_CANCELLED' && (
                <th className="text-center py-3 px-2 font-medium text-xs text-muted-foreground">取消原因</th>
              )}
              <th className={`table-frozen-cell text-center py-3 px-2 font-medium md:sticky md:right-10 md:z-20 md:table-frozen-right${isCompact ? ' w-[200px]' : ''}`}>操作</th>
              <th className="table-frozen-cell text-center py-3 px-1 font-medium text-xs text-muted-foreground w-10 min-w-[40px] md:sticky md:right-0 md:z-20">同步</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const evals = record.resume.evaluationDimensions
              const displayScore = getDisplayScore(record)

              return (
                <tr
                  key={record.id}
                  className="group border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onDoubleClick={() => onOpenLog(record)}
                >
                  {/* 候选人 */}
                  <td className="sticky left-0 z-10 table-frozen-cell table-frozen-left py-3 pl-4 pr-2 min-w-[120px]">
                    <div className="flex items-center gap-2.5">
                      <span className="h-7 w-7 shrink-0 rounded-full bg-muted inline-flex items-center justify-center text-xs font-semibold text-muted-foreground">
                        {(record.resume.candidateName || '未')[0]}
                      </span>
                      <div className="min-w-0">
                        <Link
                          onClick={writeNavSnapshot}
                          href={`/resume/detail/${record.resume.id}?positionId=${record.resume.evaluationPosition?.id || ''}&from=${encodeURIComponent(currentQueryString ? `/resume/follow-up?${currentQueryString}` : `/resume/follow-up?tab=${currentTabFrom}`)}`}
                          className="font-medium hover:text-primary transition-all duration-200 cursor-pointer truncate block"
                        >
                          {record.resume.candidateName || '未知'}
                        </Link>
                        <p className="text-xs text-muted-foreground truncate">{record.resume.candidatePhone || record.resume.candidateEmail || ''}</p>
                      </div>
                    </div>
                  </td>

                  {/* 沟通中：知识、技能、得分 */}
                  {activeTab === 'CONTACTING' && (
                    <>
                      <td className="py-3 px-2 text-center">
                        <StarRating rating={getRating(evals, 'knowledge')} onChange={(r) => onRatingChange(record.id, record.resume.id, 'knowledge', r)} size="sm" />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <StarRating rating={getRating(evals, 'skill')} onChange={(r) => onRatingChange(record.id, record.resume.id, 'skill', r)} size="sm" />
                      </td>
                      <td className="whitespace-nowrap py-3 px-2 text-center">
                        <ScoreBadge score={displayScore?.score ?? null} label={displayScore?.label} />
                      </td>
                    </>
                  )}

                  {/* 待面试/已面试：6维度 + 得分 */}
                  {SIX_DIM_TABS.includes(activeTab) && (
                    <>
                      {SIX_DIMS.map((dim) => (
                        <td key={dim} className="py-3 px-1.5 text-center">
                          <StarRating rating={getRating(evals, dim)} onChange={(r) => onRatingChange(record.id, record.resume.id, dim, r)} size="sm" />
                        </td>
                      ))}
                      <td className="whitespace-nowrap py-3 px-2 text-center">
                        <ScoreBadge score={displayScore?.score ?? null} label={displayScore?.label} />
                      </td>
                    </>
                  )}

                  {/* 面试时间 */}
                  {activeTab === 'INTERVIEW_SCHEDULED' && (
                    <td className="py-3 px-2 text-center">
                      <InlineTimeEdit
                        value={record.interviewTime}
                        recordId={record.id}
                        field="interviewTime"
                        displayFormat={formatInterviewTime}
                        onSaved={() => { saveScrollPos(); reload() }}
                        validate={(v) => {
                          const now = new Date()
                          // 允许提前 30 分钟的容差（接近当前时间的不报错）
                          const minTime = new Date(now.getTime() - 30 * 60 * 1000)
                            .toISOString()
                            .slice(0, 16)
                          if (v < minTime) return '面试时间不能早于当前时间'
                          return null
                        }}
                      />
                    </td>
                  )}
                  {activeTab === 'INTERVIEWED' && (
                    <td className="py-3 px-2 text-center text-xs text-muted-foreground">
                      {formatInterviewTime(record.interviewTime)}
                    </td>
                  )}

                  {/* 标签 */}
                  <td
                    className="whitespace-nowrap py-3 px-1.5 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5 justify-center">
                      <TagBadgeList
                        tags={record.tags.map((t) => t.followUpTag)}
                        max={3}
                      />
                      <TagEditPopover
                        recordId={record.id}
                        candidateName={record.resume.candidateName || '未知'}
                        currentTags={record.tags.map((t) => t.followUpTag)}
                        allTags={allTags}
                        onSaved={() => { saveScrollPos(); reload() }}
                        onTagCreated={(tag) => setAllTags((prev) => [...prev, tag])}
                        onTagDeleted={(tag) => setAllTags((prev) => prev.filter((t) => t.id !== tag.id))}
                      />
                    </div>
                  </td>

                  {/* 职位（优先显示跟进关联岗位） */}
                  <td className="py-3 px-2 text-center hidden md:table-cell whitespace-nowrap">
                    {(() => {
                      const pos = record.resume.evaluationPosition || record.resume.position
                      return pos ? (
                        <Badge variant="secondary" className="text-xs">{pos.title}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">未分配</span>
                      )
                    })()}
                  </td>

                  {/* 联系结果（仅沟通中） */}
                  {activeTab === 'CONTACTING' && (
                    <td className="py-3 px-1.5 text-center hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                      <ContactResultSelector
                        value={record.contacted || 'NOT_CONTACTED'}
                        onChange={(newValue) => onContactedChange(record, newValue)}
                      />
                    </td>
                  )}

                  {/* 备注 */}
                  {NOTE_TABS.includes(activeTab) && (
                    <td className="py-3 px-2 text-center text-xs hidden lg:table-cell">
                      <NoteCell
                        note={record.note}
                        candidateName={record.resume.candidateName || '未知'}
                        recordId={record.id}
                        onEdit={onNoteClick}
                      />
                    </td>
                  )}

                  {/* 不合适：时间 + 拒绝原因 */}
                  {activeTab === 'UNSUITABLE' && (
                    <>
                      <td className="py-3 px-2 text-center text-xs text-muted-foreground whitespace-nowrap">
                        {record.unsuitableAt ? new Date(record.unsuitableAt).toISOString().slice(0, 10) : '-'}
                      </td>
                      <td className="py-3 px-2 text-center text-xs">
                        <NoteCell
                          note={record.rejectReason}
                          candidateName={record.resume.candidateName || '未知'}
                          recordId={record.id}
                          onEdit={(id, name, note) => onReasonEditClick(id, name, note, 'rejectReason', '拒绝原因')}
                        />
                      </td>
                    </>
                  )}

                  {/* 已入职：入职时间 */}
                  {activeTab === 'HIRED' && (
                    <td className="py-3 px-2 text-center">
                      <InlineTimeEdit
                        value={record.startDate}
                        recordId={record.id}
                        field="startDate"
                        displayFormat={(v) => v || '-'}
                        onSaved={() => { saveScrollPos(); reload() }}
                        validate={(v) => {
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          if (v < today.toISOString().slice(0, 10)) return '入职时间不能早于今天'
                          return null
                        }}
                        crossCheckValue={record.interviewTime}
                        crossCheckLabel="面试时间"
                      />
                    </td>
                  )}

                  {/* 已离职：离职日期/原因 */}
                  {activeTab === 'RESIGNED' && (
                    <>
                      <td className="py-3 px-2 text-center">
                        <InlineTimeEdit
                          value={record.resignedAt ? new Date(record.resignedAt).toISOString().slice(0, 10) : null}
                          recordId={record.id}
                          field="resignedAt"
                          displayFormat={(v) => v || '-'}
                          onSaved={() => { saveScrollPos(); reload() }}
                          confirmMessage="修改离职日期属于慎重操作，确认修改？"
                        />
                      </td>
                      <td className="py-3 px-2 text-center text-xs">
                        <NoteCell
                          note={record.resignReason}
                          candidateName={record.resume.candidateName || '未知'}
                          recordId={record.id}
                          onEdit={(id, name, note) => onReasonEditClick(id, name, note, 'resignReason', '离职原因')}
                        />
                      </td>
                    </>
                  )}

                  {/* 已发offer：入职时间(预计) */}
                  {activeTab === 'OFFER_SENT' && (
                    <td className="py-3 px-2 text-center">
                      <InlineTimeEdit
                        value={record.startDate}
                        recordId={record.id}
                        field="startDate"
                        displayFormat={(v) => v || '-'}
                        onSaved={() => { saveScrollPos(); reload() }}
                      />
                    </td>
                  )}

                  {/* 待入职：入职时间 */}
                  {activeTab === 'PENDING_ONBOARD' && (
                    <td className="py-3 px-2 text-center">
                      <InlineTimeEdit
                        value={record.startDate}
                        recordId={record.id}
                        field="startDate"
                        displayFormat={(v) => v || '-'}
                        onSaved={() => { saveScrollPos(); reload() }}
                      />
                    </td>
                  )}

                  {/* 拒offer：拒绝原因 */}
                  {activeTab === 'OFFER_REJECTED' && (
                    <td className="py-3 px-2 text-center text-xs">
                      <NoteCell
                        note={record.rejectReason}
                        candidateName={record.resume.candidateName || '未知'}
                        recordId={record.id}
                        onEdit={(id, name, note) => onReasonEditClick(id, name, note, 'rejectReason', '拒绝原因')}
                      />
                    </td>
                  )}

                  {/* 取消面试：取消原因 */}
                  {activeTab === 'INTERVIEW_CANCELLED' && (
                    <td className="py-3 px-2 text-center text-xs">
                      <NoteCell
                        note={record.rejectReason}
                        candidateName={record.resume.candidateName || '未知'}
                        recordId={record.id}
                        onEdit={(id, name, note) => onReasonEditClick(id, name, note, 'rejectReason', '取消原因')}
                      />
                    </td>
                  )}

                  {/* 操作（配置驱动，与 lib/services/follow-up-transitions.ts 保持一致） */}
                  {(() => {
                    const actions = FOLLOW_UP_ACTIONS[activeTab]
                    if (!actions || (actions.forward.length === 0 && !actions.rollback && activeTab !== 'CONTACTING')) return null
                    return (
                      <td className="table-frozen-cell py-3 px-2 text-center whitespace-nowrap md:sticky md:right-10 md:z-10">
                        <div className="inline-flex items-center gap-1">
                          {actions.forward.map((btn) => {
                            const Icon = btn.icon
                            return (
                              <Button
                                key={btn.target}
                                variant="ghost"
                                size="sm"
                                className={`gap-1 h-7 px-2 text-xs ${btn.colorClass} hover:shadow-sm transition-all duration-200`}
                                onClick={() => onForwardAction(record, btn)}
                              >
                                <Icon className="h-3 w-3" />{btn.label}
                              </Button>
                            )
                          })}
                          {actions.rollback && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={() => onRollback(record)}
                              title="回退"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          {activeTab === 'CONTACTING' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 h-7 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-muted-foreground hover:shadow-sm transition-all duration-200"
                              onClick={() => onCancelFollowUp(record)}
                            >
                              <X className="h-3 w-3" />取消跟进
                            </Button>
                          )}
                        </div>
                      </td>
                    )
                  })()}

                  {/* Webhook 集成状态 */}
                  <td className="table-frozen-cell py-3 px-1 text-center w-10 min-w-[40px] md:sticky md:right-0 md:z-10">
                    <WebhookSyncCell
                      record={record}
                      onReload={() => reload()}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => updateParams({ pageSize: String(size), page: '' })}
      />
    </>
  )
}

// ==================== Webhook 同步状态单元格 ====================

function WebhookSyncCell({
  record,
  onReload,
}: {
  record: FollowUpRecordItem
  onReload: () => void | Promise<void>
}) {
  const syncStatus: string = (record as any).webhookSyncStatus || 'NOT_SYNCED'
  const syncError: string = (record as any).webhookSyncError || ''
  const lastSynced: string = (record as any).webhookLastSyncedAt || ''

  if (syncStatus === 'SYNCED') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-success cursor-default"
        title={lastSynced ? `上次同步: ${formatDateTime(lastSynced)}` : '已同步'}
      >
        <CircleCheck className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (syncStatus === 'SYNC_FAILED') {
    const handleResync = async (e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        const json = await apiPost<{ success?: boolean; message?: string }>(
          '/api/webhooks/sync',
          { followUpRecordId: record.id },
          { fallbackMessage: '同步失败' }
        )
        if (json.success) {
          toast.success('重新同步成功')
          onReload()
        } else {
          toast.error(json.message || '同步失败')
        }
      } catch (err: unknown) {
        toast.error(apiErrorMessage(err, '同步请求失败'))
      }
    }

    return (
      <button
        className="inline-flex items-center gap-1 text-xs text-destructive hover:text-destructive hover:underline cursor-pointer"
        title={syncError ? `错误: ${syncError}\n点击重新同步` : '点击重新同步'}
        onClick={handleResync}
      >
        <CircleX className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground/40 cursor-default"
      title="未同步"
    >
      <Circle className="h-3.5 w-3.5" />
    </span>
  )
}
