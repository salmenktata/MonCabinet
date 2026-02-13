/**
 * API Super Admin : Lancer classification batch des pages web
 *
 * POST /api/super-admin/classify-pages
 *
 * Body:
 * {
 *   "limit": 100,       // Optionnel : nombre de pages max
 *   "skipCache": false  // Optionnel : ignorer cache
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { classifyLegalContent } from '@/lib/web-scraper/legal-classifier-service'

// =============================================================================
// TYPES
// =============================================================================

interface ClassifyRequest {
  limit?: number
  skipCache?: boolean
}

interface ClassifyStats {
  total: number
  processed: number
  succeeded: number
  failed: number
  skipped: number
  errors: Array<{ page_id: string; url: string; error: string }>
}

interface WebPageToClassify {
  id: string
  url: string
  title: string | null
  extracted_text: string
  web_source_id: string
}

// =============================================================================
// API HANDLER
// =============================================================================

export async function POST(req: NextRequest) {
  try {
    // 1. Vérifier authentification Super Admin
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role?.toUpperCase() !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Accès refusé - Super Admin uniquement' },
        { status: 403 }
      )
    }

    // 2. Parser requête
    const body: ClassifyRequest = await req.json().catch(() => ({}))
    const limit = body.limit || 100 // Default 100 pages
    const skipCache = body.skipCache || false

    // 3. Vérifier qu'il n'y a pas déjà une classification en cours
    const runningJob = await db.query(
      `SELECT id FROM indexing_jobs
       WHERE job_type = 'classify_pages'
         AND status = 'running'
       LIMIT 1`
    )

    if (runningJob.rows.length > 0) {
      return NextResponse.json(
        {
          error: 'Une classification est déjà en cours',
          job_id: runningJob.rows[0].id,
        },
        { status: 409 }
      )
    }

    // 4. Créer job d'indexation
    const jobResult = await db.query(
      `INSERT INTO indexing_jobs (
        job_type,
        target_id,
        status,
        started_at,
        metadata
      ) VALUES ('classify_pages', $1, 'running', NOW(), $2)
      RETURNING id`,
      [
        session.user.id, // target_id = user qui lance le job
        JSON.stringify({
          limit,
          skipCache,
          started_by: session.user.id,
        }),
      ]
    )

    const jobId = jobResult.rows[0].id

    // 5. Récupérer pages à classifier
    const pagesResult = await db.query(
      `SELECT
         wp.id,
         wp.url,
         wp.title,
         wp.extracted_text,
         wp.web_source_id
       FROM web_pages wp
       LEFT JOIN legal_classifications lc ON wp.id = lc.web_page_id
       WHERE wp.status IN ('crawled', 'indexed')
         AND wp.extracted_text IS NOT NULL
         AND LENGTH(wp.extracted_text) >= 100
         AND lc.id IS NULL
       ORDER BY wp.last_crawled_at DESC
       LIMIT $1`,
      [limit]
    )

    const pages = pagesResult.rows as WebPageToClassify[]

    if (pages.length === 0) {
      await db.query(
        `UPDATE indexing_jobs
         SET status = 'completed',
             completed_at = NOW(),
             metadata = metadata || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify({ message: 'Aucune page à classifier' }), jobId]
      )

      return NextResponse.json({
        message: 'Aucune page à classifier',
        job_id: jobId,
        stats: {
          total: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
        },
      })
    }

    // 6. Lancer classification en arrière-plan (sans await)
    classifyPagesBackground(pages, jobId, limit).catch((error) => {
      console.error('[ClassifyAPI] Erreur background:', error)
    })

    // 7. Retourner réponse immédiate
    return NextResponse.json({
      message: `Classification lancée pour ${pages.length} pages`,
      job_id: jobId,
      pages_count: pages.length,
      limit,
    })
  } catch (error) {
    console.error('[ClassifyAPI] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// CLASSIFICATION BACKGROUND
// =============================================================================

async function classifyPagesBackground(
  pages: WebPageToClassify[],
  jobId: string,
  limit: number
): Promise<void> {
  const stats: ClassifyStats = {
    total: pages.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  try {
    // Traiter les pages séquentiellement (éviter surcharge LLM)
    for (const page of pages) {
      try {
        const classification = await classifyLegalContent(page.id)

        if (classification && classification.primaryCategory) {
          stats.succeeded++
          console.log(
            `[ClassifyAPI] ✅ ${page.url.substring(0, 60)}... → ${classification.primaryCategory}`
          )
        } else {
          stats.skipped++
          console.log(`[ClassifyAPI] ⚠️  ${page.url.substring(0, 60)}... → Skipped`)
        }

        stats.processed++

        // Mettre à jour progression
        if (stats.processed % 10 === 0 || stats.processed === stats.total) {
          await db.query(
            `UPDATE indexing_jobs
             SET metadata = metadata || $1::jsonb,
                 updated_at = NOW()
             WHERE id = $2`,
            [
              JSON.stringify({
                progress: {
                  processed: stats.processed,
                  total: stats.total,
                  succeeded: stats.succeeded,
                  failed: stats.failed,
                  skipped: stats.skipped,
                },
              }),
              jobId,
            ]
          )
        }
      } catch (error) {
        stats.failed++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        stats.errors.push({
          page_id: page.id,
          url: page.url,
          error: errorMsg,
        })
        console.error(`[ClassifyAPI] ❌ ${page.url.substring(0, 60)}... → ${errorMsg}`)
      }
    }

    // Finaliser le job
    await db.query(
      `UPDATE indexing_jobs
       SET status = 'completed',
           completed_at = NOW(),
           metadata = metadata || $1::jsonb
       WHERE id = $2`,
      [
        JSON.stringify({
          stats,
          completed_at: new Date().toISOString(),
        }),
        jobId,
      ]
    )

    console.log(`[ClassifyAPI] ✅ Job ${jobId} complété:`, stats)
  } catch (error) {
    // Marquer job comme failed
    await db.query(
      `UPDATE indexing_jobs
       SET status = 'failed',
           completed_at = NOW(),
           metadata = metadata || $1::jsonb,
           error_message = $2
       WHERE id = $3`,
      [
        JSON.stringify({ stats }),
        error instanceof Error ? error.message : 'Unknown error',
        jobId,
      ]
    )

    console.error(`[ClassifyAPI] ❌ Job ${jobId} failed:`, error)
  }
}

// =============================================================================
// GET : Status d'un job
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()

    if (!session?.user || session.user.role?.toUpperCase() !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('job_id')

    if (!jobId) {
      // Retourner les 10 derniers jobs
      const jobs = await db.query(
        `SELECT id, job_type, status, started_at, completed_at, metadata, error_message
         FROM indexing_jobs
         WHERE job_type = 'classify_pages'
         ORDER BY started_at DESC
         LIMIT 10`
      )

      return NextResponse.json({ jobs: jobs.rows })
    }

    // Retourner un job spécifique
    const job = await db.query(
      `SELECT id, job_type, status, started_at, completed_at, metadata, error_message
       FROM indexing_jobs
       WHERE id = $1`,
      [jobId]
    )

    if (job.rows.length === 0) {
      return NextResponse.json({ error: 'Job non trouvé' }, { status: 404 })
    }

    return NextResponse.json({ job: job.rows[0] })
  } catch (error) {
    console.error('[ClassifyAPI] Erreur GET:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
