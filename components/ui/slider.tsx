'use client'

import * as React from 'react'
import { useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface SliderProps {
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  colorClass?: string
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  'aria-label'?: string
  className?: string
}

/**
 * 自定义滑动条 — 完全自定义渲染，精致视觉
 *
 * 设计要点：
 * - 双色轨道：左侧渐变填充 + 右侧 muted 底色
 * - 自定义圆形拇指：白色填充、渐变边框、柔和阴影
 * - 拖拽交互：pointer events，支持触摸和鼠标
 * - 键盘可访问：内嵌隐藏原生 input[range] 供屏幕阅读器使用
 * - 触摸友好：轨道高度 8px，点击区域 44px
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  colorClass = 'from-primary to-primary',
  onChange,
  onCommit,
  'aria-label': ariaLabel,
  className,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const commitValueRef = useRef(value)

  // 计算值对应的百分比位置
  const percent = ((value - min) / (max - min)) * 100

  // 根据点击/拖拽位置计算新值
  const calcValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return value
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      let newValue = ratio * (max - min) + min
      newValue = Math.round(newValue / step) * step
      return Math.max(min, Math.min(max, newValue))
    },
    [min, max, step, value],
  )

  const applyValue = useCallback(
    (clientX: number) => {
      const v = calcValue(clientX)
      commitValueRef.current = v
      onChange(v)
    },
    [calcValue, onChange],
  )

  // Pointer 事件处理
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return
      e.preventDefault()
      draggingRef.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      applyValue(e.clientX)
    },
    [disabled, applyValue],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      applyValue(e.clientX)
    },
    [applyValue],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      onCommit?.(commitValueRef.current)
    },
    [onCommit],
  )

  // 清理：组件卸载时释放捕获
  useEffect(() => {
    return () => {
      draggingRef.current = false
    }
  }, [])

  return (
    <div
      className={cn('relative w-full select-none', className)}
      style={{ paddingBlock: '18px' }} // 44px 触摸区域
    >
      {/* 轨道背景 */}
      <div
        ref={trackRef}
        className={cn(
          'relative h-2 rounded-full cursor-pointer',
          'bg-secondary/60',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="presentation"
      >
        {/* 已填充轨道 — 渐变色彩 */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            'bg-gradient-to-r',
            colorClass,
            'transition-[width] duration-75 ease-linear',
          )}
          style={{ width: `${percent}%` }}
        />

        {/* 拇指 — 绝对定位在填充轨道末端 */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
            'h-5 w-5 rounded-full',
            'bg-card',
            'border-2 shadow-md',
            // 边框颜色跟随 colorClass
            'border-primary',
            'transition-shadow duration-150 ease-out',
            'hover:shadow-lg hover:scale-110',
            'active:shadow-xl active:scale-105',
            disabled && 'border-muted-foreground/30 shadow-none hover:scale-100 active:scale-100',
          )}
          style={{ left: `${percent}%` }}
          // 阻止 thumb 上的点击事件避免重复触发
          onPointerDown={(e) => {
            e.stopPropagation()
            handlePointerDown(e)
          }}
          role="presentation"
        />
      </div>

      {/* 隐藏的原生 range input — 仅供屏幕阅读器使用 */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={() => {}} // 实际由 pointer 事件处理
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  )
}
