'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InlineEditCard } from '@/components/resume/InlineEditCard'
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  FileText,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'

interface ResumeSource {
  id: string
  name: string
  description: string | null
  promptTemplate: string | null
  subjectPattern: string | null
  isActive: boolean
  _count: { emailConfigs: number; resumes: number }
}

export default function SourcesPage() {
  const [sources, setSources] = useState<ResumeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    description: '',
    promptTemplate: '',
    subjectPattern: '',
  })

  const loadSources = async () => {
    try {
      const res = await fetch('/api/config/resume-sources')
      const json = await res.json()
      if (json.sources) setSources(json.sources)
    } catch {
      toast.error('加载简历来源失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSources()
  }, [])

  const resetForm = () => {
    setForm({ name: '', description: '', promptTemplate: '', subjectPattern: '' })
    setEditingId(null)
    setIsCreating(false)
  }

  const startEdit = (source: ResumeSource) => {
    setEditingId(source.id)
    setIsCreating(false)
    setForm({
      name: source.name,
      description: source.description || '',
      promptTemplate: source.promptTemplate || '',
      subjectPattern: source.subjectPattern || '',
    })
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('请填写来源名称')
      return
    }
    setSaving(true)
    try {
      const isEdit = editingId && !isCreating
      const url = isEdit
        ? `/api/config/resume-sources/${editingId}`
        : '/api/config/resume-sources'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(isEdit ? '来源已更新' : '来源已创建')
      resetForm()
      loadSources()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({
      title: '删除该简历来源？',
      description: '此操作不可撤销。',
      confirmText: '删除',
      destructive: true,
    }))) return
    try {
      const res = await fetch(`/api/config/resume-sources/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('来源已删除')
      loadSources()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败'
      toast.error(msg)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">简历来源</h2>
          <p className="text-sm text-muted-foreground mt-1">
            管理不同的简历来源渠道，配置各来源的 AI 解析提示词模板
          </p>
        </div>
        <Button
          onClick={() => {
            setIsCreating(true)
            setEditingId('new')
            setForm({ name: '', description: '', promptTemplate: '', subjectPattern: '' })
          }}
          disabled={isCreating}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          新增来源
        </Button>
      </div>

      {/* Create form — 保持在列表顶部 */}
      {isCreating && (
        <InlineEditCard open={true} onClose={resetForm} title="新增简历来源">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  来源名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如: 前程无忧、BOSS直聘、猎聘"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">描述</label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="可选，简要描述该来源"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">邮件主题解析规则（正则表达式）</label>
              <Input
                value={form.subjectPattern}
                onChange={(e) => setForm({ ...form, subjectPattern: e.target.value })}
                placeholder="如 BOSS 直聘: ^(.+?)-.*-.*投递"
              />
              <p className="text-xs text-muted-foreground">
                用正则从邮件主题中提取候选人姓名，第一个捕获组 (.*?) 为姓名。
                例如 BOSS 主题格式「张三-Java开发-5年-本科-求职中 投递了...」，
                可使用 <code className="bg-muted px-1 rounded">^(.+?)-</code> 提取姓名
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">AI 解析提示词模板</label>
              <textarea
                value={form.promptTemplate}
                onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })}
                placeholder="可选，AI 筛选简历时会附加此提示词。例如：&#10;该简历来自前程无忧，简历格式为标准模板，请注意识别候选人的工作经验和项目经历部分。"
                className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-y"
              />
              <p className="text-xs text-muted-foreground">
                此模板会在 AI 筛选时作为额外上下文传递给模型，帮助模型更好地理解简历格式
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                取消
              </Button>
            </div>
          </InlineEditCard>
        )}

      {/* Source list */}
      {sources.length === 0 && !editingId ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无简历来源</p>
            <p className="text-sm mt-1">点击「新增来源」按钮创建第一个简历来源</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div key={source.id}>
              <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{source.name}</span>
                      {!source.isActive && (
                        <Badge variant="secondary">已禁用</Badge>
                      )}
                    </div>
                    {source.description && (
                      <p className="text-sm text-muted-foreground ml-6 mb-2">
                        {source.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {source._count.resumes} 份简历
                      </span>
                      <span>
                        {source._count.emailConfigs} 个关联邮箱
                      </span>
                      {source.promptTemplate && (
                        <Badge variant="outline" className="text-xs">
                          已配置提示词
                        </Badge>
                      )}
                      {source.subjectPattern && (
                        <Badge variant="outline" className="text-xs">
                          主题解析: {source.subjectPattern}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(source)}
                      disabled={!!editingId && editingId !== source.id}
                      className="hover:bg-gray-100/60 hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(source.id)}
                      disabled={!!editingId && editingId !== source.id}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 编辑表单 — 出现在被编辑项正下方 */}
            {editingId === source.id && !isCreating && (
              <InlineEditCard open={true} onClose={resetForm} title="编辑简历来源">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      来源名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="如: 前程无忧、BOSS直聘、猎聘"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">描述</label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="可选，简要描述该来源"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">邮件主题解析规则（正则表达式）</label>
                  <Input
                    value={form.subjectPattern}
                    onChange={(e) => setForm({ ...form, subjectPattern: e.target.value })}
                    placeholder="如 BOSS 直聘: ^(.+?)-.*-.*投递"
                  />
                  <p className="text-xs text-muted-foreground">
                    用正则从邮件主题中提取候选人姓名，第一个捕获组 (.*?) 为姓名。
                    例如 BOSS 主题格式「张三-Java开发-5年-本科-求职中 投递了...」，
                    可使用 <code className="bg-muted px-1 rounded">^(.+?)-</code> 提取姓名
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">AI 解析提示词模板</label>
                  <textarea
                    value={form.promptTemplate}
                    onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })}
                    placeholder="可选，AI 筛选简历时会附加此提示词。例如：&#10;该简历来自前程无忧，简历格式为标准模板，请注意识别候选人的工作经验和项目经历部分。"
                    className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    此模板会在 AI 筛选时作为额外上下文传递给模型，帮助模型更好地理解简历格式
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {saving ? '保存中...' : '保存'}
                  </Button>
                  <Button variant="outline" onClick={resetForm}>
                    取消
                  </Button>
                </div>
              </InlineEditCard>
            )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
