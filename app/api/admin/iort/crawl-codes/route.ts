/**
 * GET /api/admin/iort/crawl-codes
 *
 * Crawle les codes juridiques depuis la section RechercheCodes d'IORT.
 * Flow : PAGE_RechercheCodes → sélectionner code → PAGE_NavigationCode → extraire sections.
 *
 * Paramètres :
 *   ?code=المجلة+التجارية   Crawl d'un code spécifique (obligatoire sauf ?list=true)
 *   ?list=true               Liste les codes disponibles sans crawler
 *   ?dry=true                Navigation + parsing seulement (pas de sauvegarde)
 *
 * Auth : CRON_SECRET (x-cron-secret) OU session admin.
 * maxDuration : 600s (Playwright + navigation + extraction)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { IortSessionManager } from '@/lib/web-scraper/iort-scraper-utils'
import {
  navigateToCodesSelectionPage,
  parseAvailableCodes,
  crawlCode,
  getOrCreateIortSource,
} from '@/lib/web-scraper/iort-codes-scraper'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

export const GET = withAdminApiAuth(
  async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const { searchParams } = request.nextUrl

    const codeName = searchParams.get('code')
    const listOnly = searchParams.get('list') === 'true'
    const dryRun = searchParams.get('dry') === 'true'

    const session = new IortSessionManager()

    try {
      await session.init()

      // Mode liste : retourner les codes disponibles
      if (listOnly) {
        logger.info('[IORT Codes] Listage des codes disponibles...')
        await navigateToCodesSelectionPage(session)
        const page = session.getPage()
        const codes = await parseAvailableCodes(page)

        return NextResponse.json({
          success: true,
          codes: codes.map(c => ({ name: c.name, nameFr: c.nameFr, index: c.selectIndex })),
          total: codes.length,
          elapsed: Math.round((Date.now() - startTime) / 1000),
        })
      }

      if (!codeName) {
        return NextResponse.json(
          { success: false, error: 'Paramètre ?code= obligatoire (ou ?list=true pour lister)' },
          { status: 400 },
        )
      }

      logger.info(`[IORT Codes] Démarrage crawl: "${codeName}" (dryRun=${dryRun})`)

      const sourceId = await getOrCreateIortSource()
      const stats = await crawlCode(session, sourceId, codeName, dryRun)

      const elapsed = Math.round((Date.now() - startTime) / 1000)
      logger.info(
        `[IORT Codes] ✅ "${codeName}": ${stats.crawled} nouveaux, ${stats.updated} MAJ, ` +
        `${stats.skipped} inchangés, ${stats.errors} erreurs (${elapsed}s)`,
      )

      return NextResponse.json({
        success: true,
        codeName,
        dryRun,
        stats,
        elapsed,
        sourceOrigin: 'iort_gov_tn',
      })

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[IORT Codes] Erreur fatale:', message)
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    } finally {
      await session.close().catch(() => {})
    }
  },
  { allowCronSecret: true },
)
