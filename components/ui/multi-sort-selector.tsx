'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Plus,
  GripVertical,
} from 'lucide-react'

export interface SortCondition {
  key: string
  order: 'asc' | 'desc'
}

interface MultiSortSelectorProps {
  value: SortCondition[]
  onChange: (value: SortCondition[]) => void
  disabled?: boolean
}

const sortOptions = [
  { value: 'initialScore', label: '初筛得分' },
  { value: 'screenedAt', label: '评估日期' },
  { value: 'receivedAt', label: '接收时间' },
]

const MAX_CONDITIONS = 3

export function MultiSortSelector({ value, onChange, disabled }: MultiSortSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null)

  const handleAddCondition = useCallback((key: string) => {
    if (value.length >= MAX_CONDITIONS) return
    if (value.some(c => c.key === key)) return
    
    const newConditions: SortCondition[] = [...value, { key, order: 'desc' }]
    setAnimatingIndex(newConditions.length - 1)
    onChange(newConditions)
    
    setTimeout(() => setAnimatingIndex(null), 300)
  }, [value, onChange])

  const handleRemoveCondition = useCallback((index: number) => {
    setAnimatingIndex(index)
    setTimeout(() => {
      const newConditions = value.filter((_, i) => i !== index)
      onChange(newConditions)
      setAnimatingIndex(null)
    }, 200)
  }, [value, onChange])

  const handleToggleOrder = useCallback((index: number) => {
    const newConditions: SortCondition[] = value.map((c, i) =>
      i === index ? { ...c, order: c.order === 'asc' ? 'desc' : 'asc' } : c
    )
    onChange(newConditions)
  }, [value, onChange])

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return
    const newConditions: SortCondition[] = [...value]
    ;[newConditions[index - 1], newConditions[index]] = [newConditions[index], newConditions[index - 1]]
    onChange(newConditions)
  }, [value, onChange])

  const handleMoveDown = useCallback((index: number) => {
    if (index === value.length - 1) return
    const newConditions: SortCondition[] = [...value]
    ;[newConditions[index], newConditions[index + 1]] = [newConditions[index + 1], newConditions[index]]
    onChange(newConditions)
  }, [value, onChange])

  const handleClearAll = useCallback(() => {
    onChange([])
  }, [onChange])

  const availableOptions = sortOptions.filter(opt => !value.some(c => c.key === opt.value))

  return (
    <div className="relative">
      {/* 紧凑模式 - 显示已选条件摘要 */}
      <div className="flex items-center gap-2 flex-wrap">
        {value.length === 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setIsExpanded(true)}
            className="h-10 px-3 text-sm hover:bg-primary hover:text-primary-foreground border-input bg-background"
          >
            <ArrowUpDown className="h-4 w-4 mr-2" />
            选择排序条件
          </Button>
        ) : (
          value.map((condition, index) => {
            const option = sortOptions.find(opt => opt.value === condition.key)
            return (
              <div
                key={`${condition.key}-${index}`}
                className={`inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm transition-all duration-200
                  ${animatingIndex === index ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
                  ${isExpanded ? 'bg-primary/20' : ''}
                `}
              >
                <span className="text-xs font-medium opacity-60">{index + 1}</span>
                <span>{option?.label}</span>
                {condition.order === 'asc' ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {isExpanded && (
                  <button
                    onClick={() => handleRemoveCondition(index)}
                    className="ml-1 p-0.5 hover:bg-primary/20 rounded-full transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })
        )}
        
        {value.length > 0 && !isExpanded && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(true)}
            className="h-10 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 展开模式 - 完整编辑界面 */}
      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-background border rounded-lg shadow-lg z-50 overflow-hidden animate-in slide-in-from-top-2 duration-200">
          {/* 已选条件列表 */}
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">排序条件</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-7 text-xs text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              >
                清除全部
              </Button>
            </div>
            
            {value.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                暂无排序条件
              </div>
            ) : (
              <div className="space-y-2">
                {value.map((condition, index) => {
                  const option = sortOptions.find(opt => opt.value === condition.key)
                  return (
                    <div
                      key={`${condition.key}-${index}`}
                      className={`flex items-center gap-2 p-2 rounded-md bg-muted/50 transition-all duration-200
                        ${animatingIndex === index ? 'opacity-0 translate-x-[-20px]' : 'opacity-100 translate-x-0'}
                      `}
                    >
                      {/* 拖拽手柄 */}
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                      
                      {/* 序号 */}
                      <span className="w-5 h-5 flex items-center justify-center bg-primary/20 text-primary text-xs font-medium rounded-full">
                        {index + 1}
                      </span>
                      
                      {/* 条件名称 */}
                      <span className="flex-1 text-sm">{option?.label}</span>
                      
                      {/* 方向切换 */}
                      <button
                        onClick={() => handleToggleOrder(index)}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                        title={condition.order === 'asc' ? '切换为降序' : '切换为升序'}
                      >
                        {condition.order === 'asc' ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : (
                          <ArrowDown className="h-4 w-4" />
                        )}
                      </button>
                      
                      {/* 上移/下移 */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="上移"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleMoveDown(index)}
                          disabled={index === value.length - 1}
                          className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="下移"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                      
                      {/* 删除 */}
                      <button
                        onClick={() => handleRemoveCondition(index)}
                        className="p-1.5 hover:bg-destructive/15 hover:text-destructive rounded-md transition-colors"
                        title="删除"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 添加条件 */}
          <div className="p-3">
            <span className="text-xs text-muted-foreground mb-2 block">添加排序条件</span>
            {availableOptions.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {availableOptions.map(opt => (
                  <Button
                    key={opt.value}
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddCondition(opt.value)}
                    disabled={value.length >= MAX_CONDITIONS}
                    className="h-9 text-sm justify-start hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3 w-3 mr-2" />
                    {opt.label}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="text-center py-2 text-sm text-muted-foreground">
                已添加所有排序条件
              </div>
            )}
          </div>

          {/* 关闭按钮 */}
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              className="w-full h-8 text-sm hover:bg-primary hover:text-primary-foreground"
              onClick={() => setIsExpanded(false)}
            >
              完成
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
