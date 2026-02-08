/**
 * Page Super Admin - Contradictions détectées
 * Liste et gestion des contradictions entre contenus juridiques
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getContradictions,
  getContradictionsStats,
} from '@/app/actions/super-admin/content-review'
import { ContradictionFilters } from '@/components/super-admin/contradictions/ContradictionFilters'
import type { ContradictionStatus, ContradictionSeverity } from '@/lib/web-scraper/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    status?: string
    severity?: string
    page?: string
  }>
}

const SEVERITY_COLORS: Record<ContradictionSeverity, string> = {
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const SEVERITY_LABELS: Record<ContradictionSeverity, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
}

const STATUS_COLORS: Record<ContradictionStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  under_review: 'bg-blue-500/20 text-blue-400',
  resolved: 'bg-green-500/20 text-green-400',
  dismissed: 'bg-slate-500/20 text-slate-400',
  escalated: 'bg-purple-500/20 text-purple-400',
}

const TYPE_LABELS: Record<string, string> = {
  version_conflict: 'Conflit de version',
  interpretation_conflict: 'Conflit d\'interprétation',
  date_conflict: 'Conflit de date',
  legal_update: 'Mise à jour légale',
  doctrine_vs_practice: 'Doctrine vs pratique',
  cross_reference_error: 'Erreur de référence',
}

export default async function ContradictionsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  const pageSize = 20

  // Préparer les filtres
  const filters: {
    status?: ContradictionStatus[]
    severity?: ContradictionSeverity[]
  } = {}

  if (params.status) {
    filters.status = [params.status as ContradictionStatus]
  }
  if (params.severity) {
    filters.severity = [params.severity as ContradictionSeverity]
  }

  // Récupérer les données
  const [contradictionsData, stats] = await Promise.all([
    getContradictions({
      ...filters,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    getContradictionsStats(),
  ])

  const totalPages = Math.ceil(contradictionsData.total / pageSize)

  // Récupérer les titres des pages pour chaque contradiction
  const pageIds = new Set<string>()
  contradictionsData.items.forEach((c) => {
    pageIds.add(c.sourcePageId)
    if (c.targetPageId) pageIds.add(c.targetPageId)
  })

  const pageTitles: Record<string, string> = {}
  if (pageIds.size > 0) {
    const pagesResult = await db.query<{ id: string; title: string | null; url: string }>(
      `SELECT id, title, url FROM web_pages WHERE id = ANY($1)`,
      [Array.from(pageIds)]
    )
    pagesResult.rows.forEach((row) => {
      pageTitles[row.id] = row.title || row.url
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contradictions</h1>
          <p className="text-slate-400 mt-1">
            Gérez les contradictions détectées entre les contenus juridiques
          </p>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total"
          value={stats.total}
          icon={Icons.alertTriangle}
          color="text-slate-400"
        />
        <StatCard
          label="En attente"
          value={stats.pending}
          icon={Icons.clock}
          color="text-yellow-400"
        />
        <StatCard
          label="Critiques"
          value={stats.bySeverity.critical || 0}
          icon={Icons.alertCircle}
          color="text-red-400"
        />
        <StatCard
          label="Hautes"
          value={stats.bySeverity.high || 0}
          icon={Icons.alertTriangle}
          color="text-orange-400"
        />
        <StatCard
          label="Résolues"
          value={stats.resolved}
          icon={Icons.check}
          color="text-green-400"
        />
      </div>

      {/* Filtres */}
      <ContradictionFilters
        currentStatus={params.status}
        currentSeverity={params.severity}
      />

      {/* Liste */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 hover:bg-transparent">
              <TableHead className="text-slate-400">Type</TableHead>
              <TableHead className="text-slate-400">Sévérité</TableHead>
              <TableHead className="text-slate-400">Documents</TableHead>
              <TableHead className="text-slate-400">Description</TableHead>
              <TableHead className="text-slate-400">Statut</TableHead>
              <TableHead className="text-slate-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contradictionsData.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                  <Icons.check className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  Aucune contradiction trouvée
                </TableCell>
              </TableRow>
            ) : (
              contradictionsData.items.map((contradiction) => (
                <TableRow
                  key={contradiction.id}
                  className="border-slate-700 hover:bg-slate-800/50"
                >
                  <TableCell className="text-sm">
                    {TYPE_LABELS[contradiction.contradictionType] || contradiction.contradictionType}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={SEVERITY_COLORS[contradiction.severity]}
                    >
                      {SEVERITY_LABELS[contradiction.severity]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="text-sm">
                      <div className="text-white truncate">
                        {pageTitles[contradiction.sourcePageId] || 'Page source'}
                      </div>
                      {contradiction.targetPageId && (
                        <div className="text-slate-400 truncate flex items-center gap-1">
                          <Icons.arrowRight className="h-3 w-3" />
                          {pageTitles[contradiction.targetPageId] || 'Page cible'}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-sm text-slate-300 truncate">
                      {contradiction.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[contradiction.status]}
                    >
                      {contradiction.status === 'pending' ? 'En attente' :
                       contradiction.status === 'under_review' ? 'En cours' :
                       contradiction.status === 'resolved' ? 'Résolu' :
                       contradiction.status === 'dismissed' ? 'Rejeté' : 'Escaladé'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/super-admin/contradictions/${contradiction.id}`}>
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
            Page {page} sur {totalPages}
          </div>
          <div className="flex gap-2">
            <Link
              href={`?page=${page - 1}${params.status ? `&status=${params.status}` : ''}${params.severity ? `&severity=${params.severity}` : ''}`}
              className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
            >
              <Button variant="outline" size="sm" disabled={page <= 1}>
                <Icons.chevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Link
              href={`?page=${page + 1}${params.status ? `&status=${params.status}` : ''}${params.severity ? `&severity=${params.severity}` : ''}`}
              className={page >= totalPages ? 'pointer-events-none opacity-50' : ''}
            >
              <Button variant="outline" size="sm" disabled={page >= totalPages}>
                <Icons.chevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
    </div>
  )
}
