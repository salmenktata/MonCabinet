'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { QuotaCard } from '@/components/super-admin/quotas/QuotaCard'
import { Icons } from '@/lib/icons'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

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
  const [geminiData, setGeminiData] = useState<QuotaData | null>(null)
  const [deepseekData, setDeepseekData] = useState<QuotaData | null>(null)
  const [groqData, setGroqData] = useState<QuotaData | null>(null)
  const [ollamaData, setOllamaData] = useState<QuotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('gemini')

  useEffect(() => {
    fetchQuotas()
  }, [])

  const fetchQuotas = async () => {
    setLoading(true)
    try {
      const [gemini, deepseek, groq, ollama] = await Promise.all([
        fetch('/api/admin/quotas?provider=gemini').then(r => r.json()),
        fetch('/api/admin/quotas?provider=deepseek').then(r => r.json()),
        fetch('/api/admin/quotas?provider=groq').then(r => r.json()),
        fetch('/api/admin/quotas?provider=ollama').then(r => r.json()),
      ])
      setGeminiData(gemini)
      setDeepseekData(deepseek)
      setGroqData(groq)
      setOllamaData(ollama)
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
      {(hasAlert(geminiData) || hasAlert(deepseekData) || hasAlert(groqData)) && (
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="gemini" className="flex items-center gap-2">
            <Icons.sparkles className="h-4 w-4" />
            Gemini
            {hasAlert(geminiData) && (
              <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="deepseek" className="flex items-center gap-2">
            <Icons.brain className="h-4 w-4" />
            DeepSeek
          </TabsTrigger>
          <TabsTrigger value="groq" className="flex items-center gap-2">
            <Icons.zap className="h-4 w-4" />
            Groq
          </TabsTrigger>
          <TabsTrigger value="ollama" className="flex items-center gap-2">
            <Icons.database className="h-4 w-4" />
            Ollama
          </TabsTrigger>
        </TabsList>

        {/* Gemini */}
        <TabsContent value="gemini" className="space-y-6">
          {geminiData && (
            <>
              <QuotaCard
                provider="gemini"
                todayUsage={geminiData.today}
                monthUsage={geminiData.month}
                currentRPM={geminiData.current_rpm}
                rpmLimit={geminiData.rpm_limit}
                tier={geminiData.quotas.tokensPerDay ? 'free' : 'paid'}
              />

              {/* Tendance */}
              <Card>
                <CardHeader>
                  <CardTitle>Tendance 7 derniers jours</CardTitle>
                  <CardDescription>Consommation quotidienne tokens</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={geminiData.trend.reverse()}>
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

                  {/* Limite gratuite (ligne rouge) */}
                  {geminiData.quotas.tokensPerDay && (
                    <div className="mt-4 p-3 border border-red-500/30 rounded-lg bg-red-500/5">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-red-500">Limite tier gratuit</span> :
                        {' '}{(geminiData.quotas.tokensPerDay / 1_000_000).toFixed(1)}M tokens/jour
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* DeepSeek */}
        <TabsContent value="deepseek" className="space-y-6">
          {deepseekData && (
            <QuotaCard
              provider="deepseek"
              todayUsage={deepseekData.today}
              monthUsage={deepseekData.month}
              currentRPM={deepseekData.current_rpm}
              rpmLimit={deepseekData.rpm_limit}
              tier="paid"
            />
          )}
        </TabsContent>

        {/* Groq */}
        <TabsContent value="groq" className="space-y-6">
          {groqData && (
            <QuotaCard
              provider="groq"
              todayUsage={groqData.today}
              monthUsage={groqData.month}
              currentRPM={groqData.current_rpm}
              rpmLimit={groqData.rpm_limit}
              tier={groqData.quotas.tokensPerDay ? 'free' : 'paid'}
            />
          )}
        </TabsContent>

        {/* Ollama */}
        <TabsContent value="ollama" className="space-y-6">
          {ollamaData && (
            <QuotaCard
              provider="ollama"
              todayUsage={ollamaData.today}
              monthUsage={ollamaData.month}
              currentRPM={ollamaData.current_rpm}
              tier="local"
            />
          )}
        </TabsContent>
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
              <p className="font-semibold">Gemini Paid Tier (Recommandé)</p>
              <p className="text-muted-foreground">
                Pour 10K docs/mois : ~$11.25/mois (35 TND) avec 1000 RPM. Économie -90% vs DeepSeek.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icons.info className="h-4 w-4 text-blue-500 mt-0.5" />
            <div>
              <p className="font-semibold">Configurer alerte budget</p>
              <p className="text-muted-foreground">
                Dans Google Cloud Console, définir budget alert à $15/mois pour monitoring.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icons.trendingUp className="h-4 w-4 text-orange-500 mt-0.5" />
            <div>
              <p className="font-semibold">Scaler progressivement</p>
              <p className="text-muted-foreground">
                Commencer avec 100 docs/jour (3000/mois), valider coûts réels, puis scaler à 10K.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
