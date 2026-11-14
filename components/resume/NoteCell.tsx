'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * 备注单元格：最多显示 2 行，溢出时悬停显示完整内容，点击编辑。
 * 由 follow-up 页从内嵌组件提取（B9）。
 */
export function NoteCell({
  note,
  candidateName,
  recordId,
  onEdit,
}: {
  note: string | null
  candidateName: string
  recordId: string
  onEdit: (id: string, name: string, note: string | null) => void
}) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const el = textRef.current
    if (!el) return
    setIsOverflowing(el.scrollHeight > el.clientHeight)
  }, [note])

  if (!note) {
    return (
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/70 active:scale-95 transition-all duration-150 cursor-pointer"
        onClick={() => onEdit(recordId, candidateName, note)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </span>
    )
  }

  const noteSpan = (
    <span
      ref={textRef}
      className="cursor-pointer hover:text-primary hover:bg-primary/5 px-1.5 py-0.5 rounded transition-all duration-200 inline-block max-w-[200px] overflow-hidden text-ellipsis"
      style={{
        display: '-webkit-inline-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
      onClick={() => onEdit(recordId, candidateName, note)}
      title={undefined}
    >
      {note}
    </span>
  )

  if (!isOverflowing) {
    return noteSpan
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{noteSpan}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[300px] whitespace-pre-wrap break-all"
      >
        {note}
      </TooltipContent>
    </Tooltip>
  )
}
