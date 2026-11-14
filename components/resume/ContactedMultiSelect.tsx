'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CONTACT_RESULT_OPTIONS } from '@/lib/constants/contact-result'

/**
 * 联系结果多选筛选组件（follow-up 搜索面板用）。
 * 由 follow-up 页从内嵌组件提取（B9），选项来源收敛到 contact-result 单点。
 */
export function ContactedMultiSelect({
  value,
  onChange,
  className,
}: {
  value: string[]
  onChange: (value: string[]) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const toggle = (optVal: string) => {
    const newVal = value.includes(optVal)
      ? value.filter((v) => v !== optVal)
      : [...value, optVal]
    onChange(newVal)
  }

  const selectedLabels = value
    .map((v) => CONTACT_RESULT_OPTIONS.find((o) => o.value === v)?.label)
    .filter(Boolean)
    .join('、')

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/30 transition-colors w-full ${className || ''}`}
      >
        <span className={value.length > 0 ? 'text-foreground truncate' : 'text-muted-foreground'}>
          {selectedLabels || '全部'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 ml-2 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-20 w-48 bg-popover border rounded-md shadow-md p-1">
            {CONTACT_RESULT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
