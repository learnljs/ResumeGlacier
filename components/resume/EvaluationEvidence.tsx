'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Sparkles, UserCheck, AlertCircle } from 'lucide-react'
import { EVALUATION_DIMENSIONS } from '@/lib/constants/evaluation'
import { NewDirectionGroupList, type QuestionLookup } from './QuestionDetails'
import { StarRating } from './StarRating'
import { apiGet } from '@/lib/api/client'
import {
  parseAiDetail,
  type AiDetail,
  type AiDetailNew,
  type AiDetailLegacyScored,
  type AiDetailLegacyAspects,
  type LegacyDirectionScore,
  type LegacyQuestionAnswer,
} from '@/types/ai-detail'

// === 历史方向映射（仅用于渲染旧格式 aiDetail，scorer 已删除） ===

const LEGACY_DIRECTION_NAMES: Record<string, string> = {
  industry: '行业认知',
  theory: '专业理论',
  tools: '工具方法认知',
  learning: '学习积累',
  practice: '专业实操',
  toolUse: '工具运用',
  output: '业务产出',
  judgment: '专业判断',
}

const LEGACY_KNOWLEDGE_DIRECTIONS: Record<string, string[]> = {
  industry: ['Q1', 'Q2', 'Q3', 'Q4'],
  theory: ['Q5', 'Q6', 'Q7', 'Q8'],
  tools: ['Q9', 'Q10', 'Q11'],
  learning: ['Q12', 'Q13', 'Q14', 'Q15'],
}

const LEGACY_SKILL_DIRECTIONS: Record<string, string[]> = {
  practice: ['Q16', 'Q17', 'Q18', 'Q19'],
  toolUse: ['Q20', 'Q21', 'Q22', 'Q23'],
  output: ['Q24', 'Q25', 'Q26', 'Q27'],
  judgment: ['Q28', 'Q29', 'Q30', 'Q31'],
}

const LEGACY_DIRECTION_ORDER: Record<string, string[]> = {
  knowledge: Object.keys(LEGACY_KNOWLEDGE_DIRECTIONS),
  skill: Object.keys(LEGACY_SKILL_DIRECTIONS),
}

interface EvaluationEvidenceProps {
  evaluations: {
    dimension: string
    rating: number | null
    source: string
    /** 原始 aiDetail（对象 / JSON 字符串 / null 皆可），由 parseAiDetail 归一化 */
    aiDetail: unknown
  }[]
  positionId?: string | null
}

