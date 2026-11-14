'use client'

import type { Ref } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 紧凑型下拉 listbox 面板（Portal 渲染，突破表格 overflow 限制）。
 *
 * 从 ContactResultSelector 抽出——此前 inline / filter 两个变体各复制了一份
 * 完全相同的面板 JSX。触发按钮、锚点定位、外点关闭与键盘导航仍由调用方维护，
 * 这里只负责「选项列表长什么样」。
 */

export interface ListboxOption {
  value: string
  label: string
  /** 屏幕阅读器补充说明（视觉隐藏） */
  srLabel?: string
  /** 选项左侧指示圆点的类名 */
  dotClass?: string
}

export interface ListboxPanelProps {
  id: string
  /** 无障碍标签 */
  label: string
  options: ListboxOption[]
  /** 当前选中值 */
  value: string
  /** 键盘高亮项索引（-1 表示无） */
  activeIndex: number
  /** 触发按钮坐标系下的锚点（fixed 定位） */
  position: { top: number; left: number }
  onSelect: (value: string) => void
  panelRef?: Ref<HTMLDivElement>
  /** 注册选项 DOM 引用，供键盘导航聚焦 */
  registerOption?: (value: string, el: HTMLButtonElement | null) => void
}

export function ListboxPanel({
  id,
  label,
  options,
  value,
  activeIndex,
  position,
  onSelect,
  panelRef,
  registerOption,
}: ListboxPanelProps) {
  return createPortal(
    <div
      id={id}
      ref={panelRef}
      role="listbox"
      aria-label={label}
      className="fixed z-[9999] min-w-[130px] bg-popover border rounded-lg shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-150"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <div className="p-1">
        {options.map((option, i) => {
          const isSelected = option.value === value
          return (
            <button
              key={option.value}
              ref={(el) => registerOption?.(option.value, el)}
              type="button"
              role="option"
              aria-selected={isSelected}
              tabIndex={activeIndex === i ? 0 : -1}
              onClick={() => onSelect(option.value)}
              className={cn(
                'flex items-center w-full gap-2 px-2.5 py-1.5 text-xs rounded-md transition-colors',
                isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
              )}
            >
              {option.dotClass && (
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', option.dotClass)} aria-hidden="true" />
              )}
              <span className="whitespace-nowrap flex-1 text-left">
                {option.label}
                {option.srLabel && <span className="sr-only"> — {option.srLabel}</span>}
              </span>
              {isSelected && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
