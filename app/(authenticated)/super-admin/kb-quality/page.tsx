'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, Play, Eye, TrendingUp } from 'lucide-react'

interface QualityStats {
  totalDocs: number
  withScore: number
  withoutScore: number
  avgScore: number
  distribution: {
    excellent: number
    good: number
    medium: number
    low: number
  }
}

interface ReanalyzeResult {
  documentId: string
  title: string
  success: boolean
  oldScore?: number
  newScore?: number
  improvement?: number
  error?: string
}

export default function KBQualityManagerPage() {
  const [stats, setStats] = useState<QualityStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<any>(null)
  const [reanalyzeResults, setReanalyzeResults] = useState<any>(null)
  const [batchSize, setBatchSize] = useState(20)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/kb/reanalyze-all')
      const data = await response.json()
      if (data.success) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleDryRun = async () => {
    setLoading(true)
    setDryRunResults(null)
    setReanalyzeResults(null)

    try {
      const response = await fetch('/api/admin/kb/reanalyze-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize, dryRun: true }),
      })

      const data = await response.json()
      setDryRunResults(data)
    } catch (error: any) {
      console.error('Error during dry run:', error)
      alert('Erreur: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReanalyze = async () => {
    if (!confirm(`Confirmer la ré-analyse de ${batchSize} documents ?`)) {
      return
    }

    setLoading(true)
    setDryRunResults(null)
    setReanalyzeResults(null)

    try {
      const response = await fetch('/api/admin/kb/reanalyze-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize, dryRun: false }),
      })

      const data = await response.json()
      setReanalyzeResults(data)

      // Rafraîchir les stats
      await fetchStats()
    } catch (error: any) {
      console.error('Error during reanalysis:', error)
      alert('Erreur: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReanalyzeAll = async () => {
    if (!confirm(`ATTENTION: Cela va ré-analyser TOUS les ${stats?.totalDocs} documents. Continuer ?`)) {
      return
    }

    alert('Utilisez le script bash pour la ré-analyse complète:\n\n./scripts/reanalyze-all-kb.sh 20 20\n\nOu lancez-le depuis le terminal.')
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestionnaire Qualité KB</h1>
          <p className="text-muted-foreground mt-1">
            Ré-analyse des documents avec les prompts améliorés
          </p>
        </div>
        <Button onClick={fetchStats} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Rafraîchir
        </Button>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDocs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.withScore} avec score
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Score Moyen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgScore}/100</div>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((stats.withScore / stats.totalDocs) * 100)}% couverture
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Excellent (≥80)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.distribution.excellent}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((stats.distribution.excellent / stats.totalDocs) * 100)}% du total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600">Bon (60-79)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.distribution.good}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((stats.distribution.good / stats.totalDocs) * 100)}% du total
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions de Ré-analyse</CardTitle>
          <CardDescription>
            Ré-analyser les documents avec les nouveaux prompts améliorés (fiabilité documents officiels)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Taille du batch:</label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value))}
              min={1}
              max={100}
              className="w-24 px-3 py-2 border rounded-md"
            />
            <span className="text-sm text-muted-foreground">documents par batch</span>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleDryRun} disabled={loading} variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Dry Run (Simulation)
            </Button>

            <Button onClick={handleReanalyze} disabled={loading} variant="default">
              <Play className="h-4 w-4 mr-2" />
              Ré-analyser {batchSize} documents
            </Button>

            <Button onClick={handleReanalyzeAll} disabled={loading} variant="destructive">
              <TrendingUp className="h-4 w-4 mr-2" />
              Ré-analyser TOUS les documents
            </Button>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Analyse en cours...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Résultats Dry Run */}
      {dryRunResults && (
        <Card>
          <CardHeader>
            <CardTitle>Résultats Simulation (Dry Run)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-4">{dryRunResults.message}</p>
            {dryRunResults.documents && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {dryRunResults.documents.map((doc: any) => (
                  <div key={doc.id} className="p-3 border rounded-lg">
                    <div className="font-medium text-sm">{doc.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Catégorie: {doc.category} | Score actuel: {doc.currentScore || 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Résultats Ré-analyse */}
      {reanalyzeResults && (
        <Card>
          <CardHeader>
            <CardTitle>Résultats Ré-analyse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-sm font-medium">{reanalyzeResults.message}</p>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-green-600">✓ {reanalyzeResults.succeeded} réussis</span>
                <span className="text-red-600">✗ {reanalyzeResults.failed} échoués</span>
              </div>
            </div>

            {reanalyzeResults.results && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {reanalyzeResults.results.map((result: ReanalyzeResult) => (
                  <div
                    key={result.documentId}
                    className={`p-3 border rounded-lg ${
                      result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="font-medium text-sm">{result.title}</div>
                    {result.success ? (
                      <div className="text-xs mt-1">
                        Score: {result.oldScore || 0} → {result.newScore}
                        <span
                          className={`ml-2 font-medium ${
                            (result.improvement || 0) > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {(result.improvement || 0) > 0 ? '+' : ''}
                          {result.improvement}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-red-600 mt-1">{result.error}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
