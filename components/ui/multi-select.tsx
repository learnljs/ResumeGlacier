'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]           // 已选的 value 数组
  onChange: (value: string[]) => void
  placeholder?: string       // 默认 "全部职位"
  className?: string
  disabled?: boolean
  showSelectAll?: boolean    // 是否在下拉面板顶部显示全选操作栏
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = '全部职位',
  className,
  disabled,
  showSelectAll = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const checkboxRef = useRef<HTMLInputElement>(null)

  // 点击外部关闭
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  const toggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue))
    } else {
      onChange([...value, optionValue])
    }
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  // 三态 checkbox：全选 / 部分选 / 全不选
  const allSelected = options.length > 0 && value.length === options.length
  const someSelected = value.length > 0 && value.length < options.length

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const handleSelectAll = () => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(options.map(o => o.value))
    }
  }

  const selectedCount = value.length
  const displayText = selectedCount === 0
    ? placeholder
    : `已选 ${selectedCount} 个职位`

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* 触发器 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center justify-between h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm transition-all duration-200',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'w-full min-w-[140px]'
        )}
      >
        <span className={cn(
          'truncate',
          selectedCount === 0 ? 'text-muted-foreground' : 'text-foreground'
        )}>
          {displayText}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {selectedCount > 0 && (
            <span
              onClick={clearAll}
              className="p-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
              title="清除"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); clearAll(e as unknown as React.MouseEvent) } }}
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )} />
        </div>
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-full bg-background border rounded-lg shadow-lg z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150" style={{ width: 'auto', minWidth: '220px' }}>
          {/* 全选操作栏 */}
          {showSelectAll && options.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b">
              <input
                ref={checkboxRef}
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              />
              <span className="text-sm text-muted-foreground">
                已选 {value.length}/{options.length}
              </span>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            {options.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                暂无可选职位
              </div>
            ) : (
              options.map((option) => {
                const isSelected = value.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleOption(option.value)}
                    className={cn(
                      'flex items-center w-full gap-2 px-3 py-2 text-sm rounded-md transition-colors',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    )}
                  >
                    {/* Checkbox */}
                    <span
                      className={cn(
                        'flex items-center justify-center h-4 w-4 rounded border shrink-0 transition-colors',
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-input'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </span>
                    <span className="whitespace-nowrap">{option.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
