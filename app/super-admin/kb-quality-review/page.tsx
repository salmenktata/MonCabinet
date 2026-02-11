'use client'

/**
 * Dashboard Validation Qualité KB (Phase 1.3)
 *
 * Page de validation manuelle des métadonnées structurées
 * avec gamification et priorisation intelligente
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CheckCircle, XCircle, Trophy, Filter } from 'lucide-react'

// =============================================================================
// Types
// =============================================================================

interface QueueDocument {
  id: string
  title: string
  category: string
  source: string
  createdAt: string
  extractionConfidence: number
  missingFieldsCount: number
  priority: number
  tribunalCode?: string
  chambreCode?: string
  decisionDate?: string
  author?: string
}

interface LeaderboardEntry {
  userId: string
  email: string
  name: string
  documentsValidated: number
  points: number
  badge: 'novice' | 'bronze' | 'argent' | 'or'
  rank: number
}

// =============================================================================
// Composant Principal
// =============================================================================

export default function KBQualityReviewPage() {
  const [documents, setDocuments] = useState<QueueDocument[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<QueueDocument | null>(null)
  const [filters, setFilters] = useState({
    category: '',
    maxConfidence: '0.85',
  })

  // Charger la queue
  useEffect(() => {
    fetchQueue()
    fetchLeaderboard()
  }, [filters])

  async function fetchQueue() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        maxConfidence: filters.maxConfidence,
        limit: '20',
      })
      if (filters.category) {
        params.append('category', filters.category)
      }

      const res = await fetch(`/api/admin/kb-quality/queue?${params}`)
      const data = await res.json()

      if (data.success) {
        setDocuments(data.data.documents)
      }
    } catch (error) {
      console.error('Erreur chargement queue:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchLeaderboard() {
    try {
      const res = await fetch('/api/admin/kb-quality/leaderboard?limit=5')
      const data = await res.json()

      if (data.success) {
        setLeaderboard(data.data.leaderboard)
      }
    } catch (error) {
      console.error('Erreur chargement leaderboard:', error)
    }
  }

  async function handleValidate(docId: string, validated: boolean) {
    // TODO: Implémenter formulaire édition métadonnées
    try {
      const res = await fetch('/api/admin/kb-quality/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docId,
          userId: 'current-user-id', // TODO: Récupérer depuis session
          metadata: {}, // TODO: Passer métadonnées éditées
          validated,
        }),
      })

      const data = await res.json()

      if (data.success) {
        // Retirer le doc de la queue
        setDocuments(prev => prev.filter(d => d.id !== docId))
        // Rafraîchir leaderboard
        fetchLeaderboard()
      }
    } catch (error) {
      console.error('Erreur validation:', error)
    }
  }

  // Badge emoji
  const getBadgeEmoji = (badge: string) => {
    const badges: Record<string, string> = {
      or: '🥇',
      argent: '🥈',
      bronze: '🥉',
      novice: '🔰',
    }
    return badges[badge] || '🔰'
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Validation Qualité KB</h1>
          <p className="text-muted-foreground">
            Valider et enrichir les métadonnées juridiques
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {documents.length} docs en attente
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue Documents (Col 1-2) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filtres */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtres
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>Catégorie</Label>
                <Select
                  value={filters.category}
                  onValueChange={cat => setFilters(prev => ({ ...prev, category: cat }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="jurisprudence">Jurisprudence</SelectItem>
                    <SelectItem value="code">Code</SelectItem>
                    <SelectItem value="législation">Législation</SelectItem>
                    <SelectItem value="doctrine">Doctrine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Confiance max</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={filters.maxConfidence}
                  onChange={e => setFilters(prev => ({ ...prev, maxConfidence: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Liste Documents */}
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-lg font-medium">Aucun document à valider !</p>
                <p className="text-sm text-muted-foreground">
                  Tous les documents sont validés ou au-dessus du seuil de confiance
                </p>
              </CardContent>
            </Card>
          ) : (
            documents.map(doc => (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg line-clamp-2">{doc.title}</CardTitle>
                      <CardDescription className="mt-1 space-x-2">
                        <Badge variant="secondary">{doc.category}</Badge>
                        <Badge variant="outline">{doc.source}</Badge>
                        <Badge
                          variant={doc.extractionConfidence > 0.7 ? 'default' : 'destructive'}
                        >
                          Confiance: {(doc.extractionConfidence * 100).toFixed(0)}%
                        </Badge>
                      </CardDescription>
                    </div>
                    <Badge className="ml-2 shrink-0">
                      Priorité: {Math.round(doc.priority)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Métadonnées actuelles */}
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    {doc.tribunalCode && (
                      <div>
                        <span className="font-medium">Tribunal:</span> {doc.tribunalCode}
                      </div>
                    )}
                    {doc.chambreCode && (
                      <div>
                        <span className="font-medium">Chambre:</span> {doc.chambreCode}
                      </div>
                    )}
                    {doc.decisionDate && (
                      <div>
                        <span className="font-medium">Date:</span>{' '}
                        {new Date(doc.decisionDate).toLocaleDateString('fr-FR')}
                      </div>
                    )}
                    {doc.author && (
                      <div>
                        <span className="font-medium">Auteur:</span> {doc.author}
                      </div>
                    )}
                  </div>

                  {doc.missingFieldsCount > 0 && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
                      ⚠️ {doc.missingFieldsCount} champ(s) manquant(s)
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleValidate(doc.id, true)}
                      className="flex-1"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Valider
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedDoc(doc)}
                      className="flex-1"
                    >
                      Éditer
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleValidate(doc.id, false)}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Leaderboard (Col 3) */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Top Validateurs
              </CardTitle>
              <CardDescription>Classement général</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucun validateur pour le moment
                </p>
              ) : (
                leaderboard.map(entry => (
                  <div
                    key={entry.userId}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getBadgeEmoji(entry.badge)}</span>
                      <div>
                        <p className="font-medium text-sm">{entry.name || entry.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Rang #{entry.rank}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{entry.points}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.documentsValidated} docs
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Aide */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Badges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span>🔰</span>
                <span>Novice (0-9 pts)</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🥉</span>
                <span>Bronze (10-49 pts)</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🥈</span>
                <span>Argent (50-99 pts)</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🥇</span>
                <span>Or (100+ pts)</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
