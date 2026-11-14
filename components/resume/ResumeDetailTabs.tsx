'use client'

import { AlertTriangle } from 'lucide-react'
import type { ResumeDetailTab } from '@/types/resume-detail'

/**
 * 简历详情页 Tab 导航（B9 从 page.tsx 提取）。
 * 「异常信息」页签仅在简历状态为 ERROR 时出现。
 */
export function ResumeDetailTabs({
  activeTab,
  onChange,
  hasStructuredData,
  showError,
}: {
  activeTab: ResumeDetailTab
  onChange: (tab: ResumeDetailTab) => void
  hasStructuredData: boolean
  showError: boolean
}) {
  const tabs = [
    { key: 'evaluation' as const, label: '评估结果' },
    { key: 'structured' as const, label: '结构化数据', hasData: hasStructuredData },
    { key: 'text' as const, label: '简历内容' },
    ...(showError ? [{ key: 'error' as const, label: '异常信息' }] : []),
  ]

  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === tab.key
              ? tab.key === 'error' ? 'border-destructive text-destructive' : 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.key === 'error' && <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
          {'hasData' in tab && tab.hasData && (
            <span className="inline-block w-2 h-2 rounded-full bg-success mr-1" />
          )}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
