'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Loader2, Users, Tag as TagIcon, Check } from 'lucide-react'
import { toast } from 'sonner'
import { TAG_COLORS } from '@/lib/constants/tags'
import { apiGet, apiPost } from '@/lib/api/client'
import type { Tag } from '@/types/follow-up'
import { TagChip } from '@/components/resume/TagChip'
import { TagCreateForm } from '@/components/resume/TagCreateForm'
import { SelectedTagsPreview } from '@/components/resume/SelectedTagsPreview'

// ==================== 类型 ====================

interface BatchFollowUpDialogProps {
  open: boolean
  onClose: () => void
  resumeIds: string[]
  evaluationIds?: string[]
  candidateNames: string[]
  onSuccess?: () => void
}

// ==================== 常量 ====================

const MAX_VISIBLE_CANDIDATES = 5

// ==================== 组件 ====================

export function BatchFollowUpDialog({
  open,
  onClose,
  resumeIds,
  evaluationIds,
  candidateNames,
  onSuccess,
}: BatchFollowUpDialogProps) {
  // --- 状态 ---
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [loadingTags, setLoadingTags] = useState(false)
  const [creatingTag, setCreatingTag] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showNewTag, setShowNewTag] = useState(false)

  // --- 数据加载 ---

  const loadTags = useCallback(async () => {
    setLoadingTags(true)
    try {
      const json = await apiGet<{ tags: Tag[] }>('/api/follow-up/tags')
      setTags(json.tags)
    } catch {
      toast.error('加载标签失败')
    } finally {
      setLoadingTags(false)
    }
  }, [])

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      loadTags()
      setSelectedTagIds(new Set())
      setShowNewTag(false)
      setNewTagName('')
      setNewTagColor(TAG_COLORS[0])
    }
  }, [open, loadTags])

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
      const json = await apiPost<{ created: number; skipped: number }>(
        '/api/follow-up/records/batch',
        {
          resumeIds,
          ...(evaluationIds?.length ? { evaluationIds } : {}),
          tagIds: Array.from(selectedTagIds),
        },
        { fallbackMessage: '批量创建跟进记录失败' }
      )

      const { created, skipped } = json
      const parts: string[] = []
      if (created > 0) parts.push(`已为 ${created} 份简历创建跟进记录`)
      if (skipped > 0) parts.push(`${skipped} 份已存在跟进，已跳过`)
      toast.success(parts.join('，'))

      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '批量创建跟进记录失败'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // --- 候选列表计算 ---

  const displayNames = candidateNames.slice(0, MAX_VISIBLE_CANDIDATES)
  const extraCount = candidateNames.length - displayNames.length
  const selectedTags = Array.from(selectedTagIds)
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean) as Tag[]

  // --- 渲染 ---

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* === Header === */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            批量跟进
          </DialogTitle>
          <DialogDescription>
            已选择 <strong className="text-foreground font-semibold">{candidateNames.length}</strong> 份简历，
            为它们统一打上跟进标签
          </DialogDescription>
        </DialogHeader>

        {/* === Body === */}
        <div className="px-6 py-5 space-y-5">

          {/* 1. 候选人列表 */}
          <section>
            <h4 className="text-sm font-medium mb-2.5 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              涉及候选人
            </h4>
            <div className="rounded-lg border bg-muted/20 px-3.5 py-3">
              {candidateNames.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  未选择任何简历
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {displayNames.map((name, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-xs font-normal py-0.5"
                    >
                      {name || '未知'}
                    </Badge>
                  ))}
                  {extraCount > 0 && (
                    <span className="text-xs text-muted-foreground font-medium pl-1">
                      +{extraCount} 人
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 2. 标签选择 */}
          <section>
            <h4 className="text-sm font-medium mb-2.5 flex items-center gap-1.5">
              <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
              选择标签
              <span className="text-red-500 ml-0.5">*</span>
            </h4>

            {loadingTags ? (
              // 加载骨架
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-8 w-20 rounded-full bg-muted animate-pulse"
                  />
                ))}
              </div>
            ) : tags.length === 0 ? (
              // 空状态
              <div className="rounded-lg border border-dashed bg-muted/10 px-4 py-6 text-center">
                <TagIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">
                  暂无标签，请先创建一个
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewTag(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  新建标签
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    selected={selectedTagIds.has(tag.id)}
                    onToggle={toggleTag}
                  />
                ))}
                {/* 新增标签按钮 */}
                {!showNewTag && (
                  <button
                    type="button"
                    onClick={() => setShowNewTag(true)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新建标签
                  </button>
                )}
              </div>
            )}
          </section>

          {/* 3. 新建标签表单（可折叠） */}
          {showNewTag && (
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
          )}

          {/* 4. 已选标签预览 */}
          <SelectedTagsPreview tags={selectedTags} onRemove={toggleTag} />

          {/* 5. 提示信息 */}
          {selectedTagIds.size === 0 && !loadingTags && tags.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              请从上方选择至少一个标签，或新建标签后再确认
            </p>
          )}
        </div>

        {/* === Footer === */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/20 sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="sm:order-1"
          >
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
                确认跟进{candidateNames.length > 0 ? ` (${candidateNames.length})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
