'use client'

import { Icons } from '@/lib/icons'

interface HealthBadgeProps {
  status: string
  consecutiveFailures?: number
  size?: 'sm' | 'md'
}

export function HealthBadge({ status, consecutiveFailures = 0, size = 'md' }: HealthBadgeProps) {
  const config = getHealthConfig(status, consecutiveFailures)
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${textSize} font-medium ${config.classes}`}>
      <config.icon className={iconSize} />
      {config.label}
    </span>
  )
}

function getHealthConfig(status: string, failures: number) {
  switch (status) {
    case 'healthy':
      return {
        icon: Icons.checkCircle,
        label: 'OK',
        classes: 'bg-green-500/15 text-green-400 border border-green-500/30',
      }
    case 'degraded':
      return {
        icon: Icons.alertTriangle,
        label: 'Degraded',
        classes: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
      }
    case 'failing':
      return {
        icon: Icons.xCircle,
        label: failures > 0 ? `Erreur (${failures})` : 'Erreur',
        classes: 'bg-red-500/15 text-red-400 border border-red-500/30',
      }
    default:
      return {
        icon: Icons.alertCircle,
        label: 'Inconnu',
        classes: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
      }
  }
}
