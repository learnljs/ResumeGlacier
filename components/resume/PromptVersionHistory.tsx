'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RotateCcw, GitCompare, FileText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils/date'
import type { DiffLine } from '@/lib/services/prompt-service'
import { apiGet, apiPost, apiDelete } from '@/lib/api/client'

interface VersionItem {
  id: string
  version: number
  isCurrent: boolean
  changeNote: string | null
  savedBy: string | null
  createdAt: string
}

interface PromptVersionHistoryProps {
  positionId: string
  positionTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRolledBack: () => void
}

const FIELDS: Array<{ key: keyof DiffResult; label: string }> = [
  { key: 'bodyText', label: '提示词主体' },
  { key: 'knowledgeContent', label: '知识维度' },
  { key: 'skillContent', label: '技能维度' },
  { key: 'overallRules', label: '通用评分规则' },
]

interface DiffResult {
  bodyText: DiffLine[]
  knowledgeContent: DiffLine[]
  skillContent: DiffLine[]
  overallRules: DiffLine[]
}

export function PromptVersionHistory({
  positionId,
  positionTitle,
  open,
  onOpenChange,
  onRolledBack,
}: PromptVersionHistoryProps) {
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [viewVersion, setViewVersion] = useState<number | null>(null)
  const [viewContent, setViewContent] = useState<Record<string, string> | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [diffA, setDiffA] = useState('')
  const [diffB, setDiffB] = useState('')
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [rollingBack, setRollingBack] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      const json = await apiGet<{ versions?: VersionItem[] }>(
        `/api/prompts/positions/${positionId}/versions`
      )
      setVersions(json.versions || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载版本失败')
    } finally {
      setLoading(false)
    }
  }, [positionId])

  useEffect(() => {
    if (open) {
      loadVersions()
      setViewVersion(null)
      setViewContent(null)
      setDiffResult(null)
    }
  }, [open, loadVersions])

  const viewOne = async (version: number) => {
    setViewVersion(version)
    setViewContent(null)
    setViewLoading(true)
    try {
      const json = await apiGet<{
        prompt: { bodyText: string; knowledgeContent: string; skillContent: string; overallRules: string }
      }>(`/api/prompts/positions/${positionId}/versions/${version}`)
      setViewContent({
        bodyText: json.prompt.bodyText,
        knowledgeContent: json.prompt.knowledgeContent,
        skillContent: json.prompt.skillContent,
        overallRules: json.prompt.overallRules,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载版本内容失败')
    } finally {
      setViewLoading(false)
    }
  }

  const runDiff = async () => {
    const a = parseInt(diffA, 10)
    const b = parseInt(diffB, 10)
    if (Number.isNaN(a) || Number.isNaN(b)) {
      toast.error('请选择两个版本进行对比')
      return
    }
    if (a === b) {
      toast.error('请选择两个不同的版本')
      return
    }
    setDiffLoading(true)
    setDiffResult(null)
    try {
      const json = await apiGet<{ diff: DiffResult }>(
        `/api/prompts/positions/${positionId}/diff?v1=${a}&v2=${b}`
      )
      setDiffResult(json.diff)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '对比失败')
    } finally {
      setDiffLoading(false)
    }
  }

  const doDelete = async (version: number) => {
    if (!(await confirmDialog({
      title: `确定删除 v${version} 吗？`,
      description: '此操作不可撤销，该版本内容将永久丢失。',
      confirmText: '删除',
      destructive: true,
    }))) {
      return
    }
    setDeleting(version)
    try {
      const json = await apiDelete<{ message?: string }>(
        `/api/prompts/positions/${positionId}/versions/${version}`,
        { fallbackMessage: '删除失败' }
      )
      toast.success(json.message || `v${version} 已删除`)
      await loadVersions()
      onRolledBack()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleting(null)
    }
  }

  const doRollback = async (version: number) => {
    if (!(await confirmDialog({
      title: `确定回滚到 v${version} 吗？`,
      description: `v${version} 将立即成为当前生效版本。`,
      confirmText: '回滚',
    }))) {
      return
    }
    setRollingBack(version)
    try {
      const json = await apiPost<{ message?: string }>(
        `/api/prompts/positions/${positionId}/rollback`,
        { version },
        { fallbackMessage: '回滚失败' }
      )
      toast.success(json.message || '回滚成功')
      await loadVersions()
      onRolledBack()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '回滚失败')
    } finally {
      setRollingBack(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[88vh] overflow-hidden flex flex-col gap-0 p-0 sm:rounded-xl [&>button]:hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <DialogTitle className="text-base font-semibold">
            版本历史 - {positionTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            查看、对比与回滚该职位的历史 Prompt 版本
          </DialogDescription>
          <DialogClose asChild>
            <button className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </DialogClose>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* 版本列表 */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">版本列表</p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">暂无历史版本</p>
            ) : (
              versions.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg border text-sm',
                    v.isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border',
                  )}
                >
                  <span className="font-mono font-medium w-12">
                    v{v.version}
                  </span>
                  {v.isCurrent && <Badge variant="default" className="text-xs">当前</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(v.createdAt)}
                  </span>
                  {v.savedBy && <span className="text-xs">{v.savedBy}</span>}
                  {v.changeNote && (
                    <span className="text-xs text-muted-foreground flex-1 truncate">
                      {v.changeNote}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 hover:text-foreground hover:bg-muted"
                      onClick={() => viewOne(v.version)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      查看
                    </Button>
                    {!v.isCurrent && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-warning hover:text-warning hover:bg-warning/15"
                          disabled={rollingBack === v.version}
                          onClick={() => doRollback(v.version)}
                        >
                          {rollingBack === v.version ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          回滚
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={deleting === v.version}
                          onClick={() => doDelete(v.version)}
                        >
                          {deleting === v.version ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 单版本内容查看 */}
          {viewVersion !== null && (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">v{viewVersion} 完整内容</p>
              {viewLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                </div>
              ) : viewContent ? (
                FIELDS.map((f) => (
                  <div key={f.key}>
                    <p className="text-xs font-medium text-primary mt-2 mb-1">{f.label}</p>
                    <pre className="text-xs bg-muted/30 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                      {viewContent[f.key]}
                    </pre>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">加载失败</p>
              )}
            </div>
          )}

          {/* 版本对比 */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">版本对比</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="h-8 rounded border border-input bg-background px-2 text-sm"
                value={diffA}
                onChange={(e) => setDiffA(e.target.value)}
              >
                <option value="">版本 A</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>v{v.version}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">↔</span>
              <select
                className="h-8 rounded border border-input bg-background px-2 text-sm"
                value={diffB}
                onChange={(e) => setDiffB(e.target.value)}
              >
                <option value="">版本 B</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>v{v.version}</option>
                ))}
              </select>
              <Button size="sm" className="h-8 gap-1.5" onClick={runDiff} disabled={diffLoading}>
                {diffLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompare className="h-3.5 w-3.5" />}
                对比
              </Button>
            </div>

            {diffResult && (
              <div className="space-y-3">
                {FIELDS.map((f) => {
                  const lines = diffResult[f.key] || []
                  const hasChange = lines.some((l) => l.type !== 'same')
                  return (
                    <div key={f.key}>
                      <p className="text-xs font-medium text-primary mb-1">
                        {f.label}
                        {!hasChange && <span className="text-muted-foreground ml-2">（无变化）</span>}
                      </p>
                      {hasChange && (
                        <pre className="text-xs bg-muted/30 rounded p-2 max-h-60 overflow-auto">
                          {lines.map((l, i) => (
                            <div
                              key={i}
                              className={cn(
                                'min-w-max px-1 whitespace-pre',
                                l.type === 'add' && 'bg-success/15 text-success',
                                l.type === 'del' && 'bg-destructive/15 text-destructive',
                              )}
                            >
                              {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                              {l.text}
                            </div>
                          ))}
                        </pre>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
