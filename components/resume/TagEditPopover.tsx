'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Loader2, X, Check, Bot, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_DOT_COLORS, TAG_COLORS } from '@/lib/constants/tags'
import { apiPost, apiPut, apiDelete } from '@/lib/api/client'
import type { Tag } from '@/types/follow-up'

// ==================== 类型 ====================

interface TagEditPopoverProps {
  recordId: string
  candidateName: string
  currentTags: Tag[]
  allTags: Tag[]
  onSaved: () => void
  onTagCreated?: (tag: Tag) => void
  onTagDeleted?: (tag: Tag) => void
}

// ==================== 常量 ====================

const PANEL_WIDTH = 336
const PANEL_MAX_HEIGHT_RATIO = 0.72
const PANEL_MIN_HEIGHT = 220

// ==================== 组件 ====================

export function TagEditPopover({ recordId, candidateName, currentTags, allTags, onSaved, onTagCreated, onTagDeleted }: TagEditPopoverProps) {
  const [open, setOpen] = useState(false)
  const [exiting, setExiting] = useState(false) // 退出动画状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [creating, setCreating] = useState(false)
  const [localTags, setLocalTags] = useState<Tag[]>(allTags)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  // 面板打开时：重置选中状态、新标签输入框和退出动画标记
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(currentTags.map((t) => t.id)))
      setLocalTags(allTags)
      setNewTagName('')
      setExiting(false)
    }
    // currentTags 是 record.tags.map() 内联创建的新数组，引用每次渲染都变；
    // 只在 open 变化时重置，避免父组件重渲染时误清空选中状态
  }, [open])

  // allTags prop 更新时：仅同步标签列表，不触碰选中状态
  useEffect(() => {
    if (open) {
      setLocalTags(allTags)
    }
  }, [open, allTags])

  // 计算面板 fixed 定位，返回 style 对象（纯函数，无副作用）
  const calcStyle = useCallback((): React.CSSProperties => {
    if (!triggerRef.current) {
      // fallback: 居中显示
      return {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${PANEL_WIDTH}px`,
        maxHeight: `${PANEL_MIN_HEIGHT}px`,
      }
    }

    const rect = triggerRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth
    const margin = 12
    const gap = 6

    const idealMaxH = Math.max(PANEL_MIN_HEIGHT, Math.floor(viewportH * PANEL_MAX_HEIGHT_RATIO))

    // 水平：右对齐触发按钮，不超出视口
    let left = rect.right - PANEL_WIDTH
    if (left < margin) left = margin
    if (left + PANEL_WIDTH > viewportW - margin) left = viewportW - PANEL_WIDTH - margin

    // 垂直：优先向下展开，空间不够向上
    const belowSpace = viewportH - rect.bottom - gap
    const aboveSpace = rect.top - gap

    let top: number
    let actualMaxH: number

    if (belowSpace >= aboveSpace) {
      // 向下展开
      top = rect.bottom + gap
      // 关键修复：maxH 不得超过实际可用下方空间（留 12px 底部安全距离）
      actualMaxH = Math.min(idealMaxH, belowSpace - margin)
    } else {
      // 向上展开
      // 关键修复：maxH 不得超过实际可用上方空间
      actualMaxH = Math.min(idealMaxH, aboveSpace - margin)
      top = Math.max(margin, rect.top - actualMaxH - gap)
    }

    // 确保不超出视口底部（最后一道保险）
    if (top + actualMaxH > viewportH - margin) {
      actualMaxH = viewportH - margin - top
    }

    // 确保最小高度
    if (actualMaxH < PANEL_MIN_HEIGHT) actualMaxH = PANEL_MIN_HEIGHT

    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${PANEL_WIDTH}px`,
      maxHeight: `${actualMaxH}px`,
    }
  }, [])

  // 打开面板（先算位置再打开，React 18 批处理合并为一次渲染，消除闪烁）
  const handleOpen = useCallback(() => {
    const style = calcStyle()
    setPanelStyle(style)
    setOpen(true)
  }, [calcStyle])

  // 打开后监听 resize/scroll 实时更新位置
  useEffect(() => {
    if (!open) return

    const onUpdate = () => setPanelStyle(calcStyle())
    window.addEventListener('resize', onUpdate)
    window.addEventListener('scroll', onUpdate, true)
    return () => {
      window.removeEventListener('resize', onUpdate)
      window.removeEventListener('scroll', onUpdate, true)
    }
  }, [open, calcStyle])

  // Escape 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const toggleTag = (tagId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    setCreating(true)
    try {
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
      const json = await apiPost<{ tag: Tag }>('/api/follow-up/tags', {
        name,
        color,
        source: 'manual',
        category: 'custom',
      }, { fallbackMessage: '创建失败' })
      const newTag: Tag = json.tag
      setLocalTags(prev => [...prev, newTag])
      setSelectedIds(prev => new Set(prev).add(newTag.id))
      setNewTagName('')
      onTagCreated?.(newTag)
      toast.success(`标签「${name}」已创建`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  // 删除手动标签（AI 标签后端拒绝删除；关联记录经 Cascade 自动清理）
  const handleDeleteTag = async (tag: Tag) => {
    if (tag.source === 'ai') return
    try {
      await apiDelete(`/api/follow-up/tags?id=${tag.id}`, { fallbackMessage: '删除失败' })
      setLocalTags(prev => prev.filter((t) => t.id !== tag.id))
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(tag.id)
        return next
      })
      onTagDeleted?.(tag)
      toast.success(`标签「${tag.name}」已删除`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败'
      toast.error(msg)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPut(`/api/follow-up/records/${recordId}`, { tagIds: Array.from(selectedIds) }, {
        fallbackMessage: '更新失败',
      })
      toast.success('标签已更新')
      handleClose()
      onSaved()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '更新失败'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // 带退出动画的关闭
  const handleClose = () => {
    setExiting(true)
    setTimeout(() => {
      setOpen(false)
      setExiting(false)
    }, 120) // exit 动画 120ms（比 enter 快）
  }

  // 按分类分组
  const grouped = new Map<string, Tag[]>()
  for (const tag of localTags) {
    const cat = tag.category || 'custom'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(tag)
  }

  const categories = CATEGORY_ORDER.filter((cat) => grouped.has(cat))

  // 统计每分类已选数量
  const selectedCountByCat = (cat: string) =>
    grouped.get(cat)?.filter((t) => selectedIds.has(t.id)).length ?? 0

  const isDirty = (() => {
    const currentIds = new Set(currentTags.map((t) => t.id))
    if (selectedIds.size !== currentIds.size) return true
    for (const id of selectedIds) {
      if (!currentIds.has(id)) return true
    }
    return false
  })()

  const panelClasses = cn(
    'bg-popover border rounded-xl flex flex-col',
    'ring-1 ring-border/60 shadow-xl shadow-foreground/5',
    exiting
      ? 'animate-out fade-out-0 zoom-out-95 duration-100'
      : 'animate-in fade-in-0 zoom-in-95 duration-200',
  )

  return (
    <>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? handleClose : handleOpen}
        className={cn(
          'inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0',
          'text-muted-foreground hover:text-foreground hover:bg-muted/70',
          'active:scale-95 transition-all duration-150',
          open && 'text-foreground bg-muted/50',
        )}
        title="编辑标签"
        aria-label="编辑标签"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {/* Popover 面板 */}
      {open && (
        <>
          {/* 遮罩 */}
          <div
            className="fixed inset-0 bg-overlay/5 transition-opacity duration-150"
            style={{ zIndex: 9998 }}
            onClick={handleClose}
          />

          {/* 面板 */}
          <div
            ref={panelRef}
            className={panelClasses}
            style={{ ...panelStyle, zIndex: 9999 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold tracking-tight">编辑标签</h4>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[240px]">
                  {candidateName || '未知候选人'}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 -mr-1 rounded-md hover:bg-muted/70 transition-colors shrink-0 ml-2"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 overscroll-contain">
              {categories.map((cat) => {
                const tags = grouped.get(cat)!
                const accent = CATEGORY_DOT_COLORS[cat] || CATEGORY_DOT_COLORS.custom
                const selectedCount = selectedCountByCat(cat)

                return (
                  <div key={cat}>
                    {/* 分类标题 */}
                    <div
                      className="flex items-center gap-2 px-2 mb-1.5 sticky top-0 z-10 bg-popover/95 backdrop-blur-sm py-1.5"
                    >
                      <span
                        className="w-1 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: accent }}
                      />
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                      {selectedCount > 0 && (
                        <span className="text-[10px] font-medium text-muted-foreground/60 ml-auto">
                          {selectedCount}/{tags.length}
                        </span>
                      )}
                    </div>

                    {/* 标签列表 */}
                    <div className="space-y-px">
                      {tags.map((tag) => {
                        const isSelected = selectedIds.has(tag.id)
                        return (
                          <label
                            key={tag.id}
                            className={cn(
                              'group flex items-center gap-2.5 px-2 py-2.5 rounded-lg cursor-pointer',
                              'transition-all duration-150 ease-out',
                              'hover:bg-muted/60',
                              isSelected
                                ? 'bg-primary/8 hover:bg-primary/12'
                                : 'bg-transparent',
                            )}
                          >
                            {/* 左侧选择指示条 */}
                            <span
                              className={cn(
                                'w-0.5 h-5 rounded-full shrink-0 transition-all duration-200',
                                isSelected ? 'bg-primary scale-100' : 'bg-transparent scale-50',
                              )}
                            />

                            {/* 复选框（自定义外观） */}
                            <span
                              className={cn(
                                'relative flex items-center justify-center w-4 h-4 rounded border-2 shrink-0 transition-all duration-150',
                                isSelected
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground/30 group-hover:border-muted-foreground/50',
                              )}
                            >
                              {isSelected && (
                                <Check
                                  className="h-3 w-3 text-primary-foreground"
                                  strokeWidth={3}
                                />
                              )}
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTag(tag.id)}
                                className="sr-only"
                              />
                            </span>

                            {/* 标签色点 */}
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-foreground/10"
                              style={{ backgroundColor: tag.color }}
                            />

                            {/* 标签名 */}
                            <span className="text-[13px] leading-none truncate select-none">
                              {tag.name}
                            </span>

                            {/* AI 标记 */}
                            {tag.source === 'ai' && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-info/80 ml-auto shrink-0 bg-info/10 px-1.5 py-0.5 rounded-full"
                                title="AI 自动识别标签"
                              >
                                <Bot className="h-2.5 w-2.5" />
                                AI
                              </span>
                            )}

                            {/* 删除标签（仅手动标签可删） */}
                            {tag.source !== 'ai' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleDeleteTag(tag)
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -mr-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 shrink-0"
                                title={`删除标签「${tag.name}」`}
                                aria-label={`删除标签 ${tag.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {categories.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">暂无可用标签</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    请在下方输入框中创建新标签
                  </p>
                </div>
              )}
            </div>

            {/* 新增标签 */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-t shrink-0">
              <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag() }}
                placeholder="输入新标签名"
                className="flex-1 h-7 px-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={creating}
              />
              <Button
                size="sm"
                onClick={handleCreateTag}
                disabled={creating || !newTagName.trim()}
                className="h-7 px-3 text-xs font-medium shrink-0"
              >
                {creating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  '添加'
                )}
              </Button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 rounded-b-xl shrink-0">
              <div className="flex items-center gap-2">
                {isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" title="有未保存的修改" />
                )}
                <span className="text-xs text-muted-foreground">
                  已选 <span className="font-medium text-foreground">{selectedIds.size}</span> 个标签
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-8 px-3 text-xs font-medium"
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-8 px-4 text-xs font-medium"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      保存中
                    </>
                  ) : (
                    '保存修改'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

/**
 * 表格行内标签 Badge 展示
 */
export function TagBadgeList({
  tags,
  max = 3,
}: {
  tags: Tag[]
  max?: number
}) {
  // 排序：自定义分类优先
  const sorted = [...tags].sort((a, b) => {
    const catA = a.category || 'custom'
    const catB = b.category || 'custom'
    if (catA === 'custom' && catB !== 'custom') return -1
    if (catA !== 'custom' && catB === 'custom') return 1
    return 0
  })
  const visible = sorted.slice(0, max)
  const hidden = sorted.length - max

  if (tags.length === 0) {
    return (
      <span className="text-xs text-muted-foreground/50 italic">未标记</span>
    )
  }

  return (
    <div className="flex items-center gap-1 flex-nowrap min-w-0 max-w-full overflow-hidden">
      {visible.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center text-[11px] font-medium px-1.5 py-px rounded-md whitespace-nowrap leading-5 shrink-0"
          style={{
            backgroundColor: tag.color + '14',
            color: tag.color,
            border: `1px solid ${tag.color}30`,
          }}
          title={tag.source === 'ai' ? `${tag.name}（🤖 AI 识别）` : tag.name}
        >
          {tag.name}
        </span>
      ))}
      {hidden > 0 && (
        <span
          className="text-[11px] text-muted-foreground font-medium cursor-default shrink-0"
          title={sorted.slice(max).map((t) => `${t.name}${t.source === 'ai' ? '🤖' : ''}`).join('、')}
        >
          +{hidden}
        </span>
      )}
    </div>
  )
}
