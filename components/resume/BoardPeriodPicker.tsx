'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  weekStrToPeriod,
  dateToWeekStr,
  shiftWeekStr,
  getCurrentWeekStr,
} from '@/lib/utils/date'

/** 看板时间段（起止日期均为 YYYY-MM-DD，含首尾） */
export interface BoardPeriod {
  from: string
  to: string
}

/** 当前周（周一 ~ 周日）作为默认时间段（日期工具单点在 lib/utils/date，B8-4） */
export function getDefaultBoardPeriod(): BoardPeriod {
  return weekStrToPeriod(getCurrentWeekStr()!) as BoardPeriod
}

interface Props {
  value: BoardPeriod
  onChange: (period: BoardPeriod) => void
}

/**
 * 跟进看板时间段选择器
 *
 * 主路径：起止日期输入框，手动输入任意时间段（含首尾）。
 * 快捷路径：原生周输入 + 上一周/下一周按钮，选择后一键换算回填起止日期框。
 * 快捷输入只负责回填，不锁定类型。
 */
export function BoardPeriodPicker({ value, onChange }: Props) {
  // 快捷输入值按默认周期（当前周）初始化；手动改日期后不强制回读
  const [weekValue, setWeekValue] = useState<string>(() => dateToWeekStr(value.from))

  // 快捷周输入：选择后回填起止日期
  const handleQuickInput = (raw: string) => {
    setWeekValue(raw)
    const period = weekStrToPeriod(raw)
    if (period) onChange(period)
  }

  // 上一/下一周：基于快捷周值平移一周
  const handleShift = (delta: number) => {
    const next = shiftWeekStr(weekValue || dateToWeekStr(value.from), delta)
    setWeekValue(next)
    const period = weekStrToPeriod(next)
    if (period) onChange(period)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 起止日期手动输入（含首尾） */}
      <div className="inline-flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">时间:</span>
        <Input
          type="date"
          value={value.from}
          onChange={(e) => {
            const v = e.target.value
            if (v) {
              onChange({ ...value, from: v })
              // 同步快捷周框：否则手动改日期后周框仍显示旧值，
              // 再选同值周（如「本周」）时 change 不触发、不生效
              setWeekValue(dateToWeekStr(v))
            }
          }}
          className="h-8 w-36 px-2 text-sm"
        />
        <span className="text-sm text-muted-foreground">~</span>
        <Input
          type="date"
          value={value.to}
          onChange={(e) => {
            const v = e.target.value
            if (v) {
              onChange({ ...value, to: v })
              // 同起始日期：任意一端修改都同步周框，保证再次选周时能触发 change
              setWeekValue(dateToWeekStr(v))
            }
          }}
          className="h-8 w-36 px-2 text-sm"
        />
      </div>

      {/* 快捷：周输入 + 上一/下一周 */}
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleShift(-1)}
          title="上一周"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Input
          type="week"
          value={weekValue}
          onChange={(e) => handleQuickInput(e.target.value)}
          className="h-8 w-40 px-2 text-sm"
        />
        <button
          type="button"
          onClick={() => handleShift(1)}
          title="下一周"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
