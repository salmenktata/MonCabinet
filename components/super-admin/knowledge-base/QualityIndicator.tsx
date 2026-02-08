'use client'

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip'
import { Icons } from '@/lib/icons'

interface QualityIndicatorProps {
  score: number | null
  requiresReview?: boolean
  size?: 'xs' | 'sm' | 'md'
  showTooltip?: boolean
  details?: {
    clarity?: number
    structure?: number
    completeness?: number
    reliability?: number
    summary?: string
  }
}

export function QualityIndicator({
  score,
  requiresReview,
  size = 'sm',
  showTooltip = true,
  details,
}: QualityIndicatorProps) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="outline" className="border-slate-600 text-slate-500 text-xs">
        Non analysé
      </Badge>
    )
  }

  const { color, label, icon } = getScoreDisplay(score, requiresReview)

  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  }

  const badge = (
    <Badge className={`${color} ${sizeClasses[size]} gap-1`}>
      {icon}
      {label}
    </Badge>
  )

  if (!showTooltip || !details) {
    return badge
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="bg-slate-800 border-slate-700 text-white max-w-xs"
        >
          <div className="space-y-2">
            <div className="font-medium">Score qualité : {score}/100</div>
            {details.summary && (
              <p className="text-xs text-slate-300">{details.summary}</p>
            )}
            <div className="grid grid-cols-2 gap-1 text-xs">
              {details.clarity !== undefined && (
                <div className="text-slate-400">
                  Clarté: <span className="text-white">{details.clarity}</span>
                </div>
              )}
              {details.structure !== undefined && (
                <div className="text-slate-400">
                  Structure: <span className="text-white">{details.structure}</span>
                </div>
              )}
              {details.completeness !== undefined && (
                <div className="text-slate-400">
                  Complétude: <span className="text-white">{details.completeness}</span>
                </div>
              )}
              {details.reliability !== undefined && (
                <div className="text-slate-400">
                  Fiabilité: <span className="text-white">{details.reliability}</span>
                </div>
              )}
            </div>
            {requiresReview && (
              <div className="text-xs text-yellow-400 flex items-center gap-1">
                <Icons.alertTriangle className="h-3 w-3" />
                Revue requise
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function getScoreDisplay(score: number, requiresReview?: boolean) {
  if (score >= 80) {
    return {
      color: 'bg-green-500/20 text-green-400 border-green-500/30',
      label: `${score}`,
      icon: <Icons.checkCircle className="h-3 w-3" />,
    }
  }
  if (score >= 60) {
    return {
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      label: `${score}`,
      icon: requiresReview
        ? <Icons.alertTriangle className="h-3 w-3" />
        : <Icons.chevronRight className="h-3 w-3" />,
    }
  }
  return {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: `${score}`,
    icon: <Icons.alertCircle className="h-3 w-3" />,
  }
}
