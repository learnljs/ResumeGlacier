'use client'

import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import type { Tag } from '@/types/follow-up'

interface SelectedTagsPreviewProps {
  tags: Tag[]
  /** 点击某个已选标签时触发（通常用于取消选择） */
  onRemove: (id: string) => void
}

/**
 * 已选标签预览：点击标签即取消选择。
 * 供 FollowUpDialog / BatchFollowUpDialog 复用（原为两份重复 JSX）。
 */
export function SelectedTagsPreview({ tags, onRemove }: SelectedTagsPreviewProps) {
  if (tags.length === 0) return null

  return (
    <section>
      <h4 className="text-sm font-medium mb-2.5">
        已选标签
        <span className="text-muted-foreground font-normal ml-1">({tags.length})</span>
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag.id}
            className="gap-1.5 cursor-pointer pr-1.5 transition-all duration-150 hover:opacity-90 active:scale-95"
            style={{ backgroundColor: tag.color, color: '#fff' }}
            onClick={() => onRemove(tag.id)}
          >
            {tag.name}
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
              <X className="h-2.5 w-2.5" />
            </span>
          </Badge>
        ))}
      </div>
    </section>
  )
}
