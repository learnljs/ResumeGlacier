'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CATEGORY_ORDER, CATEGORY_LABELS } from '@/lib/constants/tags'
import type { Tag } from '@/types/follow-up'

/**
 * 标签筛选行：多选下拉（按分类分组） + AND/OR 切换。
 * 由 follow-up 页从内嵌 FilterTagRow 提取（B9）。
 */
export function FollowUpTagFilter({
  allTags,
  selectedTagIds,
  tagLogic,
  onTagsChange,
}: {
  allTags: Tag[]
  selectedTagIds: string[]
  tagLogic: 'OR' | 'AND'
  onTagsChange: (ids: string[], logic: 'OR' | 'AND') => void
}) {
  const [open, setOpen] = useState(false)

  const toggleTag = (tagId: string) => {
    const newIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId]
    onTagsChange(newIds, tagLogic)
  }

  const selectedNames = selectedTagIds
    .map((id) => allTags.find((t) => t.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground w-10 shrink-0">标签</span>

      {/* 下拉触发 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/30 transition-colors min-w-[160px]"
        >
          <span className={selectedTagIds.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
            {selectedNames || '选择标签...'}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* 下拉面板（按分类分组） */}
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute top-full mt-1 left-0 z-20 w-64 bg-popover border rounded-md shadow-md p-2 max-h-72 overflow-y-auto">
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">暂无标签</p>
              ) : (
                (() => {
                  const grouped = new Map<string, typeof allTags>()
                  for (const tag of allTags) {
                    const cat = tag.category || 'custom'
                    if (!grouped.has(cat)) grouped.set(cat, [])
                    grouped.get(cat)!.push(tag)
                  }
                  return CATEGORY_ORDER.filter(cat => grouped.has(cat)).map(cat => (
                    <div key={cat} className="mb-1 last:mb-0">
                      <div className="text-[10px] text-muted-foreground px-2 py-0.5 font-medium uppercase tracking-wider">
                        {CATEGORY_LABELS[cat] || cat}
                      </div>
                      {grouped.get(cat)!.map((tag) => (
                        <label
                          key={tag.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTagIds.includes(tag.id)}
                            onChange={() => toggleTag(tag.id)}
                            className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                          />
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="truncate">{tag.name}</span>
                          {tag.source === 'ai' && (
                            <span className="text-[10px] text-info ml-auto shrink-0">AI</span>
                          )}
                        </label>
                      ))}
                    </div>
                  ))
                })()
              )}
            </div>
          </>
        )}
      </div>

      {/* AND/OR 切换 */}
      {selectedTagIds.length > 1 && (
        <div className="flex items-center gap-1 ml-1">
          <label className={`text-xs cursor-pointer px-2 py-1 rounded ${tagLogic === 'OR' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <input
              type="radio"
              name="tagLogic"
              checked={tagLogic === 'OR'}
              onChange={() => onTagsChange(selectedTagIds, 'OR')}
              className="sr-only"
            />
            满足任一
          </label>
          <label className={`text-xs cursor-pointer px-2 py-1 rounded ${tagLogic === 'AND' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <input
              type="radio"
              name="tagLogic"
              checked={tagLogic === 'AND'}
              onChange={() => onTagsChange(selectedTagIds, 'AND')}
              className="sr-only"
            />
            满足全部
          </label>
        </div>
      )}
    </div>
  )
}
