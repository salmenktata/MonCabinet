/**
 * GET /api/admin/iort/crawl-constitution
 *
 * Crawle la page Constitution M4 d'IORT, extrait le texte (HTML ou PDF fallback),
 * sauvegarde en web_pages et indexe article par article dans la KB.
 *
 * Auth : CRON_SECRET (x-cron-secret) OU session admin.
 * Déclenché automatiquement par le cron mensuel (1er du mois, 3h).
 * Peut aussi être lancé manuellement depuis l'admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import {
  IortSessionManager,
  downloadConstitutionFromIort,
  getOrCreateIortSource,
} from '@/lib/web-scraper/iort-scraper-utils'
import { indexWebPage } from '@/lib/web-scraper/web-indexer-service'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 600 // Playwright + OCR 42 pages + indexation = jusqu'à 10 min

export const GET = withAdminApiAuth(
  async (_request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    logger.info('[IORT Constitution] Démarrage crawl automatique')

    const session = new IortSessionManager()

    try {
      const sourceId = await getOrCreateIortSource()
      await session.init()

      // Crawl + extraction (HTML ou PDF fallback)
      const crawlResult = await downloadConstitutionFromIort(session, sourceId)

      if (!crawlResult.saved || !crawlResult.pageId) {
        logger.error('[IORT Constitution] Échec crawl — aucune page sauvegardée')
        return NextResponse.json(
          { success: false, error: 'Crawl IORT échoué' },
          { status: 500 },
        )
      }

      logger.info(
        `[IORT Constitution] Crawl OK: "${crawlResult.title}" (${
          crawlResult.pdfSize ? Math.round(crawlResult.pdfSize / 1024) + ' KB PDF' : 'HTML only'
        })`,
      )

      // Indexation KB : article-level chunking (الفصل X = 1 chunk)
      const indexResult = await indexWebPage(crawlResult.pageId)

      const elapsed = Math.round((Date.now() - startTime) / 1000)

      if (!indexResult.success) {
        logger.warn(`[IORT Constitution] Indexation partielle: ${indexResult.error}`)
        return NextResponse.json({
          success: false,
          title: crawlResult.title,
          error: indexResult.error,
          elapsed,
        })
      }

      logger.info(`[IORT Constitution] ✅ ${indexResult.chunksCreated} chunks créés en ${elapsed}s`)

      return NextResponse.json({
        success: true,
        title: crawlResult.title,
        chunksCreated: indexResult.chunksCreated,
        pdfSizeKb: crawlResult.pdfSize ? Math.round(crawlResult.pdfSize / 1024) : null,
        sourceOrigin: 'iort_gov_tn',
        elapsed,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[IORT Constitution] Erreur fatale:', message)
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      )
    } finally {
      await session.close().catch(() => {})
    }
  },
  { allowCronSecret: true },
)
