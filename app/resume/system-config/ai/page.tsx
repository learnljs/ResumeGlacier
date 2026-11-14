'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { InlineEditCard } from '@/components/resume/InlineEditCard'
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Bot,
  Sparkles,
  Star,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'

interface AIConfigItem {
  id: string
  alias: string
  provider: string
  baseUrl: string | null
  model: string
  purposes: string
  isDefault: boolean
  isActive: boolean
  hasApiKey: boolean
  _count: { evaluations: number }
}

// 可选的用途
const purposeOptions = [
  { value: 'screening', label: '简历筛选', description: '用于 AI 筛选简历' },
  { value: 'extraction', label: '结构化提取', description: '用于提取结构化数据' },
  { value: 'ocr', label: '视觉 OCR', description: '用于扫描件识别' },
  { value: 'vision', label: '头像识别', description: '用于简历头像提取确认（需支持视觉的模型）' },
]

const providerPresets = [
  { label: 'OpenAI', baseUrl: '', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-turbo', 'qwen-max'] },
  { label: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4', 'glm-4-flash'] },
  { label: '自定义', baseUrl: '', models: [] },
]

export default function AIConfigPage() {
  const [configs, setConfigs] = useState<AIConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const [form, setForm] = useState({
    alias: '',
    provider: 'OpenAI',
    apiKey: '',
    baseUrl: '',
    model: 'gpt-4o',
    purposes: 'screening',
    isDefault: false,
  })

  const loadConfigs = async () => {
    try {
      const res = await fetch('/api/config/ai')
      const json = await res.json()
      if (json.configs) setConfigs(json.configs)
    } catch {
      toast.error('加载AI配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfigs()
  }, [])

  const resetForm = () => {
    setForm({ alias: '', provider: 'OpenAI', apiKey: '', baseUrl: '', model: 'gpt-4o', purposes: 'screening', isDefault: false })
    setEditingId(null)
    setIsCreating(false)
    setTestResult(null)
  }

  const startCreate = () => {
    setIsCreating(true)
    setEditingId('new')
    setForm({ alias: '', provider: 'OpenAI', apiKey: '', baseUrl: '', model: 'gpt-4o', purposes: 'screening', isDefault: configs.length === 0 })
    setTestResult(null)
  }

  const startEdit = (config: AIConfigItem) => {
    setEditingId(config.id)
    setIsCreating(false)
    setTestResult(null)
    const matchPreset = providerPresets.find(
      (p) => p.label === config.provider || p.baseUrl === config.baseUrl
    )
    setForm({
      alias: config.alias,
      provider: matchPreset?.label || '自定义',
      apiKey: '',
      baseUrl: config.baseUrl || '',
      model: config.model,
      purposes: config.purposes || 'screening',
      isDefault: config.isDefault,
    })
  }

  const handleProviderChange = (label: string) => {
    const preset = providerPresets.find((p) => p.label === label)
    if (preset) {
      setForm((prev) => ({
        ...prev,
        provider: label,
        baseUrl: preset.baseUrl,
        model: preset.models[0] || prev.model,
      }))
    }
  }

  const handleTest = async () => {
    if (!form.apiKey) {
      toast.error('请填写 API Key')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/config/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: form.apiKey, baseUrl: form.baseUrl, model: form.model }),
      })
      const json = await res.json()
      setTestResult(json)
      if (json.success) toast.success(json.message)
      else toast.error(json.message)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '测试失败'
      setTestResult({ success: false, message: msg })
      toast.error(msg)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!form.model) {
      toast.error('请填写模型名称')
      return
    }
    const isEdit = editingId && !isCreating
    if (!isEdit && !form.apiKey) {
      toast.error('请填写 API Key')
      return
    }

    setSaving(true)
    try {
      const url = isEdit ? `/api/config/ai/${editingId}` : '/api/config/ai'
      const method = isEdit ? 'PUT' : 'POST'
      const payload: Record<string, unknown> = {
        alias: form.alias || `${form.provider} ${form.model}`,
        provider: form.provider,
        baseUrl: form.baseUrl,
        model: form.model,
        purposes: form.purposes,
        isDefault: form.isDefault,
      }
      if (form.apiKey) payload.apiKey = form.apiKey

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(isEdit ? 'AI 配置已更新' : 'AI 配置已创建')
      resetForm()
      loadConfigs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({
      title: '删除该 AI 模型配置？',
      description: '此操作不可撤销。',
      confirmText: '删除',
      destructive: true,
    }))) return
    try {
      const res = await fetch(`/api/config/ai/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('配置已删除')
      loadConfigs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败'
      toast.error(msg)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/config/ai/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('已设为默认模型')
      loadConfigs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '设置失败'
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

  const currentPreset = providerPresets.find((p) => p.label === form.provider)
  const presetModels = currentPreset?.models || []

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI 模型配置</h2>
          <p className="text-sm text-muted-foreground mt-1">
            管理多个 AI 模型配置，用于简历智能筛选分析
          </p>
        </div>
        <Button onClick={startCreate} disabled={isCreating} className="gap-2">
          <Plus className="h-4 w-4" />
          新增模型
        </Button>
      </div>

      {/* Create form — 保持在列表顶部 */}
      {isCreating && (
        <InlineEditCard open={true} onClose={resetForm} title="新增 AI 模型">
            <div className="space-y-2">
              <label className="text-sm font-medium">配置别名</label>
              <Input
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                placeholder="如: 主力模型、备用模型（留空自动生成）"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">AI 服务商</label>
              <div className="flex flex-wrap gap-2">
                {providerPresets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleProviderChange(preset.label)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      form.provider === preset.label
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-input hover:bg-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Base URL</label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value, provider: '自定义' })}
                placeholder="留空则使用 OpenAI 官方地址"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  模型名称 <span className="text-red-500">*</span>
                </label>
                {presetModels.length > 0 ? (
                  <Select
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                  >
                    {presetModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="_custom">手动输入...</option>
                  </Select>
                ) : (
                  <Input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="gpt-4o"
                  />
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  API Key <span className="text-red-500">*</span>
                  {!isCreating && (
                    <span className="text-muted-foreground font-normal ml-1">(留空不修改)</span>
                  )}
                </label>
                <Input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={!isCreating ? '••••••••' : 'sk-...'}
                />
              </div>
            </div>

            {/* 用途选择 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">用途</label>
              <p className="text-xs text-muted-foreground">选择该模型用于哪些场景</p>
              <div className="flex flex-wrap gap-2">
                {purposeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      const current = form.purposes.split(',').filter(Boolean)
                      const newPurposes = current.includes(opt.value)
                        ? current.filter((p) => p !== opt.value).join(',')
                        : [...current, opt.value].join(',')
                      setForm({ ...form, purposes: newPurposes || 'screening' })
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      form.purposes.split(',').includes(opt.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-input hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded border-input h-4 w-4 accent-primary"
              />
              设为默认模型（AI 筛选时优先使用）
            </label>

            {/* Test result */}
            {testResult && (
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                {testResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                )}
                <p className="text-sm">{testResult.message}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing || !form.apiKey}
                className="gap-2"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {testing ? '测试中...' : '测试连接'}
              </Button>
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

      {/* Config list */}
      {configs.length === 0 && !editingId ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无 AI 模型配置</p>
            <p className="text-sm mt-1">点击「新增模型」按钮添加第一个 AI 模型</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <div key={config.id}>
              <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{config.alias || `${config.provider} ${config.model}`}</span>
                      {config.isDefault && (
                        <Badge variant="default" className="gap-1">
                          <Star className="h-3 w-3" />
                          默认
                        </Badge>
                      )}
                      {!config.isActive && (
                        <Badge variant="secondary">已禁用</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground">
                      <span>服务商: {config.provider}</span>
                      <span>模型: {config.model}</span>
                      {config.baseUrl && <span className="truncate max-w-[200px]">URL: {config.baseUrl}</span>}
                      <span>{config._count.evaluations} 次筛选</span>
                    </div>
                    <div className="flex items-center gap-1 ml-6 mt-1">
                      {config.purposes.split(',').filter(Boolean).map((p) => {
                        const opt = purposeOptions.find((o) => o.value === p)
                        return opt ? (
                          <Badge key={p} variant="outline" className="text-xs">{opt.label}</Badge>
                        ) : null
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    {!config.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(config.id)}
                        title="设为默认"
                        disabled={!!editingId && editingId !== config.id}
                        className="bg-transparent text-yellow-500 border-transparent hover:bg-yellow-100/80 hover:text-yellow-600 hover:border-yellow-200/50 transition-all duration-200"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(config)}
                      disabled={!!editingId && editingId !== config.id}
                      className="hover:bg-gray-100/60 hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                      disabled={!!editingId && editingId !== config.id}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 编辑表单 — 出现在被编辑项正下方 */}
            {editingId === config.id && !isCreating && (
              <InlineEditCard open={true} onClose={resetForm} title="编辑 AI 模型">
                <div className="space-y-2">
                  <label className="text-sm font-medium">配置别名</label>
                  <Input
                    value={form.alias}
                    onChange={(e) => setForm({ ...form, alias: e.target.value })}
                    placeholder="如: 主力模型、备用模型（留空自动生成）"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">AI 服务商</label>
                  <div className="flex flex-wrap gap-2">
                    {providerPresets.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => handleProviderChange(preset.label)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          form.provider === preset.label
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-input hover:bg-muted'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">API Base URL</label>
                  <Input
                    value={form.baseUrl}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value, provider: '自定义' })}
                    placeholder="留空则使用 OpenAI 官方地址"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      模型名称 <span className="text-red-500">*</span>
                    </label>
                    {presetModels.length > 0 ? (
                      <Select
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                      >
                        {presetModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        <option value="_custom">手动输入...</option>
                      </Select>
                    ) : (
                      <Input
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                        placeholder="gpt-4o"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      API Key <span className="text-red-500">*</span>
                      <span className="text-muted-foreground font-normal ml-1">(留空不修改)</span>
                    </label>
                    <Input
                      type="password"
                      value={form.apiKey}
                      onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {/* 用途选择 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">用途</label>
                  <p className="text-xs text-muted-foreground">选择该模型用于哪些场景</p>
                  <div className="flex flex-wrap gap-2">
                    {purposeOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const current = form.purposes.split(',').filter(Boolean)
                          const newPurposes = current.includes(opt.value)
                            ? current.filter((p) => p !== opt.value).join(',')
                            : [...current, opt.value].join(',')
                          setForm({ ...form, purposes: newPurposes || 'screening' })
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          form.purposes.split(',').includes(opt.value)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-input hover:bg-muted'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                    className="rounded border-input h-4 w-4 accent-primary"
                  />
                  设为默认模型（AI 筛选时优先使用）
                </label>

                {/* Test result */}
                {testResult && (
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    {testResult.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                    <p className="text-sm">{testResult.message}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={testing || !form.apiKey}
                    className="gap-2"
                  >
                    {testing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {testing ? '测试中...' : '测试连接'}
                  </Button>
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
