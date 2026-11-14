/**
 * 任务批次状态展示配置（代码质量专项：自 task-batches/page.tsx 抽出）。
 *
 * 颜色全部走设计令牌，深色模式由 globals.css 的 .dark 变量接管。
 */

import type { ReactNode } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

export interface TaskBatchStatusStyle {
  label: string
  color: string
  icon: ReactNode
  bgColor: string
}

export const statusConfig: Record<string, TaskBatchStatusStyle> = {
  processing: {
    label: '进行中',
    color: 'text-info',
    bgColor: 'bg-info/10 border-info/30',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  completed: {
    label: '已完成',
    color: 'text-success',
    bgColor: 'bg-success/10 border-success/30',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
}
