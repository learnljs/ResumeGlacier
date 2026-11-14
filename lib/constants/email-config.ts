/**
 * 邮箱配置单点常量（B9）。
 *
 * imapPresets 原定义在 system-config/email 页，被 startEdit（反查预设）与
 * 表单（渲染预设按钮）两处使用，收敛到本文件避免表单组件反向导出常量。
 */

import type { EmailConfigFormValues } from '@/types/email-config'

/** IMAP 服务商预设（label 为唯一键） */
export const IMAP_PRESETS = [
  { label: '通用 IMAP 邮箱', host: '', port: 993, secure: true },
  { label: 'QQ邮箱', host: 'imap.qq.com', port: 993, secure: true },
  { label: '163邮箱', host: 'imap.163.com', port: 993, secure: true },
  { label: '126邮箱', host: 'imap.126.com', port: 993, secure: true },
  { label: 'Gmail', host: 'imap.gmail.com', port: 993, secure: true },
  { label: 'Outlook', host: 'outlook.office365.com', port: 993, secure: true },
  { label: '自定义', host: '', port: 993, secure: true },
]

/** 默认选中的预设（新建时） */
export const DEFAULT_PRESET = '通用 IMAP 邮箱'

/** 表单空值（新建 / 重置共用） */
export const EMPTY_EMAIL_CONFIG_FORM: EmailConfigFormValues = {
  alias: '',
  host: '',
  port: 993,
  secure: true,
  user: '',
  password: '',
  mailbox: 'INBOX',
  resumeSourceId: '',
}