export function EvaluationEvidence({ evaluations, positionId }: EvaluationEvidenceProps) {
  // A1 兼容：新格式 aiDetail 无 text/name，按 key 从 prompt 配置取题面/方向名
  const [textMap, setTextMap] = useState<Map<string, string>>(new Map())
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!positionId) return
    let cancelled = false
    apiGet<{
      questions?: Array<{ dimension: string; direction: string; key: string; text: string }>
    }>(`/api/prompts/questions?positionId=${positionId}`)
      .then((json) => {
        if (cancelled || !json.questions) return
        const tm = new Map<string, string>()
        const nm = new Map<string, string>()
        for (const q of json.questions) {
          tm.set(`${q.dimension}-${q.key}`, q.text)
          nm.set(`${q.dimension}-${q.key.split('.')[0]}`, q.direction)
        }
        setTextMap(tm)
        setNameMap(nm)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [positionId])

  // 筛选出有 aiDetail 的维度（兼容新旧格式，仅知识/技能维度）
  const dimensionsWithEvidence = evaluations.filter(
    (e) => e.aiDetail != null && (e.dimension === 'knowledge' || e.dimension === 'skill')
  )

  if (dimensionsWithEvidence.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">暂无 AI 评分依据</p>
          <p className="text-xs text-muted-foreground mt-1">
            仅对新版 AI 筛选的简历提供评分依据
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI 评分依据
          <Badge variant="outline" className="text-xs">仅供参考</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {dimensionsWithEvidence.map((eval_) => {
          const dimLabel =
            EVALUATION_DIMENSIONS[eval_.dimension as keyof typeof EVALUATION_DIMENSIONS]?.label ||
            eval_.dimension
          const isOverridden = eval_.source === 'manual'

          return (
            <DimensionEvidenceBlock
              key={eval_.dimension}
              dimensionLabel={dimLabel}
              dimensionKey={eval_.dimension}
              rating={eval_.rating}
              aiDetail={parseAiDetail(eval_.aiDetail)}
              isOverridden={isOverridden}
              lookup={{ textMap, nameMap, dimensionKey: eval_.dimension }}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}

function DimensionEvidenceBlock({
  dimensionLabel,
  dimensionKey,
  rating,
  aiDetail,
  isOverridden,
  lookup,
}: {
  dimensionLabel: string
  dimensionKey: string
  rating: number | null
  aiDetail: AiDetail
  isOverridden: boolean
  lookup?: QuestionLookup
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{dimensionLabel}</span>
          {rating !== null && rating > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <StarRating rating={rating} readonly />
              <span>({rating}/5)</span>
            </span>
          )}
          {isOverridden && (
            <Badge variant="secondary" className="text-xs gap-1">
              <UserCheck className="h-3 w-3" />
              HR 已覆盖评分
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t pt-3">
          {aiDetail.kind === 'new' ? (
            <NewFormatEvidence aiDetail={aiDetail} lookup={lookup} />
          ) : aiDetail.kind === 'legacy-scored' ? (
            <LegacyScoredEvidence
              aiDetail={aiDetail}
              directionKeys={LEGACY_DIRECTION_ORDER[dimensionKey] || []}
              dimensionKey={dimensionKey as 'knowledge' | 'skill'}
            />
          ) : aiDetail.kind === 'legacy-aspects' ? (
            <LegacyAspectsEvidence
              aiDetail={aiDetail}
              aspectKeys={LEGACY_DIRECTION_ORDER[dimensionKey] || []}
            />
          ) : (
            <p className="text-xs text-muted-foreground">评分依据格式无法识别</p>
          )}
        </div>
      )}
    </div>
  )
}

/** 新格式（开发方案 4.4）：方向卡片列表 + scoringApplied */
function NewFormatEvidence({ aiDetail, lookup }: { aiDetail: AiDetailNew; lookup?: QuestionLookup }) {
  return (
    <>
      {aiDetail.comment && (
        <p className="text-sm text-muted-foreground bg-muted/10 rounded-md p-3">{aiDetail.comment}</p>
      )}
      <NewDirectionGroupList directions={aiDetail.directions} lookup={lookup} />
      {aiDetail.scoringApplied && (
        <div className="bg-muted/10 rounded-md p-3">
          <span className="text-xs font-medium text-muted-foreground">评分规则应用</span>
          <p className="text-sm mt-1 text-muted-foreground whitespace-pre-wrap">{aiDetail.scoringApplied}</p>
        </div>
      )}
    </>
  )
}

/** 旧格式（ScoredDimension 31 题）：方向卡片 + 多数决 + 保险规则（只读兼容） */
function LegacyScoredEvidence({
  aiDetail,
  directionKeys,
  dimensionKey,
}: {
  aiDetail: AiDetailLegacyScored
  directionKeys: string[]
  dimensionKey: 'knowledge' | 'skill'
}) {
  const voting = aiDetail.voting
  const insurance = aiDetail.insurance
  const questions = aiDetail.questions || {}
  const directions = aiDetail.directions
  const dirMap =
    dimensionKey === 'knowledge' ? LEGACY_KNOWLEDGE_DIRECTIONS : LEGACY_SKILL_DIRECTIONS

  return (
    <>
      <div className="space-y-2">
        {directionKeys.map((dirKey) => {
          const dirScore = directions[dirKey]
          if (!dirScore) return null
          const questionIds = dirMap[dirKey] || []
          return (
            <LegacyDirectionGroup
              key={dirKey}
              dirLabel={LEGACY_DIRECTION_NAMES[dirKey] || dirKey}
              dirScore={dirScore}
              questionIds={questionIds}
              questions={questions}
            />
          )
        })}
      </div>

      {voting?.majorityStar != null && (
        <div className="bg-muted/10 rounded-md p-3">
          <span className="text-xs font-medium text-muted-foreground">多数决</span>
          <p className="text-sm mt-1">
            方向星级 [{voting.directionStars?.join(', ')}] -&gt; {voting.majorityStar} 星
          </p>
          {(voting.adjustments || []).filter(Boolean).map((adj, i) => (
            <p key={i} className="text-xs text-amber-600 mt-1">⚠ {adj}</p>
          ))}
        </div>
      )}

      {(insurance?.overrides || []).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
          <span className="text-xs font-medium text-amber-700">保险规则触发</span>
          {(insurance.overrides || []).map((o, i) => (
            <p key={i} className="text-sm mt-1 text-amber-800">{o}</p>
          ))}
        </div>
      )}
    </>
  )
}

function LegacyDirectionGroup({
  dirLabel,
  dirScore,
  questionIds,
  questions,
}: {
  dirLabel: string
  dirScore: LegacyDirectionScore
  questionIds: string[]
  questions: Record<string, LegacyQuestionAnswer>
}) {
  const [expanded, setExpanded] = useState(false)
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
        <span className="text-sm font-medium">{dirLabel}</span>
        <span className="text-xs text-muted-foreground">
          （{dirScore.yesCount}/{dirScore.totalCount}）
        </span>
        {dirScore.star > 0 && (
          <span className="inline-flex items-center">
            <StarRating rating={dirScore.star} readonly />
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5">
          {questionIds.map((qId) => {
            const q = questions[qId]
            if (!q) return null
            return (
              <div
                key={qId}
                className="flex items-start gap-2 text-xs py-1.5 border-b border-muted/30 last:border-b-0"
              >
                <span className="text-muted-foreground w-7 flex-shrink-0">{qId}</span>
                <span className={q.answer ? 'text-green-600' : 'text-red-400'}>
                  {q.answer ? '✓' : '✗'}
                </span>
                {q.evidence && (
                  <span className="text-muted-foreground italic truncate" title={q.evidence}>
                    「{q.evidence}」
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 旧格式（aspects + reasoning，只读兼容） */
function LegacyAspectsEvidence({
  aiDetail,
  aspectKeys,
}: {
  aiDetail: AiDetailLegacyAspects
  aspectKeys: string[]
}) {
  return (
    <>
      <div className="grid gap-2">
        {aspectKeys.map((key) => {
          const aspect = aiDetail.aspects?.[key]
          const label = LEGACY_DIRECTION_NAMES[key] || key
          return (
            <div key={key} className="bg-muted/20 rounded-md p-2.5">
              <span className="text-xs font-medium text-primary">{label}</span>
              <p className="text-sm mt-1">{aspect ? aspect.signal : 'AI 未提供'}</p>
              {aspect?.excerpt && aspect.excerpt !== 'AI 未提供' && (
                <blockquote className="mt-1.5 border-l-2 border-primary/30 pl-2.5 text-xs text-muted-foreground italic">
                  「{aspect.excerpt}」
                </blockquote>
              )}
            </div>
          )
        })}
      </div>
      {aiDetail.reasoning && (
        <div className="bg-muted/10 rounded-md p-3">
          <span className="text-xs font-medium text-muted-foreground">综合推理</span>
          <p className="text-sm mt-1 text-muted-foreground">{aiDetail.reasoning}</p>
        </div>
      )}
    </>
  )
}
