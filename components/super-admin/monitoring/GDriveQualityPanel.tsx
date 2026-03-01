'use client'

/**
 * Panel de gestion qualité Google Drive
 *
 * Affiche les statistiques de qualité des documents Drive,
 * permet de lancer l'analyse LLM et d'activer/désactiver le RAG
 * selon un seuil de qualité configurable.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  CloudOff,
  Cloud,
  HardDrive,
} from 'lucide-react'
import { toast } from 'sonner'

interface GDriveStats {
  total: number
  analyzed: number
  unanalyzed: number
  ragEnabled: number
  avgScore: number
  coverage: number
  distribution: {
    excellent: number
    good: number
    average: number
    poor: number
  }
}

interface DocRow {
  id: string
  title: string
  quality_score: number
  quality_analysis_summary: string
  rag_enabled?: boolean
  quality_detected_issues?: string[]
}

interface GDriveData {
  stats: GDriveStats
  topDocs: DocRow[]
  lowDocs: DocRow[]
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80) return <Badge className="bg-green-600 text-white">{score}/100 — Excellent</Badge>
  if (score >= 60) return <Badge className="bg-blue-600 text-white">{score}/100 — Bon</Badge>
  if (score >= 40) return <Badge className="bg-yellow-500 text-white">{score}/100 — Moyen</Badge>
  return <Badge variant="destructive">{score}/100 — Faible</Badge>
}

export function GDriveQualityPanel() {
  const [data, setData] = useState<GDriveData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [enableLoading, setEnableLoading] = useState(false)
  const [disableLoading, setDisableLoading] = useState(false)
  const [minScore, setMinScore] = useState(60)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/admin/kb/gdrive-quality')
      if (!res.ok) throw new Error('Erreur chargement stats Drive')
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Erreur API')
      setData(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAnalyze = async () => {
    setAnalyzeLoading(true)
    try {
      const res = await fetch('/api/admin/kb/gdrive-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze', batchSize: 20 }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success(json.message)
      await fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur analyse')
    } finally {
      setAnalyzeLoading(false)
    }
  }

  const handleEnable = async () => {
    setEnableLoading(true)
    try {
      const res = await fetch('/api/admin/kb/gdrive-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable', minQualityScore: minScore }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success(json.message)
      await fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur activation RAG')
    } finally {
      setEnableLoading(false)
    }
  }

  const handleDisable = async () => {
    if (!confirmDisable) {
      setConfirmDisable(true)
      setTimeout(() => setConfirmDisable(false), 5000)
      return
    }
    setConfirmDisable(false)
    setDisableLoading(true)
    try {
      const res = await fetch('/api/admin/kb/gdrive-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable' }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success(json.message)
      await fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur désactivation RAG')
    } finally {
      setDisableLoading(false)
    }
  }

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-40">
          <div className="text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Chargement stats Google Drive...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={fetchData}>Réessayer</Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!data) return null

  const { stats, topDocs, lowDocs } = data
  const unanalyzedPercent = stats.total > 0
    ? Math.round((stats.unanalyzed / stats.total) * 100)
    : 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Google Drive — Gestion Qualité RAG</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total documents</p>
            <p className="text-2xl font-bold">{stats.total.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-muted-foreground mt-1">category=google_drive</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Analysés</p>
            <p className="text-2xl font-bold">{stats.analyzed.toLocaleString('fr-FR')}</p>
            <Progress value={stats.coverage} className="mt-2 h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">{stats.coverage}% — {stats.unanalyzed} restants</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Score moyen</p>
            <p className="text-2xl font-bold">{stats.avgScore || '—'}{stats.avgScore ? '/100' : ''}</p>
            {stats.avgScore >= 70 ? (
              <Badge className="mt-2 bg-green-600 text-white text-xs">Bonne qualité</Badge>
            ) : stats.avgScore >= 50 ? (
              <Badge className="mt-2 bg-yellow-500 text-white text-xs">Qualité moyenne</Badge>
            ) : stats.avgScore > 0 ? (
              <Badge variant="destructive" className="mt-2 text-xs">Qualité faible</Badge>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">RAG actifs</p>
            <p className="text-2xl font-bold">{stats.ragEnabled.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0 ? Math.round((stats.ragEnabled / stats.total) * 100) : 0}% du total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution qualité */}
      {stats.analyzed > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribution des scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: 'Excellent (≥80)', value: stats.distribution.excellent, color: 'bg-green-500' },
                { label: 'Bon (60–79)', value: stats.distribution.good, color: 'bg-blue-500' },
                { label: 'Moyen (40–59)', value: stats.distribution.average, color: 'bg-yellow-500' },
                { label: 'Faible (<40)', value: stats.distribution.poor, color: 'bg-red-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full`}
                      style={{ width: stats.analyzed > 0 ? `${Math.round((value / stats.analyzed) * 100)}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs font-medium w-8 text-right">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Actions RAG</CardTitle>
          <CardDescription>Analyser les documents et contrôler l'accès RAG</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Analyser */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">Analyser documents non-scorés</p>
              <p className="text-xs text-muted-foreground">
                {stats.unanalyzed > 0
                  ? `${stats.unanalyzed} document(s) sans score — analyse par batch de 20`
                  : 'Tous les documents ont déjà été analysés'}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAnalyze}
              disabled={analyzeLoading || stats.unanalyzed === 0}
            >
              <Sparkles className={`h-4 w-4 mr-1.5 ${analyzeLoading ? 'animate-spin' : ''}`} />
              {analyzeLoading ? 'Analyse...' : 'Analyser (×20)'}
            </Button>
          </div>

          {/* Activer RAG avec seuil */}
          <div className="p-3 rounded-lg border space-y-3">
            <div>
              <p className="text-sm font-medium">Activer RAG selon seuil qualité</p>
              <p className="text-xs text-muted-foreground">
                Active le RAG pour les docs avec quality_score ≥ {minScore}
                {stats.analyzed > 0 && ` (≈ ${stats.distribution.excellent + (minScore <= 60 ? stats.distribution.good : 0) + (minScore <= 40 ? stats.distribution.average : 0)} docs éligibles)`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-6">{minScore}</span>
              <Slider
                value={[minScore]}
                onValueChange={(v) => setMinScore(v[0])}
                min={30}
                max={80}
                step={5}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-4">80</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={enableLoading || stats.analyzed === 0}
                className="flex-1"
              >
                <Cloud className={`h-4 w-4 mr-1.5 ${enableLoading ? 'animate-spin' : ''}`} />
                {enableLoading ? 'Activation...' : `Activer RAG (≥${minScore})`}
              </Button>
            </div>
          </div>

          {/* Désactiver tout */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-destructive/20">
            <div>
              <p className="text-sm font-medium text-destructive">Désactiver tout RAG Drive</p>
              <p className="text-xs text-muted-foreground">
                {stats.ragEnabled > 0
                  ? `Désactive le RAG pour les ${stats.ragEnabled} docs actuellement actifs`
                  : "Aucun doc Drive n'est actuellement actif dans le RAG"}
              </p>
            </div>
            <Button
              size="sm"
              variant={confirmDisable ? 'destructive' : 'outline'}
              onClick={handleDisable}
              disabled={disableLoading || stats.ragEnabled === 0}
              className="shrink-0"
            >
              <CloudOff className={`h-4 w-4 mr-1.5 ${disableLoading ? 'animate-spin' : ''}`} />
              {disableLoading ? 'Désactivation...' : confirmDisable ? 'Confirmer ?' : 'Désactiver tout'}
            </Button>
          </div>

          {confirmDisable && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Cliquez à nouveau sur "Confirmer ?" pour désactiver le RAG pour tous les documents Drive.
                Cette action est réversible.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Avertissement docs non analysés */}
      {unanalyzedPercent > 50 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {unanalyzedPercent}% des documents n'ont pas encore de score qualité.
            Lancez plusieurs batches d'analyse avant d'activer le RAG pour obtenir des résultats fiables.
          </AlertDescription>
        </Alert>
      )}

      {/* Top docs */}
      {topDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Meilleurs documents ({topDocs.length})</CardTitle>
            <CardDescription>Documents avec les scores qualité les plus élevés</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topDocs.map((doc) => (
                <div key={doc.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{doc.title || '(sans titre)'}</p>
                      <ScoreBadge score={doc.quality_score} />
                      {doc.rag_enabled
                        ? <ToggleRight className="h-4 w-4 text-green-500" aria-label="RAG actif" />
                        : <ToggleLeft className="h-4 w-4 text-muted-foreground" aria-label="RAG inactif" />
                      }
                    </div>
                    {doc.quality_analysis_summary && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {doc.quality_analysis_summary}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pires docs */}
      {lowDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Documents à faible score ({lowDocs.length})</CardTitle>
            <CardDescription>Candidats à l'exclusion du RAG ou à la révision</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowDocs.map((doc) => (
                <div key={doc.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{doc.title || '(sans titre)'}</p>
                      <ScoreBadge score={doc.quality_score} />
                    </div>
                    {doc.quality_detected_issues && doc.quality_detected_issues.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {doc.quality_detected_issues.slice(0, 2).join(' • ')}
                      </p>
                    )}
                    {doc.quality_analysis_summary && !doc.quality_detected_issues?.length && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {doc.quality_analysis_summary}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
