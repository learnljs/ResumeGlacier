'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { X, Save } from 'lucide-react'
import { toast } from 'sonner'
import { type DimensionKey } from '@/lib/constants/evaluation'
import { DimensionLabel } from '@/components/resume/DimensionLabel'
import { StarRating } from '@/components/resume/StarRating'
import { apiPost } from '@/lib/api/client'
import { apiErrorMessage } from '@/lib/utils/api-message'

interface DimensionEvaluatorProps {
  resumeId: string
  positionId: string | null
  dimension: DimensionKey
  rating: number | null
  comment: string | null
  editable: boolean
  onSave: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DimensionEvaluator({
  resumeId,
  positionId,
  dimension,
  rating: initialRating,
  comment: initialComment,
  editable,
  onSave,
  open,
  onOpenChange,
}: DimensionEvaluatorProps) {
  const [rating, setRating] = useState<number | null>(initialRating)
  const [comment, setComment] = useState(initialComment || '')
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 同步外部数据
  useEffect(() => {
    setRating(initialRating)
    setComment(initialComment || '')
  }, [initialRating, initialComment])

  // 点击外部区域关闭
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      // 检查点击是否在编辑框外部
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // 检查点击是否在维度标签上（避免点击维度时立即关闭）
        const target = event.target as HTMLElement
        if (!target.closest('[data-dimension-click]')) {
          onOpenChange(false)
        }
      }
    }

    // 延迟添加事件监听，避免当前点击立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onOpenChange])

  const handleSave = async () => {
    if (!editable) return

    setSaving(true)
    try {
      await apiPost('/api/evaluations', {
        resumeId,
        positionId,
        dimensions: [
          {
            dimension,
            rating,
            comment: comment.trim() || null,
          },
        ],
        source: 'manual',
      }, { fallbackMessage: '保存失败' })

      toast.success('评分保存成功')
      onSave()
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '保存失败，请稍后重试')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg animate-in slide-in-from-bottom-2 duration-200"
    >
      <div className="container max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-start gap-6">
          {/* 左侧：维度信息和关闭按钮 */}
          <div className="flex items-center gap-3 min-w-[120px]">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <div>
              <h4 className="font-medium text-sm flex items-center gap-1">评估: <DimensionLabel dimension={dimension} /></h4>
              {!editable && (
                <p className="text-xs text-muted-foreground">只读模式</p>
              )}
            </div>
          </div>

          {/* 中间：星级评分 */}
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">星级评分</label>
            <div className="flex items-center gap-1">
              <StarRating
                rating={rating}
                onChange={setRating}
                onClear={() => setRating(null)}
                size="lg"
                variant="inline"
                readonly={!editable}
              />
              {rating !== null && (
                <>
                  <span className="ml-2 text-sm font-medium text-muted-foreground">
                    {rating}/5
                  </span>
                  <button
                    type="button"
                    className="ml-1 p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors"
                    onClick={() => setRating(null)}
                    title="清除评分"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {rating === null && editable && (
                <span className="ml-2 text-xs text-muted-foreground">
                  点击选择 1-5 星
                </span>
              )}
            </div>
          </div>

          {/* 右侧：文本评价 */}
          <div className="flex-1 max-w-md space-y-2">
            <label className="text-xs font-medium text-muted-foreground">文本评价</label>
            <div className="relative">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                placeholder="输入对该维度的评价..."
                disabled={!editable}
                rows={2}
                className="resize-none text-sm pr-16"
              />
              <span className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                {comment.length}/500
              </span>
            </div>
          </div>

          {/* 操作按钮 */}
          {editable && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="gap-1"
              >
                {saving ? (
                  <>保存中...</>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    保存
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
