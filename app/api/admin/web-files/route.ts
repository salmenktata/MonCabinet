/**
 * API Route: Liste globale des fichiers web
 * GET /api/admin/web-files - Liste tous les fichiers avec pagination et filtres
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

interface WebFileRow {
  id: string
  web_page_id: string
  web_source_id: string
  knowledge_base_id: string | null
  url: string
  filename: string
  file_type: string
  minio_path: string | null
  file_size: number
  is_downloaded: boolean
  is_indexed: boolean
  download_error: string | null
  parse_error: string | null
  chunks_count: number
  word_count: number
  downloaded_at: string | null
  indexed_at: string | null
  created_at: string
  source_name: string
  page_url: string
  page_title: string | null
}

interface WebFilesStats {
  totalFiles: number
  totalSize: number
  byType: Record<string, number>
  byStatus: {
    pending: number
    downloaded: number
    indexed: number
    error: number
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const sourceId = searchParams.get('source_id')
    const fileType = searchParams.get('file_type')
    const isIndexed = searchParams.get('is_indexed')
    const search = searchParams.get('search')
    const status = searchParams.get('status') // pending, downloaded, indexed, error

    const offset = (page - 1) * limit

    // Construction des conditions WHERE
    const conditions: string[] = []
    const params: (string | number | boolean)[] = []
    let paramIndex = 1

    if (sourceId) {
      conditions.push(`wf.web_source_id = $${paramIndex}`)
      params.push(sourceId)
      paramIndex++
    }

    if (fileType) {
      conditions.push(`wf.file_type = $${paramIndex}`)
      params.push(fileType)
      paramIndex++
    }

    if (isIndexed !== null && isIndexed !== undefined) {
      conditions.push(`wf.is_indexed = $${paramIndex}`)
      params.push(isIndexed === 'true')
      paramIndex++
    }

    if (status) {
      switch (status) {
        case 'pending':
          conditions.push('wf.is_downloaded = false AND wf.download_error IS NULL')
          break
        case 'downloaded':
          conditions.push('wf.is_downloaded = true AND wf.is_indexed = false AND wf.parse_error IS NULL')
          break
        case 'indexed':
          conditions.push('wf.is_indexed = true')
          break
        case 'error':
          conditions.push('(wf.download_error IS NOT NULL OR wf.parse_error IS NOT NULL)')
          break
      }
    }

    if (search) {
      conditions.push(`wf.filename ILIKE $${paramIndex}`)
      params.push(`%${search}%`)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Requête pour compter le total
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM web_files wf ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0].total)

    // Requête pour récupérer les fichiers avec pagination
    const filesResult = await db.query<WebFileRow>(
      `SELECT
        wf.id,
        wf.web_page_id,
        wf.web_source_id,
        wf.knowledge_base_id,
        wf.url,
        wf.filename,
        wf.file_type,
        wf.minio_path,
        wf.file_size,
        wf.is_downloaded,
        wf.is_indexed,
        wf.download_error,
        wf.parse_error,
        wf.chunks_count,
        wf.word_count,
        wf.downloaded_at,
        wf.indexed_at,
        wf.created_at,
        ws.name as source_name,
        wp.url as page_url,
        wp.title as page_title
      FROM web_files wf
      LEFT JOIN web_sources ws ON wf.web_source_id = ws.id
      LEFT JOIN web_pages wp ON wf.web_page_id = wp.id
      ${whereClause}
      ORDER BY wf.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    // Calculer les stats globales (sans filtres de pagination)
    const statsResult = await db.query(
      `SELECT
        COUNT(*) as total_files,
        COALESCE(SUM(file_size), 0) as total_size,
        COUNT(*) FILTER (WHERE is_downloaded = false AND download_error IS NULL) as pending,
        COUNT(*) FILTER (WHERE is_downloaded = true AND is_indexed = false AND parse_error IS NULL) as downloaded,
        COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
        COUNT(*) FILTER (WHERE download_error IS NOT NULL OR parse_error IS NOT NULL) as error
      FROM web_files`
    )

    const typeStatsResult = await db.query(
      `SELECT file_type, COUNT(*) as count
       FROM web_files
       GROUP BY file_type
       ORDER BY count DESC`
    )

    const byType: Record<string, number> = {}
    for (const row of typeStatsResult.rows) {
      byType[row.file_type] = parseInt(row.count)
    }

    const stats: WebFilesStats = {
      totalFiles: parseInt(statsResult.rows[0].total_files),
      totalSize: parseInt(statsResult.rows[0].total_size),
      byType,
      byStatus: {
        pending: parseInt(statsResult.rows[0].pending),
        downloaded: parseInt(statsResult.rows[0].downloaded),
        indexed: parseInt(statsResult.rows[0].indexed),
        error: parseInt(statsResult.rows[0].error),
      },
    }

    // Formater les fichiers pour la réponse
    const files = filesResult.rows.map(file => ({
      id: file.id,
      webPageId: file.web_page_id,
      webSourceId: file.web_source_id,
      knowledgeBaseId: file.knowledge_base_id,
      url: file.url,
      filename: file.filename,
      fileType: file.file_type,
      minioPath: file.minio_path,
      fileSize: file.file_size,
      isDownloaded: file.is_downloaded,
      isIndexed: file.is_indexed,
      downloadError: file.download_error,
      parseError: file.parse_error,
      chunksCount: file.chunks_count,
      wordCount: file.word_count,
      downloadedAt: file.downloaded_at,
      indexedAt: file.indexed_at,
      createdAt: file.created_at,
      sourceName: file.source_name,
      pageUrl: file.page_url,
      pageTitle: file.page_title,
      status: file.download_error || file.parse_error
        ? 'error'
        : file.is_indexed
          ? 'indexed'
          : file.is_downloaded
            ? 'downloaded'
            : 'pending',
    }))

    return NextResponse.json({
      files,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    })
  } catch (error) {
    console.error('Erreur récupération fichiers:', error)
    return NextResponse.json(
      { error: 'Erreur récupération fichiers' },
      { status: 500 }
    )
  }
}
