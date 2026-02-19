'use client'

import { getIndexationPercentage } from './utils'

interface IndexationProgressProps {
  indexed: number
  total: number
  compact?: boolean
}

export function IndexationProgress({ indexed, total, compact = false }: IndexationProgressProps) {
  const percentage = getIndexationPercentage(indexed, total)
  const barColor = percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-[100px]">
        <span className="text-xs text-slate-300 tabular-nums whitespace-nowrap">
          {indexed.toLocaleString()}/{total.toLocaleString()}
        </span>
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden min-w-[40px]">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300 tabular-nums">
          {indexed.toLocaleString()} / {total.toLocaleString()}
        </span>
        <span className="text-slate-400">{percentage}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}
