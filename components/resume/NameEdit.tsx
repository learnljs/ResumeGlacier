'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { apiPatch } from '@/lib/api/client'
import { apiErrorMessage } from '@/lib/utils/api-message'

/**
 * 候选人姓名就地编辑：铅笔进入编辑态，显式「确认」才保存（防误改）
 * Enter 确认 / Esc 取消 / 失焦取消不保存
 */
export default function NameEdit({
  resumeId,
  value,
  onSaved,
}: {
  resumeId: string
  value: string
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
  }

  const cancel = () => {
    if (saving) return
    setEditing(false)
  }

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      toast.error('候选人姓名不能为空')
      return
    }
    if (trimmed.length > 50) {
      toast.error('候选人姓名不能超过50个字符')
      return
    }
    if (trimmed === value) {
      // 名字未变化，直接退出编辑态
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await apiPatch(`/api/resumes/${resumeId}`, { candidateName: trimmed }, {
        fallbackMessage: '保存失败',
      })
      toast.success('姓名已更新')
      setEditing(false)
      onSaved()
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, '保存失败，请稍后重试'))
    } finally {
      setSaving(false)
    }
  }

  // 编辑态：输入框 + 确认/取消（onMouseDown preventDefault 防止点击按钮触发失焦取消）
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          onBlur={cancel}
          maxLength={50}
          autoFocus
          className="h-8 w-40 text-base"
          placeholder="请输入候选人姓名"
        />
        <Button
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
        >
          {saving ? '保存中...' : '确认'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancel}
        >
          取消
        </Button>
      </span>
    )
  }

  // 展示态：名字 + 铅笔（悬停显现）
  return (
    <span className="inline-flex items-center gap-1.5 group/name">
      <span>{value || '未知名称'}</span>
      <button
        type="button"
        onClick={startEdit}
        className="opacity-0 group-hover/name:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
        title="修改姓名"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}
