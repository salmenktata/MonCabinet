'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { ReviewTypeBadge, PriorityBadge } from './ReviewFilters'
import { claimNextReviewItem } from '@/app/actions/super-admin/content-review'
import type { HumanReviewItem } from '@/lib/web-scraper/types'

interface ReviewQueueProps {
  items: HumanReviewItem[]
  total: number
  currentPage: number
  pageSize: number
  userId: string
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  assigned: 'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-green-500/20 text-green-400',
  skipped: 'bg-slate-500/20 text-slate-400',
}

export function ReviewQueue({
  items,
  total,
  currentPage,
  pageSize,
  userId,
}: ReviewQueueProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [claiming, setClaiming] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  const handleClaimNext = async () => {
    setClaiming(true)
    try {
      const item = await claimNextReviewItem(userId)
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

  const formatDate = (date: Date | null) => {
    if (!date) return '-'
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date))
  }

  return (
    <div className="space-y-4">
      {/* Header avec action */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          {total} item{total > 1 ? 's' : ''} dans la queue
        </div>
        <Button
          onClick={handleClaimNext}
          disabled={claiming}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {claiming ? (
            <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Icons.play className="h-4 w-4 mr-2" />
          )}
          Traiter le suivant
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 hover:bg-transparent">
              <TableHead className="text-slate-400">Titre</TableHead>
              <TableHead className="text-slate-400">Type</TableHead>
              <TableHead className="text-slate-400">Priorité</TableHead>
              <TableHead className="text-slate-400">Score</TableHead>
              <TableHead className="text-slate-400">Statut</TableHead>
              <TableHead className="text-slate-400">Créée le</TableHead>
              <TableHead className="text-slate-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                  <Icons.inbox className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  Aucun item dans la queue
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  className="border-slate-700 hover:bg-slate-800/50"
                >
                  <TableCell>
                    <Link
                      href={`/super-admin/content-review/${item.id}`}
                      className="font-medium text-white hover:text-emerald-400"
                    >
                      {item.title}
                    </Link>
                    {item.description && (
                      <p className="text-xs text-slate-400 truncate max-w-xs mt-1">
                        {item.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <ReviewTypeBadge type={item.reviewType} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={item.priority} />
                  </TableCell>
                  <TableCell>
                    {item.qualityScore !== null ? (
                      <span
                        className={`font-mono ${
                          item.qualityScore >= 70
                            ? 'text-green-400'
                            : item.qualityScore >= 50
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {item.qualityScore}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                    {item.confidenceScore !== null && (
                      <span className="text-xs text-slate-400 ml-1">
                        ({(item.confidenceScore * 100).toFixed(0)}%)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[item.status] || STATUS_COLORS.pending}
                    >
                      {item.status === 'pending' ? 'En attente' :
                       item.status === 'assigned' ? 'Assignée' :
                       item.status === 'in_progress' ? 'En cours' :
                       item.status === 'completed' ? 'Terminée' : 'Passée'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm">
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
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Page {currentPage} sur {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() =>
                router.push(`?page=${currentPage - 1}`)
              }
            >
              <Icons.chevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() =>
                router.push(`?page=${currentPage + 1}`)
              }
            >
              <Icons.chevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
