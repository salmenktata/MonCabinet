import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API: Stats des batches (KB, Web Crawls, Quality Analysis)
 * GET /api/admin/cron-executions/batches
 * Auth: Session admin
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { safeParseInt } from '@/lib/utils/safe-number'

export async function GET(req: NextRequest) {
  try {
    // 1. KB Indexation Stats (24h)
    const kbStatsResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '24 hours') as completed_today,
        COUNT(*) FILTER (WHERE status = 'failed' AND completed_at >= NOW() - INTERVAL '24 hours') as failed_today,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '24 hours') as avg_duration_sec
      FROM indexing_jobs
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `)
    const kbStats = kbStatsResult.rows[0]

    // 2. Web Crawls Stats (24h)
    // Utilise web_pages car web_crawl_pages n'existe pas
    const crawlStatsResult = await db.query(`
      SELECT
        COUNT(DISTINCT wcj.id) FILTER (WHERE wcj.status = 'running') as active_jobs,
        0 as pages_crawled_today,
        0 as pages_failed_today,
        0 as avg_fetch_ms
      FROM web_crawl_jobs wcj
      WHERE wcj.created_at >= NOW() - INTERVAL '7 days'
    `)
    const crawlStats = crawlStatsResult.rows[0]

    // Compter les pages web crawlées aujourd'hui (alternative via web_pages)
    const webPagesStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE last_crawled_at >= NOW() - INTERVAL '24 hours' AND status IN ('crawled', 'indexed')) as pages_crawled,
        COUNT(*) FILTER (WHERE last_crawled_at >= NOW() - INTERVAL '24 hours' AND status = 'failed') as pages_failed
      FROM web_pages
    `)
    crawlStats.pages_crawled_today = webPagesStats.rows[0].pages_crawled || 0
    crawlStats.pages_failed_today = webPagesStats.rows[0].pages_failed || 0

    // 3. Quality Analysis Stats (24h)
    const qualityStatsResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE quality_score IS NULL AND is_active = true) as pending_analysis,
        COUNT(*) FILTER (WHERE quality_assessed_at >= NOW() - INTERVAL '24 hours' AND quality_score >= 80) as high_quality_today,
        COUNT(*) FILTER (WHERE quality_assessed_at >= NOW() - INTERVAL '24 hours' AND quality_score < 60) as low_quality_today,
        AVG(quality_score) FILTER (WHERE quality_assessed_at >= NOW() - INTERVAL '24 hours') as avg_score_today,
        COUNT(*) FILTER (WHERE quality_assessed_at >= NOW() - INTERVAL '24 hours') as analyzed_today
      FROM knowledge_base
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `)
    const qualityStats = qualityStatsResult.rows[0]

    // 4. Calcul taux de succès
    const kbSuccessRate = kbStats.completed_today > 0
      ? (parseInt(kbStats.completed_today, 10) / (parseInt(kbStats.completed_today, 10) + parseInt(kbStats.failed_today, 10))) * 100
      : 0

    const crawlSuccessRate = crawlStats.pages_crawled_today > 0
      ? (parseInt(crawlStats.pages_crawled_today, 10) / (parseInt(crawlStats.pages_crawled_today, 10) + parseInt(crawlStats.pages_failed_today, 10))) * 100
      : 0

    const qualitySuccessRate = qualityStats.analyzed_today > 0
      ? (parseInt(qualityStats.high_quality_today, 10) / parseInt(qualityStats.analyzed_today, 10)) * 100
      : 0

    return NextResponse.json({
      success: true,
      batches: {
        kbIndexation: {
          pending: parseInt(kbStats.pending, 10) || 0,
          processing: parseInt(kbStats.processing, 10) || 0,
          completedToday: parseInt(kbStats.completed_today, 10) || 0,
          failedToday: parseInt(kbStats.failed_today, 10) || 0,
          avgDurationSec: parseFloat(kbStats.avg_duration_sec) || 0,
          successRate: Math.round(kbSuccessRate * 100) / 100,
        },
        webCrawls: {
          activeJobs: parseInt(crawlStats.active_jobs, 10) || 0,
          pagesCrawledToday: parseInt(crawlStats.pages_crawled_today, 10) || 0,
          pagesFailedToday: parseInt(crawlStats.pages_failed_today, 10) || 0,
          avgFetchMs: parseFloat(crawlStats.avg_fetch_ms) || 0,
          successRate: Math.round(crawlSuccessRate * 100) / 100,
        },
        qualityAnalysis: {
          pendingAnalysis: parseInt(qualityStats.pending_analysis, 10) || 0,
          analyzedToday: parseInt(qualityStats.analyzed_today, 10) || 0,
          highQualityToday: parseInt(qualityStats.high_quality_today, 10) || 0,
          lowQualityToday: parseInt(qualityStats.low_quality_today, 10) || 0,
          avgScoreToday: Math.round((parseFloat(qualityStats.avg_score_today) || 0) * 100) / 100,
          successRate: Math.round(qualitySuccessRate * 100) / 100,
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Batches Stats] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
