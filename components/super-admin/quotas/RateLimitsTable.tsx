'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'

interface RateLimit {
  provider: string
  model: string
  tier: 'free' | 'paid' | 'local'
  limitType: 'RPD' | 'TPD' | 'RPM' | 'TPM' | 'Budget'
  limitValue: number | null
  unit?: string
  usedToday: number
  percentUsed: number
  status: 'ok' | 'warning' | 'critical' | 'unlimited'
  source: 'redis' | 'db'
}

const PROVIDER_ICONS: Record<string, string> = {
  groq: '⚡',
  deepseek: '🔵',
  openai: '🟢',
  ollama: '🦙',
  gemini: '✨',
  anthropic: '🔶',
}

const PROVIDER_COLORS: Record<string, string> = {
  groq: 'text-orange-400',
  deepseek: 'text-blue-400',
  openai: 'text-emerald-400',
  ollama: 'text-purple-400',
  gemini: 'text-yellow-400',
  anthropic: 'text-red-400',
}

function StatusBadge({ status }: { status: RateLimit['status'] }) {
  if (status === 'unlimited') return <Badge variant="secondary" className="text-xs">Illimité</Badge>
  if (status === 'critical') return <Badge variant="destructive" className="text-xs">Critique</Badge>
  if (status === 'warning') return <Badge className="text-xs bg-orange-500/20 text-orange-400 border-orange-500/30">Attention</Badge>
  return <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">OK</Badge>
}

function TierBadge({ tier }: { tier: RateLimit['tier'] }) {
  if (tier === 'local') return <Badge variant="secondary" className="text-xs font-mono">LOCAL</Badge>
  if (tier === 'free') return <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30 font-mono">FREE TIER</Badge>
  return <Badge variant="outline" className="text-xs font-mono">PAID</Badge>
}

function formatLimitValue(limit: RateLimit): string {
  if (limit.limitValue === null) return '∞'
  if (limit.limitType === 'Budget') return `$${limit.limitValue}${limit.unit ? `/${limit.unit.split('/')[1]}` : ''}`
  if (limit.limitType === 'TPD' || limit.limitType === 'TPM') {
    if (limit.limitValue >= 1_000_000) return `${(limit.limitValue / 1_000_000).toFixed(1)}M`
    if (limit.limitValue >= 1_000) return `${(limit.limitValue / 1_000).toFixed(0)}K`
    return limit.limitValue.toLocaleString('fr-FR')
  }
  return limit.limitValue.toLocaleString('fr-FR')
}

function formatUsedValue(limit: RateLimit): string {
  if (limit.status === 'unlimited') return '—'
  if (limit.limitType === 'Budget') return `$${limit.usedToday.toFixed(3)}`
  if (limit.limitType === 'TPD' || limit.limitType === 'TPM') {
    if (limit.usedToday >= 1_000_000) return `${(limit.usedToday / 1_000_000).toFixed(2)}M`
    if (limit.usedToday >= 1_000) return `${(limit.usedToday / 1_000).toFixed(1)}K`
    return limit.usedToday.toLocaleString('fr-FR')
  }
  return limit.usedToday.toLocaleString('fr-FR')
}

const LIMIT_TYPE_LABELS: Record<string, string> = {
  RPD: 'Req./jour',
  TPD: 'Tokens/jour',
  RPM: 'Req./min',
  TPM: 'Tokens/min',
  Budget: 'Budget',
}

export function RateLimitsTable({ rateLimits }: { rateLimits: RateLimit[] }) {
  // Filtrer les lignes RPM (pas de données temps réel) sauf si elles ont une vraie valeur utile
  const displayed = rateLimits.filter(r => r.status !== 'unlimited' || r.tier !== 'local')

  // Grouper par provider
  const byProvider = displayed.reduce<Record<string, RateLimit[]>>((acc, r) => {
    if (!acc[r.provider]) acc[r.provider] = []
    acc[r.provider].push(r)
    return acc
  }, {})

  const hasAnyAlert = rateLimits.some(r => r.status === 'critical' || r.status === 'warning')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icons.activity className="h-5 w-5" />
              Limites temps réel par modèle
            </CardTitle>
            <CardDescription>
              Consommation du jour vs limites par modèle. Sources : Redis (Groq/DeepSeek) + DB (OpenAI/Gemini).
            </CardDescription>
          </div>
          {hasAnyAlert && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <Icons.alertTriangle className="h-3 w-3" />
              Alertes actives
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-3 text-left font-medium">Provider / Modèle</th>
                <th className="pb-3 text-left font-medium">Type</th>
                <th className="pb-3 text-right font-medium">Limite</th>
                <th className="pb-3 text-right font-medium">Aujourd'hui</th>
                <th className="pb-3 text-left font-medium pl-4 min-w-[160px]">Utilisation</th>
                <th className="pb-3 text-center font-medium">Tier</th>
                <th className="pb-3 text-center font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {Object.entries(byProvider).map(([provider, limits]) =>
                limits.map((limit, idx) => (
                  <tr key={`${provider}-${limit.model}-${limit.limitType}`} className="hover:bg-muted/30 transition-colors">
                    {/* Provider + modèle (seulement sur la 1ère ligne du groupe) */}
                    <td className="py-3 pr-4">
                      {idx === 0 ? (
                        <div className="flex flex-col">
                          <span className={`font-semibold ${PROVIDER_COLORS[provider] || ''}`}>
                            {PROVIDER_ICONS[provider]} {provider.charAt(0).toUpperCase() + provider.slice(1)}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs truncate max-w-[180px]" title={limit.model}>
                            {limit.model}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground font-mono text-xs truncate max-w-[180px] block" title={limit.model}>
                          {limit.model}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">
                      {LIMIT_TYPE_LABELS[limit.limitType] || limit.limitType}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold">
                      {formatLimitValue(limit)}
                    </td>
                    <td className="py-3 text-right font-mono text-muted-foreground">
                      {formatUsedValue(limit)}
                    </td>
                    <td className="py-3 pl-4">
                      {limit.status === 'unlimited' ? (
                        <span className="text-muted-foreground text-xs">Pas de limite</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-[120px] relative">
                            <Progress value={limit.percentUsed} className="h-2" />
                            <div
                              className={cn(
                                'absolute top-0 left-0 h-2 rounded-full transition-all',
                                limit.percentUsed >= 80 ? 'bg-red-500' :
                                limit.percentUsed >= 50 ? 'bg-orange-500' : 'bg-green-500'
                              )}
                              style={{ width: `${limit.percentUsed}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {limit.percentUsed.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <TierBadge tier={limit.tier} />
                    </td>
                    <td className="py-3 text-center">
                      <StatusBadge status={limit.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Légende source des données */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground border-t pt-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-400 inline-block" />
            Redis : données temps réel (Groq, DeepSeek)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
            DB : données agrégées (OpenAI, Gemini)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-purple-400 inline-block" />
            Local : Ollama sans limite
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
