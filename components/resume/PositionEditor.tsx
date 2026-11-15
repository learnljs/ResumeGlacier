'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Save, ArrowLeft, Ban, Play, Trash2, AlertTriangle,
  Briefcase, FileText, Tag, Hash, Building2, Info, ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { WeightModelEditor } from './WeightModelEditor'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { apiFetch, apiGet, apiPut, apiDelete } from '@/lib/api/client'
import type { WeightModelRecord } from '@/types/resume-detail'
import { apiErrorMessage } from '@/lib/utils/api-message'

interface PositionData {
  id: string
  title: string
  department: string | null
  description: string
  requirements: string
  keywords: string | null
  status: string
  defaultInitialModelId: string | null
  defaultIcebergModelId: string | null
  weightModels: WeightModelRecord[]
  _count?: { resumes: number }
}

interface PositionEditorProps {
  position: PositionData | null
}

/**
 * 职位编辑器：职位的新建与编辑表单。
 *
 * 维护职位基础信息（标题 / 部门 / 描述 / 要求）与两套权重模型
 * （initial 初筛、iceberg 冰山），并处理启用、停用、删除。
 * 由 system-config/positions 的新建页与详情页共用。
 */
export function PositionEditor({ position }: PositionEditorProps) {
  const router = useRouter()
  const isNew = !position
  const isDisabled = position?.status === 'disabled'

  // 基本信息表单
  const [form, setForm] = useState({
    title: position?.title || '',
    department: position?.department || '',
    description: position?.description || '',
    requirements: position?.requirements || '',
    keywords: position?.keywords || '',
  })
  const [saving, setSaving] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // 权重模型数据
  const [weightModels, setWeightModels] = useState<WeightModelRecord[]>(position?.weightModels || [])

  // 跟踪表单变更
  const trackChange = (updates: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...updates }))
    if (position) {
      const original = {
        title: position.title || '',
        department: position.department || '',
        description: position.description || '',
        requirements: position.requirements || '',
        keywords: position.keywords || '',
      }
      const current = { ...form, ...updates }
      setHasUnsavedChanges(
        current.title !== original.title ||
        current.department !== original.department ||
        current.description !== original.description ||
        current.requirements !== original.requirements ||
        current.keywords !== original.keywords
      )
    }
  }

  const loadWeightModels = useCallback(async () => {
    if (isNew) return
    try {
      const json = await apiGet<{ models?: WeightModelRecord[] }>(
        `/api/positions/${position!.id}/weight-models`
      )
      setWeightModels(json.models || [])
    } catch {
      // 静默处理
    }
  }, [isNew, position])

  useEffect(() => {
    if (position) {
      setForm({
        title: position.title,
        department: position.department || '',
        description: position.description,
        requirements: position.requirements,
        keywords: position.keywords || '',
      })
      setWeightModels(position.weightModels || [])
      setHasUnsavedChanges(false)
    }
  }, [position])

  const handleSave = async () => {
    if (!form.title || !form.requirements) {
      toast.error('职位名称和筛选要求为必填项')
      return
    }
    setSaving(true)
    try {
      const url = isNew ? '/api/positions' : `/api/positions/${position!.id}`
      const json = await apiFetch<{ position: { id: string } }>(url, {
        method: isNew ? 'POST' : 'PUT',
        body: form,
        fallbackMessage: '保存失败',
      })

      if (isNew) {
        toast.success('职位创建成功')
        router.push(`/resume/system-config/positions/${json.position.id}`)
      } else {
        toast.success('职位信息已更新')
        setHasUnsavedChanges(false)
      }
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '保存失败，请稍后重试')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!position) return
    const newStatus = position.status === 'active' ? 'disabled' : 'active'
    const actionLabel = newStatus === 'disabled' ? '停用' : '启用'

    if (newStatus === 'disabled' && !(await confirmDialog({
      title: `确定要停用职位「${position.title}」吗？`,
      description: '停用后：\n• 职位信息和权重模型将不可修改\n• 已关联的简历不受影响\n• 可随时重新启用',
      confirmText: '停用',
    }))) return

    setStatusChanging(true)
    try {
      await apiPut(`/api/positions/${position.id}`, { status: newStatus }, {
        fallbackMessage: `${actionLabel}失败`,
      })
      toast.success(`职位已${actionLabel}`)
      router.refresh()
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, `${actionLabel}失败，请稍后重试`)
      toast.error(msg)
    } finally {
      setStatusChanging(false)
    }
  }

  const handleDelete = async () => {
    if (!position) return
    const resumeCount = position._count?.resumes || 0

    if (resumeCount > 0) {
      toast.error(`该职位存在 ${resumeCount} 条关联简历，不可删除，请先停用`)
      return
    }

    if (!(await confirmDialog({
      title: `确定要永久删除职位「${position.title}」吗？`,
      description: '此操作不可撤销，关联的所有权重模型也将被永久删除。',
      confirmText: '永久删除',
      destructive: true,
    }))) return

    setDeleting(true)
    try {
      await apiDelete(`/api/positions/${position.id}`, { fallbackMessage: '删除失败' })
      toast.success('职位已永久删除')
      router.push('/resume/system-config/positions')
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, '删除失败，请稍后重试')
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  // 每个分类只保留一份模型，取第一条即为该职位唯一模型
  const initialModel = weightModels.find(m => m.category === 'initial') || null
  const icebergModel = weightModels.find(m => m.category === 'iceberg') || null
  const resumeCount = position?._count?.resumes || 0
  const canDelete = position && resumeCount === 0

  // 删除按钮的 Tooltip 文案
  const getDeleteTooltip = () => {
    if (!position) return ''
    if (resumeCount > 0) return `该职位关联了 ${resumeCount} 条简历，无法删除`
    return '永久删除该职位及其所有权重模型'
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ===== Page Header ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/resume/system-config/positions">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg shrink-0 hover:bg-muted/70 hover:text-foreground"
                aria-label="返回职位列表"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {isNew ? '新建职位' : position?.title}
              </h1>
              {position && (
                <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                  {/* Status Badge */}
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
                    position.status === 'active'
                      ? 'bg-success/10 text-success border border-success/20'
                      : 'bg-muted text-muted-foreground border border-border',
                  )}>
                    <span className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      position.status === 'active' ? 'bg-success' : 'bg-muted-foreground/40',
                    )} />
                    {position.status === 'active' ? '启用中' : '已停用'}
                  </span>

                  {/* Resume Count */}
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {resumeCount} 份简历
                  </span>

                  {/* Unsaved Changes */}
                  {hasUnsavedChanges && (
                    <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                      有未保存的修改
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Top Action Buttons */}
          {!isNew && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={handleToggleStatus}
                disabled={statusChanging}
                className={cn(
                  'h-9 px-4 gap-2 rounded-lg transition-all duration-200',
                  isDisabled
                    ? 'border-success/20 text-success hover:bg-success/10'
                    : 'border-warning/20 text-warning hover:bg-warning/10',
                )}
                aria-label={isDisabled ? '启用职位' : '停用职位'}
              >
                {statusChanging ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isDisabled ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                {isDisabled ? '启用职位' : '停用职位'}
              </Button>

              {/* Delete Button with Tooltip */}
              <div className="relative group">
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={!canDelete || deleting}
                  className={cn(
                    'h-9 px-4 gap-2 rounded-lg transition-all duration-200',
                    canDelete && 'border-destructive/20 text-destructive hover:bg-destructive/10',
                    !canDelete && 'opacity-50 cursor-not-allowed',
                  )}
                  aria-label="删除职位"
                >
                  {deleting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                  删除职位
                </Button>
                {!canDelete && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5
                                  bg-foreground text-background text-xs rounded-lg opacity-0
                                  group-hover:opacity-100 transition-opacity duration-150
                                  whitespace-nowrap pointer-events-none z-20
                                  shadow-lg">
                    {getDeleteTooltip()}
                    <div className="absolute top-full left-1/2 -translate-x-1/2
                                    border-4 border-transparent border-t-foreground" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ===== Disabled Warning Banner ===== */}
        {isDisabled && (
          <div className="flex items-start gap-3 p-4 rounded-xl
                          bg-warning/10 border border-warning/20
                          animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-1.5 rounded-lg bg-warning/15 shrink-0">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning">
                职位已停用
              </p>
              <p className="text-xs text-warning/80 mt-0.5">
                职位基本信息和权重模型均不可修改。如需编辑，请点击右上角「启用职位」按钮。
              </p>
            </div>
          </div>
        )}

        {/* ===== Basic Info Card ===== */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-info/10">
                <Briefcase className="h-4 w-4 text-info" />
              </div>
              <div>
                <CardTitle className="text-base">基本信息</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  填写职位的核心信息，AI 将据此评估候选人匹配度
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Row 1: Name + Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-1">
                  职位名称
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  value={form.title}
                  onChange={(e) => trackChange({ title: e.target.value })}
                  placeholder="例如：前端开发工程师"
                  disabled={isDisabled}
                  className="h-10 text-sm"
                  aria-required="true"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  所属部门
                </label>
                <Input
                  value={form.department}
                  onChange={(e) => trackChange({ department: e.target.value })}
                  placeholder="例如：技术部"
                  disabled={isDisabled}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            {/* Row 2: Description */}
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                职位描述
              </label>
              <Textarea
                value={form.description}
                onChange={(e) => trackChange({ description: e.target.value })}
                placeholder="详细描述职位职责、工作内容和发展前景..."
                rows={3}
                disabled={isDisabled}
                className="text-sm resize-y"
              />
            </div>

            {/* Row 3: Requirements */}
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-1">
                筛选要求
                <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={form.requirements}
                onChange={(e) => trackChange({ requirements: e.target.value })}
                placeholder="例如：&#10;1. 3年以上前端开发经验&#10;2. 熟悉 React/Vue 框架&#10;3. 本科及以上学历&#10;4. 良好的沟通与协作能力"
                rows={5}
                disabled={isDisabled}
                className="text-sm resize-y"
                aria-required="true"
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                AI 将根据此要求对候选人简历进行智能评估和打分
              </div>
            </div>

            {/* Row 4: Keywords */}
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                邮件匹配关键词
              </label>
              <Input
                value={form.keywords}
                onChange={(e) => trackChange({ keywords: e.target.value })}
                placeholder="用逗号分隔，例如：前端, frontend, React, TypeScript"
                disabled={isDisabled}
                className="h-10 text-sm"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                系统将根据关键词自动将收到的邮件简历匹配到此职位
              </p>
            </div>

            {/* Save Button */}
            {!isDisabled && (
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  {hasUnsavedChanges ? '有未保存的修改' : '所有信息已保存'}
                </p>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="h-10 px-6 gap-2 rounded-lg"
                >
                  {saving
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Save className="h-4 w-4" />
                  }
                  {saving ? '保存中...' : hasUnsavedChanges ? '保存修改' : '已保存'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== Weight Models Card ===== */}
        {!isNew && (
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-accent/10">
                  <Hash className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-base">权重模型</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    每个职位固定一份初筛模型与一份冰山模型，它们的权重用于该职位下所有简历的评分
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <WeightModelEditor
                positionId={position.id}
                category="initial"
                model={initialModel}
                isDisabled={isDisabled}
                onChanged={loadWeightModels}
              />
              <WeightModelEditor
                positionId={position.id}
                category="iceberg"
                model={icebergModel}
                isDisabled={isDisabled}
                onChanged={loadWeightModels}
              />
            </CardContent>
          </Card>
        )}

        {/* ===== New Position Info ===== */}
        {isNew && (
          <Card className="border-border/60 bg-muted/30">
            <CardContent className="py-6 text-center">
              <div className="p-3 rounded-full bg-primary/10 inline-flex mb-3">
                <ShieldCheck className="h-8 w-8 text-primary/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                创建职位后将自动生成默认的初筛和冰山权重模型
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                你可以在职位创建后在编辑页面中自定义这些模型
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
