'use client'

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

type StarRatingVariant = 'popover' | 'inline'

interface StarRatingProps {
  rating: number | null    // 1-5，null 表示未评分
  onChange?: (rating: number) => void  // 可选，有则可编辑
  size?: 'sm' | 'md' | 'lg'  // 默认 'sm'
  readonly?: boolean       // 默认 false
  /**
   * 编辑交互形态：
   * - 'popover'（默认）：点击展开浮层再选值，清除走「清除」按钮（onChange(0)）
   * - 'inline'：大号星直接点击设值，再次点击同一颗星取消（回调 onClear）
   */
  variant?: StarRatingVariant
  /** 仅 inline 变体：点击当前已选中的星时触发（用于取消评分） */
  onClear?: () => void
  /** rating 为 null 时渲染的内容（如占位符「-」）；不传则渲染 5 颗空星 */
  nullFallback?: ReactNode
}

const starSizes = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
}

export function StarRating({
  rating,
  onChange,
  size = 'sm',
  readonly = false,
  variant = 'popover',
  onClear,
  nullFallback,
}: StarRatingProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const editable = !readonly && !!onChange
  const displayRating = hoverRating ?? rating ?? 0

  // 计算浮层位置
  const updatePickerPosition = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPickerPosition({
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2,
    })
  }, [])

  // 点击外部关闭
  useEffect(() => {
    if (!showPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
        setHoverRating(null)
      }
    }
    // 监听滚动事件，更新浮层位置
    const handleScroll = () => {
      updatePickerPosition()
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [showPicker, updatePickerPosition])

  const handleStarClick = (star: number) => {
    if (!editable) return
    onChange?.(star)
    setShowPicker(false)
    setHoverRating(null)
  }

  const handleTogglePicker = () => {
    if (!editable) return
    if (!showPicker) {
      updatePickerPosition()
    }
    setShowPicker(!showPicker)
  }

  // 未评分且调用方提供占位内容时，直接渲染占位（如「-」），不渲染空星
  if (rating === null && nullFallback !== undefined) {
    return <>{nullFallback}</>
  }

  // inline 变体：大号星直接点击设值，再点同一颗取消
  if (variant === 'inline') {
    return (
      <div className="inline-flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled =
            hoverRating !== null ? star <= hoverRating : rating !== null && star <= rating
          return (
            <button
              key={star}
              type="button"
              disabled={!editable}
              className={cn(
                'p-1 transition-all duration-150',
                editable ? 'cursor-pointer hover:scale-110' : 'cursor-default'
              )}
              onClick={() => (star === rating ? onClear?.() : onChange?.(star))}
              onMouseEnter={() => editable && setHoverRating(star)}
              onMouseLeave={() => setHoverRating(null)}
            >
              <Star
                className={cn(
                  starSizes[size],
                  'transition-colors',
                  isFilled
                    ? 'fill-yellow-400 text-yellow-400'
                    : editable
                      ? 'text-muted-foreground/30'
                      : 'text-muted-foreground/20'
                )}
              />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* 显示区域 */}
      <div
        className={cn(
          'inline-flex items-center gap-0.5',
          editable && 'cursor-pointer'
        )}
        onClick={handleTogglePicker}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              starSizes[size],
              'transition-colors',
              star <= displayRating
                ? 'fill-yellow-400 text-yellow-400'
                : rating !== null
                  ? 'fill-gray-200 text-gray-300'
                  : 'fill-gray-100 text-gray-200'
            )}
          />
        ))}
      </div>

      {/* 编辑浮层 - 使用 fixed 定位，不受父容器滚动影响 */}
      {showPicker && editable && (
        <div
          className="fixed z-[9999] bg-background border rounded-lg shadow-lg p-2"
          style={{
            top: `${pickerPosition.top}px`,
            left: `${pickerPosition.left}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="p-0.5 hover:scale-110 transition-transform"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                onClick={() => handleStarClick(star)}
              >
                <Star
                  className={cn(
                    'h-5 w-5',
                    star <= (hoverRating ?? rating ?? 0)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'fill-gray-200 text-gray-300'
                  )}
                />
              </button>
            ))}
            <button
              type="button"
              className="ml-1 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors"
              onClick={() => handleStarClick(0)}
            >
              清除
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-1">
            {hoverRating ? `${hoverRating}星` : '点击评分'}
          </p>
        </div>
      )}
    </div>
  )
}
