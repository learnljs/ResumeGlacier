'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { TableRowsSkeleton } from '@/components/ui/page-skeleton'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, ChevronDown, ChevronRight, ScrollText, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { PromptEditor } from '@/components/resume/PromptEditor'
import { ResumePageShell } from '@/components/resume/PageShell'
import { apiErrorMessage } from '@/lib/utils/api-message'

interface PositionPromptStatus {
  id: string
  title: string
  department: string | null
  currentVersion: number | null
  savedBy: string | null
  savedAt: string | null
  changeNote: string | null
  totalVersions: number
  configured: boolean
}

interface PromptData {
  bodyText: string
  knowledgeContent: string
  skillContent: string
  overallRules: string
  version: number
}

export default function PromptManagementPage() {
  const [positions, setPositions] = useState<PositionPromptStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [promptData, setPromptData] = useState<PromptData | null>(null)
  const [promptLoading, setPromptLoading] = useState(false)
  const [dirty, setDirty] = useState(false)

  const loadPositions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/prompts/positions')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setPositions(json.positions || [])
    } catch (e) {
      toast.error(apiErrorMessage(e, '加载职位列表失败，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPositions()
  }, [loadPositions])

  const loadPrompt = useCallback(async (positionId: string) => {
    setPromptLoading(true)
    setPromptData(null)
    try {
      const res = await fetch(`/api/prompts/positions/${positionId}`)
      const json = await res.json()
      if (res.status === 404 && json.configured === false) {
        // 未配置，editor 用空模板初始化
        setPromptData(null)
        return
      }
      if (json.error) throw new Error(json.error)
      const p = json.prompt
      setPromptData({
        bodyText: p.bodyText,
        knowledgeContent: p.knowledgeContent,
        skillContent: p.skillContent,
        overallRules: p.overallRules,
        version: p.version,
      })
    } catch (e) {
      toast.error(apiErrorMessage(e, '加载提示词失败，请稍后重试'))
    } finally {
      setPromptLoading(false)
    }
  }, [])

  const tryExpand = async (positionId: string) => {
    const collapsing = positionId === expandedId
    // 脏状态保护（开发方案 7.2）：有未保存修改时先弹窗确认
    if (dirty) {
      const discard = await confirmDialog({
        title: '放弃未保存的修改？',
        description: '当前职位有未保存的修改，切换将丢弃这些修改。',
        confirmText: '放弃修改',
        destructive: true,
      })
      if (!discard) return
      setDirty(false)
    }
    if (collapsing) {
      setExpandedId(null)
      return
    }
    setExpandedId(positionId)
    loadPrompt(positionId)
  }

  const onSaved = () => {
    loadPositions()
    if (expandedId) loadPrompt(expandedId)
  }

  const filtered = positions.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.department || '').toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <ResumePageShell>
    <div className="max-w-3xl space-y-4">
      {/* 标题 + 搜索 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">职位提示词</h2>
          <span className="text-sm text-muted-foreground">
            按职位独立维护评估提示词，保存即生效
          </span>
        </div>
        <div className="relative w-64">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索职位…"
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* 职位列表 */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          {loading ? (
            <TableRowsSkeleton rows={4} className="rounded-none border-0" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              {positions.length === 0 ? '暂无职位' : '无匹配职位'}
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map((p) => (
                <div key={p.id}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => tryExpand(p.id)}
                  >
                    {expandedId === p.id ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium">{p.title}</span>
                    {p.department && (
                      <span className="text-xs text-muted-foreground">{p.department}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {p.configured ? (
                        <Badge variant="outline" className="text-xs">
                          v{p.currentVersion}
                        </Badge>
                      ) : (
                        <span className="text-xs text-warning flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          未配置
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        共 {p.totalVersions} 版
                      </span>
                    </div>
                  </button>

                  {/* 展开后编辑器 */}
                  {expandedId === p.id && (
                    <div className="px-4 pb-4 bg-muted/10 border-t border-border/60">
                      {promptLoading ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-12">
                          <Loader2 className="h-5 w-5 animate-spin" /> 加载提示词…
                        </div>
                      ) : (
                        <div className="pt-4">
                          <PromptEditor
                            positionId={p.id}
                            positionTitle={p.title}
                            initialPrompt={promptData}
                            onDirtyChange={setDirty}
                            onSaved={onSaved}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </ResumePageShell>
  )
}
