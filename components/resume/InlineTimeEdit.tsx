'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2, Pencil, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { apiPatch } from '@/lib/api/client'
import { apiErrorMessage } from '@/lib/utils/api-message'

// ==================== 类型 ====================

interface InlineTimeEditProps {
  /** 当前值（ISO datetime 或 date 字符串） */
  value: string | null
  /** 记录 ID */
  recordId: string
  /** 字段名：'interviewTime' | 'startDate' | 'resignedAt' */
  field: 'interviewTime' | 'startDate' | 'resignedAt'
  /** 显示格式 */
  displayFormat: (v: string | null) => string
  /** 保存成功回调 */
  onSaved: () => void
  /** 验证函数，返回错误消息或 null */
  validate?: (v: string) => string | null
  /** 最小日期时间限制（ISO 字符串或 null 表示无限制） */
  min?: string | null
  /** 其他字段的值（用于跨字段校验，如入职时间需晚于面试时间） */
  crossCheckValue?: string | null
  /** 跨字段校验错误提示标签 */
  crossCheckLabel?: string
  /** 保存前二次确认提示文案，设置后在保存前弹出 confirm（用于离职日期等慎重操作） */
  confirmMessage?: string
}

// ==================== 组件 ====================

export function InlineTimeEdit({
  value,
  recordId,
  field,
  displayFormat,
  onSaved,
  validate,
  min,
  crossCheckValue,
  crossCheckLabel,
  confirmMessage,
}: InlineTimeEditProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const inputType = field === 'interviewTime' ? 'datetime-local' : 'date'
  const fieldLabel = field === 'interviewTime' ? '面试时间' : field === 'startDate' ? '入职时间' : '离职日期'

  // 进入编辑模式
  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation() // 阻止触发行双击日志
    // 初始化为当前值或空
    setEditValue(value || '')
    setEditing(true)
  }

  // 退出编辑
  const cancelEdit = () => {
    setEditing(false)
    setEditValue('')
  }

  // 自动聚焦
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  // 保存
  const saveEdit = async () => {
    const trimmed = editValue.trim()

    // 空值处理：等同于清除
    if (!trimmed) {
      if (!value) {
        cancelEdit()
        return // 本来就是空，无需保存
      }
    }

    // 值未变化
    if (trimmed === (value || '')) {
      cancelEdit()
      return
    }

    // 前端校验
    if (trimmed) {
      // 自定义校验
      if (validate) {
        const err = validate(trimmed)
        if (err) {
          toast.error(apiErrorMessage(err))
          return
        }
      }

      // 跨字段校验
      if (crossCheckValue && crossCheckLabel) {
        if (field === 'startDate' && crossCheckValue) {
          // 入职时间应晚于面试时间
          const interviewDate = crossCheckValue.includes('T')
            ? crossCheckValue.slice(0, 10)
            : crossCheckValue
          if (trimmed <= interviewDate) {
            toast.error(`入职时间必须晚于${crossCheckLabel}`)
            return
          }
        }
      }

      // min 校验
      if (min) {
        if (trimmed < min) {
          toast.error(`${fieldLabel}不能早于当前时间`)
          return
        }
      }
    }

    // 二次确认（离职日期等慎重操作）
    if (confirmMessage && !(await confirmDialog({ title: confirmMessage }))) {
      cancelEdit()
      return
    }

    // 保存
    setSaving(true)
    const previousValue = value
    try {
      await apiPatch(`/api/follow-up/records/${recordId}`, { [field]: trimmed || null }, {
        fallbackMessage: '保存失败',
      })

      toast.success(`${fieldLabel}已更新`)
      setEditing(false)
      onSaved()
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '保存失败，请稍后重试')
      toast.error(msg)
      // 回滚：保持编辑状态，用户可以重试
    } finally {
      setSaving(false)
    }
  }

  // 键盘处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  // 编辑模式
  if (editing) {
    return (
      <div
        className="inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type={inputType}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={saveEdit} // 失焦自动保存
          min={min || undefined}
          disabled={saving}
          className={cn(
            'h-7 px-1.5 text-xs rounded border border-input bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
            'disabled:opacity-50',
          )}
        />
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <>
            <button
              onClick={saveEdit}
              className="p-0.5 rounded hover:bg-success/15 text-success shrink-0"
              title="确认"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={cancelEdit}
              className="p-0.5 rounded hover:bg-destructive/15 text-destructive shrink-0"
              title="取消"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    )
  }

  // 展示模式
  const display = displayFormat(value)
  const hasValue = value !== null && value !== ''

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 group cursor-pointer',
        'px-1.5 py-0.5 rounded transition-all duration-150',
        'hover:bg-muted/60',
        hasValue ? 'text-foreground' : 'text-muted-foreground',
      )}
      onClick={startEdit}
      title={`点击编辑${fieldLabel}`}
    >
      <span className="text-xs">{display}</span>
      <Pencil className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}
