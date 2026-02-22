'use client'

import { Badge } from '@/components/ui/badge'
import { AlertTriangle, XCircle, CheckCircle } from 'lucide-react'

interface AbrogationBadgeProps {
  isAbroge?: boolean | null
  abrogeSuspected?: boolean | null
  abrogeConfidence?: 'low' | 'medium' | 'high' | null
  className?: string
}

export function AbrogationBadge({
  isAbroge,
  abrogeSuspected,
  abrogeConfidence,
  className,
}: AbrogationBadgeProps) {
  if (isAbroge) {
    return (
      <Badge
        variant="destructive"
        className={`gap-1 text-xs ${className || ''}`}
        title="Document confirmé abrogé — retiré du RAG"
      >
        <XCircle className="h-3 w-3" />
        Abrogé
      </Badge>
    )
  }

  if (abrogeSuspected) {
    const colorClass =
      abrogeConfidence === 'high'
        ? 'bg-orange-600 hover:bg-orange-700 text-white'
        : abrogeConfidence === 'medium'
          ? 'bg-orange-400 hover:bg-orange-500 text-white'
          : 'bg-yellow-500 hover:bg-yellow-600 text-white'

    const label =
      abrogeConfidence === 'high'
        ? 'Abrogé? (sûr)'
        : abrogeConfidence === 'medium'
          ? 'Abrogé? (moyen)'
          : 'Abrogé? (faible)'

    return (
      <Badge
        className={`gap-1 text-xs ${colorClass} ${className || ''}`}
        title={`Suspicion d'abrogation — confidence: ${abrogeConfidence}`}
      >
        <AlertTriangle className="h-3 w-3" />
        {label}
      </Badge>
    )
  }

  return null
}
