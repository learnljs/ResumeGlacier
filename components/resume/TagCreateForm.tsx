'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TAG_COLORS } from '@/lib/constants/tags'

interface TagCreateFormProps {
  /** 标签名称（受控） */
  name: string
  /** 选中的颜色（受控） */
  color: string
  /** 提交中 */
  creating: boolean
  onNameChange: (name: string) => void
  onColorChange: (color: string) => void
  /** 点击「创建」或按 Enter */
  onCreate: () => void
  /** 点击「取消」或按 Esc */
  onCancel: () => void
}

/**
 * 新建标签表单：名称输入 + 颜色选择 + 创建/取消。
 * 供 FollowUpDialog / BatchFollowUpDialog 复用（原为两份逐字重复的 JSX）。
 */
export function TagCreateForm({
  name,
  color,
  creating,
  onNameChange,
  onColorChange,
  onCreate,
  onCancel,
}: TagCreateFormProps) {
  return (
    <section className="rounded-lg border bg-muted/10 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <h4 className="text-sm font-medium">新建标签</h4>

      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="输入标签名称，如: 0625"
          className="h-9 flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCreate()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <Button
          size="sm"
          onClick={onCreate}
          disabled={creating || !name.trim()}
          className="h-9 gap-1.5 shrink-0"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '创建'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-9 shrink-0">
          取消
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">颜色：</span>
        <div className="flex items-center gap-1.5">
          {TAG_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onColorChange(preset)}
              aria-label={`选择颜色 ${preset}`}
              className={cn(
                'w-6 h-6 rounded-full transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'active:scale-90',
                color === preset ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
