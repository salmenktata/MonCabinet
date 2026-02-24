/**
 * API Route: Pipeline Stats par source web
 *
 * GET /api/admin/web-sources/pipeline-stats
 * Retourne, pour chaque source web, le détail de toutes les étapes du pipeline :
 * crawl → extraction → fichiers → chunking → indexation KB → RAG-ready
 *
 * Cache: 2 minutes (données changeantes)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { getCacheHeaders, CACHE_PRESETS } from '@/lib/api/cache-headers'

export const dynamic = 'force-dynamic'

export interface SourcePipelineStats {
  id: string
  name: string
  base_url: string
  category: string
  language: string
  is_active: boolean
  rag_enabled: boolean
  health_status: string
  consecutive_failures: number
  last_crawl_at: string | null
  next_crawl_at: string | null
  priority: number
  pages: {
    total: number
    indexed: number
    crawled_pending: number
    pending: number
    failed: number
    unchanged: number
    removed: number
    total_chunks: number
  }
  files: {
    total: number
    downloaded: number
    indexed: number
    download_failed: number
    parse_failed: number
    total_chunks: number
  }
  kb: {
    docs_count: number
    total_chunks: number
  }
  last_crawl_log: {
    pages_new: number
    pages_changed: number
    pages_failed: number
    duration_ms: number
    status: string
    started_at: string
  } | null
}

export const GET = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || ''
  const search = searchParams.get('search') || ''
  const isActiveParam = searchParams.get('isActive')
  const isActive = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined

  // Conditions de filtre
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (category) {
    conditions.push(`ws.category = $${paramIdx++}`)
    params.push(category)
  }
  if (search) {
    conditions.push(`(ws.name ILIKE $${paramIdx} OR ws.base_url ILIKE $${paramIdx++})`)
    params.push(`%${search}%`)
  }
  if (isActive !== undefined) {
    conditions.push(`ws.is_active = $${paramIdx++}`)
    params.push(isActive)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Requête principale : agrégation par source
  const mainQuery = `
    SELECT
      ws.id,
      ws.name,
      ws.base_url,
      ws.category,
      ws.language,
      ws.is_active,
      ws.rag_enabled,
      ws.health_status,
      ws.consecutive_failures,
      ws.last_crawl_at,
      ws.next_crawl_at,
      ws.priority,
      -- Pages par statut
      COUNT(wp.id)                                               AS total_pages,
      COUNT(wp.id) FILTER (WHERE wp.is_indexed = true)          AS pages_indexed,
      COUNT(wp.id) FILTER (WHERE wp.status = 'crawled'
                            AND wp.is_indexed = false)          AS pages_crawled_pending,
      COUNT(wp.id) FILTER (WHERE wp.status = 'pending')         AS pages_pending,
      COUNT(wp.id) FILTER (WHERE wp.status = 'failed')          AS pages_failed,
      COUNT(wp.id) FILTER (WHERE wp.status = 'unchanged')       AS pages_unchanged,
      COUNT(wp.id) FILTER (WHERE wp.status = 'removed')         AS pages_removed,
      COALESCE(SUM(wp.chunks_count), 0)                         AS pages_total_chunks,
      -- Fichiers
      COUNT(wf.id)                                              AS total_files,
      COUNT(wf.id) FILTER (WHERE wf.is_downloaded = true)       AS files_downloaded,
      COUNT(wf.id) FILTER (WHERE wf.is_indexed = true)          AS files_indexed,
      COUNT(wf.id) FILTER (WHERE wf.download_error IS NOT NULL) AS files_download_failed,
      COUNT(wf.id) FILTER (WHERE wf.parse_error IS NOT NULL
                            AND wf.download_error IS NULL)      AS files_parse_failed,
      COALESCE(SUM(wf.chunks_count), 0)                         AS files_total_chunks,
      -- KB docs (pages liées à une KB)
      COUNT(DISTINCT wp.knowledge_base_id)
        FILTER (WHERE wp.knowledge_base_id IS NOT NULL)         AS kb_docs_count
    FROM web_sources ws
    LEFT JOIN web_pages wp ON wp.web_source_id = ws.id
    LEFT JOIN web_files wf ON wf.web_source_id = ws.id
    ${whereClause}
    GROUP BY
      ws.id, ws.name, ws.base_url, ws.category, ws.language,
      ws.is_active, ws.rag_enabled, ws.health_status, ws.consecutive_failures,
      ws.last_crawl_at, ws.next_crawl_at, ws.priority
    ORDER BY ws.priority DESC, ws.name ASC
  `

  // Sous-requête : dernier log de crawl par source
  const logsQuery = `
    SELECT DISTINCT ON (web_source_id)
      web_source_id,
      pages_new,
      pages_changed,
      pages_failed,
      duration_ms,
      status,
      started_at
    FROM web_crawl_logs
    ORDER BY web_source_id, started_at DESC
  `

  const [mainResult, logsResult] = await Promise.all([
    db.query(mainQuery, params),
    db.query(logsQuery),
  ])

  // Indexer les logs par source id
  const logsMap = new Map<string, typeof logsResult.rows[0]>()
  for (const row of logsResult.rows) {
    logsMap.set(row.web_source_id, row)
  }

  const stats: SourcePipelineStats[] = mainResult.rows.map((row) => {
    const log = logsMap.get(row.id) ?? null
    const totalChunks = Number(row.pages_total_chunks) + Number(row.files_total_chunks)

    return {
      id: row.id,
      name: row.name,
      base_url: row.base_url,
      category: row.category,
      language: row.language,
      is_active: row.is_active,
      rag_enabled: row.rag_enabled,
      health_status: row.health_status,
      consecutive_failures: Number(row.consecutive_failures),
      last_crawl_at: row.last_crawl_at ? row.last_crawl_at.toISOString?.() ?? row.last_crawl_at : null,
      next_crawl_at: row.next_crawl_at ? row.next_crawl_at.toISOString?.() ?? row.next_crawl_at : null,
      priority: Number(row.priority),
      pages: {
        total: Number(row.total_pages),
        indexed: Number(row.pages_indexed),
        crawled_pending: Number(row.pages_crawled_pending),
        pending: Number(row.pages_pending),
        failed: Number(row.pages_failed),
        unchanged: Number(row.pages_unchanged),
        removed: Number(row.pages_removed),
        total_chunks: Number(row.pages_total_chunks),
      },
      files: {
        total: Number(row.total_files),
        downloaded: Number(row.files_downloaded),
        indexed: Number(row.files_indexed),
        download_failed: Number(row.files_download_failed),
        parse_failed: Number(row.files_parse_failed),
        total_chunks: Number(row.files_total_chunks),
      },
      kb: {
        docs_count: Number(row.kb_docs_count),
        total_chunks: totalChunks,
      },
      last_crawl_log: log
        ? {
            pages_new: Number(log.pages_new ?? 0),
            pages_changed: Number(log.pages_changed ?? 0),
            pages_failed: Number(log.pages_failed ?? 0),
            duration_ms: Number(log.duration_ms ?? 0),
            status: log.status,
            started_at: log.started_at?.toISOString?.() ?? log.started_at,
          }
        : null,
    }
  })

  return NextResponse.json({ stats }, {
    headers: getCacheHeaders(CACHE_PRESETS.SHORT), // Cache 1 min
  })
})
