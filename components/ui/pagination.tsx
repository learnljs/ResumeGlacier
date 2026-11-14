'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'

interface PageSizeOption {
  value: number
  label: string
}

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  unitLabel?: string
  pageSizeOptions?: PageSizeOption[]
  alwaysShow?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const DEFAULT_PAGE_SIZE_OPTIONS: PageSizeOption[] = [
  { value: 10, label: '10条/页' },
  { value: 15, label: '15条/页' },
  { value: 20, label: '20条/页' },
]

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  unitLabel = '条',
  pageSizeOptions,
  alwaysShow = false,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const [jumpValue, setJumpValue] = useState('')
  const options = pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS

  if (!alwaysShow && totalPages <= 1) return null

  const handleJump = () => {
    const num = parseInt(jumpValue, 10)
    if (num >= 1 && num <= totalPages) {
      onPageChange(num)
      setJumpValue('')
    }
  }

  const handleJumpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJump()
  }

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPageSize = parseInt(e.target.value, 10)
    onPageSizeChange(newPageSize)
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          共 {total} {unitLabel}，第 {page}/{totalPages} 页
        </p>
        <Select
          value={String(pageSize)}
          onChange={handlePageSizeChange}
          className="w-auto text-sm"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          title="首页"
          className="hover:bg-gray-200/70 hover:text-foreground transition-all duration-200"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="hover:bg-gray-200/70 hover:text-foreground transition-all duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="hover:bg-gray-200/70 hover:text-foreground transition-all duration-200"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title="末页"
          className="hover:bg-gray-200/70 hover:text-foreground transition-all duration-200"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 ml-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap">跳至</span>
          <Input
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ''))}
            onKeyDown={handleJumpKeyDown}
            placeholder=""
            className="h-8 w-14 text-center text-sm"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">页</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleJump}
            className="h-8 px-2 text-xs hover:bg-gray-200/70 hover:text-foreground transition-all duration-200"
          >
            跳转
          </Button>
        </div>
      </div>
    </div>
  )
}
