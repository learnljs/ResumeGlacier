'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Users, Sparkles, Star } from 'lucide-react'

/** 简历复用评估页统计概要（候选人数 / 已评估 / 平均得分），B9 从 page.tsx 提取 */
export function ReevaluateStatsCards({
  candidateCount,
  evaluatedCount,
  avgScore,
}: {
  candidateCount: number
  evaluatedCount: number
  avgScore: number | null
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">候选人数</p>
            <p className="text-xl font-bold tabular-nums">{candidateCount}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-success/5 to-success/10 border-success/20">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
            <Sparkles className="h-4.5 w-4.5 text-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">已评估</p>
            <p className="text-xl font-bold tabular-nums">{evaluatedCount}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-secondary/30 to-secondary/50">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center">
            <Star className="h-4.5 w-4.5 text-warning fill-amber-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">平均得分</p>
            <p className="text-xl font-bold tabular-nums">{avgScore ?? '-'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
