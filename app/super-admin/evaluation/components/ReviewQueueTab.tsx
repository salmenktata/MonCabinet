'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface RiskSignal {
  type: string
  weight: number
  detail: string
}

interface ReviewItem {
  id: string
  conversationId: string | null
  question: string
  answer: string
  sourcesUsed: { id: string; title: string; similarity: number }[] | null
  riskScore: number
  riskLevel: 'low' | 'medium' | 'high'
  riskSignals: RiskSignal[]
  avgSimilarity: number | null
  sourcesCount: number | null
  status: 'pending' | 'reviewed' | 'escalated' | 'dismissed'
  createdAt: string
}

interface ReviewStats {
  pending: number
  reviewed: number
  dismissed: number
  escalated: number
  avgRiskScore: number
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function ReviewQueueTab() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [validatedAnswers, setValidatedAnswers] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, statsRes] = await Promise.all([
        fetch('/api/admin/review-queue?status=pending'),
        fetch('/api/admin/review-queue?stats=true'),
      ])
      if (itemsRes.ok) {
        const data = await itemsRes.json()
        setItems(data.items || [])
      }
      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data)
      }
    } catch {
      toast.error('Erreur chargement review queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateItem = async (id: string, status: 'reviewed' | 'dismissed' | 'escalated', validatedAnswer?: string) => {
    setUpdatingId(id)
    try {
      const body: Record<string, string> = { id, status }
      if (validatedAnswer) body.validatedAnswer = validatedAnswer

      const res = await fetch('/api/admin/review-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const verb = status === 'reviewed' ? 'Validé' : status === 'dismissed' ? 'Rejeté' : 'Escaladé'
        toast.success(`${verb} avec succès`)
        if (validatedAnswer) toast.success('Silver case créé depuis la réponse corrigée')
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
          <h2 className="text-lg font-semibold">File de Relecture Expert</h2>
          <p className="text-sm text-muted-foreground">
            Réponses RAG à haut risque soumises à relecture avocat
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-orange-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
              <div className="text-xs text-muted-foreground">En attente</div>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.reviewed}</div>
              <div className="text-xs text-muted-foreground">Validés</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{stats.dismissed}</div>
              <div className="text-xs text-muted-foreground">Rejetés</div>
            </CardContent>
          </Card>
          <Card className="border-purple-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.escalated}</div>
              <div className="text-xs text-muted-foreground">Escaladés</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.avgRiskScore != null ? (stats.avgRiskScore * 100).toFixed(0) : '--'}%</div>
              <div className="text-xs text-muted-foreground">Risque moy.</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Liste */}
      {items.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">En attente de relecture ({items.length})</h3>
          {items.map(item => (
            <Card key={item.id} className="border-orange-100">
              <CardContent className="p-4 space-y-3">
                {/* En-tête */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <RiskBadge level={item.riskLevel} score={item.riskScore} />
                      <span className="text-xs text-muted-foreground">
                        {item.sourcesCount} source(s)
                        {item.avgSimilarity != null && ` · sim. ${item.avgSimilarity.toFixed(2)}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-sm font-medium line-clamp-2">{item.question}</p>
                  </div>
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="shrink-0 p-1 hover:bg-muted rounded"
                  >
                    {expandedId === item.id
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>

                {/* Signaux de risque */}
                <div className="flex gap-1 flex-wrap">
                  {item.riskSignals.map((signal, i) => (
                    <SignalBadge key={i} signal={signal} />
                  ))}
                </div>

                {/* Détails expandés */}
                {expandedId === item.id && (
                  <div className="space-y-3 border-t pt-3">
                    {/* Réponse générée */}
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Réponse générée :</div>
                      <div className="text-sm bg-muted rounded p-3 max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {item.answer}
                      </div>
                    </div>

                    {/* Sources */}
                    {item.sourcesUsed && item.sourcesUsed.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Sources utilisées :</div>
                        <div className="space-y-1">
                          {item.sourcesUsed.map((src, i) => (
                            <div key={i} className="text-xs flex items-center gap-2">
                              <span className="text-muted-foreground">[{i + 1}]</span>
                              <span className="flex-1 truncate">{src.title}</span>
                              <span className="text-muted-foreground">{src.similarity?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Réponse corrigée */}
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Réponse corrigée (optionnel — crée un Silver case) :
                      </div>
                      <textarea
                        className="w-full text-sm border rounded p-2 h-24 resize-y"
                        placeholder="Entrez la réponse corrigée pour créer un Silver case..."
                        value={validatedAnswers[item.id] ?? ''}
                        onChange={e => setValidatedAnswers(prev => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={updatingId === item.id}
                        onClick={() => updateItem(item.id, 'reviewed', validatedAnswers[item.id])}
                      >
                        {updatingId === item.id
                          ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          : <CheckCircle2 className="w-3 h-3 mr-1" />}
                        Valider
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        disabled={updatingId === item.id}
                        onClick={() => updateItem(item.id, 'dismissed')}
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Rejeter (faux positif)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-purple-600 border-purple-300 hover:bg-purple-50"
                        disabled={updatingId === item.id}
                        onClick={() => updateItem(item.id, 'escalated')}
                      >
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Escalader
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <p>Aucun item en attente de relecture.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// =============================================================================
// COMPOSANTS UTILITAIRES
// =============================================================================

function RiskBadge({ level, score }: { level: 'low' | 'medium' | 'high'; score: number }) {
  const pct = Math.round(score * 100)
  if (level === 'high') return <Badge variant="destructive">{pct}% — Élevé</Badge>
  if (level === 'medium') return <Badge variant="outline" className="border-orange-400 text-orange-700">{pct}% — Moyen</Badge>
  return <Badge variant="outline">{pct}% — Faible</Badge>
}

const SIGNAL_LABELS: Record<string, string> = {
  low_similarity: 'Sim. faible',
  single_source: 'Source unique',
  source_conflict: 'Conflit sources',
  source_outdated: 'Source ancienne',
  sensitive_topic: 'Sujet sensible',
  citation_warning: 'Citations non vérif.',
  quality_gate: 'Quality gate',
}

function SignalBadge({ signal }: { signal: RiskSignal }) {
  const label = SIGNAL_LABELS[signal.type] ?? signal.type
  return (
    <span
      className="text-xs bg-orange-50 border border-orange-200 text-orange-700 rounded px-2 py-0.5"
      title={signal.detail}
    >
      {label} (+{Math.round(signal.weight * 100)}%)
    </span>
  )
}
