'use client'

import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface LegalPortalCardProps {
  icon: LucideIcon
  titleFr: string
  titleAr: string
  description: string
  count?: number | null
  colorClass: string   // ex: "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200"
  iconBgClass: string  // ex: "bg-blue-100 dark:bg-blue-900"
  onClick: () => void
}

export function LegalPortalCard({
  icon: Icon,
  titleFr,
  titleAr,
  description,
  count,
  colorClass,
  iconBgClass,
  onClick,
}: LegalPortalCardProps) {
  return (
    <Card
      className={`cursor-pointer border transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none ${colorClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-lg shrink-0 ${iconBgClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="font-bold text-base leading-tight">{titleFr}</div>
            <div className="text-sm font-medium opacity-70" dir="rtl">{titleAr}</div>
            <p className="text-xs opacity-60 mt-1.5 line-clamp-2 leading-relaxed">
              {description}
            </p>
            {count != null && count > 0 && (
              <Badge variant="secondary" className="text-xs mt-2 opacity-80">
                {count.toLocaleString('fr-FR')} documents
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
