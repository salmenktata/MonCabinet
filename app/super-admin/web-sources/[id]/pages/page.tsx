/**
 * Page Super Admin - Liste des pages crawlées d'une source web
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; status?: string; search?: string }>
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-slate-500' },
  crawled: { label: 'Crawlée', color: 'bg-blue-500' },
  indexed: { label: 'Indexée', color: 'bg-green-500' },
  failed: { label: 'Erreur', color: 'bg-red-500' },
  unchanged: { label: 'Inchangée', color: 'bg-slate-400' },
  removed: { label: 'Supprimée', color: 'bg-orange-500' },
  blocked: { label: 'Bloquée', color: 'bg-yellow-500' },
}

const ITEMS_PER_PAGE = 20

async function getSourcePages(
  sourceId: string,
  page: number,
  status?: string,
  search?: string
) {
  // Vérifier que la source existe
  const sourceResult = await db.query(
    `SELECT id, name, base_url FROM web_sources WHERE id = $1`,
    [sourceId]
  )

  if (sourceResult.rows.length === 0) {
    return null
  }

  const source = sourceResult.rows[0]

  // Construire la requête avec filtres
  let whereClause = 'WHERE web_source_id = $1'
  const params: (string | number)[] = [sourceId]
  let paramIndex = 2

  if (status && status !== 'all') {
    whereClause += ` AND status = $${paramIndex}`
    params.push(status)
    paramIndex++
  }

  if (search) {
    whereClause += ` AND (title ILIKE $${paramIndex} OR url ILIKE $${paramIndex})`
    params.push(`%${search}%`)
    paramIndex++
  }

  // Compter le total
  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM web_pages ${whereClause}`,
    params
  )
  const total = parseInt(countResult.rows[0].total)

  // Récupérer les pages avec pagination
  const offset = (page - 1) * ITEMS_PER_PAGE
  const pagesResult = await db.query(
    `SELECT
      id, url, title, status, is_indexed,
      word_count, chunks_count, language_detected,
      error_message, error_count,
      crawl_depth, freshness_score,
      first_seen_at, last_crawled_at, last_indexed_at
    FROM web_pages
    ${whereClause}
    ORDER BY last_crawled_at DESC NULLS LAST
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, ITEMS_PER_PAGE, offset]
  )

  // Stats par status
  const statsResult = await db.query(
    `SELECT status, COUNT(*) as count
     FROM web_pages
     WHERE web_source_id = $1
     GROUP BY status`,
    [sourceId]
  )

  const stats = statsResult.rows.reduce(
    (acc, row) => {
      acc[row.status] = parseInt(row.count)
      return acc
    },
    {} as Record<string, number>
  )

  // Sérialiser les dates
  const pages = pagesResult.rows.map((p) => ({
    ...p,
    first_seen_at: p.first_seen_at?.toISOString() || null,
    last_crawled_at: p.last_crawled_at?.toISOString() || null,
    last_indexed_at: p.last_indexed_at?.toISOString() || null,
  }))

  return {
    source,
    pages,
    stats,
    pagination: {
      page,
      totalPages: Math.ceil(total / ITEMS_PER_PAGE),
      total,
      perPage: ITEMS_PER_PAGE,
    },
  }
}

export default async function WebSourcePagesPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const { page: pageParam, status, search } = await searchParams
  const page = parseInt(pageParam || '1')

  const data = await getSourcePages(id, page, status, search)

  if (!data) {
    notFound()
  }

  const { source, pages, stats, pagination } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/super-admin/web-sources/${id}`}>
            <Button variant="ghost" size="sm" className="text-slate-400">
              <Icons.arrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Pages de {source.name}
            </h1>
            <p className="text-slate-400 text-sm">{pagination.total} pages</p>
          </div>
        </div>
      </div>

      {/* Stats par status */}
      <div className="flex flex-wrap gap-2">
        <FilterBadge
          href={`/super-admin/web-sources/${id}/pages`}
          active={!status || status === 'all'}
          count={pagination.total}
          label="Toutes"
        />
        {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
          <FilterBadge
            key={key}
            href={`/super-admin/web-sources/${id}/pages?status=${key}`}
            active={status === key}
            count={stats[key] || 0}
            label={label}
          />
        ))}
      </div>

      {/* Liste des pages */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">Pages crawlées</CardTitle>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Icons.fileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune page trouvée</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pages.map((pageItem) => (
                <PageRow key={pageItem.id} page={pageItem} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700">
              <p className="text-sm text-slate-400">
                Page {pagination.page} sur {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                {pagination.page > 1 && (
                  <Link
                    href={`/super-admin/web-sources/${id}/pages?page=${pagination.page - 1}${status ? `&status=${status}` : ''}`}
                  >
                    <Button variant="outline" size="sm">
                      <Icons.chevronLeft className="h-4 w-4 mr-1" />
                      Précédent
                    </Button>
                  </Link>
                )}
                {pagination.page < pagination.totalPages && (
                  <Link
                    href={`/super-admin/web-sources/${id}/pages?page=${pagination.page + 1}${status ? `&status=${status}` : ''}`}
                  >
                    <Button variant="outline" size="sm">
                      Suivant
                      <Icons.chevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface FilterBadgeProps {
  href: string
  active: boolean
  count: number
  label: string
}

function FilterBadge({ href, active, count, label }: FilterBadgeProps) {
  return (
    <Link href={href}>
      <Badge
        className={`cursor-pointer transition-colors ${
          active
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        }`}
      >
        {label} ({count})
      </Badge>
    </Link>
  )
}

interface PageRowProps {
  page: {
    id: string
    url: string
    title: string | null
    status: string
    is_indexed: boolean
    word_count: number
    chunks_count: number
    language_detected: string | null
    error_message: string | null
    error_count: number
    crawl_depth: number
    freshness_score: number
    first_seen_at: string | null
    last_crawled_at: string | null
    last_indexed_at: string | null
  }
}

function PageRow({ page }: PageRowProps) {
  const statusInfo = STATUS_LABELS[page.status] || {
    label: page.status,
    color: 'bg-slate-500',
  }

  return (
    <div className="bg-slate-700/50 rounded-lg p-4 hover:bg-slate-700/70 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`${statusInfo.color} text-white text-xs`}>
              {statusInfo.label}
            </Badge>
            {page.is_indexed && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                <Icons.checkCircle className="h-3 w-3 mr-1" />
                Indexée
              </Badge>
            )}
            {page.language_detected && (
              <Badge
                variant="outline"
                className="text-xs border-slate-600 text-slate-400"
              >
                {page.language_detected.toUpperCase()}
              </Badge>
            )}
          </div>
          <h3 className="text-white font-medium truncate">
            {page.title || 'Sans titre'}
          </h3>
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 text-sm hover:text-blue-400 truncate block"
          >
            {page.url}
          </a>
          {page.error_message && (
            <p className="text-red-400 text-xs mt-1 truncate">
              <Icons.alertTriangle className="h-3 w-3 inline mr-1" />
              {page.error_message}
            </p>
          )}
        </div>
        <div className="text-right text-sm text-slate-400 shrink-0">
          <div className="flex items-center gap-4">
            {page.word_count > 0 && (
              <span title="Mots">{page.word_count.toLocaleString()} mots</span>
            )}
            {page.chunks_count > 0 && (
              <span title="Chunks RAG">{page.chunks_count} chunks</span>
            )}
          </div>
          {page.last_crawled_at && (
            <p className="text-xs mt-1">
              Crawlé {new Date(page.last_crawled_at).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
