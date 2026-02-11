/**
 * Queue de Revue de Contenu Juridique
 * Composant unifié pour la validation du contenu
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { HumanReviewItem, ReviewStatus, ReviewType, ReviewPriority } from '@/lib/web-scraper/types'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  assigned: 'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-green-500/20 text-green-400',
  skipped: 'bg-slate-500/20 text-slate-400',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-green-500/20 text-green-400',
}

const TYPE_LABELS: Record<string, string> = {
  quality_check: 'Qualité',
  contradiction: 'Contradiction',
  metadata: 'Métadonnées',
  classification: 'Classification',
  content: 'Contenu',
}

interface ReviewQueueData {
  items: HumanReviewItem[]
  total: number
}

interface ReviewStats {
  pending: number
  assigned: number
  inProgress: number
  completed: number
  byType: Record<string, number>
  byPriority: Record<string, number>
}

export function ContentReviewQueue() {
  const router = useRouter()
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [data, setData] = useState<ReviewQueueData | null>(null)
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)

  const page = parseInt(searchParams.get('page') || '1')
  const statusFilter = searchParams.get('status') || 'all'
  const typeFilter = searchParams.get('type') || 'all'
  const priorityFilter = searchParams.get('priority') || 'all'
  const pageSize = 20

  useEffect(() => {
    fetchData()
  }, [page, statusFilter, typeFilter, priorityFilter])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Construire les filtres
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      })

      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (typeFilter !== 'all') params.append('type', typeFilter)
      if (priorityFilter !== 'all') params.append('priority', priorityFilter)

      // Récupérer la queue et les stats en parallèle
      const [queueRes, statsRes] = await Promise.all([
        fetch(`/api/super-admin/content-review/queue?${params}`),
        fetch('/api/super-admin/content-review/stats'),
      ])

      if (!queueRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch data')
      }

      const queueData = await queueRes.json()
      const statsData = await statsRes.json()

      setData(queueData)
      setStats(statsData)
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les données',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClaimNext = async () => {
    setClaiming(true)
    try {
      const response = await fetch('/api/super-admin/content-review/claim-next', {
        method: 'POST',
      })

      if (!response.ok) throw new Error('Failed to claim item')

      const item = await response.json()

      if (item) {
        toast({
          title: 'Item assigné',
          description: `"${item.title}" vous a été assigné`,
        })
        router.push(`/super-admin/content-review/${item.id}`)
      } else {
        toast({
          title: 'Queue vide',
          description: 'Aucun item en attente de revue',
        })
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de récupérer un item',
        variant: 'destructive',
      })
    } finally {
      setClaiming(false)
    }
  }

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.set('page', '1') // Reset to first page
    router.push(`?${params.toString()}`)
  }

  const formatDate = (date: Date | null) => {
    if (!date) return '-'
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date))
  }

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">En attente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Assignées</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.assigned}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">En cours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.inProgress}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Terminées</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Select value={statusFilter} onValueChange={(v) => updateFilter('status', v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="assigned">Assignée</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="completed">Terminée</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(v) => updateFilter('type', v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="quality_check">Qualité</SelectItem>
                <SelectItem value="contradiction">Contradiction</SelectItem>
                <SelectItem value="metadata">Métadonnées</SelectItem>
                <SelectItem value="classification">Classification</SelectItem>
                <SelectItem value="content">Contenu</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={(v) => updateFilter('priority', v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="low">Basse</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleClaimNext}
              disabled={claiming}
              className="ml-auto bg-emerald-600 hover:bg-emerald-700"
            >
              {claiming ? (
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Icons.play className="h-4 w-4 mr-2" />
              )}
              Traiter le suivant
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créée le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Icons.inbox className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    Aucun item dans la queue
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/super-admin/content-review/${item.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {item.title}
                      </Link>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs mt-1">
                          {item.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {TYPE_LABELS[item.reviewType] || item.reviewType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium}
                      >
                        {item.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.qualityScore !== null ? (
                        <span
                          className={`font-mono ${
                            item.qualityScore >= 70
                              ? 'text-green-500'
                              : item.qualityScore >= 50
                              ? 'text-yellow-500'
                              : 'text-red-500'
                          }`}
                        >
                          {item.qualityScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[item.status]}>
                        {item.status === 'pending' ? 'En attente' :
                         item.status === 'assigned' ? 'Assignée' :
                         item.status === 'in_progress' ? 'En cours' :
                         item.status === 'completed' ? 'Terminée' : 'Passée'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/super-admin/content-review/${item.id}`}>
                        <Button variant="ghost" size="sm">
                          <Icons.eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} sur {totalPages} ({data?.total} items)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateFilter('page', (page - 1).toString())}
            >
              <Icons.chevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateFilter('page', (page + 1).toString())}
            >
              <Icons.chevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
