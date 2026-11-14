'use client'

import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

interface ResumeListToolbarProps {
  /** 当前 tab 总条数 */
  total: number
  /** 已选条数 */
  selectedCount: number
  /** 当前排序字段 */
  sortBy: string
  /** 排序方向 */
  sortOrder: 'asc' | 'desc'
  /** 切换排序字段 / 方向 */
  onSortToggle: (field: 'receivedAt' | 'screenedAt') => void
  /** 当前页是否全选 */
  allSelected: boolean
  /** 全选 / 取消全选当前页 */
  onToggleSelectAll: () => void
}

/**
 * 简历列表工具栏：总数 / 已选提示 + 排序切换（接收时间 / 筛选时间）+ 全选行。
 */
export function ResumeListToolbar({
  total,
  selectedCount,
  sortBy,
  sortOrder,
  onSortToggle,
  allSelected,
  onToggleSelectAll,
}: ResumeListToolbarProps) {
  const sortIcon = (field: 'receivedAt' | 'screenedAt') => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3" />
    return sortOrder === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
  }

  const sortClass = (field: string) =>
    `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
      sortBy === field ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
    }`

  return (
    <>
      {/* 排序工具栏 */}
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs text-muted-foreground">
          共 {total} 份简历
          {selectedCount > 0 && <span className="ml-2 text-primary font-medium">已选 {selectedCount} 份</span>}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => onSortToggle('receivedAt')} className={sortClass('receivedAt')}>
            接收时间
            {sortIcon('receivedAt')}
          </button>
          <button onClick={() => onSortToggle('screenedAt')} className={sortClass('screenedAt')}>
            筛选时间
            {sortIcon('screenedAt')}
          </button>
        </div>
      </div>

      {/* 全选行 */}
      <div className="flex items-center justify-between pb-2">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleSelectAll}
            className="h-4 w-4 rounded border-muted-foreground/30 text-primary accent-primary"
          />
          <span className="text-xs text-muted-foreground">全选当前页</span>
        </label>
      </div>
    </>
  )
}
