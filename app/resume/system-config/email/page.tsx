'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmailConfigForm } from '@/components/resume/EmailConfigForm'
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
  RefreshCw,
  Download,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { formatDateTime } from '@/lib/utils/date'
import { IMAP_PRESETS, DEFAULT_PRESET, EMPTY_EMAIL_CONFIG_FORM } from '@/lib/constants/email-config'
import type { EmailConfigItem, ResumeSourceOption, EmailConfigFormValues } from '@/types/email-config'

export default function EmailConfigPage() {
  const [configs, setConfigs] = useState<EmailConfigItem[]>([])
  const [sources, setSources] = useState<ResumeSourceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_PRESET)
  const [folderList, setFolderList] = useState<Array<{ path: string; name: string }>>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [showFolderSelect, setShowFolderSelect] = useState(false)
  const [fetchingConfigId, setFetchingConfigId] = useState<string | null>(null)

  const [form, setForm] = useState<EmailConfigFormValues>({ ...EMPTY_EMAIL_CONFIG_FORM })

  const patchForm = useCallback((patch: Partial<EmailConfigFormValues>) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }, [])

  const loadData = async () => {
    try {
      const [configRes, sourceRes] = await Promise.all([
        fetch('/api/config/email'),
        fetch('/api/config/resume-sources'),
      ])
      const configJson = await configRes.json()
      const sourceJson = await sourceRes.json()
      if (configJson.configs) setConfigs(configJson.configs)
      if (sourceJson.sources) setSources(sourceJson.sources.map((s: ResumeSourceOption & { isActive: boolean }) => ({ id: s.id, name: s.name })))
    } catch {
      toast.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setForm({ ...EMPTY_EMAIL_CONFIG_FORM })
    setEditingId(null)
    setIsCreating(false)
    setTestResult(null)
    setSelectedPreset(DEFAULT_PRESET)
    setFolderList([])
    setShowFolderSelect(false)
  }

  const startCreate = () => {
    setIsCreating(true)
    setEditingId('new')
    setTestResult(null)
    setForm({ ...EMPTY_EMAIL_CONFIG_FORM })
    setSelectedPreset(DEFAULT_PRESET)
    setFolderList([])
    setShowFolderSelect(false)
  }

  const startEdit = (config: EmailConfigItem) => {
    setEditingId(config.id)
    setIsCreating(false)
    setTestResult(null)
    setForm({
      alias: config.alias,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      password: '',
      mailbox: config.mailbox,
      resumeSourceId: config.resumeSourceId || '',
    })
    const match = IMAP_PRESETS.find((p) => p.host === config.host)
    setSelectedPreset(match?.label || '自定义')
    setFolderList([])
    setShowFolderSelect(false)
  }

  const handlePresetChange = (label: string) => {
    setSelectedPreset(label)
    const preset = IMAP_PRESETS.find((p) => p.label === label)
    if (preset && preset.host) {
      patchForm({ host: preset.host, port: preset.port, secure: preset.secure })
    }
  }

  const handleTest = async () => {
    if (!form.user || !form.password) {
      toast.error('请填写邮箱地址和密码')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/config/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: form.host, port: form.port, secure: form.secure,
          user: form.user, password: form.password,
        }),
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

  const handleFetchFolders = async () => {
    if (!form.host || !form.user || !form.password) {
      toast.error('请先填写服务器地址、邮箱地址和密码')
      return
    }
    setLoadingFolders(true)
    setFolderList([])
    try {
      const res = await fetch('/api/config/email/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: form.host, port: form.port, secure: form.secure,
          user: form.user, password: form.password,
        }),
      })
      const json = await res.json()
      if (json.success && json.folders) {
        setFolderList(json.folders)
        setShowFolderSelect(true)
        toast.success(`已获取 ${json.folders.length} 个文件夹`)
        // 如果当前 mailbox 不在列表中，自动选第一个
        const currentInList = json.folders.some((f: { path: string }) => f.path === form.mailbox)
        if (!currentInList && json.folders.length > 0) {
          patchForm({ mailbox: json.folders[0].path })
        }
      } else {
        toast.error(json.message || '获取文件夹列表失败')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取文件夹列表失败'
      toast.error(msg)
    } finally {
      setLoadingFolders(false)
    }
  }

  const handleSave = async () => {
    if (!form.user) {
      toast.error('请填写邮箱地址')
      return
    }
    const isEdit = !!editingId && !isCreating
    if (!isEdit && !form.password) {
      toast.error('请填写密码')
      return
    }

    setSaving(true)
    try {
      const url = isEdit ? `/api/config/email/${editingId}` : '/api/config/email'
      const method = isEdit ? 'PUT' : 'POST'
      const payload: Record<string, unknown> = {
        alias: form.alias || form.user,
        host: form.host,
        port: form.port,
        secure: form.secure,
        user: form.user,
        mailbox: form.mailbox,
        resumeSourceId: form.resumeSourceId || null,
      }
      if (form.password) payload.password = form.password

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(isEdit ? '邮箱配置已更新' : '邮箱配置已创建')
      resetForm()
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({
      title: '删除该邮箱配置？',
      description: '此操作不可撤销。',
      confirmText: '删除',
      destructive: true,
    }))) return
    try {
      const res = await fetch(`/api/config/email/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('配置已删除')
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败'
      toast.error(msg)
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/config/email/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(currentActive ? '已禁用' : '已启用')
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败'
      toast.error(msg)
    }
  }

  // 立即收取邮件（增量 / 全量）—— 邮箱状态功能合并进邮箱配置页
  const handleFetch = async (configId: string, full: boolean) => {
    setFetchingConfigId(configId)
    try {
      const res = await fetch('/api/emails/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId, full, autoProcess: true }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const t = json.total
      const autoMsg = json.autoProcess
        ? json.autoProcess.error
          ? `，自动管道启动失败: ${json.autoProcess.error}`
          : `，已自动入队${json.autoProcess.queued}份简历到解析队列`
        : ''
      toast.success(
        `${full ? '全量' : '增量'}收取完成: 获取${t.fetched}封邮件, 生成${t.generated}份简历` +
          (t.errors > 0 ? `, ${t.errors}个错误` : '') +
          (t.duplicatesSkipped > 0 ? `, 跳过${t.duplicatesSkipped}封重复` : '') +
          autoMsg
      )
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '收取失败'
      toast.error(msg)
    } finally {
      setFetchingConfigId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // 新增 / 编辑共用同一份表单属性
  const formProps = {
    form,
    onChange: patchForm,
    sources,
    selectedPreset,
    onPresetChange: handlePresetChange,
    folderList,
    showFolderSelect,
    loadingFolders,
    onFetchFolders: handleFetchFolders,
    testResult,
    testing,
    onTest: handleTest,
    saving,
    onSave: handleSave,
    onCancel: resetForm,
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">邮箱配置</h2>
          <p className="text-sm text-muted-foreground mt-1">
            管理多个 IMAP 邮箱，自动收取不同渠道的简历邮件
          </p>
        </div>
        <Button onClick={startCreate} disabled={isCreating} className="gap-2">
          <Plus className="h-4 w-4" />
          新增邮箱
        </Button>
      </div>

      {/* Create form — 保持在列表顶部 */}
      {isCreating && <EmailConfigForm mode="create" {...formProps} />}

      {/* Config list */}
      {configs.length === 0 && !editingId ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无邮箱配置</p>
            <p className="text-sm mt-1">点击「新增邮箱」按钮添加第一个邮箱</p>
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
                        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium">{config.alias || config.user}</span>
                        {config.isActive ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            启用
                          </Badge>
                        ) : (
                          <Badge variant="secondary">已禁用</Badge>
                        )}
                      </div>
                      <div className="ml-6 text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-4">
                          <span>{config.user}</span>
                          <span>{config.host}:{config.port}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {config.resumeSource && (
                            <span className="flex items-center gap-1">
                              来源: {config.resumeSource.name}
                            </span>
                          )}
                          <span>{config._count.emails} 封邮件</span>
                          <span>{config._count.resumes} 份简历</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {config.lastFetchedAt
                              ? formatDateTime(config.lastFetchedAt)
                              : '未收取'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFetch(config.id, false)}
                        disabled={!!editingId && editingId !== config.id || fetchingConfigId === config.id}
                        className="gap-1.5"
                      >
                        {fetchingConfigId === config.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        增量
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFetch(config.id, true)}
                        disabled={!!editingId && editingId !== config.id || fetchingConfigId === config.id}
                        className="gap-1.5"
                      >
                        {fetchingConfigId === config.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        全量
                      </Button>
                      <div className="flex items-center gap-1 border-l pl-2 ml-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(config.id, config.isActive)}
                          title={config.isActive ? '禁用' : '启用'}
                          disabled={!!editingId && editingId !== config.id}
                          className="hover:bg-muted hover:text-foreground"
                        >
                          {config.isActive ? (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(config)}
                          disabled={!!editingId && editingId !== config.id}
                          className="hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(config.id)}
                          disabled={!!editingId && editingId !== config.id}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 编辑表单 — 出现在被编辑项正下方 */}
              {editingId === config.id && !isCreating && (
                <EmailConfigForm mode="edit" {...formProps} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Help info */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">配置帮助</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>通用 IMAP 邮箱: 需在管理后台开启 IMAP，使用客户端专用密码</p>
          <p>QQ/163邮箱: 需开启 IMAP 服务，使用「授权码」</p>
          <p>Gmail: 需启用两步验证后使用应用专用密码</p>
          <p className="flex items-center gap-1.5 pt-2 border-t">
            <Shield className="h-3.5 w-3.5" />
            所有密码均使用 AES-256-GCM 加密存储
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
