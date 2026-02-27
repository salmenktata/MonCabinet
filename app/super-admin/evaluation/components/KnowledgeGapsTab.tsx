'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface GapItem {
  id: string
  domain: string
  abstentionCount: number
  avgSimilarity: number | null
  priority: 'high' | 'medium' | 'low'
  exampleQueries: string[]
  suggestedSources: string[]
  status: 'open' | 'in_progress' | 'resolved'
  createdAt: string
}

interface GapStats {
  total: number
  byStatus: { open: number; in_progress: number; resolved: number }
  byPriority: { high: number; medium: number; low: number }
  recentOpenGaps: GapItem[]
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function KnowledgeGapsTab() {
  const [stats, setStats] = useState<GapStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/eval/gaps?stats=true')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch {
      toast.error('Erreur chargement gaps')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const runAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/admin/eval/gaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 7, persist: true, sendAlert: false }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.gapsFound ?? 0} lacune(s) identifiée(s)`)
        fetchStats()
      } else {
        toast.error('Erreur lors de l\'analyse')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setAnalyzing(false)
    }
  }

  const updateGapStatus = async (id: string, status: 'in_progress' | 'resolved') => {
    try {
      const res = await fetch('/api/admin/eval/gaps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) {
        toast.success('Statut mis à jour')
        fetchStats()
      } else {
        toast.error('Erreur mise à jour')
      }
    } catch {
      toast.error('Erreur réseau')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header + Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lacunes de la Base de Connaissances</h2>
          <p className="text-sm text-muted-foreground">
            Identifiées depuis les abstentions RAG (queries sans réponse)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
          <Button size="sm" onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
            Analyser maintenant (7j)
          </Button>
        </div>
      </div>

      {/* Compteurs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.byPriority.high}</div>
              <div className="text-xs text-muted-foreground">Haute priorité</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.byPriority.medium}</div>
              <div className="text-xs text-muted-foreground">Priorité moy.</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.byStatus.open}</div>
              <div className="text-xs text-muted-foreground">Ouvertes</div>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.byStatus.in_progress}</div>
              <div className="text-xs text-muted-foreground">En cours</div>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.byStatus.resolved}</div>
              <div className="text-xs text-muted-foreground">Résolues</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Liste des gaps ouverts */}
      {stats?.recentOpenGaps && stats.recentOpenGaps.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Lacunes ouvertes (récentes)</h3>
          {stats.recentOpenGaps.map(gap => (
            <Card key={gap.id} className={gap.priority === 'high' ? 'border-red-200' : gap.priority === 'medium' ? 'border-yellow-200' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{gap.domain}</span>
                      <PriorityBadge priority={gap.priority} />
                      <StatusBadge status={gap.status} />
                      <span className="text-xs text-muted-foreground">
                        {gap.abstentionCount} abstention(s)
                        {gap.avgSimilarity != null && ` · sim. moy. ${gap.avgSimilarity.toFixed(2)}`}
                      </span>
                    </div>

                    {gap.exampleQueries.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Exemples de questions :</div>
                        <ul className="space-y-1">
                          {gap.exampleQueries.slice(0, 3).map((q, i) => (
                            <li key={i} className="text-xs bg-muted rounded px-2 py-1 truncate max-w-lg" title={q}>
                              {q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {gap.suggestedSources.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Sources suggérées : {gap.suggestedSources.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {gap.status === 'open' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => updateGapStatus(gap.id, 'in_progress')}
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        En cours
                      </Button>
                    )}
                    {gap.status !== 'resolved' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-green-700 border-green-300 hover:bg-green-50"
                        onClick={() => updateGapStatus(gap.id, 'resolved')}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Résoudre
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !loading && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p>Aucune lacune détectée. Lance l&apos;analyse pour identifier les gaps récents.</p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}

// =============================================================================
// COMPOSANTS UTILITAIRES
// =============================================================================

function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  if (priority === 'high') return <Badge variant="destructive" className="text-xs">Haute</Badge>
  if (priority === 'medium') return <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">Moyenne</Badge>
  return <Badge variant="outline" className="text-xs">Basse</Badge>
}

function StatusBadge({ status }: { status: 'open' | 'in_progress' | 'resolved' }) {
  if (status === 'resolved') return <Badge variant="outline" className="text-xs border-green-400 text-green-700">Résolue</Badge>
  if (status === 'in_progress') return <Badge variant="outline" className="text-xs border-blue-400 text-blue-700">En cours</Badge>
  return <Badge variant="outline" className="text-xs">Ouverte</Badge>
}
