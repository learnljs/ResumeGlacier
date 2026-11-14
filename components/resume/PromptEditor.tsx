'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2, Save, Eye, History, FileText, Brain, Wrench, Scale, Sparkles, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { REQUIRED_PLACEHOLDER } from '@/lib/services/prompt-assembler'
import { PromptVersionHistory } from './PromptVersionHistory'
import { EvaluationEvidence } from './EvaluationEvidence'
import { apiGet } from '@/lib/api/client'
import { parseAiDetail } from '@/types/ai-detail'

interface PromptData {
  bodyText: string
  knowledgeContent: string
  skillContent: string
  overallRules: string
  version: number
}

interface PreviewScore {
  total: number
  breakdown: Array<{ dim: string; star: number; weight: number; score: number }>
}

interface PromptEditorProps {
  positionId: string
  positionTitle: string
  initialPrompt: PromptData | null
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
}

const SYNTAX_HINT =
  '语法：### 评分规则（保留名，维度专属规则） -> ### 方向名 -> 1.1 问题文本 -> 缩进行 评判标准：xxx'

export function PromptEditor({
  positionId,
  positionTitle,
  initialPrompt,
  onDirtyChange,
  onSaved,
}: PromptEditorProps) {
  const [form, setForm] = useState<PromptData>(
    initialPrompt || {
      bodyText: '',
      knowledgeContent: '### 评分规则\n\n### 方向一\n1.1 问题文本？\n  评判标准：xxx',
      skillContent: '### 评分规则\n\n### 方向一\n1.1 问题文本？\n  评判标准：xxx',
      overallRules: '',
      version: 0,
    },
  )
  const [changeNote, setChangeNote] = useState('')
  const [savedBy, setSavedBy] = useState('')
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // 预览流程
  const [pickerOpen, setPickerOpen] = useState(false)
  const [resumes, setResumes] = useState<Array<{ id: string; fileName: string; candidateName: string | null }>>([])
  const [selectedResumeId, setSelectedResumeId] = useState('')
  const [running, setRunning] = useState(false)
  const [previewResult, setPreviewResult] = useState<Record<string, unknown> | null>(null)
  const [previewScore, setPreviewScore] = useState<PreviewScore | null>(null)
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    setForm(
      initialPrompt || {
        bodyText: '',
        knowledgeContent: '### 评分规则\n\n### 方向一\n1.1 问题文本？\n  评判标准：xxx',
        skillContent: '### 评分规则\n\n### 方向一\n1.1 问题文本？\n  评判标准：xxx',
        overallRules: '',
        version: 0,
      },
    )
    setChangeNote('')
    setPreviewResult(null)
    setPreviewScore(null)
    setPreviewError('')
  }, [initialPrompt])

  // 脏状态由 useMemo 计算，onDirtyChange 由 useEffect 异步通知父组件
  // 避免在 setForm 回调中同步调用父组件 setState（React 不支持跨组件渲染时更新）
  const isDirty = useMemo(() => {
    if (!initialPrompt) return true
    const keys = ['bodyText', 'knowledgeContent', 'skillContent', 'overallRules'] as const
    return keys.some((k) => form[k] !== initialPrompt[k])
  }, [form, initialPrompt])

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const update = (field: keyof PromptData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const validateLocal = (): string[] => {
    const errors: string[] = []
    if (!form.bodyText.trim()) errors.push('提示词主体不能为空')
    else if (form.bodyText.split(REQUIRED_PLACEHOLDER).length - 1 !== 1)
      errors.push(`提示词主体必须包含且仅包含一个 ${REQUIRED_PLACEHOLDER} 占位符`)
    if (!form.overallRules.trim()) errors.push('通用评分规则不能为空')
    if (!form.knowledgeContent.includes('###')) errors.push('知识维度缺少 ### 方向或评分规则')
    if (!form.skillContent.includes('###')) errors.push('技能维度缺少 ### 方向或评分规则')
    return errors
  }

  const loadResumes = useCallback(async () => {
    try {
      // 注：预览 / 保存两处刻意保留原生 fetch —— 需读取非 2xx 响应里的
      // errors 列表与部分 result，apiFetch 会在非 2xx 直接抛错而丢失这些信息
      const json = await apiGet<{
        resumes?: Array<{ id: string; fileName: string; candidateName: string | null }>
        items?: Array<{ id: string; fileName: string; candidateName: string | null }>
      }>(`/api/resumes?pageSize=50&positionId=${encodeURIComponent(positionId)}`)
      const list = (json.resumes || json.items || []).slice(0, 50)
      setResumes(
        list.map((r) => ({
          id: r.id,
          fileName: r.fileName,
          candidateName: r.candidateName,
        })),
      )
    } catch {
      setResumes([])
    }
  }, [positionId])

  const openPicker = () => {
    const errors = validateLocal()
    if (errors.length > 0) {
      toast.error(errors[0])
      return
    }
    setPreviewResult(null)
    setPreviewScore(null)
    setPreviewError('')
    setSelectedResumeId('')
    setPickerOpen(true)
    loadResumes()
  }

  const runPreview = async () => {
    if (!selectedResumeId) {
      toast.error('请选择一份简历作为校验样本')
      return
    }
    setRunning(true)
    setPreviewError('')
    setPreviewResult(null)
    try {
      const res = await fetch('/api/prompts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bodyText: form.bodyText,
          knowledgeContent: form.knowledgeContent,
          skillContent: form.skillContent,
          overallRules: form.overallRules,
          resumeId: selectedResumeId,
          positionId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // 校验失败时优先展示具体 errors 列表 + AI 原始返回，便于定位
        const errs = json.errors ? json.errors.join('；') : json.error || '预览失败'
        setPreviewError(errs)
        if (json.result) {
          setPreviewResult(json.result as Record<string, unknown>)
        }
        return
      }
      setPreviewResult(json.result as Record<string, unknown>)
      setPreviewScore((json.score as PreviewScore | undefined) ?? null)
      toast.success('AI 校验通过，已返回评估结果')
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : '预览失败')
    } finally {
      setRunning(false)
    }
  }

  const handleDirectSave = async () => {
    const errors = validateLocal()
    if (errors.length > 0) {
      toast.error(errors[0])
      return
    }
    setSaving(true)
    try {
      await doSaveInner()
    } finally {
      setSaving(false)
    }
  }

  const doSaveInner = async () => {
    const res = await fetch(`/api/prompts/positions/${positionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bodyText: form.bodyText,
        knowledgeContent: form.knowledgeContent,
        skillContent: form.skillContent,
        overallRules: form.overallRules,
        changeNote,
        savedBy,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      const msg = json.errors ? json.errors.join('；') : json.error || '保存失败'
      toast.error(msg)
      return
    }
    toast.success(json.message || `已保存为 v${json.prompt.version}`)
    setChangeNote('')
    onSaved()
  }

  return (
    <div className="space-y-4">
      {/* 版本信息条 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">当前版本 v{form.version || '?'}</Badge>
          {!initialPrompt && (
            <span className="text-warning flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              尚未配置提示词
            </span>
          )}
          {isDirty && (
            <span className="text-warning flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              有未保存的修改
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-1.5">
          <History className="h-4 w-4" />
          查看版本历史
        </Button>
      </div>

      {/* 编辑区 A：提示词主体 */}
      <EditorCard
        icon={<FileText className="h-4 w-4 text-info" />}
        title="提示词主体"
        description="AI 角色定义、核心任务、JD 解读规则。{{resumeText}} 作为简历文本分界点（实际简历文本追加在 prompt 末尾以启用缓存），必须包含且仅含一个"
        value={form.bodyText}
        onChange={(v) => update('bodyText', v)}
      />

      {/* 编辑区 B：知识维度 */}
      <EditorCard
        icon={<Brain className="h-4 w-4 text-accent" />}
        title="知识维度"
        description={SYNTAX_HINT}
        value={form.knowledgeContent}
        onChange={(v) => update('knowledgeContent', v)}
        minHeight={280}
      />

      {/* 编辑区 C：技能维度 */}
      <EditorCard
        icon={<Wrench className="h-4 w-4 text-success" />}
        title="技能维度"
        description={SYNTAX_HINT}
        value={form.skillContent}
        onChange={(v) => update('skillContent', v)}
        minHeight={280}
      />

      {/* 编辑区 D：通用评分规则 */}
      <EditorCard
        icon={<Scale className="h-4 w-4 text-warning" />}
        title="通用评分规则"
        description="如何综合两个维度得分得出最终星级的规则文本，AI 严格按此打分"
        value={form.overallRules}
        onChange={(v) => update('overallRules', v)}
        minHeight={160}
      />

      {/* 保存人 + 修改说明 + 操作 */}
      <Card className="border-border/60">
        <CardContent className="pt-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">保存人（可选）</label>
              <Input
                value={savedBy}
                onChange={(e) => setSavedBy(e.target.value)}
                placeholder="如：张HR"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">修改说明（可选）</label>
              <Input
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="如：调整行业认知评判标准"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <Button variant="outline" size="sm" onClick={() => openPicker()} className="gap-1.5">
              <Eye className="h-4 w-4" />
              预览校验
            </Button>
            <Button
              size="sm"
              onClick={handleDirectSave}
              disabled={saving || !isDirty}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存为新版本
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 版本历史 */}
      <PromptVersionHistory
        positionId={positionId}
        positionTitle={positionTitle}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRolledBack={onSaved}
      />

      {/* 简历选择 + 预览结果 弹窗 */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0 sm:rounded-xl [&>button]:hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              预览评估结果
            </DialogTitle>
            <DialogDescription className="sr-only">
              选择一份样本简历，运行 AI 评估以校验当前 Prompt 的效果
            </DialogDescription>
            <DialogClose asChild>
              <button className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </DialogClose>
          </div>
          <div className="p-5 overflow-y-auto space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">选择校验样本简历</label>
              <select
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
              >
                <option value="">请选择简历…</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.candidateName || r.fileName}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={runPreview} disabled={running || !selectedResumeId} className="gap-1.5">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              运行 AI 评估
            </Button>

            {previewError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {previewError}
              </div>
            )}

            {previewResult && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                {previewScore && (
                  <div className="rounded-md bg-background/60 p-2.5 text-sm">
                    <span className="font-semibold text-primary">
                      初筛总分：{previewScore.total} 分
                    </span>
                    <span className="text-muted-foreground ml-2">
                      ({previewScore.breakdown.map((b) =>
                        `${b.dim}${b.star}星×${b.weight}%=${b.score}分`
                      ).join(' + ')})
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">AI 评分依据</p>
                  <EvaluationEvidence evaluations={adaptPreviewToEvaluations(previewResult!)} />
                </div>
                <details className="rounded-md bg-background/50 p-2">
                  <summary className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
                    查看原始 JSON 数据
                  </summary>
                  <pre className="text-xs whitespace-pre-wrap max-h-80 overflow-y-auto mt-2">
                    {JSON.stringify(previewResult, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 把预览结果（{knowledge, skill, ...}）适配成 EvaluationEvidence 期望的 evaluations 数组 */
function adaptPreviewToEvaluations(result: Record<string, unknown>) {
  return (['knowledge', 'skill'] as const).map((dimension) => {
    const detail = parseAiDetail(result[dimension])
    return {
      dimension,
      rating: detail.kind === 'new' ? detail.star : null,
      source: 'ai',
      aiDetail: result[dimension] ?? null,
    }
  })
}

function EditorCard({
  icon,
  title,
  description,
  value,
  onChange,
  minHeight = 200,
}: {
  icon: React.ReactNode
  title: string
  description: string
  value: string
  onChange: (v: string) => void
  minHeight?: number
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-muted/40">{icon}</div>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn('text-xs font-mono resize-y leading-relaxed')}
          style={{ minHeight }}
        />
      </CardContent>
    </Card>
  )
}
