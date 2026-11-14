'use client'

import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { InlineEditCard } from '@/components/resume/InlineEditCard'
import { Loader2, Save, Wifi, FolderSearch, CheckCircle2, XCircle } from 'lucide-react'
import { IMAP_PRESETS } from '@/lib/constants/email-config'
import type { EmailConfigFormValues, ResumeSourceOption } from '@/types/email-config'

/** 邮箱配置表单：新增与编辑共用同一份内容（B9 合并原先重复的两份 JSX） */
export function EmailConfigForm({
  mode,
  form,
  onChange,
  sources,
  selectedPreset,
  onPresetChange,
  folderList,
  showFolderSelect,
  loadingFolders,
  onFetchFolders,
  testResult,
  testing,
  onTest,
  saving,
  onSave,
  onCancel,
}: {
  /** create → 顶部新建卡；edit → 被编辑项下方行内卡 */
  mode: 'create' | 'edit'
  form: EmailConfigFormValues
  /** 局部更新表单字段 */
  onChange: (patch: Partial<EmailConfigFormValues>) => void
  sources: ResumeSourceOption[]
  selectedPreset: string
  onPresetChange: (label: string) => void
  folderList: Array<{ path: string; name: string }>
  showFolderSelect: boolean
  loadingFolders: boolean
  onFetchFolders: () => void
  testResult: { success: boolean; message: string } | null
  testing: boolean
  onTest: () => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const isEdit = mode === 'edit'

  return (
    <InlineEditCard open={true} onClose={onCancel} title={isEdit ? '编辑邮箱配置' : '新增邮箱配置'}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">邮箱别名</label>
          <Input
            value={form.alias}
            onChange={(e) => onChange({ alias: e.target.value })}
            placeholder="如: HR邮箱、猎头邮箱（留空使用邮箱地址）"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">关联简历来源</label>
          <Select
            value={form.resumeSourceId}
            onChange={(e) => onChange({ resumeSourceId: e.target.value })}
          >
            <option value="">不关联</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* IMAP preset selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">邮箱服务商</label>
        <div className="flex flex-wrap gap-2">
          {IMAP_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => onPresetChange(preset.label)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                selectedPreset === preset.label
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-input hover:bg-muted'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 space-y-2">
          <label className="text-sm font-medium">IMAP 服务器</label>
          <Input
            value={form.host}
            onChange={(e) => { onChange({ host: e.target.value }); onPresetChange('自定义') }}
            placeholder=""
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">端口</label>
          <Input
            type="number"
            value={form.port}
            onChange={(e) => onChange({ port: parseInt(e.target.value) || 993 })}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={form.secure}
          onChange={(e) => onChange({ secure: e.target.checked })}
          className="rounded border-input h-4 w-4 accent-primary"
        />
        启用 SSL/TLS 安全连接
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            邮箱地址 <span className="text-red-500">*</span>
          </label>
          <Input
            type="email"
            value={form.user}
            onChange={(e) => onChange({ user: e.target.value })}
            placeholder="hr@company.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            密码 <span className="text-red-500">*</span>
            {isEdit && (
              <span className="text-muted-foreground font-normal ml-1">(留空不修改)</span>
            )}
          </label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => onChange({ password: e.target.value })}
            placeholder={isEdit ? '••••••••' : '邮箱密码或应用专用密码'}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">收取文件夹</label>
        <div className="flex items-center gap-2">
          {showFolderSelect && folderList.length > 0 ? (
            <Select
              value={form.mailbox}
              onChange={(e) => onChange({ mailbox: e.target.value })}
              className="max-w-xs"
            >
              {folderList.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.name} ({f.path})
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={form.mailbox}
              onChange={(e) => onChange({ mailbox: e.target.value })}
              placeholder="INBOX"
              className="max-w-xs"
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onFetchFolders}
            disabled={loadingFolders || !form.host || !form.user || !form.password}
            className="gap-1.5 flex-shrink-0"
          >
            {loadingFolders ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderSearch className="h-3.5 w-3.5" />
            )}
            {loadingFolders ? '获取中...' : '获取文件夹'}
          </Button>
        </div>
        {folderList.length > 0 && (
          <p className="text-xs text-muted-foreground">
            共 {folderList.length} 个文件夹，可从下拉列表中选择或直接输入
          </p>
        )}
      </div>

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
          onClick={onTest}
          disabled={testing || !form.user || !form.password}
          className="gap-2"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
          {testing ? '测试中...' : '测试连接'}
        </Button>
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? '保存中...' : '保存'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </InlineEditCard>
  )
}
