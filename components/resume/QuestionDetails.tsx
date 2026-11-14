'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { StarRating } from './StarRating'
import type { AiDetailDirection, AiDetailQuestion } from '@/types/ai-detail'

// === 新格式类型（开发方案 4.4 aiDetail） ===
// 阶段二输出瘦身后，text/name 改为可选（AI 不再回吐，由前端按 key 从 prompt 配置取）

/** 题面/方向名查找表：新格式 aiDetail 无 text/name，按 dimension+key 从 prompt 配置取（A1 兼容） */
export interface QuestionLookup {
  textMap: Map<string, string> // key: `${dimension}-${questionKey}` -> 题面
  nameMap: Map<string, string> // key: `${dimension}-${directionIndex}` -> 方向名
  dimensionKey: string
}

interface NewDirectionGroupListProps {
  directions: AiDetailDirection[]
  lookup?: QuestionLookup
}

/**
 * 新格式方向卡片列表（开发方案 4.4）
 *
 * 渲染 aiDetail 中 directions 数组，每个方向可独立折叠，
 * 展开后显示方向评语与逐题（题号 + 题目文本 + 是/否 + evidence）。
 * 题目文本/方向名优先取 aiDetail（旧数据），缺失则按 key 从 prompt 配置取（新数据，A1 兼容）。
 */
export function NewDirectionGroupList({ directions, lookup }: NewDirectionGroupListProps) {
  return (
    <div className="space-y-2">
      {directions.map((dir, i) => (
        <NewDirectionGroup key={i} direction={dir} index={i} lookup={lookup} />
      ))}
    </div>
  )
}

function NewDirectionGroup({
  direction,
  index,
  lookup,
}: {
  direction: AiDetailDirection
  index: number
  lookup?: QuestionLookup
}) {
  const [expanded, setExpanded] = useState(false)
  // 优先用 aiDetail 的 name（旧数据），缺失则从 prompt 配置映射取（新数据，A1 兼容）
  const name =
    direction.name ?? lookup?.nameMap.get(`${lookup.dimensionKey}-${index + 1}`) ?? ''

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-muted/30 transition-colors rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-sm font-medium">{name}</span>
        {direction.star > 0 && (
          <span className="inline-flex items-center">
            <StarRating rating={direction.star} readonly />
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {direction.questions.filter((q) => q.answer).length}/{direction.questions.length}
        </span>
      </button>

      <div
        className={`overflow-hidden transition-[max-height] duration-300 ease ${
          expanded ? 'max-h-[800px]' : 'max-h-0'
        }`}
      >
        <div
          className={`transition-all duration-200 delay-100 ${
            expanded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
          }`}
        >
          <div className="px-2.5 pb-2.5 max-h-96 overflow-y-auto">
            {direction.comment && (
              <p className="text-xs text-muted-foreground italic mb-2 border-l-2 border-muted-foreground/30 pl-2">
                {direction.comment}
              </p>
            )}
            {direction.questions.map((q, qi) => (
              <NewQuestionRow key={qi} question={q} lookup={lookup} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function NewQuestionRow({ question, lookup }: { question: AiDetailQuestion; lookup?: QuestionLookup }) {
  // 优先用 aiDetail 的 text（旧数据），缺失则从 prompt 配置映射取（新数据，A1 兼容）
  const text =
    question.text ?? lookup?.textMap.get(`${lookup.dimensionKey}-${question.key}`) ?? ''

  return (
    <div className="flex flex-col md:flex-row items-start gap-2 text-xs py-1.5 border-b border-muted/30 last:border-b-0">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <span className="text-muted-foreground w-7 flex-shrink-0">{question.key}</span>
        <span className="flex-1 text-foreground/80">{text}</span>
      </div>
      <div className="flex items-start gap-2 flex-shrink-0 ml-0 md:ml-auto">
        <span className={question.answer ? 'text-success' : 'text-destructive/70'}>
          {question.answer ? '✓' : '✗'}
        </span>
        {question.evidence && (
          <span
            className="text-muted-foreground italic truncate max-w-[300px]"
            title={question.evidence}
          >
            「{question.evidence}」
          </span>
        )}
      </div>
    </div>
  )
}
