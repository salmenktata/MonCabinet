/**
 * Page Super Admin - Vue globale des fichiers web
 */

import nextDynamic from 'next/dynamic'
import { db } from '@/lib/db/postgres'

// Dynamic import pour réduire le bundle initial
const WebFilesList = nextDynamic(
  () => import('@/components/super-admin/web-files/WebFilesList').then(m => ({ default: m.WebFilesList })),
  { loading: () => <div className="h-96 bg-slate-800 animate-pulse rounded-lg" /> }
)

export const dynamic = 'force-dynamic'

async function getSources() {
  const result = await db.query(
    `SELECT id, name FROM web_sources WHERE is_active = true ORDER BY name`
  )
  return result.rows
}

export default async function WebFilesPage() {
  const sources = await getSources()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Fichiers Web</h1>
        <p className="text-slate-400 mt-1">
          Vue globale de tous les fichiers (PDF, DOCX) récupérés depuis les sources web
        </p>
      </div>

      {/* Liste des fichiers avec filtres */}
      <WebFilesList sources={sources} />
    </div>
  )
}
