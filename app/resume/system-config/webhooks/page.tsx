'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Wifi, Plus, Trash2, FileJson, Pencil, Save, X } from 'lucide-react'
import { InlineEditCard } from '@/components/resume/InlineEditCard'
import { HR_FIELDS, HR_FIELD_MAP } from '@/lib/constants/webhook-fields'
import type { HrFieldDef } from '@/lib/constants/webhook-fields'
import {
  TRANSFORM_TYPES,
  TRANSFORM_TYPE_LABELS,
  TARGET_FIELD_TYPES,
  UNSUPPORTED_TARGET_FIELD_TYPES,
} from '@/lib/constants/webhook-fields'
import type { TransformType, TargetFieldType } from '@/lib/constants/webhook-fields'

// ========== 类型 ==========
interface MappingRow {
  id: string
  hrField: string
  targetFieldId: string | null
  targetFieldName: string | null
  targetFieldType: string | null
  transformType: string
  transformConfig: string | null
  isEnabled: boolean
}

// 职位映射行（职位 → Webhook岗位记录 ID）
interface PositionMapping {
  id: string
  title: string
  department: string | null
  webhookTargetRecordId: string | null
}

// ========== 页面组件 ==========
export default function WebhookConfigPage() {
  // 状态
  const [webhookUrl, setWebhookUrl] = useState('')
  // 已配置时后端返回脱敏地址，用于识别「未修改的脱敏占位」，保存前需重新输入完整 URL
  const [webhookUrlMasked, setWebhookUrlMasked] = useState('')
  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingUrl, setSavingUrl] = useState(false)
  const [testing, setTesting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  // 导入 JSON
  const [schemaJson, setSchemaJson] = useState('')
  const [showImportDialog, setShowImportDialog] = useState(false)

  // 职位映射（职位 → Webhook岗位记录 ID）
  const [positionMappings, setPositionMappings] = useState<PositionMapping[]>([])
  const [loadingPositions, setLoadingPositions] = useState(true)
  const [savingPositions, setSavingPositions] = useState(false)

  // 编辑表单
  const [form, setForm] = useState<{
    hrField: string
    targetFieldId: string
    targetFieldName: string
    targetFieldType: string
    transformType: string
    transformConfig: string
    isEnabled: boolean
  }>({
    hrField: '',
    targetFieldId: '',
    targetFieldName: '',
    targetFieldType: 'TEXT',
    transformType: 'DIRECT',
    transformConfig: '',
    isEnabled: true,
  })

  // ========== 数据加载 ==========
  const loadData = async () => {
    try {
      const res = await fetch('/api/config/webhooks')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setWebhookUrl(json.webhookUrl || '')
      setWebhookUrlMasked(json.webhookUrlConfigured ? json.webhookUrl || '' : '')
      setMappings(json.mappings || [])
    } catch {
      toast.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // ========== 职位映射 ==========
  const loadPositionMappings = async () => {
    try {
      const res = await fetch('/api/config/webhooks/position-mappings')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setPositionMappings(json.positions || [])
    } catch {
      toast.error('加载职位映射失败')
    } finally {
      setLoadingPositions(false)
    }
  }

  useEffect(() => { loadPositionMappings() }, [])

  const handleSavePositions = async () => {
    setSavingPositions(true)
    try {
      const res = await fetch('/api/config/webhooks/position-mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: positionMappings.map((p) => ({ positionId: p.id, webhookTargetRecordId: p.webhookTargetRecordId || '' })),
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      if (json.skipped > 0) {
        toast.warning(`已保存 ${json.updated} 个，${json.skipped} 个职位被跳过（不存在或已停用）`)
      } else {
        toast.success('职位映射已保存')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingPositions(false)
    }
  }

  // ========== Webhook URL ==========
  const handleSaveUrl = async () => {
    if (webhookUrl.includes('****')) {
      toast.error('检测到脱敏占位符，请重新输入完整 Webhook URL 后再保存')
      return
    }
    if (!webhookUrl.startsWith('https://')) {
      toast.error('Webhook 地址格式不正确')
      return
    }
    setSavingUrl(true)
    try {
      const res = await fetch('/api/config/webhooks/webhook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('Webhook 地址已保存')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingUrl(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      // 未修改脱敏占位时传空 body，后端从数据库读取解密后的完整 URL
      const body = webhookUrlMasked && webhookUrl === webhookUrlMasked ? {} : { webhookUrl }
      const res = await fetch('/api/config/webhooks/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      if (json.success) {
        toast.success(json.message || '连接成功')
      } else {
        toast.error(json.message || '连接失败')
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '测试连接失败')
    } finally {
      setTesting(false)
    }
  }

  // ========== 映射 CRUD ==========
  const resetForm = () => {
    setEditingId(null)
    setIsCreating(false)
    setForm({
      hrField: '',
      targetFieldId: '',
      targetFieldName: '',
      targetFieldType: 'TEXT',
      transformType: 'DIRECT',
      transformConfig: '',
      isEnabled: true,
    })
  }

  const startEdit = (row: MappingRow) => {
    setEditingId(row.id)
    setIsCreating(false)
    setForm({
      hrField: row.hrField,
      targetFieldId: row.targetFieldId || '',
      targetFieldName: row.targetFieldName || '',
      targetFieldType: row.targetFieldType || 'TEXT',
      transformType: row.transformType,
      transformConfig: row.transformConfig || '',
      isEnabled: row.isEnabled,
    })
  }

  const handleSave = async () => {
    const isEdit = !!editingId
    setSaving(true)
    try {
      const url = isEdit ? `/api/config/webhooks/${editingId}` : '/api/config/webhooks'
      const method = isEdit ? 'PUT' : 'POST'
      const payload = {
        hrField: form.hrField,
        targetFieldId: form.targetFieldId || null,
        targetFieldName: form.targetFieldName || null,
        targetFieldType: form.targetFieldType || null,
        transformType: form.transformType,
        transformConfig: form.transformConfig || null,
        isEnabled: form.isEnabled,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success(isEdit ? '映射已更新' : '映射已创建')
      resetForm()
      loadData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({
      title: '删除这条映射？',
      description: '此操作不可撤销。',
      confirmText: '删除',
      destructive: true,
    }))) return
    try {
      const res = await fetch(`/api/config/webhooks/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      toast.success('映射已删除')
      loadData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  // ========== 导入示例 JSON ==========
  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/config/webhooks/import-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaJson, replace: true }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      const msg = `已导入 ${json.imported} 个字段`
      if (json.skipped > 0) {
        toast.warning(`${msg}，${json.skipped} 个不受支持的字段已跳过`)
      } else {
        toast.success(msg)
      }
      closeImportDialog()
      loadData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  // ========== 查找 HR 字段信息 ==========
  const getHrFieldInfo = (path: string): HrFieldDef | undefined => HR_FIELD_MAP[path]
  const getTransformConfigHint = (type: string): string => {
    switch (type) {
      case 'ENUM_MAP': return '{"INTERVIEW_SCHEDULED":"待面试","HIRED":"已入职"}'
      case 'CONCAT': return '{resume.candidateName} - {position.title}'
      case 'FIXED': return '固定值内容'
      default: return ''
    }
  }

  // ========== 渲染 ==========
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const editingForm = (
    <InlineEditCard
      open={true}
      onClose={resetForm}
      title={isCreating ? '新增字段映射' : '编辑字段映射'}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* HR 系统字段 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">HR 系统字段<span className="text-red-500">*</span></label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.hrField}
            onChange={(e) => setForm({ ...form, hrField: e.target.value })}
          >
            <option value="">请选择...</option>
            {HR_FIELDS.map((f) => (
              <option key={f.path} value={f.path}>{f.label} ({f.path})</option>
            ))}
          </select>
        </div>

        {/* Webhook字段 ID */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Webhook字段 ID</label>
          <Input
            value={form.targetFieldId}
            onChange={(e) => setForm({ ...form, targetFieldId: e.target.value })}
            placeholder="fld_xxx"
          />
        </div>

        {/* Webhook字段名称 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Webhook字段名称</label>
          <Input
            value={form.targetFieldName}
            onChange={(e) => setForm({ ...form, targetFieldName: e.target.value })}
            placeholder="如：候选人、面试状态"
          />
        </div>

        {/* Webhook 字段类型 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Webhook 字段类型</label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.targetFieldType}
            onChange={(e) => setForm({ ...form, targetFieldType: e.target.value })}
          >
            {TARGET_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* 转换方式 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">转换方式</label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.transformType}
            onChange={(e) => setForm({ ...form, transformType: e.target.value, transformConfig: '' })}
          >
            {TRANSFORM_TYPES.map((t) => (
              <option key={t} value={t}>{TRANSFORM_TYPE_LABELS[t as TransformType]}</option>
            ))}
          </select>
        </div>

        {/* 转换参数 */}
        {(form.transformType === 'ENUM_MAP' || form.transformType === 'CONCAT' || form.transformType === 'FIXED') && (
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">转换参数（transformConfig）</label>
              {form.transformType === 'ENUM_MAP' && HR_FIELD_MAP[form.hrField]?.enumValues && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // 填入该枚举字段的默认字典（HR 内部值 -> 中文），如面试状态 = FOLLOWUP_STATUS_ENUM
                    const enumValues = HR_FIELD_MAP[form.hrField]?.enumValues
                    if (enumValues) {
                      setForm({ ...form, transformConfig: JSON.stringify(enumValues) })
                    }
                  }}
                >
                  填入默认值
                </Button>
              )}
            </div>
            <Textarea
              className="font-mono"
              value={form.transformConfig}
              onChange={(e) => setForm({ ...form, transformConfig: e.target.value })}
              placeholder={getTransformConfigHint(form.transformType)}
            />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || !form.hrField} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? '保存中...' : '保存'}
        </Button>
        <Button variant="outline" onClick={resetForm}>
          <X className="h-4 w-4 mr-1" />取消
        </Button>
      </div>
    </InlineEditCard>
  )

  // 关闭导入弹窗并清空粘贴内容（未导入时再次打开应为空）
  const closeImportDialog = () => {
    setShowImportDialog(false)
    setSchemaJson('')
  }

  const importDialog = (
    <Dialog open={showImportDialog} onOpenChange={(open) => { if (!open) closeImportDialog() }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>导入示例 JSON</DialogTitle>
          <DialogDescription>
            粘贴Webhook「接收外部数据」示例 JSON，导入后将替换现有字段映射。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          className="h-48 font-mono"
          value={schemaJson}
          onChange={(e) => setSchemaJson(e.target.value)}
          placeholder='{"schema":{"fld_xxx":{"title":"字段名","type":"text"}}}'
        />
        <p className="text-xs text-muted-foreground">
          将从 schema 中解析字段 ID、字段名和类型，单选/多选的选项列表一并导入；不支持的字段类型（公式、自动编号、文件等）将跳过。
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={closeImportDialog}>
            <X className="h-4 w-4 mr-1" />取消
          </Button>
          <Button onClick={handleImport} disabled={importing || !schemaJson} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
            {importing ? '导入中...' : '导入并替换现有映射'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* ===== Webhook 配置区 ===== */}
      <div>
        <h2 className="text-2xl font-bold">Webhook 集成配置</h2>
        <p className="text-sm text-muted-foreground mt-1">
          配置Webhook 地址和字段映射规则
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Webhook 地址</h3>
          <div className="flex gap-3">
            <Input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=..."
              className="flex-1"
            />
            <Button onClick={handleSaveUrl} disabled={savingUrl} variant="outline" className="gap-2">
              {savingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
            <Button onClick={handleTestConnection} disabled={testing} className="gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              测试连接
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            已保存的地址以脱敏形式展示（key 参数仅显示后 4 位），修改需重新输入完整 URL。
            测试连接会发送一条空值记录到Webhook表格，测试后请在Webhook端手动删除。
          </p>
        </CardContent>
      </Card>

      {/* ===== 字段映射列表 ===== */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">字段映射</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)} className="gap-2">
            <FileJson className="h-4 w-4" />导入示例 JSON
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setIsCreating(true) }} className="gap-2">
            <Plus className="h-4 w-4" />新增映射
          </Button>
        </div>
      </div>

      {/* 新建表单 */}
      {isCreating && editingForm}

      {/* 映射表格 */}
      {mappings.length === 0 && !isCreating ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <FileJson className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无字段映射</p>
            <p className="text-sm mt-1">点击「导入示例 JSON」导入Webhook字段，或「新增映射」手动添加</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {mappings.map((row) => {
            const hrInfo = getHrFieldInfo(row.hrField)
            return (
              <div key={row.id}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* HR 字段 */}
                      <Badge variant="secondary" className="text-xs">
                        {hrInfo?.label || row.hrField || '未设置'}
                      </Badge>

                      {/* 箭头 */}
                      <span className="text-muted-foreground text-xs">→</span>

                      {/* 转换方式 */}
                      <Badge variant="outline" className="text-xs">
                        {TRANSFORM_TYPE_LABELS[row.transformType as TransformType] || row.transformType}
                      </Badge>

                      {/* 转换参数摘要 */}
                      {row.transformConfig && (
                        <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {row.transformConfig.length > 30 ? row.transformConfig.slice(0, 30) + '…' : row.transformConfig}
                        </span>
                      )}

                      {/* 箭头 */}
                      <span className="text-muted-foreground text-xs">→</span>

                      {/* Webhook字段 */}
                      <span className="text-sm">
                        {row.targetFieldName || row.targetFieldId || '未指定'}
                      </span>
                      {row.targetFieldType && (
                        <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                          {row.targetFieldType}
                        </Badge>
                      )}

                      {/* 禁用标记 */}
                      {!row.isEnabled && <Badge variant="secondary" className="text-xs">已禁用</Badge>}

                      {/* 操作 */}
                      <div className="ml-auto flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs hover:text-foreground hover:bg-gray-200/60"
                          onClick={() => startEdit(row)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-600 hover:text-red-600 hover:bg-red-100/60"
                          onClick={() => handleDelete(row.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />删除
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 编辑表单 */}
                {editingId === row.id && editingForm}
              </div>
            )
          })}
        </div>
      )}

      {/* ===== 职位映射 ===== */}
      <div>
        <h3 className="text-lg font-semibold">职位映射</h3>
        <p className="text-xs text-muted-foreground mt-1">
          为每个职位配置它在Webhook「岗位管理」表的记录 ID（record_id），同步「应聘岗位」关联字段时按此映射自动写入。
          在Webhook新增ai字段获取记录id，可查看 record_id。
        </p>
      </div>
      <Card>
        <CardContent className="p-6 space-y-3">
          {loadingPositions ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : positionMappings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无启用中的职位</p>
          ) : (
            <div className="space-y-2">
              {positionMappings.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-44 truncate">{p.title}</span>
                  {p.department && <Badge variant="secondary" className="text-xs shrink-0">{p.department}</Badge>}
                  <Input
                    className="flex-1 font-mono"
                    value={p.webhookTargetRecordId || ''}
                    onChange={(e) =>
                      setPositionMappings((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, webhookTargetRecordId: e.target.value } : x))
                      )
                    }
                    placeholder="Webhook岗位 record_id"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSavePositions} disabled={savingPositions || loadingPositions} className="gap-2">
              {savingPositions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 导入弹窗 */}
      {importDialog}
    </div>
  )
}
