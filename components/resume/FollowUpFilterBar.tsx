'use client'

import { Search, Filter, ChevronDown, RotateCcw, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import { FollowUpTagFilter } from '@/components/resume/FollowUpTagFilter'
import { ContactedMultiSelect } from '@/components/resume/ContactedMultiSelect'
import { contactResultLabel } from '@/lib/constants/contact-result'
import type { Tag } from '@/types/follow-up'

interface FollowUpFilterBarProps {
  /** 搜索框输入值 */
  searchInput: string
  setSearchInput: (value: string) => void
  /** 提交搜索（回车 / 由父级处理 URL 同步） */
  onSearch: () => void
  /** 高级筛选面板开合 */
  filterOpen: boolean
  setFilterOpen: (open: boolean) => void
  /** 已应用的筛选条件数量（用于按钮徽标） */
  activeFilterCount: number
  /** 进入时间排序方向 */
  sortOrder: string
  onToggleSortOrder: () => void
  /** 标签 */
  allTags: Tag[]
  draftTagIds: string[]
  setDraftTagIds: (ids: string[]) => void
  draftTagLogic: 'OR' | 'AND'
  setDraftTagLogic: (logic: 'OR' | 'AND') => void
  /** 职位 */
  allPositions: { id: string; title: string }[]
  draftPositionIds: string[]
  setDraftPositionIds: (ids: string[]) => void
  /** 跟进时间范围 */
  draftDateFrom: string
  setDraftDateFrom: (value: string) => void
  draftDateTo: string
  setDraftDateTo: (value: string) => void
  /** 当前 tab（联系结果筛选仅沟通中显示） */
  activeTab: string
  draftContacted: string[]
  setDraftContacted: (values: string[]) => void
  /** 应用 / 清除筛选 */
  onApplyFilters: () => void
  onClearFilters: () => void
}

/**
 * 跟进页筛选栏：搜索框 + 高级筛选（标签 / 职位 / 日期 / 联系结果）+ 排序方向。
 * 纯受控组件，draft 状态由页面持有，URL 同步由父级回调完成。
 */
export function FollowUpFilterBar({
  searchInput,
  setSearchInput,
  onSearch,
  filterOpen,
  setFilterOpen,
  activeFilterCount,
  sortOrder,
  onToggleSortOrder,
  allTags,
  draftTagIds,
  setDraftTagIds,
  draftTagLogic,
  setDraftTagLogic,
  allPositions,
  draftPositionIds,
  setDraftPositionIds,
  draftDateFrom,
  setDraftDateFrom,
  draftDateTo,
  setDraftDateTo,
  activeTab,
  draftContacted,
  setDraftContacted,
  onApplyFilters,
  onClearFilters,
}: FollowUpFilterBarProps) {
  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        {/* Row 1: 搜索框 + 高级筛选按钮 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch() }}
              placeholder="搜索候选人姓名、邮箱、电话..."
              className="pl-9 h-10"
            />
          </div>
          <Button
            variant={filterOpen || activeFilterCount > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterOpen(!filterOpen)}
            className="h-10 gap-1.5 shrink-0"
          >
            <Filter className="h-4 w-4" />
            高级筛选
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-foreground text-primary text-xs font-medium">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${filterOpen ? 'rotate-180' : ''}`} />
          </Button>
          {/* 排序方向切换 */}
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSortOrder}
            className="h-10 gap-1.5 shrink-0"
          >
            进入时间 {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>

        {/* Row 2: 筛选面板（展开时） */}
        {filterOpen && (
          <div className="space-y-3 pt-2 border-t">
            {/* 标签筛选 */}
            <FollowUpTagFilter
              allTags={allTags}
              selectedTagIds={draftTagIds}
              tagLogic={draftTagLogic}
              onTagsChange={(ids, logic) => {
                setDraftTagIds(ids)
                setDraftTagLogic(logic)
              }}
            />

            {/* 职位筛选（多选） */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-10 shrink-0">职位</span>
              <MultiSelect
                options={allPositions.map((p) => ({ value: p.id, label: p.title }))}
                value={draftPositionIds}
                onChange={setDraftPositionIds}
                placeholder="全部职位"
                className="flex-1 max-w-[240px]"
              />
            </div>

            {/* 日期范围 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-16 shrink-0">跟进时间</span>
              <input
                type="date"
                value={draftDateFrom}
                onChange={(e) => setDraftDateFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">至</span>
              <input
                type="date"
                value={draftDateTo}
                onChange={(e) => setDraftDateTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* 联系结果筛选（仅沟通中） */}
            {activeTab === 'CONTACTING' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0 whitespace-nowrap">联系结果</span>
                <ContactedMultiSelect
                  value={draftContacted}
                  onChange={setDraftContacted}
                  className="flex-1 max-w-[240px]"
                />
              </div>
            )}

            {/* 筛选按钮行 */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={onApplyFilters}
                className="h-9 gap-1.5"
              >
                筛选
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="h-9 gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/70"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                清除筛选
              </Button>
            </div>

            {/* 已选条件汇总 */}
            {(draftTagIds.length > 0 || draftPositionIds.length > 0 || draftDateFrom || draftDateTo || draftContacted.length > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-xs text-muted-foreground mr-1">已选:</span>
                {draftTagIds.map((tagId) => {
                  const tag = allTags.find((t) => t.id === tagId)
                  if (!tag) return null
                  return (
                    <Badge key={tag.id} variant="secondary" className="gap-1 text-xs py-0.5">
                      {tag.name}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-foreground"
                        onClick={() => setDraftTagIds(draftTagIds.filter((id) => id !== tagId))}
                      />
                    </Badge>
                  )
                })}
                {draftPositionIds.map((posId) => {
                  const pos = allPositions.find((p) => p.id === posId)
                  if (!pos) return null
                  return (
                    <Badge key={pos.id} variant="secondary" className="gap-1 text-xs py-0.5">
                      {pos.title}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-foreground"
                        onClick={() => setDraftPositionIds(draftPositionIds.filter((id) => id !== posId))}
                      />
                    </Badge>
                  )
                })}
                {(draftDateFrom || draftDateTo) && (
                  <Badge variant="secondary" className="gap-1 text-xs py-0.5">
                    {draftDateFrom || '...'} ~ {draftDateTo || '...'}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-foreground"
                      onClick={() => { setDraftDateFrom(''); setDraftDateTo('') }}
                    />
                  </Badge>
                )}
                {draftContacted.map((val) => (
                  <Badge key={val} variant="secondary" className="gap-1 text-xs py-0.5">
                    {contactResultLabel(val)}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-foreground"
                      onClick={() => setDraftContacted(draftContacted.filter((v) => v !== val))}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
