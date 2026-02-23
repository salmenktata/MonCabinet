/**
 * API Route: Administration - Déclencher un crawl
 *
 * POST /api/admin/web-sources/[id]/crawl
 * - Déclenche un crawl manuel pour une source
 * - Paramètres: jobType (full_crawl, incremental, single_page)
 *
 * Réservé aux administrateurs (session admin OU CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import {
  getWebSource,
  createCrawlJob,
  crawlSource,
  crawlSinglePage,
} from '@/lib/web-scraper'
import { indexSourcePages } from '@/lib/web-scraper/web-indexer-service'

export const POST = withAdminApiAuth(
  async (
    request: NextRequest,
    context: { params?: Promise<Record<string, string>> },
    session
  ): Promise<NextResponse> => {
    try {
      const { id } = await context.params!
      const body = await request.json().catch(() => ({}))

      const jobType = body.jobType || 'incremental'
      const singlePageUrl = body.url
      const async = body.async === true

      // Récupérer la source
      const source = await getWebSource(id)

      // Utiliser le flag auto_index de la source si non spécifié
      const indexAfterCrawl = body.indexAfterCrawl ?? (source as any)?.auto_index ?? true
      if (!source) {
        return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
      }

      if (!source.isActive) {
        return NextResponse.json({ error: 'Source désactivée' }, { status: 400 })
      }

      // Mode async: créer un job et retourner immédiatement
      if (async) {
        try {
          const jobId = await createCrawlJob(id, jobType, 5, {
            triggeredBy: session?.user?.id,
            indexAfterCrawl,
          })

          return NextResponse.json({
            message: 'Job de crawl créé',
            jobId,
            async: true,
          })
        } catch (error) {
          if (error instanceof Error && error.message.includes('déjà en cours')) {
            return NextResponse.json(
              { error: 'Un crawl est déjà en cours pour cette source' },
              { status: 409 }
            )
          }
          throw error
        }
      }

      // Mode synchrone: exécuter le crawl directement
      let result

      if (jobType === 'single_page' && singlePageUrl) {
        // Crawl d'une seule page
        result = await crawlSinglePage(source, singlePageUrl)

        if (!result.success) {
          return NextResponse.json(
            { error: result.error || 'Erreur crawl page' },
            { status: 400 }
          )
        }

        return NextResponse.json({
          message: 'Page crawlée avec succès',
          page: result.page,
        })
      }

      // Crawl complet ou incrémental
      const crawlResult = await crawlSource(source, {
        maxPages: source.maxPages,
        maxDepth: source.maxDepth,
        incrementalMode: jobType === 'incremental',
      })

      // Indexer les pages si demandé (limite 500 pour couvrir les gros crawls)
      let indexingResult = null
      if (indexAfterCrawl && crawlResult.pagesNew + crawlResult.pagesChanged > 0) {
        indexingResult = await indexSourcePages(id, { limit: 500 })
      }

      return NextResponse.json({
        message: crawlResult.success ? 'Crawl terminé avec succès' : 'Crawl terminé avec erreurs',
        crawl: {
          pagesProcessed: crawlResult.pagesProcessed,
          pagesNew: crawlResult.pagesNew,
          pagesChanged: crawlResult.pagesChanged,
          pagesFailed: crawlResult.pagesFailed,
          filesDownloaded: crawlResult.filesDownloaded,
          errorsCount: crawlResult.errors.length,
        },
        ...(indexingResult ? {
          indexing: {
            processed: indexingResult.processed,
            succeeded: indexingResult.succeeded,
            failed: indexingResult.failed,
          }
        } : {}),
      })
    } catch (error) {
      console.error('Erreur crawl web source:', error)
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Erreur crawl source',
        },
        { status: 500 }
      )
    }
  },
  { allowCronSecret: true }
)
