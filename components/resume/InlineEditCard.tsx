'use client'

import { useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InlineEditCardProps {
  /** 是否展开 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 卡片标题，如 "编辑邮箱配置" */
  title: string
  /** 表单内容 */
  children: React.ReactNode
  /** 自定义类名 */
  className?: string
}

/**
 * 行内编辑卡片 — 在被编辑项正下方展开，带入场/出场动画，
 * 点击卡片外部自动关闭，支持 prefers-reduced-motion。
 */
export function InlineEditCard({ open, onClose, title, children, className }: InlineEditCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 延迟绑定，避免触发编辑的点击事件被误捕获
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, onClose])

  // ESC 键关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={cn(
        // 间距: 8px (mt-2)，与 4/8dp 间距体系一致
        'mt-2 w-full',
        // 进入动画: 200ms ease-out, 从上方 8px 滑入 + 淡入
        'animate-in fade-in slide-in-from-top-2',
        // 出场动画通过父组件条件渲染触发，此组件仅负责进入
        // prefers-reduced-motion 由 tailwindcss-animate 自动处理
        className
      )}
    >
      <Card className="border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="hover:bg-gray-200/60 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  )
}
