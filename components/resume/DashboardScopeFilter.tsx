'use client'

import { Mail, AtSign, Layers } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface ScopeOption {
  id: string
  label: string
  /** 邮箱维度的完整地址，用于 tooltip */
  address?: string
}

export interface ScopeValue {
  emailConfigId?: string
  resumeSourceId?: string
}

interface DashboardScopeFilterProps {
  emailConfigs: ScopeOption[]
  sources: ScopeOption[]
  value: ScopeValue
  onChange: (value: ScopeValue) => void
  className?: string
}

/**
 * 看板「数据范围」筛选
 *
 * - 邮箱 / 来源都只有一个时：不显示可选控件，只留一枚静态「邮件」标注
 * - 任一维度存在多个取值时：出现对应下拉，默认「全部」
 *
 * 为什么单值不显示控件：只有一个选项的下拉是在浪费首屏空间，
 * 而且会让用户误以为还有别的数据源没接进来。
 */
export function DashboardScopeFilter({
  emailConfigs,
  sources,
  value,
  onChange,
  className,
}: DashboardScopeFilterProps) {
  const multiMailbox = emailConfigs.length > 1
  const multiSource = sources.length > 1

  // 单一来源：只标注数据来自邮件，不作为可点控件
  if (!multiMailbox && !multiSource) {
    const source = sources[0]
    const mailbox = emailConfigs[0]
    const detail = [
      source ? `来源：${source.label}` : null,
      mailbox ? `邮箱：${mailbox.address || mailbox.label}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <span
        title={detail || '数据来自邮件收取'}
        className={cn(
          'inline-flex cursor-default items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground',
          className
        )}
      >
        <Mail className="h-3.5 w-3.5 text-primary/70" />
        邮件
      </span>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      {multiMailbox && (
        <label className="inline-flex items-center gap-1.5">
          <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">邮箱</span>
          <Select
            value={value.emailConfigId || ''}
            onChange={(e) => onChange({ ...value, emailConfigId: e.target.value || undefined })}
            title={selectedTitle(emailConfigs, value.emailConfigId)}
            /* w-auto + shrink-0：宽度由最长选项撑开，邮箱地址不再被截断 */
            className="h-8 w-auto shrink-0 py-1 pr-7 text-sm"
          >
            <option value="">全部邮箱</option>
            {emailConfigs.map((c) => (
              <option key={c.id} value={c.id} title={c.address || c.label}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>
      )}
      {multiSource && (
        <label className="inline-flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">来源</span>
          <Select
            value={value.resumeSourceId || ''}
            onChange={(e) => onChange({ ...value, resumeSourceId: e.target.value || undefined })}
            title={selectedTitle(sources, value.resumeSourceId)}
            className="h-8 w-auto shrink-0 py-1 pr-7 text-sm"
          >
            <option value="">全部来源</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </label>
      )}
    </div>
  )
}

/** 收起态显示的是选中项本身，长邮箱不可换行，宽度自适应后仍需 tooltip 兜底 */
function selectedTitle(options: ScopeOption[], id?: string): string {
  if (!id) return ''
  const hit = options.find((o) => o.id === id)
  return hit ? hit.address || hit.label : ''
}
