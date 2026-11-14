'use client'

import { GRANULARITY_LABELS } from '@/types/trend'
import type { TrendGranularity } from '@/types/trend'

interface Props {
  value: TrendGranularity
  onChange: (granularity: TrendGranularity) => void
}

const ITEMS: TrendGranularity[] = ['daily', 'weekly', 'monthly', 'yearly']

export function TrendGranularitySelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
      {ITEMS.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
            value === g
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {GRANULARITY_LABELS[g]}
        </button>
      ))}
    </div>
  )
}
