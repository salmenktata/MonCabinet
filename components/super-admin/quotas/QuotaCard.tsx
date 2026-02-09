'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { QuotaProgressBar } from './QuotaProgressBar'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface QuotaCardProps {
  provider: string
  todayUsage: {
    total_tokens: number
    cost_usd: number
    quota?: number
    usage_percent: number
  }
  monthUsage: {
    total_tokens: number
    cost_usd: number
    quota?: number
    usage_percent: number
  }
  currentRPM: number
  rpmLimit?: number
  tier: 'free' | 'paid' | 'local'
}

const PROVIDER_ICONS: Record<string, keyof typeof Icons> = {
  gemini: 'sparkles',
  deepseek: 'brain',
  groq: 'zap',
  ollama: 'database',
  anthropic: 'messageSquare',
  openai: 'brain',
}

const PROVIDER_COLORS: Record<string, string> = {
  gemini: 'border-blue-500 bg-blue-500/10',
  deepseek: 'border-purple-500 bg-purple-500/10',
  groq: 'border-yellow-500 bg-yellow-500/10',
  ollama: 'border-green-500 bg-green-500/10',
  anthropic: 'border-orange-500 bg-orange-500/10',
  openai: 'border-teal-500 bg-teal-500/10',
}

export function QuotaCard({
  provider,
  todayUsage,
  monthUsage,
  currentRPM,
  rpmLimit,
  tier,
}: QuotaCardProps) {
  const Icon = Icons[PROVIDER_ICONS[provider] || 'circle']
  const colorClass = PROVIDER_COLORS[provider] || 'border-slate-500 bg-slate-500/10'

  const formatCost = (usd: number) => {
    const tnd = usd * 3.09
    return `$${usd.toFixed(2)} (${tnd.toFixed(2)} TND)`
  }

  const getTierBadge = () => {
    switch (tier) {
      case 'free':
        return <Badge variant="secondary" className="bg-green-500/20 text-green-500">Gratuit</Badge>
      case 'paid':
        return <Badge variant="secondary" className="bg-blue-500/20 text-blue-500">Payant</Badge>
      case 'local':
        return <Badge variant="secondary" className="bg-slate-500/20 text-slate-400">Local</Badge>
    }
  }

  return (
    <Card className={cn('border-2', colorClass)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-background p-2">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="capitalize">{provider}</CardTitle>
              <CardDescription>Suivi quotas et consommation</CardDescription>
            </div>
          </div>
          {getTierBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Usage aujourd'hui */}
        {todayUsage.quota && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Icons.calendar className="h-4 w-4" />
              Aujourd'hui
            </h4>
            <QuotaProgressBar
              current={todayUsage.total_tokens}
              limit={todayUsage.quota}
              label="Tokens"
              unit="tokens"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Coût estimé : {formatCost(todayUsage.cost_usd)}
            </p>
          </div>
        )}

        {/* Usage ce mois */}
        {monthUsage.quota && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Icons.trendingUp className="h-4 w-4" />
              Ce mois
            </h4>
            <QuotaProgressBar
              current={monthUsage.total_tokens}
              limit={monthUsage.quota}
              label="Tokens"
              unit="tokens"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Coût estimé : {formatCost(monthUsage.cost_usd)}
            </p>
          </div>
        )}

        {/* RPM actuel */}
        {rpmLimit && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Icons.activity className="h-4 w-4" />
              Rate Limit
            </h4>
            <QuotaProgressBar
              current={currentRPM}
              limit={rpmLimit}
              label="Requêtes/minute"
              unit="RPM"
            />
          </div>
        )}

        {/* Tier local (pas de quota) */}
        {tier === 'local' && (
          <div className="text-center py-4">
            <Icons.checkCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-sm text-muted-foreground">
              Provider local - Aucune limite
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Aujourd'hui : {(todayUsage.total_tokens / 1_000_000).toFixed(2)}M tokens
            </p>
            <p className="text-xs text-muted-foreground">
              Ce mois : {(monthUsage.total_tokens / 1_000_000).toFixed(2)}M tokens
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
