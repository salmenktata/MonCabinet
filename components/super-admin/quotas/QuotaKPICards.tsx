'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'

interface Summary {
  totalCostMonthUsd: number
  forecastEndOfMonthUsd: number
  forecastDaysRemaining: number
  topProviderByTokens: string
  topProviderByCost: string
  totalRequestsToday: number
  activeAlerts: string[]
  daysElapsed: number
  daysInMonth: number
}

const PROVIDER_LABELS: Record<string, string> = {
  groq: 'Groq',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  ollama: 'Ollama',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
}

const PROVIDER_ICONS: Record<string, string> = {
  groq: '⚡',
  deepseek: '🔵',
  openai: '🟢',
  ollama: '🦙',
  gemini: '✨',
  anthropic: '🔶',
}

function formatCost(usd: number): string {
  if (usd < 0.01) return '$0.00'
  return `$${usd.toFixed(2)}`
}

interface KPICardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  alert?: boolean
  badge?: string
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

function KPICard({ title, value, subtitle, icon, alert, badge, badgeVariant = 'secondary' }: KPICardProps) {
  return (
    <Card className={alert ? 'border-orange-500/50 bg-orange-500/5' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg ${alert ? 'bg-orange-500/10 text-orange-500' : 'bg-muted text-muted-foreground'}`}>
            {icon}
          </div>
        </div>
        {badge && (
          <div className="mt-3">
            <Badge variant={badgeVariant} className="text-xs">{badge}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function QuotaKPICards({ summary }: { summary: Summary }) {
  const forecastAlert = summary.forecastEndOfMonthUsd > 10
  const progressPercent = Math.round((summary.daysElapsed / summary.daysInMonth) * 100)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Coût mois en cours */}
      <KPICard
        title="Coût mois en cours"
        value={formatCost(summary.totalCostMonthUsd)}
        subtitle={`Jour ${summary.daysElapsed} / ${summary.daysInMonth} (${progressPercent}% du mois)`}
        icon={<Icons.dollar className="h-5 w-5" />}
        badge={summary.totalCostMonthUsd < 1 ? 'Excellent — < $1' : summary.totalCostMonthUsd < 5 ? 'Nominal' : 'Élevé'}
        badgeVariant={summary.totalCostMonthUsd < 1 ? 'default' : summary.totalCostMonthUsd < 5 ? 'secondary' : 'destructive'}
      />

      {/* Prévision fin de mois */}
      <KPICard
        title="Prévision fin de mois"
        value={formatCost(summary.forecastEndOfMonthUsd)}
        subtitle={`${summary.forecastDaysRemaining} jours restants`}
        icon={<Icons.trendingUp className="h-5 w-5" />}
        alert={forecastAlert}
        badge={forecastAlert ? 'Attention > $10' : `Projection J+${summary.forecastDaysRemaining}`}
        badgeVariant={forecastAlert ? 'destructive' : 'outline'}
      />

      {/* Requêtes aujourd'hui */}
      <KPICard
        title="Requêtes aujourd'hui"
        value={summary.totalRequestsToday.toLocaleString('fr-FR')}
        subtitle="Toutes opérations confondues"
        icon={<Icons.activity className="h-5 w-5" />}
        badge={`Top tokens : ${PROVIDER_ICONS[summary.topProviderByTokens] || ''} ${PROVIDER_LABELS[summary.topProviderByTokens] || summary.topProviderByTokens}`}
        badgeVariant="secondary"
      />

      {/* Alertes actives */}
      <KPICard
        title="Alertes limites"
        value={summary.activeAlerts.length === 0 ? 'Aucune' : `${summary.activeAlerts.length} alerte${summary.activeAlerts.length > 1 ? 's' : ''}`}
        subtitle={
          summary.activeAlerts.length > 0
            ? summary.activeAlerts.slice(0, 2).join(', ')
            : 'Tous les providers dans les limites'
        }
        icon={<Icons.alertTriangle className="h-5 w-5" />}
        alert={summary.activeAlerts.length > 0}
        badge={summary.activeAlerts.length === 0 ? 'Tout OK' : 'Action requise'}
        badgeVariant={summary.activeAlerts.length === 0 ? 'default' : 'destructive'}
      />
    </div>
  )
}
