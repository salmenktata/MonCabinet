/**
 * GET /api/admin/iort/health
 *
 * Endpoint de santé du système IORT : derniers crawls, pages par source,
 * taux d'erreur, fraîcheur des données.
 *
 * Auth : CRON_SECRET (x-cron-secret) OU session admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

export const GET = withAdminApiAuth(
  async (_request: NextRequest): Promise<NextResponse> => {
    const [sources, crawlJobs, pageStats, kbStats] = await Promise.all([
      // Sources IORT enregistrées
      db.query(`
        SELECT id, name, base_url, created_at, updated_at
        FROM web_sources
        WHERE base_url LIKE '%iort%'
        ORDER BY created_at
      `),

      // 10 derniers crawl jobs IORT
      db.query(`
        SELECT wcj.id, wcj.job_type, wcj.status, wcj.started_at, wcj.finished_at,
               wcj.pages_crawled, wcj.pages_failed, wcj.error_message,
               ws.name as source_name
        FROM web_crawl_jobs wcj
        JOIN web_sources ws ON ws.id = wcj.web_source_id
        WHERE ws.base_url LIKE '%iort%'
        ORDER BY wcj.started_at DESC
        LIMIT 10
      `),

      // Pages par source IORT
      db.query(`
        SELECT ws.name as source_name,
               COUNT(wp.id) as total_pages,
               COUNT(CASE WHEN wp.status = 'crawled' THEN 1 END) as crawled,
               COUNT(CASE WHEN wp.status = 'error' THEN 1 END) as errors,
               COUNT(CASE WHEN wp.status = 'pending' THEN 1 END) as pending,
               MAX(wp.last_crawled_at) as last_page_crawled_at,
               MIN(wp.created_at) as first_page_at
        FROM web_sources ws
        LEFT JOIN web_pages wp ON wp.web_source_id = ws.id
        WHERE ws.base_url LIKE '%iort%'
        GROUP BY ws.id, ws.name
      `),

      // Documents KB issus de l'IORT
      db.query(`
        SELECT
          COUNT(*) as total_documents,
          COUNT(CASE WHEN is_indexed = true THEN 1 END) as indexed,
          COUNT(CASE WHEN is_indexed = false THEN 1 END) as not_indexed,
          MAX(created_at) as newest_document,
          MIN(created_at) as oldest_document
        FROM knowledge_base
        WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      `),
    ])

    const now = new Date()
    const lastCrawl = crawlJobs.rows[0]
    const daysSinceLastCrawl = lastCrawl?.started_at
      ? Math.round((now.getTime() - new Date(lastCrawl.started_at).getTime()) / (1000 * 60 * 60 * 24))
      : null

    const overallErrorRate = pageStats.rows.reduce((acc: number, r: Record<string, number>) => {
      const total = Number(r.total_pages) || 0
      const errors = Number(r.errors) || 0
      return total > 0 ? acc + errors / total : acc
    }, 0) / Math.max(pageStats.rows.length, 1)

    const freshness = daysSinceLastCrawl === null
      ? 'unknown'
      : daysSinceLastCrawl <= 7
        ? 'fresh'
        : daysSinceLastCrawl <= 30
          ? 'stale'
          : 'outdated'

    return NextResponse.json({
      status: 'ok',
      freshness,
      daysSinceLastCrawl,
      overallErrorRate: Math.round(overallErrorRate * 10000) / 100,
      sources: sources.rows.map((s: Record<string, string>) => ({
        id: s.id,
        name: s.name,
        baseUrl: s.base_url,
      })),
      pageStats: pageStats.rows.map((r: Record<string, string | number>) => ({
        source: r.source_name,
        totalPages: Number(r.total_pages),
        crawled: Number(r.crawled),
        errors: Number(r.errors),
        pending: Number(r.pending),
        errorRate: Number(r.total_pages) > 0
          ? Math.round((Number(r.errors) / Number(r.total_pages)) * 10000) / 100
          : 0,
        lastPageCrawledAt: r.last_page_crawled_at,
        firstPageAt: r.first_page_at,
      })),
      knowledgeBase: kbStats.rows[0]
        ? {
          totalDocuments: Number(kbStats.rows[0].total_documents),
          indexed: Number(kbStats.rows[0].indexed),
          notIndexed: Number(kbStats.rows[0].not_indexed),
          newestDocument: kbStats.rows[0].newest_document,
          oldestDocument: kbStats.rows[0].oldest_document,
        }
        : null,
      recentCrawls: crawlJobs.rows.map((j: Record<string, string | number | null>) => ({
        id: j.id,
        source: j.source_name,
        type: j.job_type,
        status: j.status,
        startedAt: j.started_at,
        finishedAt: j.finished_at,
        pagesCrawled: j.pages_crawled,
        pagesFailed: j.pages_failed,
        error: j.error_message,
      })),
    })
  },
  { allowCronSecret: true },
)
