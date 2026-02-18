'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MessageSquare,
  Star,
  ThumbsUp,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface FeedbackStats {
  total_feedbacks: number
  avg_rating: number | null
  satisfaction_rate: number | null
  hallucination_rate: number | null
  avg_response_time: number | null
  most_common_issue: string | null
}

interface DomainStats {
  domain: string
  total_feedbacks: number
  avg_rating: number
  positive_count: number
  negative_count: number
  satisfaction_rate: number
  hallucination_count: number
  missing_info_count: number
  avg_rag_confidence: number | null
  avg_response_time_ms: number | null
}

interface Feedback {
  id: string
  conversationId: string
  messageId: string
  question: string
  rating: number
  feedbackType: string[]
  missingInfo: string | null
  incorrectCitation: string | null
  hallucinationDetails: string | null
  suggestedSources: string[]
  comment: string | null
  userId: string
  userRole: string
  domain: string | null
  ragConfidence: number | null
  sourcesCount: number | null
  responseTimeMs: number | null
  isResolved: boolean
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function FeedbacksClient() {
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [domainStats, setDomainStats] = useState<DomainStats[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)

  // Filtres
  const [period, setPeriod] = useState('30')
  const [unresolvedOnly, setUnresolvedOnly] = useState(false)
  const [page, setPage] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, feedbacksRes, domainRes] = await Promise.all([
        fetch(`/api/admin/feedback/stats?days=${period}`),
        fetch(`/api/admin/feedback/recent?days=${period}&limit=50&unresolved=${unresolvedOnly}`),
        fetch(`/api/admin/feedback/by-domain?days=${period}`),
      ])

      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData.stats)
      }

      if (feedbacksRes.ok) {
        const feedbacksData = await feedbacksRes.json()
        setFeedbacks(feedbacksData.feedbacks || [])
      }

      if (domainRes.ok) {
        const domainData = await domainRes.json()
        setDomainStats(domainData.domains || [])
      }
    } catch (error) {
      console.error('Erreur chargement feedbacks:', error)
    } finally {
      setLoading(false)
    }
  }, [period, unresolvedOnly])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleResolve = async (feedbackId: string) => {
    setResolving(feedbackId)
    try {
      const res = await fetch('/api/admin/feedback/resolve', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId, resolved: true }),
      })

      if (res.ok) {
        setFeedbacks(prev =>
          prev.map(f => f.id === feedbackId ? { ...f, isResolved: true, resolvedAt: new Date().toISOString() } : f)
        )
      }
    } catch (error) {
      console.error('Erreur résolution feedback:', error)
    } finally {
      setResolving(null)
    }
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feedbacks</h1>
          <p className="text-muted-foreground">Analyse des retours utilisateurs sur les réponses IA</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total feedbacks</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_feedbacks ?? '—'}</div>
            <p className="text-xs text-muted-foreground">sur {period} jours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Note moyenne</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avg_rating ? stats.avg_rating.toFixed(1) : '—'}
            </div>
            <div className="flex gap-0.5 mt-1">
              {stats?.avg_rating ? renderStars(Math.round(stats.avg_rating)) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taux satisfaction</CardTitle>
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.satisfaction_rate != null ? `${stats.satisfaction_rate.toFixed(0)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">note &ge; 4/5</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taux hallucination</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats?.hallucination_rate != null ? `${stats.hallucination_rate.toFixed(0)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">signalements</p>
          </CardContent>
        </Card>
      </div>

      {/* Satisfaction par domaine */}
      {domainStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Satisfaction par domaine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Domaine</th>
                    <th className="pb-2 pr-4 text-right">Total</th>
                    <th className="pb-2 pr-4 text-right">Note moy.</th>
                    <th className="pb-2 pr-4 text-right">Satisfaction</th>
                    <th className="pb-2 pr-4 text-right">Hallucinations</th>
                    <th className="pb-2 text-right">Temps moy.</th>
                  </tr>
                </thead>
                <tbody>
                  {domainStats.map(d => (
                    <tr key={d.domain} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{d.domain}</td>
                      <td className="py-2 pr-4 text-right">{d.total_feedbacks}</td>
                      <td className="py-2 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {parseFloat(String(d.avg_rating)).toFixed(1)}
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <span className={parseFloat(String(d.satisfaction_rate)) >= 70 ? 'text-green-600' : parseFloat(String(d.satisfaction_rate)) >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                          {parseFloat(String(d.satisfaction_rate)).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {parseInt(String(d.hallucination_count)) > 0 ? (
                          <Badge variant="destructive" className="text-xs">{d.hallucination_count}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {d.avg_response_time_ms ? `${(parseFloat(String(d.avg_response_time_ms)) / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-4">
        <Select value={period} onValueChange={v => { setPeriod(v); setPage(0) }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 jours</SelectItem>
            <SelectItem value="30">30 jours</SelectItem>
            <SelectItem value="90">90 jours</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={unresolvedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setUnresolvedOnly(!unresolvedOnly); setPage(0) }}
        >
          {unresolvedOnly ? 'Non résolus' : 'Tous'}
        </Button>

        <span className="text-sm text-muted-foreground ml-auto">
          {feedbacks.length} feedback{feedbacks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Liste feedbacks */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : feedbacks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun feedback pour cette période.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {feedbacks.map(fb => (
            <Card key={fb.id} className={fb.isResolved ? 'opacity-60' : ''}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex gap-0.5">{renderStars(fb.rating)}</div>
                      {fb.domain && (
                        <Badge variant="secondary" className="text-xs">{fb.domain}</Badge>
                      )}
                      {fb.feedbackType?.map(type => (
                        <Badge key={type} variant="outline" className="text-xs">{type}</Badge>
                      ))}
                      {fb.isResolved && (
                        <Badge className="bg-green-100 text-green-700 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Résolu
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm font-medium truncate" dir="auto">
                      {fb.question}
                    </p>

                    {fb.comment && (
                      <p className="text-sm text-muted-foreground mt-1" dir="auto">
                        {fb.comment}
                      </p>
                    )}

                    {fb.hallucinationDetails && (
                      <p className="text-xs text-red-600 mt-1">
                        Hallucination: {fb.hallucinationDetails}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(fb.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                      {fb.sourcesCount != null && (
                        <span>{fb.sourcesCount} source{fb.sourcesCount !== 1 ? 's' : ''}</span>
                      )}
                      {fb.responseTimeMs != null && (
                        <span>{(fb.responseTimeMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>

                  {!fb.isResolved && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResolve(fb.id)}
                      disabled={resolving === fb.id}
                    >
                      {resolving === fb.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span className="ml-1">Résoudre</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
