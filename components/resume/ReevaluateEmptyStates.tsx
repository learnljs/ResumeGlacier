'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Search } from 'lucide-react'

/** 已查询但无结果（B9 从 page.tsx 提取） */
export function ReevaluateEmptyResult({ onResetFilters }: { onResetFilters: () => void }) {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Users className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">暂无匹配候选人</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          当前筛选条件下没有找到候选人，请尝试调整筛选条件或选择其他岗位
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onResetFilters}
        >
          清除筛选条件
        </Button>
      </CardContent>
    </Card>
  )
}

/** 初始空状态（尚未选择岗位，B9 从 page.tsx 提取） */
export function ReevaluateEmptyInitial() {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <CardContent className="flex flex-col items-center justify-center py-20">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-5">
          <Search className="h-10 w-10 text-primary/40" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">开始简历复用评估</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          选择一个目标岗位，可选设置学历、院校、专业等筛选条件，然后点击"刷新候选人列表"查看候选人
        </p>
        <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</span>
            选择岗位
          </div>
          <span className="text-muted-foreground/30">→</span>
          <div className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</span>
            设置条件
          </div>
          <span className="text-muted-foreground/30">→</span>
          <div className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</span>
            刷新列表
          </div>
          <span className="text-muted-foreground/30">→</span>
          <div className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">4</span>
            发起评估
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
