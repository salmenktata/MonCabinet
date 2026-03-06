/**
 * Page Super Admin - Fichiers d'une source web
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { WebSourceFiles } from '@/components/super-admin/web-sources/WebSourceFiles'
import { safeParseInt } from '@/lib/utils/safe-number'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'
import { Breadcrumb } from '@/components/super-admin/shared/Breadcrumb'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getSourceData(id: string) {
  const sourceResult = await db.query(
    `SELECT id, name, base_url FROM web_sources WHERE id = $1`,
    [id]
  )

  if (sourceResult.rows.length === 0) {
    return null
  }

  const source = sourceResult.rows[0]

  // Stats fichiers pour cette source
  const statsResult = await db.query(
    `SELECT
      COUNT(*) as total_files,
      COUNT(*) FILTER (WHERE is_indexed = true) as indexed_files,
      COUNT(*) FILTER (WHERE is_downloaded = true AND is_indexed = false) as downloaded_files,
      COUNT(*) FILTER (WHERE download_error IS NOT NULL OR parse_error IS NOT NULL) as error_files,
      COALESCE(SUM(file_size), 0) as total_size,
      COALESCE(SUM(chunks_count), 0) as total_chunks
    FROM web_files
    WHERE web_source_id = $1`,
    [id]
  )

  return {
    source,
    stats: statsResult.rows[0],
  }
}

export default async function WebSourceFilesPage({ params }: PageProps) {
  const { id } = await params
  const data = await getSourceData(id)

  if (!data) {
    notFound()
  }

  const { source, stats } = data

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const indexationRate = parseInt(stats.total_files, 10) > 0
    ? Math.round((parseInt(stats.indexed_files, 10) / parseInt(stats.total_files, 10)) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <Breadcrumb items={[
        { label: 'Sources Web', href: '/super-admin/web-sources' },
        { label: source.name, href: `/super-admin/web-sources/${id}` },
        { label: 'Fichiers' },
      ]} />
      <PageHeader
        title={`Fichiers - ${source.name}`}
        backHref={`/super-admin/web-sources/${id}`}
        action={
          <Link href="/super-admin/web-files">
            <Button variant="outline" className="border-border text-muted-foreground">
              <Icons.globe className="h-4 w-4 mr-2" />
              Vue globale
            </Button>
          </Link>
        }
      />

      {/* Stats résumé */}
      <div className="bg-card/50 rounded-lg p-4 border border-border">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.total_files}</p>
            <p className="text-xs text-muted-foreground">Fichiers</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{indexationRate}%</p>
            <p className="text-xs text-muted-foreground">Taux indexation</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-400">{stats.total_chunks}</p>
            <p className="text-xs text-muted-foreground">Chunks</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-400">{stats.error_files}</p>
            <p className="text-xs text-muted-foreground">Erreurs</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-400">{formatBytes(parseInt(stats.total_size, 10))}</p>
            <p className="text-xs text-muted-foreground">Stockage</p>
          </div>
        </div>
      </div>

      {/* Liste des fichiers */}
      <WebSourceFiles sourceId={id} />
    </div>
  )
}
