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
  DialogDescription,
} from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Plus, Loader2, Tag as TagIcon, Check } from 'lucide-react'
import { toast } from 'sonner'
import { TAG_COLORS, groupTagsByCategory } from '@/lib/constants/tags'
import { apiGet, apiPost } from '@/lib/api/client'
import type { Tag } from '@/types/follow-up'
import { TagChip } from '@/components/resume/TagChip'
import { TagCreateForm } from '@/components/resume/TagCreateForm'
import { SelectedTagsPreview } from '@/components/resume/SelectedTagsPreview'

// ==================== 类型 ====================

interface PositionScore {
  positionId: string
  positionTitle: string
  evaluationId?: string
  hasFollowUp?: boolean
  initialScore: number | null
  compositeScore: number | null
}

interface FollowUpDialogProps {
  open: boolean
  onClose: () => void
  resumeId: string
  resumeName: string
  evaluationId?: string
  aiTagNames?: string[]
  positionScores?: PositionScore[]
  defaultEvaluationId?: string
  onSuccess?: () => void
}

// ==================== 组件 ====================

export function FollowUpDialog({ open, onClose, resumeId, evaluationId: propEvalId, resumeName, aiTagNames, positionScores, defaultEvaluationId, onSuccess }: FollowUpDialogProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [note, setNote] = useState('')
  const [loadingTags, setLoadingTags] = useState(false)
  const [creatingTag, setCreatingTag] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showNewTag, setShowNewTag] = useState(false)
  const [selectedEvalId, setSelectedEvalId] = useState<string | undefined>(undefined)

  // --- 数据加载 ---

  const loadTags = useCallback(async () => {
    setLoadingTags(true)
    try {
      const json = await apiGet<{ tags: Tag[] }>('/api/follow-up/tags')
      setTags(json.tags)
      return json.tags as Tag[]
    } catch {
      toast.error('加载标签失败')
      return [] as Tag[]
    } finally {
      setLoadingTags(false)
    }
  }, [])

  // 打开时加载标签并匹配 AI 推荐
  useEffect(() => {
    if (open) {
      loadTags().then((loadedTags) => {
        if (aiTagNames && aiTagNames.length > 0 && loadedTags.length > 0) {
          const aiIds = loadedTags
            .filter((t) => aiTagNames.includes(t.name))
            .map((t) => t.id)
          setSelectedTagIds(new Set(aiIds))
        } else {
          setSelectedTagIds(new Set())
        }
      })
      setNote('')
      setShowNewTag(false)
      setNewTagName('')
      setNewTagColor(TAG_COLORS[0])
      // 设置默认 evaluationId（优先选未跟进的岗位）
      const available = (positionScores || []).filter(ps => !ps.hasFollowUp)
      const firstAvailable = available.length > 0 ? available[0].evaluationId : undefined
      const defaultId = defaultEvaluationId || propEvalId || firstAvailable ||
        (positionScores && positionScores.length > 0 ? positionScores[0].evaluationId : undefined)
      setSelectedEvalId(defaultId)
    }
  }, [open, loadTags, aiTagNames, propEvalId, defaultEvaluationId, positionScores])

  // --- 标签操作 ---

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim()
    if (!trimmed) return
    setCreatingTag(true)
    try {
      const json = await apiPost<{ tag: Tag }>('/api/follow-up/tags', {
        name: trimmed,
        color: newTagColor,
      }, { fallbackMessage: '创建标签失败' })
      setTags((prev) => [...prev, json.tag])
      setSelectedTagIds((prev) => new Set([...prev, json.tag.id]))
      setNewTagName('')
      setShowNewTag(false)
      setNewTagColor(TAG_COLORS[0])
      toast.success('标签创建成功')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建标签失败'
      toast.error(msg)
    } finally {
      setCreatingTag(false)
    }
  }

  // --- 提交 ---

  const handleSubmit = async () => {
    if (selectedTagIds.size === 0) {
      toast.warning('请至少选择一个标签')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/api/follow-up/records', {
        resumeId,
        ...(selectedEvalId ? { evaluationId: selectedEvalId } : {}),
        tagIds: Array.from(selectedTagIds),
        note: note.trim() || undefined,
      }, { fallbackMessage: '创建跟进记录失败' })
      toast.success('跟进记录已创建')
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建跟进记录失败'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // --- 分组计算 ---

  const groupedTags = groupTagsByCategory(tags)

  // --- 渲染辅助 ---

  const selectedTags = Array.from(selectedTagIds)
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean) as Tag[]

  // --- 渲染 ---

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto p-0 gap-0">
        {/* === Header === */}
        <DialogHeader className="px-6 pt-5 pb-3.5 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <TagIcon className="h-5 w-5 text-primary" />
                跟进标记
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                候选人：<strong className="text-foreground">{resumeName || '未知'}</strong>
              </DialogDescription>
              {positionScores && positionScores.length > 1 && (() => {
                const allFollowedUp = positionScores.every(ps => ps.hasFollowUp)
                if (allFollowedUp) {
                  return (
                    <div className="mt-2 text-xs text-muted-foreground">
                      该候选人的所有岗位均已跟进，无需重复操作
                    </div>
                  )
                }
                return (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">关联岗位：</span>
                      <Select
                        value={selectedEvalId || ''}
                        onChange={(e) => setSelectedEvalId(e.target.value || undefined)}
                        className="h-8 text-xs"
                      >
                        {positionScores.map((ps) => (
                          <option
                            key={ps.evaluationId}
                            value={ps.evaluationId || ''}
                            disabled={ps.hasFollowUp}
                          >
                            {ps.positionTitle}（{ps.initialScore ?? '-'}分）
                            {ps.hasFollowUp ? '（已跟进）' : ''}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )
              })()}
            </div>
            {!showNewTag && tags.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewTag(true)}
                className="h-8 gap-1 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                新建标签
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* === Body === */}
        <div className="px-6 py-4 space-y-4">

          {/* 1. 选择标签 */}
          <section>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
              选择标签
              <span className="text-destructive ml-0.5">*</span>
            </h4>

            {/* 新建标签表单（插在标题下方、分组上方） */}
            {showNewTag && (
              <div className="mb-3">
                <TagCreateForm
                  name={newTagName}
                  color={newTagColor}
                  creating={creatingTag}
                  onNameChange={setNewTagName}
                  onColorChange={setNewTagColor}
                  onCreate={handleCreateTag}
                  onCancel={() => {
                    setShowNewTag(false)
                    setNewTagName('')
                    setNewTagColor(TAG_COLORS[0])
                  }}
                />
              </div>
            )}

            {/* 标签分组列表 */}
            {loadingTags ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 w-20 rounded-full bg-muted animate-pulse" />
                ))}
              </div>
            ) : tags.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/10 px-4 py-6 text-center">
                <TagIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">暂无标签，请先创建一个</p>
                <Button variant="outline" size="sm" onClick={() => setShowNewTag(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  新建标签
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedTags.map((group) => (
                  <div key={group.category}>
                    {/* 分组标题 */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        {group.label}
                      </span>
                    </div>
                    {/* 分组标签 */}
                    <div className="flex flex-wrap gap-2">
                      {group.tags.map((tag) => (
                        <TagChip
                          key={tag.id}
                          tag={tag}
                          selected={selectedTagIds.has(tag.id)}
                          onToggle={toggleTag}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. 已选标签预览 */}
          <SelectedTagsPreview tags={selectedTags} onRemove={toggleTag} />

          {/* 3. 备注 */}
          <section>
            <h4 className="text-sm font-medium mb-2.5">备注</h4>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="输入跟进备注信息（可选）..."
              rows={3}
              className="resize-none"
            />
          </section>
        </div>

        {/* === Footer === */}
        <DialogFooter className="px-6 py-3.5 border-t bg-muted/20 sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting} className="sm:order-1">
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedTagIds.size === 0}
            className="gap-1.5 sm:order-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                确认跟进
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
