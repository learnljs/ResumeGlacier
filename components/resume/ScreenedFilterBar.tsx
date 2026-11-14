'use client'

import { Search, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { MultiSortSelector, type SortCondition } from '@/components/ui/multi-sort-selector'

interface ScreenedFilterBarProps {
  /** 搜索框值 */
  searchInput: string
  onSearchInputChange: (value: string) => void
  /** 回车 / 点击搜索 */
  onSearch: () => void
  /** 职位多选 */
  draftPositionIds: string[]
  onDraftPositionIdsChange: (ids: string[]) => void
  positions: { id: string; title: string }[]
  /** 来源筛选 */
  draftResumeSourceId: string
  onDraftResumeSourceIdChange: (value: string) => void
  resumeSources: { id: string; name?: string }[]
  /** 重置 */
  onReset: () => void
  /** 加载中（按钮禁用 + 转圈） */
  loading: boolean
  /** 多条件排序 */
  sortConditions: SortCondition[]
  onSortChange: (conditions: SortCondition[]) => void
}

/**
 * 已筛选简历筛选栏：搜索 + 职位多选 + 来源 + 搜索/重置 + 多条件排序。
 */
export function ScreenedFilterBar({
  searchInput,
  onSearchInputChange,
  onSearch,
  draftPositionIds,
  onDraftPositionIdsChange,
  positions,
  draftResumeSourceId,
  onDraftResumeSourceIdChange,
  resumeSources,
  onReset,
  loading,
  sortConditions,
  onSortChange,
}: ScreenedFilterBarProps) {
  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch()
              }}
              placeholder="搜索候选人姓名、邮箱、电话..."
              className="pl-9 h-10"
            />
          </div>
          <MultiSelect
            options={positions.map((pos) => ({ value: pos.id, label: pos.title }))}
            value={draftPositionIds}
            onChange={onDraftPositionIdsChange}
            placeholder="全部职位"
            className="w-auto"
          />
          <Select
            value={draftResumeSourceId}
            onChange={(e) => onDraftResumeSourceIdChange(e.target.value)}
            className="h-10 w-auto"
          >
            <option value="">全部来源</option>
            {resumeSources.map((src) => (
              <option key={src.id} value={src.id}>{src.name}</option>
            ))}
          </Select>
          <Button
            onClick={onSearch}
            disabled={loading}
            className="h-10 gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {loading ? '搜索中...' : '搜索'}
          </Button>
          <Button
            variant="outline"
            onClick={onReset}
            disabled={loading}
            className="h-10"
          >
            重置
          </Button>
          <div className="flex items-center gap-2">
            <MultiSortSelector
              value={sortConditions}
              onChange={onSortChange}
              disabled={loading}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
