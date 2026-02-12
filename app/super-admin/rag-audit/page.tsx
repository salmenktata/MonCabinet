'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Play,
  RefreshCw,
  Download,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

// Types (matching audit script output)
interface AuditSummary {
  totalIndexedPages: number
  totalIndexedDocs: number
  totalChunks: number
  overallHealthScore: number
  criticalIssuesCount: number
  warningsCount: number
}

interface CategoryStats {
  category: string
  total_chunks: number
  avg_words: number | null
  pct_normal: number | null
  stddev_words: number | null
}

interface EmbeddingValidation {
  table_name: string
  total_docs: number
  has_embedding: number
  correct_dim: number
  wrong_dim: number
  status: 'CRITICAL' | 'WARNING' | 'OK'
}

interface AuditReport {
  timestamp: string
  summary: AuditSummary
  sourceQuality: {
    criticalIssues: string[]
    recommendations: string[]
  }
  chunkingAnalysis: {
    sizeDistribution: CategoryStats[]
    criticalIssues: string[]
    recommendations: string[]
  }
  metadataQuality: {
    criticalIssues: string[]
    recommendations: string[]
  }
  embeddings: {
    validation: EmbeddingValidation[]
    criticalIssues: string[]
  }
}

interface AuditHistoryItem {
  filename: string
  timestamp: string
  createdAt: Date
  summary: {
    overallHealthScore: number
    totalIndexedDocs: number
    totalChunks: number
    criticalIssuesCount: number
    warningsCount: number
  }
}

