'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface QuotaProgressBarProps {
  current: number
  limit: number
  label: string
  unit?: string
  showPercentage?: boolean
}

export function QuotaProgressBar({
  current,
  limit,
  label,
  unit = 'tokens',
  showPercentage = true,
}: QuotaProgressBarProps) {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0

  // Couleurs selon usage
  const getColor = () => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 80) return 'bg-orange-500'
    if (percentage >= 60) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toString()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {formatNumber(current)} / {formatNumber(limit)} {unit}
          </span>
          {showPercentage && (
            <span className={cn(
              'font-bold',
              percentage >= 90 && 'text-red-500',
              percentage >= 80 && percentage < 90 && 'text-orange-500',
              percentage >= 60 && percentage < 80 && 'text-yellow-500',
              percentage < 60 && 'text-green-500'
            )}>
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="relative">
        <Progress value={percentage} className="h-3" />
        <div
          className={cn(
            'absolute top-0 left-0 h-3 rounded-full transition-all',
            getColor()
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {percentage >= 80 && (
        <p className={cn(
          'text-xs',
          percentage >= 90 ? 'text-red-500' : 'text-orange-500'
        )}>
          ⚠️ {percentage >= 90 ? 'Quota critique' : 'Quota élevé'} - Envisager upgrade
        </p>
      )}
    </div>
  )
}
