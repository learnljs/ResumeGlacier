'use client'

import { FollowUpDialog } from '@/components/resume/FollowUpDialog'
import { BatchFollowUpDialog } from '@/components/resume/BatchFollowUpDialog'
import type { ReevaluateCandidate } from '@/types/reevaluate'

/**
 * 简历复用评估页的跟进弹窗组（B9 从 page.tsx 提取）。
 * 单份跟进：仅已评估的候选人可打开；批量跟进：仅对已勾选且已评估的候选人。
 */
export function ReevaluateFollowUpDialogs({
  candidate,
  onCloseCandidate,
  onCandidateSuccess,
  batchOpen,
  onCloseBatch,
  batchCandidates,
  selectedPositionId,
  selectedPositionTitle,
  onBatchSuccess,
}: {
  /** 单份跟进目标（null 时不渲染） */
  candidate: ReevaluateCandidate | null
  onCloseCandidate: () => void
  onCandidateSuccess: (resumeId: string) => void
  batchOpen: boolean
  onCloseBatch: () => void
  batchCandidates: ReevaluateCandidate[]
  selectedPositionId: string
  selectedPositionTitle: string
  onBatchSuccess: () => void
}) {
  return (
    <>
      {/* ========== 单份跟进弹窗 ========== */}
      {candidate && (
        <FollowUpDialog
          open={!!candidate}
          onClose={onCloseCandidate}
          resumeId={candidate.id}
          resumeName={candidate.candidateName}
          evaluationId={candidate.evaluationId || undefined}
          defaultEvaluationId={candidate.evaluationId || undefined}
          positionScores={
            candidate.evaluated && candidate.evaluationId
              ? [{
                  positionId: selectedPositionId,
                  positionTitle: selectedPositionTitle,
                  evaluationId: candidate.evaluationId,
                  hasFollowUp: false,
                  initialScore: candidate.initialScore,
                  compositeScore: null,
                }]
              : []
          }
          aiTagNames={candidate.aiTags}
          onSuccess={() => onCandidateSuccess(candidate.id)}
        />
      )}

      {/* ========== 批量跟进弹窗 ========== */}
      <BatchFollowUpDialog
        open={batchOpen}
        onClose={onCloseBatch}
        resumeIds={batchCandidates.map((c) => c.id)}
        evaluationIds={batchCandidates.map((c) => c.evaluationId || '')}
        candidateNames={batchCandidates.map((c) => c.candidateName)}
        onSuccess={onBatchSuccess}
      />
    </>
  )
}
