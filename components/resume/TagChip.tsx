'use client'

import { Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tag } from '@/types/follow-up'

interface TagChipProps {
  tag: Tag
  selected: boolean
  onToggle: (id: string) => void
}

/**
 * 可选择的标签胶囊：选中时以标签色填充，未选中时描边。
 * AI 标签（source === 'ai'）额外显示闪光标识。
 * 用于 FollowUpDialog / BatchFollowUpDialog 的标签选择区。
 */
export function TagChip({ tag, selected, onToggle }: TagChipProps) {
  const isAi = tag.source === 'ai'

  return (
    <button
      type="button"
      onClick={() => onToggle(tag.id)}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border-2 transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'active:scale-95',
        selected
          ? 'border-transparent shadow-sm'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50 bg-background'
      )}
      style={selected ? { backgroundColor: tag.color, color: '#fff' } : { color: tag.color }}
    >
      <span
        className={cn('w-2 h-2 rounded-full transition-all', selected ? 'bg-white/90' : '')}
        style={!selected ? { backgroundColor: tag.color } : undefined}
      />
      {tag.name}
      {isAi && <Sparkles className="h-3 w-3 text-white/70" aria-label="AI 自动标签" />}
      {selected && <Check className="h-3 w-3 ml-0.5" />}
    </button>
  )
}
