'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { EvaluationRadar } from '@/components/resume/EvaluationRadar'
import { EvaluationEvidence } from '@/components/resume/EvaluationEvidence'
import type { EvaluationData } from '@/types/resume-detail'

/**
 * 详情页「评估结果」Tab。
 *
 * 左侧维度评分卡（点击可编辑）+ 下方评估证据。
 * 原右侧「得分计算」卡已移除：权重模型每个职位每分类唯一后，
 * 这里不再有「多模型对比」可看，单独一列会大面积留白。
 */
export function ResumeDetailEvaluationTab({
  evaluations,
  editableDimensions,
  loadingEvaluations,
  onDimensionClick,
  selectedPositionId,
}: {
  evaluations: EvaluationData[]
  /** 当前上下文下允许编辑的维度 key */
  editableDimensions: string[]
  loadingEvaluations: boolean
  onDimensionClick: (dimension: string) => void
  selectedPositionId: string | null
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">评估维度</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {loadingEvaluations ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <EvaluationRadar
              evaluations={evaluations}
              editableDimensions={editableDimensions}
              onDimensionClick={onDimensionClick}
              columns={3}
            />
          )}
          <p className="text-xs text-muted-foreground text-center mt-2">
            点击维度可编辑评分
          </p>
        </CardContent>
      </Card>

      <EvaluationEvidence evaluations={evaluations} positionId={selectedPositionId} />
    </div>
  )
}
