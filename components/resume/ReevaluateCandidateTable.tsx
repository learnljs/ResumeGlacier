'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserPlus } from 'lucide-react'
import { StarRating } from '@/components/resume/StarRating'
import { ReevaluateScoreBadge } from '@/components/resume/ReevaluateScoreBadge'
import type { RefObject, MouseEvent } from 'react'
import type { ReevaluateCandidate } from '@/types/reevaluate'

/** 根据毕业年份生成展示文案 */
function formatGraduationText(graduationYear: number | null): string | null {
  if (graduationYear == null) return null
  const currentYear = new Date().getFullYear()
  if (graduationYear > currentYear) return '在读'
  if (graduationYear === currentYear) return '应届'
  return `毕业 ${currentYear - graduationYear} 年`
}

/**
 * 简历复用评估页候选人表格（B9 从 page.tsx 提取）。
 * 三态全选 checkbox + 候选人/投递岗位/接收时间/学历/专业/知识/技能/得分/跟进列。
 */
export function ReevaluateCandidateTable({
  candidates,
  paginatedCandidates,
  selectedIds,
  headerCheckboxRef,
  onToggleSelectAll,
  onToggleSelect,
  selectedPositionId,
  onFollowUp,
  onEnsureStateSaved,
  onWriteNavSnapshot,
}: {
  candidates: ReevaluateCandidate[]
  paginatedCandidates: ReevaluateCandidate[]
  selectedIds: Set<string>
  headerCheckboxRef: RefObject<HTMLInputElement | null>
  onToggleSelectAll: (e?: MouseEvent) => void
  onToggleSelect: (id: string) => void
  selectedPositionId: string
  onFollowUp: (c: ReevaluateCandidate) => void
  /** 跳转详情前保存批次/筛选/滚动状态 */
  onEnsureStateSaved: () => void
  /** 跳转详情前写入连续浏览导航快照 */
  onWriteNavSnapshot: () => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60">
            <th className="py-3.5 pl-6 pr-2 w-10">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                onClick={onToggleSelectAll}
                checked={candidates.length > 0 && selectedIds.size === candidates.length}
                readOnly
                className="rounded border-muted-foreground/30 cursor-pointer h-4 w-4 accent-primary transition-colors"
                aria-label="全选（Shift+点击仅选当前页）"
                title="全选所有候选人（Shift+点击仅选当前页）"
              />
            </th>
            <th className="py-3.5 pr-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              候选人
            </th>
            <th className="py-3.5 pr-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              投递岗位
            </th>
            <th className="py-3.5 pr-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              接收时间
            </th>
            <th className="py-3.5 pl-12 pr-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              学历
            </th>
            <th className="py-3.5 pl-6 pr-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              专业
            </th>
            <th className="py-3.5 pl-0 pr-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              知识
            </th>
            <th className="py-3.5 pr-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              技能
            </th>
            <th className="py-3.5 pr-6 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              初筛得分
            </th>
            <th className="py-3.5 pr-6 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              跟进
            </th>
          </tr>
        </thead>
        <tbody>
          {paginatedCandidates.map((c, index) => (
            <tr
              key={c.id}
              className={`border-b border-muted-foreground/[0.08] transition-all duration-200 hover:bg-primary/[0.04] ${
                selectedIds.has(c.id) ? 'bg-primary/[0.06] shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''
              }`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <td className="py-3.5 pl-6 pr-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => onToggleSelect(c.id)}
                  className="rounded border-muted-foreground/30 cursor-pointer h-4 w-4 accent-primary transition-colors"
                  aria-label={`选择 ${c.candidateName}`}
                />
              </td>
              <td className="py-3.5 pr-4">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/resume/detail/${c.id}?from=/resume/reevaluate&positionId=${selectedPositionId}`}
                    className="text-primary font-semibold transition-colors hover:text-primary/80"
                    onClick={() => { onEnsureStateSaved(); onWriteNavSnapshot() }}
                  >
                    {c.candidateName}
                  </Link>
                  {c.gender && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {c.gender}
                    </span>
                  )}
                  {c.evaluated && (
                    <Badge variant="success" className="text-[10px] px-1.5 py-0">
                      已评估
                    </Badge>
                  )}
                </div>
                {c.school && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px]">
                    {c.school}
                    {c.graduationYear != null && (
                      <> · {formatGraduationText(c.graduationYear)}</>
                    )}
                  </p>
                )}
              </td>
              <td className="py-3.5 pr-4">
                <span
                  className="text-muted-foreground truncate max-w-[160px] block"
                  title={c.positionTitle || undefined}
                >
                  {c.positionTitle || '-'}
                </span>
              </td>
              <td className="py-3.5 pr-4">
                <span className="text-muted-foreground whitespace-nowrap">
                  {c.sourceEmailReceivedAt
                    ? new Date(c.sourceEmailReceivedAt).toISOString().slice(0, 10)
                    : '-'}
                </span>
              </td>
              <td className="py-3.5 pl-12 pr-10">
                <span className={c.education ? 'font-medium' : 'text-muted-foreground'}>
                  {c.education || '-'}
                </span>
              </td>
              <td className="py-3.5 pl-6 pr-2">
                <span className="text-muted-foreground truncate max-w-[160px] block" title={c.major || undefined}>
                  {c.major || '-'}
                </span>
              </td>
              <td className="py-3.5 pl-0 pr-4">
                <div className="flex justify-center">
                  <StarRating
                    rating={c.knowledgeRating}
                    readonly
                    size="sm"
                    nullFallback={<span className="text-muted-foreground text-xs">-</span>}
                  />
                </div>
              </td>
              <td className="py-3.5 pr-4">
                <div className="flex justify-center">
                  <StarRating
                    rating={c.skillRating}
                    readonly
                    size="sm"
                    nullFallback={<span className="text-muted-foreground text-xs">-</span>}
                  />
                </div>
              </td>
              <td className="py-3.5 pr-6">
                <div className="flex justify-center">
                  <ReevaluateScoreBadge score={c.initialScore} />
                </div>
              </td>
              <td className="py-3.5 pr-6">
                <div className="flex justify-center">
                  {c.evaluated ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                      onClick={() => onFollowUp(c)}
                      aria-label={`跟进 ${c.candidateName}`}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground/30 cursor-not-allowed"
                          disabled
                          aria-label={`${c.candidateName} 评估完成后可跟进`}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p className="text-xs">评估完成后可跟进</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 表格加载骨架屏（B9 从 page.tsx 提取） */
export function ReevaluateTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="py-3 pl-6 pr-2 w-10"><div className="h-4 w-4 bg-muted rounded" /></th>
            <th className="py-3.5 pr-4"><div className="h-3 w-16 bg-muted rounded" /></th>
            <th className="py-3.5 pr-4"><div className="h-3 w-16 bg-muted rounded" /></th>
            <th className="py-3.5 pr-4"><div className="h-3 w-20 bg-muted rounded" /></th>
            <th className="py-3.5 pl-12 pr-10"><div className="h-3 w-12 bg-muted rounded" /></th>
            <th className="py-3.5 pl-6 pr-2"><div className="h-3 w-12 bg-muted rounded" /></th>
            <th className="py-3.5 pl-0 pr-4"><div className="h-3 w-10 bg-muted rounded mx-auto" /></th>
            <th className="py-3.5 pr-4"><div className="h-3 w-10 bg-muted rounded mx-auto" /></th>
            <th className="py-3.5 pr-6"><div className="h-3 w-14 bg-muted rounded mx-auto" /></th>
            <th className="py-3.5 pr-6"><div className="h-3 w-8 bg-muted rounded mx-auto" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b animate-pulse">
      <td className="py-3 pr-2"><div className="h-4 w-4 bg-muted rounded" /></td>
      <td className="py-3.5 pr-4">
        <div className="h-4 w-24 bg-muted rounded mb-1.5" />
        <div className="h-3 w-32 bg-muted/60 rounded" />
      </td>
      <td className="py-3.5 pr-4"><div className="h-3 w-16 bg-muted rounded" /></td>
      <td className="py-3.5 pr-4"><div className="h-4 w-16 bg-muted rounded" /></td>
      <td className="py-3.5 pl-12 pr-10"><div className="h-4 w-12 bg-muted rounded" /></td>
      <td className="py-3.5 pl-6 pr-2"><div className="h-4 w-20 bg-muted rounded" /></td>
      <td className="py-3.5 pl-0 pr-4"><div className="h-4 w-16 bg-muted rounded" /></td>
      <td className="py-3.5 pr-4"><div className="h-4 w-16 bg-muted rounded" /></td>
      <td className="py-3.5 pr-4"><div className="h-6 w-10 bg-muted rounded-full" /></td>
      <td className="py-3.5 pr-4"><div className="h-8 w-8 bg-muted rounded" /></td>
    </tr>
  )
}
