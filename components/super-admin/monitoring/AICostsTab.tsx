'use client'

/**
 * Tab AI Costs - Statistiques coûts IA
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { Skeleton } from '@/components/ui/skeleton'

// Taux de change USD -> TND (approximatif)
const USD_TO_TND = 3.1

function formatTND(usdAmount: number): string {
  return (usdAmount * USD_TO_TND).toFixed(3)
}

interface CostsStats {
  total_cost: number
  total_operations: number
  unique_users: number
  total_tokens: number
  daily_costs: Array<{
    date: string
    cost: number
    operations: number
  }>
  top_users: Array<{
    user_id: string
    user_email: string
    total_cost: number
    operations: number
  }>
  costs_by_provider: Array<{
    provider: string
    total_cost: number
    operations: number
  }>
}

interface GeminiCosts {
  rpmStats: { requestsThisMinute: number; limit: number; availableSlots: number }
  costs: {
    llm: Array<{ date: string; calls: number; tokensIn: number; tokensOut: number; estimatedCostUSD: number }>
    embeddings: Array<{ date: string; calls: number; chars: number; estimatedCostUSD: number }>
    totals: { llmCalls: number; llmTokensIn: number; llmTokensOut: number; embeddingCalls: number; estimatedCostUSD: number }
  }
  thresholds: { dailyLLMCallsAlert: number; dailyCostUSDAlert: number }
}

interface GroqStats {
  stats: Array<{
    date: string
    totalCalls: number
    byModel: Record<string, { calls: number; tokensIn: number; tokensOut: number; estimatedCostUsd: number }>
  }>
  totals: {
    totalCalls: number
    total70bCalls: number
    total8bCalls: number
    totalTokensIn: number
    totalTokensOut: number
    estimatedCostUsd: number
  }
  thresholds: { freeTier70bPerDay: number; alertThreshold70b: number }
}

export function AICostsTab() {
  const [stats, setStats] = useState<CostsStats | null>(null)
  const [geminiCosts, setGeminiCosts] = useState<GeminiCosts | null>(null)
  const [groqStats, setGroqStats] = useState<GroqStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCosts()
    fetchGeminiCosts()
    fetchGroqStats()
  }, [])

  async function fetchCosts() {
    try {
      const response = await fetch('/api/admin/ai-costs/summary')
      const data = await response.json()
      if (data.success) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching AI costs:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchGeminiCosts() {
    try {
      const response = await fetch('/api/admin/monitoring/gemini-costs')
      const data = await response.json()
      if (data.status === 'ok') {
        setGeminiCosts(data)
      }
    } catch (error) {
      console.error('Error fetching Gemini costs:', error)
    }
  }

  async function fetchGroqStats() {
    try {
      const response = await fetch('/api/admin/monitoring/groq-stats')
      const data = await response.json()
      if (data.status === 'ok') {
        setGroqStats(data)
      }
    } catch (error) {
      console.error('Error fetching Groq stats:', error)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Aucune donnée disponible
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold">Coûts IA</h2>
        <p className="text-sm text-muted-foreground">
          Analyse des coûts d'utilisation des providers IA (30 derniers jours)
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coût Total (30j)</CardTitle>
            <Icons.dollar className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTND(stats.total_cost)} TND
            </div>
            <p className="text-xs text-muted-foreground">
              ${stats.total_cost.toFixed(2)} USD
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opérations</CardTitle>
            <Icons.zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_operations.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilisateurs IA</CardTitle>
            <Icons.users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unique_users}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Utilisés</CardTitle>
            <Icons.activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.total_tokens.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Costs */}
      <Card>
        <CardHeader>
          <CardTitle>Coûts des 7 derniers jours</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.daily_costs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune donnée disponible
            </div>
          ) : (
            <div className="space-y-2">
              {stats.daily_costs.map((day) => (
                <div
                  key={day.date}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <span className="text-sm font-medium">
                    {new Date(day.date).toLocaleDateString('fr-FR')}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {day.operations} ops
                    </span>
                    <Badge variant="secondary">
                      {formatTND(day.cost)} TND
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gemini Costs (Redis tracking) */}
      {geminiCosts && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Coûts Gemini Embeddings (7 derniers jours)</h3>
            <p className="text-sm text-muted-foreground">Tracking Redis — Embeddings uniquement (text-embedding-004, 768-dim) depuis migration Feb 25</p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">RPM actuel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{geminiCosts.rpmStats.requestsThisMinute}/{geminiCosts.rpmStats.limit}</div>
                <p className="text-xs text-muted-foreground">{geminiCosts.rpmStats.availableSlots} slots disponibles</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Appels LLM Gemini (7j)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{geminiCosts.costs.totals.llmCalls}</div>
                <p className="text-xs text-muted-foreground">Devrait être ~0 depuis migration Feb 25 (Gemini = embeddings uniquement)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Appels Embeddings (7j)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{geminiCosts.costs.totals.embeddingCalls}</div>
                <p className="text-xs text-muted-foreground">text-embedding-004</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Coût estimé (7j)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${geminiCosts.costs.totals.estimatedCostUSD > geminiCosts.thresholds.dailyCostUSDAlert ? 'text-red-500' : 'text-green-500'}`}>
                  ${geminiCosts.costs.totals.estimatedCostUSD.toFixed(4)}
                </div>
                <p className="text-xs text-muted-foreground">{formatTND(geminiCosts.costs.totals.estimatedCostUSD)} TND</p>
              </CardContent>
            </Card>
          </div>

          {geminiCosts.costs.llm.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Détail LLM par jour</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {geminiCosts.costs.llm.map((day) => (
                    <div key={day.date} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <span className="text-sm font-medium">{new Date(day.date).toLocaleDateString('fr-FR')}</span>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{day.calls} appels</span>
                        <span>{(day.tokensIn + day.tokensOut).toLocaleString()} tokens</span>
                        <Badge variant={day.calls > geminiCosts.thresholds.dailyLLMCallsAlert ? 'destructive' : 'secondary'}>
                          ${day.estimatedCostUSD.toFixed(4)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Groq Usage (Redis tracking) */}
      {groqStats && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Usage Groq (7 derniers jours)</h3>
            <p className="text-sm text-muted-foreground">
              Tracking Redis — llama-3.3-70b (assistant-ia) + llama-3.1-8b (classif/expansion) · Free tier 70b : 14 400 req/jour
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Appels 70b (7j)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${groqStats.totals.total70bCalls > groqStats.thresholds.alertThreshold70b * 7 ? 'text-orange-500' : ''}`}>
                  {groqStats.totals.total70bCalls.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Free tier : {groqStats.thresholds.freeTier70bPerDay.toLocaleString()}/jour
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Appels 8b (7j)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{groqStats.totals.total8bCalls.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Classif + expansion queries</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Tokens totaux (7j)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((groqStats.totals.totalTokensIn + groqStats.totals.totalTokensOut) / 1000).toFixed(0)}K
                </div>
                <p className="text-xs text-muted-foreground">
                  {(groqStats.totals.totalTokensIn / 1000).toFixed(0)}K in · {(groqStats.totals.totalTokensOut / 1000).toFixed(0)}K out
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Coût estimé (7j)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">
                  ${groqStats.totals.estimatedCostUsd.toFixed(4)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {groqStats.totals.totalCalls === 0 ? '~$0 (free tier)' : `${formatTND(groqStats.totals.estimatedCostUsd)} TND si payant`}
                </p>
              </CardContent>
            </Card>
          </div>

          {groqStats.stats.some(d => d.totalCalls > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Détail par jour</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {groqStats.stats.filter(d => d.totalCalls > 0).map((day) => {
                    const calls70b = day.byModel['llama-3.3-70b-versatile']?.calls ?? 0
                    const pct70b = groqStats.thresholds.freeTier70bPerDay > 0
                      ? Math.round((calls70b / groqStats.thresholds.freeTier70bPerDay) * 100)
                      : 0
                    return (
                      <div key={day.date} className="flex items-center justify-between border-b pb-2 last:border-0">
                        <span className="text-sm font-medium">{new Date(day.date).toLocaleDateString('fr-FR')}</span>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{day.totalCalls} appels</span>
                          {calls70b > 0 && (
                            <Badge variant={pct70b >= 80 ? 'destructive' : pct70b >= 50 ? 'secondary' : 'outline'}>
                              70b: {calls70b} ({pct70b}% free tier)
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Top Users & Providers */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Users */}
        <Card>
          <CardHeader>
            <CardTitle>Top Utilisateurs</CardTitle>
            <CardDescription>Par coût total (30j)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.top_users.slice(0, 5).map((user, idx) => (
                <div
                  key={user.user_id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <span className="text-sm">{user.user_email}</span>
                  </div>
                  <Badge variant="outline">
                    {formatTND(user.total_cost)} TND
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Costs by Provider */}
        <Card>
          <CardHeader>
            <CardTitle>Coûts par Provider</CardTitle>
            <CardDescription>Répartition (30j)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.costs_by_provider.map((provider) => (
                <div
                  key={provider.provider}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <span className="text-sm font-medium capitalize">
                    {provider.provider}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {provider.operations} ops
                    </span>
                    <Badge>
                      {formatTND(provider.total_cost)} TND
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
