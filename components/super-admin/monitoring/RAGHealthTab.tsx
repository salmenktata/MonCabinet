'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, AlertTriangle, Activity, Database, TrendingUp, CheckCircle } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'

interface RAGHealthData {
  embeddings: {
    openai: number
    ollama: number
    gemini: number
    total: number
    openaiRatio: number
    ollamaRatio: number
    geminiRatio: number
  }
  queries: {
    '24h': {
      total: number
      successful: number
      failed: number
      successRate: number
    }
    '7d': {
      total: number
      successful: number
      failed: number
      successRate: number
    }
  }
  timeline: Array<{
    date: string
    total: number
    successful: number
    successRate: number
  }>
  violations: {
    thresholdViolations: number
    dimensionMismatch: number
  }
  alerts: {
    hasMismatch: boolean
    lowSuccessRate: boolean
  }
}

const COLORS = {
  openai: '#10b981', // green
  ollama: '#3b82f6', // blue
  gemini: '#8b5cf6', // purple
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
}

export function RAGHealthTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['rag-health'],
    queryFn: async () => {
      const response = await fetch('/api/admin/monitoring/rag-health')
      if (!response.ok) throw new Error('Failed to fetch RAG health')
      const json = await response.json()
      return json.data as RAGHealthData
    },
    refetchInterval: 30000, // Refresh every 30s
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erreur</AlertTitle>
        <AlertDescription>
          Impossible de charger les métriques RAG Health. Vérifiez les logs.
        </AlertDescription>
      </Alert>
    )
  }

  // Prepare pie chart data
  const embeddingsChartData = [
    { name: 'OpenAI (1536-dim)', value: data.embeddings.openai, color: COLORS.openai },
    { name: 'Ollama (1024-dim)', value: data.embeddings.ollama, color: COLORS.ollama },
    { name: 'Gemini (768-dim)', value: data.embeddings.gemini, color: COLORS.gemini },
  ]

  // Prepare line chart data
  const timelineChartData = data.timeline.map(item => ({
    date: new Date(item.date).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }),
    successRate: item.successRate,
  }))

  return (
    <div className="space-y-6">
      {/* Alertes critiques */}
      {data.alerts.hasMismatch && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>🚨 Dimension Mismatch Détecté</AlertTitle>
          <AlertDescription>
            {data.violations.dimensionMismatch} incident(s) de misconfiguration RAG détectés dans les 7 derniers jours.
            Vérifiez que OLLAMA_ENABLED=true ou OPENAI_API_KEY est configuré.
          </AlertDescription>
        </Alert>
      )}

      {data.alerts.lowSuccessRate && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>⚠️ Taux de Succès Bas</AlertTitle>
          <AlertDescription>
            Le taux de succès des requêtes est de {data.queries['24h'].successRate}% (24h).
            Objectif: &gt;90%. Vérifiez la configuration RAG et les providers IA.
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Embeddings Consistency */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Embeddings Coverage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.embeddings.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              chunks indexés (3 providers)
            </p>
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS.openai }} />
                <span className="text-xs">OpenAI: {data.embeddings.openai.toLocaleString()} ({data.embeddings.openaiRatio.toFixed(0)}%)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS.ollama }} />
                <span className="text-xs">Ollama: {data.embeddings.ollama.toLocaleString()} ({data.embeddings.ollamaRatio.toFixed(0)}%)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS.gemini }} />
                <span className="text-xs">Gemini: {data.embeddings.gemini.toLocaleString()} ({data.embeddings.geminiRatio.toFixed(0)}%)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Query Success Rate 24h */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taux Succès 24h</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.queries['24h'].successRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.queries['24h'].successful.toLocaleString()} / {data.queries['24h'].total.toLocaleString()} requêtes
            </p>
            <div className="mt-2">
              <Badge 
                variant={data.queries['24h'].successRate >= 90 ? 'default' : 'destructive'}
                className="text-xs"
              >
                {data.queries['24h'].failed} échecs
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Query Success Rate 7d */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taux Succès 7j</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.queries['7d'].successRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.queries['7d'].successful.toLocaleString()} / {data.queries['7d'].total.toLocaleString()} requêtes
            </p>
            <div className="mt-2">
              <Badge 
                variant={data.queries['7d'].successRate >= 90 ? 'default' : 'destructive'}
                className="text-xs"
              >
                {data.queries['7d'].failed} échecs
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Incidents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Incidents 7j</CardTitle>
            {data.violations.dimensionMismatch > 0 ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.violations.dimensionMismatch}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Dimension mismatch
            </p>
            <div className="mt-2">
              <Badge 
                variant={data.violations.dimensionMismatch === 0 ? 'default' : 'destructive'}
                className="text-xs"
              >
                {data.violations.dimensionMismatch === 0 ? 'Aucun incident' : 'Action requise'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart: Embeddings Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribution Embeddings</CardTitle>
            <CardDescription>
              OpenAI 1536-dim · Ollama 1024-dim · Gemini 768-dim
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={embeddingsChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${(name || '').split(' ')[0]}: ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {embeddingsChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `${Number(value).toLocaleString()} chunks`}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Line Chart: Query Success Rate Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Taux de Succès (7 derniers jours)</CardTitle>
            <CardDescription>
              Évolution du taux de succès des requêtes RAG
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="successRate" 
                  stroke={COLORS.success}
                  strokeWidth={2}
                  dot={{ fill: COLORS.success }}
                  name="Taux de succès"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recommandations */}
      <Card>
        <CardHeader>
          <CardTitle>Recommandations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.embeddings.openaiRatio < 10 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Seulement {data.embeddings.openaiRatio.toFixed(1)}% des embeddings utilisent OpenAI haute qualité.
                Envisagez de réindexer avec OpenAI pour améliorer la pertinence RAG.
              </AlertDescription>
            </Alert>
          )}

          {data.embeddings.geminiRatio < 50 && data.embeddings.gemini > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Réindexation Gemini en cours : {data.embeddings.geminiRatio.toFixed(1)}% couverts
                ({data.embeddings.gemini.toLocaleString()} / {data.embeddings.total.toLocaleString()} chunks).
                Relancez <code className="text-xs">/api/admin/reindex-kb-gemini</code> pour continuer.
              </AlertDescription>
            </Alert>
          )}
          
          {data.queries['24h'].successRate < 90 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Taux de succès inférieur à 90%. Vérifiez :
                <ul className="list-disc list-inside mt-2">
                  <li>Configuration RAG (OLLAMA_ENABLED, OPENAI_API_KEY)</li>
                  <li>Disponibilité des providers IA</li>
                  <li>Quotas API non dépassés</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {data.violations.dimensionMismatch === 0 && data.queries['24h'].successRate >= 90 && (
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-700">
                ✅ Configuration RAG optimale. Aucune action requise.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
