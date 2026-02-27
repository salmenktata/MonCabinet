'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface SilverCase {
  id: string
  domain: string
  difficulty: 'easy' | 'medium' | 'hard'
  question: string
  actualAnswer: string | null
  keyPoints: string[]
  avgSimilarity: number | null
  status: 'draft' | 'validated' | 'rejected'
  reviewedAt: string | null
  createdAt: string
}

interface SilverStats {
  total: number
  byStatus: { draft: number; validated: number; rejected: number }
  byDomain: { domain: string; count: number }[]
  readyForBenchmark: number
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function SilverDatasetTab() {
  const [cases, setCases] = useState<SilverCase[]>([])
  const [stats, setStats] = useState<SilverStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'draft' | 'validated' | 'rejected' | 'all'>('draft')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [casesRes, statsRes] = await Promise.all([
        fetch(`/api/admin/eval/silver?status=${filterStatus === 'all' ? '' : filterStatus}&limit=20`),
        fetch('/api/admin/eval/silver?stats=true'),
      ])
      if (casesRes.ok) {
        const data = await casesRes.json()
        setCases(data.cases || [])
      }
      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data)
      }
    } catch {
      toast.error('Erreur chargement Silver dataset')
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const generateCases = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/eval/silver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 30, limit: 50 }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.generated ?? 0} cas Silver générés`)
        fetchData()
      } else {
        toast.error('Erreur génération')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setGenerating(false)
    }
  }

  const reviewCase = async (id: string, status: 'validated' | 'rejected') => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/admin/eval/silver', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, reviewNotes: reviewNotes[id] }),
      })
      if (res.ok) {
        toast.success(status === 'validated' ? 'Cas validé ✓' : 'Cas rejeté')
        fetchData()
      } else {
        toast.error('Erreur mise à jour')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setUpdatingId(null)
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Silver Dataset</h2>
          <p className="text-sm text-muted-foreground">
            Cas de test auto-générés depuis les queries prod avec feedback positif
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
          <Button size="sm" onClick={generateCases} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Générer (30j)
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.byStatus.draft}</div>
              <div className="text-xs text-muted-foreground">Drafts</div>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.byStatus.validated}</div>
              <div className="text-xs text-muted-foreground">Validés</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{stats.byStatus.rejected}</div>
              <div className="text-xs text-muted-foreground">Rejetés</div>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.readyForBenchmark}</div>
              <div className="text-xs text-muted-foreground">Prêts benchmark</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtre statut */}
      <div className="flex gap-1">
        {(['draft', 'validated', 'rejected', 'all'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              filterStatus === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-foreground'
            }`}
          >
            {s === 'draft' ? 'Drafts' : s === 'validated' ? 'Validés' : s === 'rejected' ? 'Rejetés' : 'Tous'}
          </button>
        ))}
      </div>

      {/* Liste */}
      {cases.length > 0 ? (
        <div className="space-y-3">
          {cases.map(sc => (
            <Card key={sc.id} className={sc.status === 'validated' ? 'border-green-200' : sc.status === 'rejected' ? 'border-red-100 opacity-60' : 'border-yellow-100'}>
              <CardContent className="p-4 space-y-2">
                {/* En-tête */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-medium bg-muted rounded px-2 py-0.5">{sc.domain}</span>
                      <DifficultyBadge difficulty={sc.difficulty} />
                      <SilverStatusBadge status={sc.status} />
                      {sc.avgSimilarity != null && (
                        <span className="text-xs text-muted-foreground">sim. {sc.avgSimilarity.toFixed(2)}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium line-clamp-2">{sc.question}</p>
                  </div>
                  <button
                    onClick={() => setExpandedId(expandedId === sc.id ? null : sc.id)}
                    className="shrink-0 p-1 hover:bg-muted rounded"
                  >
                    {expandedId === sc.id
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>

                {/* Key points (compact) */}
                {sc.keyPoints.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {sc.keyPoints.slice(0, 3).map((kp, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 truncate max-w-[200px]" title={kp}>
                        {kp}
                      </span>
                    ))}
                    {sc.keyPoints.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{sc.keyPoints.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Détails expandés */}
                {expandedId === sc.id && (
                  <div className="space-y-3 border-t pt-3">
                    {/* Réponse */}
                    {sc.actualAnswer && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Réponse originale :</div>
                        <div className="text-sm bg-muted rounded p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {sc.actualAnswer}
                        </div>
                      </div>
                    )}

                    {/* Tous les key points */}
                    {sc.keyPoints.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Key points extraits :</div>
                        <ul className="space-y-1">
                          {sc.keyPoints.map((kp, i) => (
                            <li key={i} className="text-xs flex gap-2">
                              <span className="text-muted-foreground">{i + 1}.</span>
                              <span>{kp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Notes de review + Actions (seulement pour drafts) */}
                    {sc.status === 'draft' && (
                      <>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Notes (optionnel) :</div>
                          <input
                            type="text"
                            className="w-full text-sm border rounded px-2 py-1"
                            placeholder="Notes de validation..."
                            value={reviewNotes[sc.id] ?? ''}
                            onChange={e => setReviewNotes(prev => ({ ...prev, [sc.id]: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            disabled={updatingId === sc.id}
                            onClick={() => reviewCase(sc.id, 'validated')}
                          >
                            {updatingId === sc.id
                              ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              : <CheckCircle2 className="w-3 h-3 mr-1" />}
                            Valider pour benchmark
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            disabled={updatingId === sc.id}
                            onClick={() => reviewCase(sc.id, 'rejected')}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Rejeter
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-blue-400" />
            <p>Aucun cas dans ce filtre. Génère des cas Silver depuis les conversations récentes.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// =============================================================================
// COMPOSANTS UTILITAIRES
// =============================================================================

function DifficultyBadge({ difficulty }: { difficulty: 'easy' | 'medium' | 'hard' }) {
  if (difficulty === 'hard') return <Badge variant="destructive" className="text-xs">Difficile</Badge>
  if (difficulty === 'medium') return <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">Moyen</Badge>
  return <Badge variant="outline" className="text-xs border-green-400 text-green-700">Facile</Badge>
}

function SilverStatusBadge({ status }: { status: 'draft' | 'validated' | 'rejected' }) {
  if (status === 'validated') return <Badge variant="outline" className="text-xs border-green-400 text-green-700">Validé</Badge>
  if (status === 'rejected') return <Badge variant="outline" className="text-xs border-red-400 text-red-700">Rejeté</Badge>
  return <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">Draft</Badge>
}
