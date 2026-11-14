'use client'

import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTACT_RESULT_OPTIONS } from '@/lib/constants/contact-result'
import { ListboxPanel, type ListboxOption } from '@/components/ui/listbox-panel'

// ==================== 常量 ====================

// 联系结果选项定义来自 lib/constants/contact-result 单点（B8）

/** 状态颜色映射（模块级缓存，避免重复计算） */
const STATUS_COLORS: Record<string, ReturnType<typeof computeStatusColors>> = {}

function computeStatusColors(value: string) {
  switch (value) {
    case 'CONTACTED':
      return {
        dot: 'bg-success',
        bg: 'bg-success/5',
        border: 'border-success/20',
        text: 'text-success',
        hoverBg: 'hover:bg-success/10',
        optionDot: 'bg-success',
      }
    case 'CONTACT_FAILED':
      return {
        dot: 'bg-accent',
        bg: 'bg-warning/5',
        border: 'border-warning/20',
        text: 'text-warning',
        hoverBg: 'hover:bg-warning/10',
        optionDot: 'bg-accent',
      }
    default:
      return {
        dot: 'bg-muted-foreground/40',
        bg: 'bg-background',
        border: 'border-input',
        text: 'text-muted-foreground',
        hoverBg: 'hover:bg-muted/30',
        optionDot: 'bg-muted-foreground/40',
      }
  }
}

function getStatusColors(value: string) {
  if (!STATUS_COLORS[value]) {
    STATUS_COLORS[value] = computeStatusColors(value)
  }
  return STATUS_COLORS[value]
}

// ==================== 组件接口 ====================

export interface ContactResultSelectorProps {
  /** 当前选中值 */
  value: string
  /** 值变更回调（异步，组件内部管理 loading 状态） */
  onChange: (value: string) => void | Promise<void>
  /** 额外类名 */
  className?: string
}

// ==================== 组件 ====================

/**
 * 联系结果选择器（跟进表格单元格内的紧凑下拉）。
 *
 * 触发按钮带状态色圆点，面板经 Portal 渲染以突破表格 overflow 限制，
 * 支持外点关闭、滚动关闭与完整键盘导航（↑↓ / Home / End / Enter / Esc）。
 */
export function ContactResultSelector({
  value,
  onChange,
  className,
}: ContactResultSelectorProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const autoId = useId()
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  // 打开时计算触发按钮的屏幕坐标
  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [])

  // 打开面板
  const handleOpen = useCallback(() => {
    updatePosition()
    setOpen(true)
  }, [updatePosition])

  // 关闭面板
  const handleClose = useCallback(() => {
    setOpen(false)
    setDropdownPos(null)
  }, [])

  // 打开时监听滚动事件，滚动时自动关闭
  useEffect(() => {
    if (!open) return
    const onScroll = () => {
      updatePosition()
      handleClose()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open, updatePosition, handleClose])

  // 构建选项列表（标签 + 状态圆点样式，仅构建一次）
  const displayOptions = useMemo<ListboxOption[]>(
    () =>
      CONTACT_RESULT_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        srLabel: o.srLabel,
        dotClass: getStatusColors(o.value).optionDot,
      })),
    []
  )

  // 重置活动索引（选项列表变化时）
  useEffect(() => {
    if (open) {
      const idx = displayOptions.findIndex((o) => o.value === value)
      setActiveIndex(idx >= 0 ? idx : 0)
    } else {
      setActiveIndex(-1)
    }
  }, [open, value, displayOptions])

  // 点击外部关闭（需同时检查 containerRef 和 Portal 渲染的 listRef）
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as Node
      const inContainer = containerRef.current?.contains(target)
      const inList = listRef.current?.contains(target)
      if (!inContainer && !inList) {
        handleClose()
      }
    },
    [handleClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  // 键盘导航
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      const opts = displayOptions
      if (opts.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((prev) => {
            const next = prev + 1
            return next >= opts.length ? 0 : next
          })
          break

        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((prev) => {
            const next = prev - 1
            return next < 0 ? opts.length - 1 : next
          })
          break

        case 'Home':
          e.preventDefault()
          setActiveIndex(0)
          break

        case 'End':
          e.preventDefault()
          setActiveIndex(opts.length - 1)
          break

        case 'Enter':
        case ' ':
          e.preventDefault()
          if (activeIndex >= 0 && activeIndex < opts.length) {
            handleSelect(opts[activeIndex].value)
          }
          break

        case 'Escape':
          e.preventDefault()
          handleClose()
          triggerRef.current?.focus()
          break

        case 'Tab':
          handleClose()
          break
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, activeIndex, displayOptions])

  // 活动选项变更时聚焦对应 DOM 元素
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const opt = displayOptions[activeIndex]
    if (opt) {
      const el = optionRefs.current.get(opt.value)
      el?.focus()
    }
  }, [open, activeIndex, displayOptions])

  // 选项点击处理
  const handleSelect = useCallback(
    async (newValue: string) => {
      if (loading) return
      // 选中当前值不发起请求
      if (newValue === value) {
        handleClose()
        triggerRef.current?.focus()
        return
      }
      handleClose()
      setLoading(true)
      try {
        await onChange(newValue)
      } catch {
        // onChange 中的网络错误/异常由调用方通过 toast 处理，
        // 此处仅确保 loading 状态正确重置
      } finally {
        setLoading(false)
        triggerRef.current?.focus()
      }
    },
    [loading, value, onChange],
  )

  const currentOption = CONTACT_RESULT_OPTIONS.find((o) => o.value === value)
  const currentLabel = currentOption?.label || (value === '' ? '全部' : value || '未尝试')
  const colors = getStatusColors(value)

  // 注册/注销选项 DOM 引用（供键盘导航聚焦）
  const registerOption = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) optionRefs.current.set(key, el)
    else optionRefs.current.delete(key)
  }, [])

  const listboxId = `contact-result-list-${autoId}`

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        type="button"
        disabled={loading}
        onClick={() => (open ? handleClose() : handleOpen())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 rounded-md border px-2 text-xs',
          'transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-wait',
          colors.bg,
          colors.border,
          colors.text,
          open ? 'ring-2 ring-ring ring-offset-1' : colors.hoverBg,
        )}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', colors.dot)} aria-hidden="true" />
        )}
        <span className="whitespace-nowrap">{currentLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-3 w-3 shrink-0 opacity-60 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* 下拉面板（Portal 渲染，突破 overflow 限制） */}
      {open && dropdownPos && (
        <ListboxPanel
          id={listboxId}
          label="联系结果"
          options={displayOptions}
          value={value}
          activeIndex={activeIndex}
          position={dropdownPos}
          onSelect={handleSelect}
          panelRef={listRef}
          registerOption={registerOption}
        />
      )}
    </div>
  )
}
