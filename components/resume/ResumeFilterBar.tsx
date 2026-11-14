'use client'

import { useRef } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

/** 简历状态筛选项 */
const STATUS_OPTIONS = [
  { value: 'ALL', label: '全部状态' },
  { value: 'PENDING', label: '待筛选' },
  { value: 'SCREENING', label: '筛选中' },
  { value: 'SCREENED', label: '已评估' },
]

interface ResumeFilterBarProps {
  /** 搜索框显示值（本地状态） */
  searchInput: string
  /** 更新搜索框显示值（IME 安全） */
  onSearchTextChange: (value: string) => void
  /** 提交搜索（非组合态 / 组合结束） */
  onSearchCommit: (value: string) => void
  /** 接收时间范围 */
  dateFrom: string
  onDateFromChange: (value: string) => void
  dateTo: string
  onDateToChange: (value: string) => void
  /** 当前 tab */
  activeTab: string
  /** 状态筛选 */
  status: string
  onStatusChange: (value: string) => void
  /** 职位筛选 */
  positionId: string
  onPositionIdChange: (value: string) => void
  positions: { id: string; title: string }[]
  /** 来源筛选 */
  resumeSourceId: string
  onResumeSourceIdChange: (value: string) => void
  resumeSources: { id: string; name?: string }[]
  /** 邮箱筛选 */
  emailConfigId: string
  onEmailConfigIdChange: (value: string) => void
  emailConfigs: { id: string; alias?: string }[]
}

/**
 * 简历列表筛选栏：搜索（IME 安全）+ 日期范围 + 状态 / 职位 / 来源 / 邮箱筛选。
 * 受控组件，搜索框内部维护 IME 组合标志，避免中文输入被 URL 同步打断。
 */
export function ResumeFilterBar({
  searchInput,
  onSearchTextChange,
  onSearchCommit,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  activeTab,
  status,
  onStatusChange,
  positionId,
  onPositionIdChange,
  positions,
  resumeSourceId,
  onResumeSourceIdChange,
  resumeSources,
  emailConfigId,
  onEmailConfigIdChange,
  emailConfigs,
}: ResumeFilterBarProps) {
  const isComposingRef = useRef(false)

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                onSearchTextChange(e.target.value)
                if (!isComposingRef.current) {
                  onSearchCommit(e.target.value)
                }
              }}
              onCompositionStart={() => { isComposingRef.current = true }}
              onCompositionEnd={(e) => {
                isComposingRef.current = false
                onSearchCommit((e.target as HTMLInputElement).value)
              }}
              placeholder="搜索候选人姓名..."
              className="pl-9 h-10"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-[150px] h-10 text-sm"
              title="起始日期"
            />
            <span className="text-muted-foreground text-sm">至</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-[150px] h-10 text-sm"
              title="结束日期"
            />
          </div>
          {activeTab === 'all' && (
            <Select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-[140px]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          )}
          {activeTab !== 'unassigned' && (
            <Select
              value={positionId}
              onChange={(e) => onPositionIdChange(e.target.value)}
              className="w-[160px]"
            >
              <option value="">全部职位</option>
              {positions.map((pos) => (
                <option key={pos.id} value={pos.id}>
                  {pos.title}
                </option>
              ))}
            </Select>
          )}
          {resumeSources.length > 0 && (
            <Select
              value={resumeSourceId}
              onChange={(e) => onResumeSourceIdChange(e.target.value)}
              className="w-[140px]"
            >
              <option value="">全部来源</option>
              {resumeSources.map((src) => (
                <option key={src.id} value={src.id}>
                  {src.name}
                </option>
              ))}
            </Select>
          )}
          {emailConfigs.length > 1 && (
            <Select
              value={emailConfigId}
              onChange={(e) => onEmailConfigIdChange(e.target.value)}
              className="w-[140px]"
            >
              <option value="">全部邮箱</option>
              {emailConfigs.map((ec) => (
                <option key={ec.id} value={ec.id}>
                  {ec.alias}
                </option>
              ))}
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
