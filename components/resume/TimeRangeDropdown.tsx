'use client'

import { Select } from '@/components/ui/select'
import { TIME_RANGE_OPTIONS, TIME_RANGE_LABELS } from '@/types/trend'
import type { TrendGranularity, TimeRange } from '@/types/trend'

interface Props {
  granularity: TrendGranularity
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangeDropdown({ granularity, value, onChange }: Props) {
  const options = TIME_RANGE_OPTIONS[granularity]

  return (
    <div className="inline-flex items-center gap-1.5 time-range-wrapper">
      <span className="text-sm text-muted-foreground">时间:</span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value as TimeRange)}
        className="h-8 w-auto text-sm py-1"
      >
        {options.map((range) => (
          <option key={range} value={range}>
            {TIME_RANGE_LABELS[range]}
          </option>
        ))}
      </Select>
    </div>
  )
}
