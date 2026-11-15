'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { REJECT_REASON_PRESETS } from '@/lib/constants/reject-reasons'
import { apiGet, apiPost, apiPatch } from '@/lib/api/client'
import type { Tag } from '@/types/follow-up'
import { apiErrorMessage } from '@/lib/utils/api-message'

// ==================== 类型 ====================

export interface UnsuitableDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  resumeId: string
  candidateName: string
  /** 有则 PATCH 现有记录，无则 POST 新建 */
  recordId?: string
  /** POST 新建时需要，关联 PositionEvaluation */
  evaluationId?: string
  /** 弹窗标题，默认 "不合适" */
  title?: string
  /** 目标状态枚举值，默认 "UNSUITABLE"；复用于取消面试/拒offer */
  targetStatus?: string
  /** AI 标签名数组，用于自动匹配标签 ID（新建记录时自动关联） */
  aiTagNames?: string[]
}

export function UnsuitableDialog({
  open,
  onClose,
  onSuccess,
  resumeId,
  candidateName,
  recordId,
  evaluationId,
  title = '不合适',
  targetStatus = 'UNSUITABLE',
  aiTagNames = [],
}: UnsuitableDialogProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [matchedTagIds, setMatchedTagIds] = useState<string[]>([])
  const [loadingTags, setLoadingTags] = useState(false)

  // 将 aiTagNames 序列化为稳定字符串，避免默认值 [] 每次渲染产生新引用导致 useCallback 无限循环
  const aiTagNamesKey = aiTagNames.join(',')

  // 加载标签并匹配 AI 标签名（带竞态防护，旧请求结果不会覆盖新请求）
  const loadAndMatchTags = useCallback(async () => {
    if (!aiTagNames || aiTagNames.length === 0) {
      setMatchedTagIds([])
      return
    }
    setLoadingTags(true)
    try {
      const json = await apiGet<{ tags?: Tag[] }>('/api/follow-up/tags')
      // 二次校验：确保请求完成时组件状态未被后续请求覆盖
      const allTags: Tag[] = json.tags || []
      const matched = allTags
        .filter((t) => aiTagNames.includes(t.name))
        .map((t) => t.id)
      setMatchedTagIds(matched)
    } catch {
      // 加载失败时重置，避免上次成功的 tagIds 残留
      setMatchedTagIds([])
    } finally {
      setLoadingTags(false)
    }
  }, [aiTagNamesKey])

  // 打开弹窗时匹配标签
  useEffect(() => {
    if (open) {
      loadAndMatchTags()
      setReason('')
    }
  }, [open, loadAndMatchTags])

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('请填写原因')
      return
    }
    setSubmitting(true)
    const trimmed = reason.trim()

    try {
      if (recordId) {
        // 有已有记录 → PATCH
        await apiPatch(`/api/follow-up/records/${recordId}`, {
          status: targetStatus,
          rejectReason: trimmed,
        }, { fallbackMessage: '操作失败' })
      } else {
        // 无记录 → POST 新建
        await apiPost('/api/follow-up/records', {
          resumeId,
          evaluationId: evaluationId || null,
          status: targetStatus,
          rejectReason: trimmed,
          tagIds: matchedTagIds,
        }, { fallbackMessage: '操作失败' })
      }

      toast.success(`${title} - 已记录`)
      setReason('')
      onSuccess()
      onClose()
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, '操作失败，请稍后重试'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setReason('')
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title} - {candidateName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* 预设原因标签 */}
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASON_PRESETS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setReason(name)}
                className="text-xs px-2.5 py-1 rounded-md border bg-background hover:bg-muted hover:border-primary/50 transition-colors"
              >
                {name}
              </button>
            ))}
          </div>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="请填写原因（必填）..."
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting || loadingTags}>
            {submitting ? '提交中...' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
