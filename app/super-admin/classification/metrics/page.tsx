'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  Activity,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Brain,
  FileText,
  Target,
  Zap,
  RefreshCw,
} from 'lucide-react'

interface LearningStats {
  totalCorrections: number
  unusedCorrections: number
  rulesGenerated: number
  taxonomySuggestions: number
  avgAccuracyImprovement: number
}

interface ClassificationStats {
  total: number
  byDomain: Record<string, number>
  byCategory: Record<string, number>
  pendingValidation: number
  avgConfidence: number
}

interface RuleEffectiveness {
  ruleId: string
  ruleName: string
  accuracy: number
  totalMatches: number
  correctMatches: number
  recommendation: 'keep' | 'review' | 'disable'
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export default function ClassificationMetricsPage() {
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null)
  const [classificationStats, setClassificationStats] = useState<ClassificationStats | null>(null)
  const [rulesEffectiveness, setRulesEffectiveness] = useState<RuleEffectiveness[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/super-admin/learning?action=stats')
      const data = await response.json()

      setLearningStats(data.learning)
      setClassificationStats(data.classification)
      setRulesEffectiveness(data.rulesEffectiveness || [])
      setLastUpdate(new Date())
    } catch (error) {
      console.error('Erreur chargement métriques:', error)
    } finally {
      setLoading(false)
    }
  }

  const runLearningCycle = async () => {
    if (running) return

    setRunning(true)
    try {
      const response = await fetch('/api/super-admin/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run-cycle' }),
      })

      const result = await response.json()

      if (result.success) {
        alert(`✅ Cycle terminé en ${result.duration}ms\n\n` +
          `Règles générées: ${result.result.rulesGenerated}\n` +
          `Suggestions taxonomie: ${result.result.taxonomySuggestions}\n` +
          `Règles à revoir: ${result.result.rulesReviewed}`)

        // Rafraîchir les métriques
        await fetchMetrics()
      }
    } catch (error) {
      console.error('Erreur cycle apprentissage:', error)
      alert('❌ Erreur lors du cycle d\'apprentissage')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    // Rafraîchir toutes les 5 minutes
    const interval = setInterval(fetchMetrics, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Préparer données pour graphiques
  const domainData = classificationStats
    ? Object.entries(classificationStats.byDomain).map(([name, value]) => ({
        name,
        value: typeof value === 'number' ? value : parseInt(value as string, 10),
      }))
    : []

  const categoryData = classificationStats
    ? Object.entries(classificationStats.byCategory).map(([name, value]) => ({
        name,
        value: typeof value === 'number' ? value : parseInt(value as string, 10),
      }))
    : []

  const rulesData = rulesEffectiveness.map(rule => ({
    name: rule.ruleName.substring(0, 20) + '...',
    accuracy: Math.round(rule.accuracy * 100),
    matches: rule.totalMatches,
  }))

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Métriques de Classification</h1>
          <p className="text-muted-foreground">
            Tableau de bord d'apprentissage automatique et de performance
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-sm text-muted-foreground">
              Mis à jour: {lastUpdate.toLocaleTimeString('fr-TN')}
            </span>
          )}
          <Button onClick={fetchMetrics} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
          <Button onClick={runLearningCycle} disabled={running}>
            {running ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Brain className="h-4 w-4 mr-2" />
            )}
            {running ? 'En cours...' : 'Lancer Apprentissage'}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pages Classées</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{classificationStats?.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {classificationStats?.pendingValidation} en attente validation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confiance Moyenne</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((classificationStats?.avgConfidence || 0) * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {(classificationStats?.avgConfidence || 0) > 0.8 ? (
                <span className="text-green-600">✅ Excellent</span>
              ) : (
                <span className="text-orange-600">⚠️ À améliorer</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Règles Générées</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{learningStats?.rulesGenerated}</div>
            <p className="text-xs text-muted-foreground">
              {learningStats?.unusedCorrections} corrections non utilisées
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Précision Règles</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((learningStats?.avgAccuracyImprovement || 0) * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Efficacité moyenne</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphiques */}
      <Tabs defaultValue="domains" className="space-y-4">
        <TabsList>
          <TabsTrigger value="domains">Par Domaine</TabsTrigger>
          <TabsTrigger value="categories">Par Catégorie</TabsTrigger>
          <TabsTrigger value="rules">Efficacité Règles</TabsTrigger>
        </TabsList>

        <TabsContent value="domains" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Distribution par Domaine Juridique</CardTitle>
              <CardDescription>Répartition des pages classées par domaine</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={domainData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {domainData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Distribution par Catégorie</CardTitle>
              <CardDescription>Répartition des pages par type de contenu</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#8884d8" name="Nombre de pages" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Efficacité des Règles</CardTitle>
              <CardDescription>Précision et nombre de matchs par règle</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={rulesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="accuracy" fill="#10B981" name="Précision (%)" />
                  <Bar dataKey="matches" fill="#3B82F6" name="Nombre de matchs" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Liste des règles */}
          <Card>
            <CardHeader>
              <CardTitle>Détail des Règles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rulesEffectiveness.slice(0, 10).map((rule) => (
                  <div
                    key={rule.ruleId}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{rule.ruleName}</div>
                      <div className="text-sm text-muted-foreground">
                        {rule.correctMatches}/{rule.totalMatches} matchs corrects
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold">
                          {(rule.accuracy * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-muted-foreground">Précision</div>
                      </div>
                      <Badge
                        variant={
                          rule.recommendation === 'keep'
                            ? 'default'
                            : rule.recommendation === 'review'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {rule.recommendation === 'keep' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {rule.recommendation === 'review' && <Activity className="h-3 w-3 mr-1" />}
                        {rule.recommendation === 'disable' && <AlertCircle className="h-3 w-3 mr-1" />}
                        {rule.recommendation}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
