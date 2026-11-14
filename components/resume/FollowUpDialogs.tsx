'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { Calendar, Loader2, ThumbsUp, X, ChevronDown, MessageSquare, Tag as TagIcon } from 'lucide-react'
import { StarRating } from '@/components/resume/StarRating'
import { EVALUATION_DIMENSIONS, type DimensionKey } from '@/lib/constants/evaluation'
import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_DOT_COLORS } from '@/lib/constants/tags'
import type { Tag } from '@/types/follow-up'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { REJECT_REASON_PRESETS } from '@/lib/constants/reject-reasons'
import { EXPORT_FIELDS } from '@/lib/constants/export-fields'
import { getRollbackTargets, STATUS_CN } from '@/lib/services/follow-up-transitions'

/**
 * follow-up 页状态弹窗集合（B9 从页面提取）。
 * 均为受控组件：页面持有 state 与业务 handler，本文件只负责 UI + 原生日期选择器 ref。
 */

/** 预约面试弹窗 */
export function ScheduleDialog({
  open,
  candidateName,
  time,
  onTimeChange,
  onCancel,
  onConfirm,
}: {
  open: boolean
  candidateName: string
  time: string
  onTimeChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const dateInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>预约面试 - {candidateName}</DialogTitle>
          <DialogDescription>为候选人 {candidateName} 设置面试时间</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">面试时间</label>
            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker()}
              className="flex items-center gap-2 h-10 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/30 transition-colors cursor-pointer mt-1 w-full"
            >
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className={time ? 'text-foreground' : 'text-muted-foreground'}>
                {time ? time.replace('T', ' ') : '点击选择面试时间'}
              </span>
            </button>
            <input
              ref={dateInputRef}
              type="datetime-local"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className="sr-only"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button onClick={onConfirm}>确认预约</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 录取 / 发 offer 弹窗 */
export function HireDialog({
  open,
  title,
  candidateName,
  startDate,
  onStartDateChange,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  candidateName: string
  startDate: string
  onStartDateChange: (value: string) => void
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const hireDateInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title} - {candidateName}</DialogTitle>
          <DialogDescription>为候选人 {candidateName} 设置入职时间</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">入职时间</label>
            <button
              type="button"
              onClick={() => hireDateInputRef.current?.showPicker()}
              className="flex items-center gap-2 h-10 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/30 transition-colors cursor-pointer mt-1 w-full"
            >
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className={startDate ? 'text-foreground' : 'text-muted-foreground'}>
                {startDate || '点击选择入职时间'}
              </span>
            </button>
            <input
              ref={hireDateInputRef}
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="sr-only"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 离职弹窗 */
export function ResignDialog({
  open,
  candidateName,
  resignedAt,
  resignReason,
  submitting,
  onFieldChange,
  onCancel,
  onConfirm,
}: {
  open: boolean
  candidateName: string
  resignedAt: string
  resignReason: string
  submitting: boolean
  onFieldChange: (patch: { resignedAt?: string; resignReason?: string }) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>标记已离职 - {candidateName}</DialogTitle>
          <DialogDescription>填写离职日期与离职原因，确认后状态将变更为「已离职」</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">离职日期</label>
            <Input
              type="date"
              value={resignedAt}
              onChange={(e) => onFieldChange({ resignedAt: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">离职原因<span className="text-destructive">*</span></label>
            <Textarea
              value={resignReason}
              onChange={(e) => onFieldChange({ resignReason: e.target.value })}
              placeholder="请填写离职原因（必填）..."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onCancel}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={submitting}>
            {submitting ? '提交中...' : '确认已离职'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 编辑备注弹窗 */
export function NoteDialog({
  open,
  candidateName,
  value,
  onChange,
  saving,
  onClose,
  onSave,
}: {
  open: boolean
  candidateName: string
  value: string
  onChange: (value: string) => void
  saving: boolean
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>编辑备注</DialogTitle>
          <DialogDescription>
            为候选人 {candidateName} 编辑备注信息
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="请输入备注内容..."
            rows={4}
            className="resize-none"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              '确定'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 原因编辑弹窗（不合适拒绝原因 / 拒offer / 取消面试 / 离职原因） */
export function ReasonEditDialog({
  open,
  label,
  candidateName,
  field,
  value,
  onChange,
  saving,
  onClose,
  onSave,
}: {
  open: boolean
  label: string
  candidateName: string
  field: string
  value: string
  onChange: (value: string) => void
  saving: boolean
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>编辑{label}</DialogTitle>
          <DialogDescription>
            为候选人 {candidateName} 编辑{label}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-3">
          {/* 预设原因标签（仅拒绝原因类，离职原因不适用） */}
          {field === 'rejectReason' && (
            <div className="flex flex-wrap gap-1.5">
              {REJECT_REASON_PRESETS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange(name)}
                  className="text-xs px-2.5 py-1 rounded-md border bg-background hover:bg-muted hover:border-primary/50 transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`请输入${label}（可不填）...`}
            rows={4}
            className="resize-none"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              '确定'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 回退弹窗 */
export function RollbackDialog({
  open,
  candidateName,
  currentStatus,
  target,
  onTargetChange,
  reason,
  onReasonChange,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean
  candidateName: string
  currentStatus: string
  target: string
  onTargetChange: (value: string) => void
  reason: string
  onReasonChange: (value: string) => void
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>回退跟进状态</DialogTitle>
          <DialogDescription>
            将候选人 {candidateName} 回退到其他状态
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">目标状态</label>
            <Select
              value={target}
              onChange={(e) => onTargetChange(e.target.value)}
            >
              <option value="">选择回退目标状态...</option>
              {getRollbackTargets(currentStatus).map((t) => (
                <option key={t} value={t}>{STATUS_CN[t] || t}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">回退原因</label>
            <Input
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="请填写回退原因（必填）..."
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                回退中...
              </>
            ) : (
              '确认回退'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 面试结束确认弹窗（6 维度评分 + 标签 + 备注）。
 * 业务数据（ratings/tagIds/note）受控由页面持有；标签面板开合与下拉定位为组件内部 UI 状态。
 * 与其它 Dialog 一致：由父级传入 open，遮罩 / 焦点陷阱 / 进出场动画交给 ui/Dialog。
 */
export function InterviewEndDialog({
  open,
  candidateName,
  ratings,
  onRatingChange,
  tagIds,
  allTags,
  onToggleTag,
  note,
  onNoteChange,
  submitting,
  onClose,
  onConfirm,
}: {
  open: boolean
  candidateName: string
  ratings: Record<string, number | null>
  onRatingChange: (dimension: string, rating: number) => void
  tagIds: string[]
  allTags: Tag[]
  onToggleTag: (tagId: string) => void
  note: string
  onNoteChange: (value: string) => void
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const tagBtnRef = useRef<HTMLButtonElement>(null)

  const handleClose = () => {
    setPanelOpen(false)
    setDropdownStyle({})
    onClose()
  }

  const grouped = new Map<string, Tag[]>()
  for (const tag of allTags) {
    const cat = tag.category || 'custom'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(tag)
  }

  const selectedTags = allTags.filter(t => tagIds.includes(t.id))
  const visibleDims = ['knowledge', 'skill']
  const hiddenDims = ['selfAwareness', 'personality', 'values', 'motivation']

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[520px] max-h-[88vh] flex flex-col gap-0 p-0 shadow-2xl ring-1 ring-border/50 sm:rounded-xl [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-success/10 shrink-0">
            <ThumbsUp className="h-[1.125rem] w-[1.125rem] text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base font-semibold text-foreground">确认面试结束</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
              {candidateName}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              className="p-1.5 -mr-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all duration-150 shrink-0"
              aria-label="关闭"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </DialogClose>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 6维度评分 */}
          <div className="rounded-lg bg-muted/40 border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">面试评分</span>
              <span className="text-[10px] text-muted-foreground/60">可点击星星修改</span>
            </div>

            {/* 水面之上 — 知识/技能 */}
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1 h-3 rounded-full bg-info/10 shrink-0" />
                <span className="text-[11px] font-medium text-muted-foreground">水面之上</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {visibleDims.map(dim => (
                  <div key={dim} className="flex items-center justify-between bg-background/60 rounded-md px-3 py-1.5 border border-border/30">
                    <span className="text-xs font-medium">{EVALUATION_DIMENSIONS[dim as DimensionKey].label}</span>
                    <StarRating
                      rating={ratings[dim] ?? null}
                      onChange={(r) => onRatingChange(dim, r)}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 水面之下 — 自我认知/品质特质/价值观/动机 */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1 h-3 rounded-full bg-accent/10 shrink-0" />
                <span className="text-[11px] font-medium text-muted-foreground">水面之下</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {hiddenDims.map(dim => (
                  <div key={dim} className="flex items-center justify-between bg-background/60 rounded-md px-3 py-1.5 border border-border/30">
                    <span className="text-xs font-medium">{EVALUATION_DIMENSIONS[dim as DimensionKey].label}</span>
                    <StarRating
                      rating={ratings[dim] ?? null}
                      onChange={(r) => onRatingChange(dim, r)}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 标签编辑 */}
          <div className="rounded-lg bg-muted/40 border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">标签</span>
            </div>

            {/* 已选标签展示 */}
            <div className="flex items-center gap-1.5 flex-wrap min-h-[28px] mb-2">
              {selectedTags.length > 0 ? (
                <>
                  {selectedTags.map(tag => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap leading-5 transition-all duration-150 hover:brightness-90 active:scale-95"
                      style={{ backgroundColor: tag.color + '18', color: tag.color, border: `1px solid ${tag.color}35` }}
                    >
                      {tag.name}
                      <X
                        className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); onToggleTag(tag.id) }}
                      />
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-xs text-muted-foreground/40 italic">未标记</span>
              )}
            </div>

            {/* 标签选择下拉 */}
            <div>
              <button
                ref={tagBtnRef}
                type="button"
                onClick={() => {
                  if (!panelOpen && tagBtnRef.current) {
                    const rect = tagBtnRef.current.getBoundingClientRect()
                    const margin = 12
                    const maxH = Math.max(120, window.innerHeight - rect.bottom - margin)
                    setDropdownStyle({
                      position: 'fixed',
                      top: rect.bottom + 6,
                      left: rect.left,
                      width: rect.width,
                      maxHeight: maxH,
                    })
                  }
                  setPanelOpen(!panelOpen)
                }}
                className="flex items-center gap-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs hover:bg-muted/40 hover:border-primary/30 transition-all duration-150 active:scale-[0.99]"
              >
                <TagIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className={tagIds.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                  {tagIds.length > 0 ? `已选 ${tagIds.length} 个标签` : '选择标签...'}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 ml-auto text-muted-foreground shrink-0 transition-transform duration-200 ${panelOpen ? 'rotate-180' : ''}`} />
              </button>

              {panelOpen && (
                <>
                  <div className="fixed inset-0 z-[55]" onClick={() => setPanelOpen(false)} />
                  <div
                    className="z-[60] bg-popover border rounded-lg shadow-lg p-2 overflow-y-auto overscroll-contain"
                    style={dropdownStyle}
                  >
                    {allTags.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">暂无标签</p>
                    ) : (
                      CATEGORY_ORDER.filter(cat => grouped.has(cat)).map(cat => (
                        <div key={cat} className="mb-1 last:mb-0">
                          <div className="flex items-center gap-1.5 px-2 py-0.5">
                            <span
                              className="w-1 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: CATEGORY_DOT_COLORS[cat] }}
                            />
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              {CATEGORY_LABELS[cat] || cat}
                            </span>
                          </div>
                          {grouped.get(cat)!.map(tag => (
                            <label
                              key={tag.id}
                              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
                                tagIds.includes(tag.id)
                                  ? 'bg-primary/8'
                                  : 'hover:bg-muted/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={tagIds.includes(tag.id)}
                                onChange={() => onToggleTag(tag.id)}
                                className="h-4 w-4 rounded border-input accent-primary cursor-pointer shrink-0"
                              />
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/5"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="text-[13px] truncate">{tag.name}</span>
                              {tag.source === 'ai' && (
                                <span className="text-[10px] font-medium text-info ml-auto shrink-0 bg-info/10 px-1.5 py-0.5 rounded-full">AI</span>
                              )}
                            </label>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 备注 */}
          <div className="rounded-lg bg-muted/40 border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">备注</span>
            </div>
            <Textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="面评、面试反馈等..."
              className="resize-none bg-background border-border/50 focus:border-primary/40 transition-colors"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20 shrink-0 rounded-b-xl">
          <p className="text-xs text-muted-foreground">
            确认后将状态变更为「已面试」并记录评分快照
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-9 px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 active:scale-95 transition-all duration-150"
            >
              取消
            </Button>
            <Button
              onClick={onConfirm}
              disabled={submitting}
              size="sm"
              className="h-9 px-5 text-sm font-medium bg-success/10 hover:bg-success/10 active:bg-success/10 text-white shadow-sm shadow-emerald-600/20 hover:shadow-emerald-600/30 active:scale-[0.97] transition-all duration-150"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : (
                <>
                  <ThumbsUp className="mr-1.5 h-4 w-4" />
                  确认面试结束
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 导出数据弹窗：选择字段后按当前筛选条件导出 */
export function ExportDialog({
  open,
  onOpenChange,
  selected,
  onToggle,
  loading,
  onExport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: string[]
  onToggle: (key: string) => void
  loading: boolean
  onExport: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>导出数据</DialogTitle>
          <DialogDescription>
            选择要导出的字段，将根据当前筛选条件导出全部数据
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="grid grid-cols-2 gap-3">
            {EXPORT_FIELDS.map((field) => (
              <label
                key={field.key}
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(field.key)}
                  onChange={() => onToggle(field.key)}
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer shrink-0"
                />
                <span className="text-sm">{field.label}</span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button onClick={onExport} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                导出中...
              </>
            ) : (
              '确认导出'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