export default function RAGAuditPage() {
  const [report, setReport] = useState<AuditReport | null>(null)
  const [history, setHistory] = useState<AuditHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLatest = async () => {
    try {
      const response = await fetch('/api/admin/rag-audit/latest')
      const result = await response.json()

      if (result.success && result.report) {
        setReport(result.report)
      }
    } catch (err: any) {
      console.error('Erreur chargement latest:', err)
    }
  }

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/admin/rag-audit/history')
      const result = await response.json()

      if (result.success) {
        setHistory(result.history || [])
      }
    } catch (err: any) {
      console.error('Erreur chargement history:', err)
    }
  }

  const runAudit = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/rag-audit/run', {
        method: 'POST',
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Erreur lors de l\'audit')
      }

      setReport(result.report)
      await fetchHistory() // Refresh history
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLatest()
    fetchHistory()
  }, [])

  const getHealthStatus = (score: number) => {
    if (score >= 85) return { label: 'EXCELLENT', color: 'text-green-600 bg-green-50', icon: CheckCircle2 }
    if (score >= 70) return { label: 'WARNING', color: 'text-yellow-600 bg-yellow-50', icon: AlertCircle }
    return { label: 'CRITICAL', color: 'text-red-600 bg-red-50', icon: XCircle }
  }

  const downloadJSON = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-rag-${new Date(report.timestamp).toISOString().split('T')[0]}.json`
    a.click()
  }

  const allIssues = report
    ? [
        ...report.sourceQuality.criticalIssues,
        ...report.chunkingAnalysis.criticalIssues,
        ...report.metadataQuality.criticalIssues,
        ...report.embeddings.criticalIssues,
      ]
    : []

  const allRecommendations = report
    ? [
        ...report.sourceQuality.recommendations,
        ...report.chunkingAnalysis.recommendations,
        ...report.metadataQuality.recommendations,
      ]
    : []

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Qualité RAG</h1>
          <p className="text-muted-foreground mt-1">
            Analyse complète de la qualité des données (sources, chunking, métadonnées, embeddings)
          </p>
        </div>
        <div className="flex gap-2">
          {report && (
            <Button variant="outline" onClick={downloadJSON} disabled={loading}>
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
          )}
          <Button onClick={runAudit} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Audit en cours...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Exécuter Audit
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Health Score Card */}
      {report && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Overall Health Score</CardTitle>
                  <CardDescription>
                    Rapport généré le{' '}
                    {new Date(report.timestamp).toLocaleString('fr-FR', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    })}
                  </CardDescription>
                </div>
                {(() => {
                  const status = getHealthStatus(report.summary.overallHealthScore)
                  const StatusIcon = status.icon
                  return (
                    <div className={`flex items-center gap-3 px-6 py-3 rounded-lg ${status.color}`}>
                      <StatusIcon className="h-8 w-8" />
                      <div>
                        <div className="text-3xl font-bold">{report.summary.overallHealthScore}/100</div>
                        <div className="text-sm font-medium">{status.label}</div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold">{report.summary.totalIndexedDocs}</div>
                  <div className="text-sm text-muted-foreground">Documents indexés</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{report.summary.totalChunks}</div>
                  <div className="text-sm text-muted-foreground">Chunks totaux</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {report.summary.criticalIssuesCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Issues critiques</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {report.summary.warningsCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Warnings</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Issues & Recommendations */}
          {(allIssues.length > 0 || allRecommendations.length > 0) && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Critical Issues */}
              {allIssues.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      Problèmes Identifiés
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {allIssues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/50"
                        >
                          <span className="mt-0.5">{issue.split(' ')[0]}</span>
                          <span className="flex-1">{issue.substring(issue.indexOf(' ') + 1)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recommendations */}
              {allRecommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Recommandations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {allRecommendations.map((rec, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/50"
                        >
                          <span className="font-medium text-muted-foreground">{idx + 1}.</span>
                          <span className="flex-1">{rec.replace(/^✅\s*/, '')}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Chunking Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Distribution des Chunks par Catégorie</CardTitle>
              <CardDescription>Objectif : 95%+ des chunks entre 100-800 mots</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {report.chunkingAnalysis.sizeDistribution.map((cat) => {
                  const pctNormal = cat.pct_normal ?? 0
                  const isGood = pctNormal >= 90
                  return (
                    <div key={cat.category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isGood ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                          )}
                          <span className="font-medium capitalize">{cat.category}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{cat.total_chunks} chunks</span>
                          <span>{Math.round(cat.avg_words ?? 0)} mots moy.</span>
                          <Badge variant={isGood ? 'default' : 'secondary'}>
                            {pctNormal.toFixed(1)}% normal
                          </Badge>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isGood ? 'bg-green-500' : 'bg-yellow-500'
                          }`}
                          style={{ width: `${pctNormal}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Embeddings Validation */}
          <Card>
            <CardHeader>
              <CardTitle>Validation des Embeddings</CardTitle>
              <CardDescription>Dimension attendue : 1024 (qwen3-embedding)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.embeddings.validation.map((val) => {
                  const status =
                    val.status === 'OK'
                      ? { icon: CheckCircle2, color: 'text-green-600' }
                      : val.status === 'WARNING'
                      ? { icon: AlertCircle, color: 'text-yellow-600' }
                      : { icon: XCircle, color: 'text-red-600' }
                  const StatusIcon = status.icon

                  return (
                    <div key={val.table_name} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-3">
                        <StatusIcon className={`h-5 w-5 ${status.color}`} />
                        <div>
                          <div className="font-medium">{val.table_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {val.correct_dim}/{val.has_embedding} embeddings corrects
                          </div>
                        </div>
                      </div>
                      {val.wrong_dim > 0 && (
                        <Badge variant="destructive">{val.wrong_dim} incorrect</Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historique des Audits</CardTitle>
            <CardDescription>Les 10 derniers audits exécutés</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((item, idx) => {
                const status = getHealthStatus(item.summary.overallHealthScore)
                const isCurrent = report && item.timestamp === report.timestamp
                const prevScore = history[idx + 1]?.summary.overallHealthScore
                const scoreDelta = prevScore ? item.summary.overallHealthScore - prevScore : 0

                return (
                  <div
                    key={item.filename}
                    className={`flex items-center justify-between p-3 rounded-md ${
                      isCurrent ? 'bg-primary/10 border-2 border-primary' : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">
                          {new Date(item.timestamp).toLocaleString('fr-FR', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {item.summary.totalIndexedDocs} docs · {item.summary.totalChunks} chunks
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {scoreDelta !== 0 && (
                        <div className={`flex items-center gap-1 text-sm ${scoreDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {scoreDelta > 0 ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          {Math.abs(scoreDelta).toFixed(1)}
                        </div>
                      )}
                      <Badge className={status.color}>{item.summary.overallHealthScore}/100</Badge>
                      {isCurrent && <Badge variant="outline">Actuel</Badge>}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!report && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucun audit disponible</h3>
            <p className="text-muted-foreground mb-4">
              Exécutez votre premier audit pour analyser la qualité des données RAG
            </p>
            <Button onClick={runAudit} disabled={loading}>
              <Play className="h-4 w-4 mr-2" />
              Lancer le premier audit
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
