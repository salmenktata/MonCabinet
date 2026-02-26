'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { QuotaCard } from '@/components/super-admin/quotas/QuotaCard'
import { Icons } from '@/lib/icons'
import { PROVIDERS_WITH_QUOTAS } from '@/lib/constants/providers'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from '@/components/charts/LazyCharts'

interface QuotaData {
  provider: string
  today: {
    total_tokens: number
    cost_usd: number
    quota?: number
    usage_percent: number
  }
  month: {
    total_tokens: number
    cost_usd: number
    quota?: number
    usage_percent: number
  }
  current_rpm: number
  rpm_limit?: number
  trend: Array<{
    date: string
    total_tokens: number
    cost_usd: number
  }>
  quotas: {
    tokensPerDay?: number
    tokensPerMonth?: number
    rpm?: number
    costPerMTokenInput: number
    costPerMTokenOutput: number
  }
}

export default function QuotasPage() {
  const [quotasData, setQuotasData] = useState<Record<string, QuotaData | null>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('groq')

  useEffect(() => {
    fetchQuotas()
  }, [])

  const fetchQuotas = async () => {
    setLoading(true)
    try {
      // Fetch quotas pour tous les providers avec quotas
      const promises = PROVIDERS_WITH_QUOTAS.map(provider =>
        fetch(`/api/admin/quotas?provider=${provider.id}`).then(r => r.json())
      )

      const results = await Promise.all(promises)

      const data: Record<string, QuotaData | null> = {}
      PROVIDERS_WITH_QUOTAS.forEach((provider, index) => {
        data[provider.id] = results[index]
      })

      setQuotasData(data)
    } catch (error) {
      console.error('Erreur récupération quotas:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Icons.loader className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const hasAlert = (data: QuotaData | null) => {
    if (!data) return false
    return data.today.usage_percent >= 80 || data.month.usage_percent >= 80
  }

  const getProviderData = (providerId: string) => quotasData[providerId]

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quotas & Alertes</h1>
          <p className="text-muted-foreground mt-1">
            Suivi consommation providers IA et limites tier gratuit
          </p>
        </div>
        <button
          onClick={fetchQuotas}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          <Icons.refresh className="h-4 w-4" />
          Rafraîchir
        </button>
      </div>

      {/* Alertes globales */}
      {Object.values(quotasData).some(data => hasAlert(data)) && (
        <Alert className="border-orange-500 bg-orange-500/10">
          <Icons.alertTriangle className="h-4 w-4 text-orange-500" />
          <AlertTitle>⚠️ Quotas élevés détectés</AlertTitle>
          <AlertDescription>
            Un ou plusieurs providers approchent de leur limite. Envisagez un upgrade vers un tier payant.
          </AlertDescription>
        </Alert>
      )}

      {/* Onglets providers */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${PROVIDERS_WITH_QUOTAS.length}, minmax(0, 1fr))` }}>
          {PROVIDERS_WITH_QUOTAS.map(provider => (
            <TabsTrigger key={provider.id} value={provider.id} className="flex items-center gap-2">
              <span>{provider.icon}</span>
              <span className="hidden sm:inline">{provider.name}</span>
              {hasAlert(getProviderData(provider.id)) && (
                <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Onglets dynamiques pour chaque provider */}
        {PROVIDERS_WITH_QUOTAS.map(provider => {
          const data = getProviderData(provider.id)
          return (
            <TabsContent key={provider.id} value={provider.id} className="space-y-6">
              {data && (
                <>
                  <QuotaCard
                    provider={provider.id}
                    todayUsage={data.today}
                    monthUsage={data.month}
                    currentRPM={data.current_rpm}
                    rpmLimit={data.rpm_limit}
                    tier={provider.tier}
                  />

                  {/* Tendance (seulement pour Gemini) */}
                  {provider.id === 'gemini' && data.trend && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Tendance 7 derniers jours</CardTitle>
                        <CardDescription>Consommation quotidienne tokens</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={data.trend.reverse()}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="date"
                              tickFormatter={(date) => new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                            />
                            <YAxis
                              tickFormatter={(value) => `${(value / 1_000_000).toFixed(1)}M`}
                            />
                            <Tooltip
                              formatter={(value, name) => {
                                if (typeof value !== 'number' || !name) return ['', '']
                                if (name === 'total_tokens') {
                                  return [`${(value / 1_000_000).toFixed(2)}M tokens`, 'Tokens']
                                }
                                return [`$${value.toFixed(2)}`, 'Coût']
                              }}
                              labelFormatter={(date) => new Date(date).toLocaleDateString('fr-FR')}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="total_tokens"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              name="Tokens"
                            />
                          </LineChart>
                        </ResponsiveContainer>

                        {/* Limite gratuite */}
                        {data.quotas?.tokensPerDay && (
                          <div className="mt-4 p-3 border border-red-500/30 rounded-lg bg-red-500/5">
                            <p className="text-sm text-muted-foreground">
                              <span className="font-semibold text-red-500">Limite tier gratuit</span> :
                              {' '}{(data.quotas.tokensPerDay / 1_000_000).toFixed(1)}M tokens/jour
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      {/* Recommandations */}
      <Card className="border-blue-500 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icons.lightbulb className="h-5 w-5 text-blue-500" />
            Recommandations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <Icons.checkCircle className="h-4 w-4 text-green-500 mt-0.5" />
            <div>
              <p className="font-semibold">Groq + Ollama = gratuits (chat + batch)</p>
              <p className="text-muted-foreground">
                Groq llama-3.3-70b (chat) + llama-3.1-8b (routing) + Ollama qwen3:8b (indexation, eval) : 0€/mois.
                Seuls OpenAI embeddings + DeepSeek dossiers sont facturés.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icons.info className="h-4 w-4 text-blue-500 mt-0.5" />
            <div>
              <p className="font-semibold">Surveiller DeepSeek ($0.028/M cache hit)</p>
              <p className="text-muted-foreground">
                DeepSeek facture les dossiers juridiques. Coût typique &lt; $2/mois selon volume.
                Alerte si &gt; $5/mois.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icons.trendingUp className="h-4 w-4 text-orange-500 mt-0.5" />
            <div>
              <p className="font-semibold">OpenAI embeddings (~$0.02/M tokens)</p>
              <p className="text-muted-foreground">
                Budget actuel : $10/mois, alerte à $5. Pour 33K chunks réindexés : &lt; $0.01.
                Gemini embeddings (768-dim) gratuits jusqu'à ~100 RPM (free tier, après coupes déc 2025).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
