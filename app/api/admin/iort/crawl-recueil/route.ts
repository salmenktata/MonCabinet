/**
 * GET /api/admin/iort/crawl-recueil
 *
 * Crawle les recueils thématiques (مجموعات نصوص) depuis PAGE_CodesJuridiques d'iort.tn.
 * Flow : PAGE_CodesJuridiques → sélectionner recueil → TOC → extraire sections.
 *
 * Paramètres :
 *   ?list=true              Liste les recueils disponibles sans crawler
 *   ?recueil=nom            Crawl d'un recueil spécifique (filtre sur le nom)
 *                           Si absent → crawl tous les recueils
 *   ?lang=ar|fr|both        Langue (défaut: ar). both = crawl AR puis FR
 *
 * Auth : CRON_SECRET (x-cron-secret) OU session admin.
 * maxDuration : 600s (Playwright + navigation + extraction multi-recueils)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { IortSessionManager } from '@/lib/web-scraper/iort-scraper-utils'
import {
  navigateToRecueilPage,
  parseAvailableRecueils,
  crawlRecueil,
  getOrCreateIortSiteiortSource,
} from '@/lib/web-scraper/iort-codes-scraper'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

export const GET = withAdminApiAuth(
  async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const { searchParams } = request.nextUrl

    const recueilName = searchParams.get('recueil') ?? undefined
    const langParam = searchParams.get('lang') ?? 'ar'
    const listOnly = searchParams.get('list') === 'true'

    if (!['ar', 'fr', 'both'].includes(langParam)) {
      return NextResponse.json(
        { success: false, error: `Langue invalide: ${langParam}. Valides: ar, fr, both` },
        { status: 400 },
      )
    }

    const session = new IortSessionManager()

    try {
      await session.init()

      if (listOnly) {
        logger.info('[IORT Recueil] Listage des recueils disponibles...')
        await navigateToRecueilPage(session)
        const page = session.getPage()
        const recueils = await parseAvailableRecueils(page)

        return NextResponse.json({
          success: true,
          recueils: recueils.map(r => ({ name: r.name, index: r.selectIndex })),
          total: recueils.length,
          elapsed: Math.round((Date.now() - startTime) / 1000),
        })
      }

      logger.info(`[IORT Recueil] Démarrage crawl: ${recueilName ? `"${recueilName}"` : 'tous'} (lang=${langParam})`)

      const sourceId = await getOrCreateIortSiteiortSource()
      const stats = await crawlRecueil(session, sourceId, recueilName, langParam as 'ar' | 'fr' | 'both')

      const elapsed = Math.round((Date.now() - startTime) / 1000)
      logger.info(
        `[IORT Recueil] ✅ ${stats.crawled} nouveaux, ${stats.updated} MAJ, ` +
        `${stats.skipped} inchangés, ${stats.errors} erreurs (${elapsed}s)`,
      )

      return NextResponse.json({
        success: true,
        recueilName: recueilName ?? 'tous',
        lang: langParam,
        stats,
        elapsed,
        sourceOrigin: 'iort_gov_tn',
      })

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[IORT Recueil] Erreur fatale:', message)
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    } finally {
      await session.close().catch(() => {})
    }
  },
  { allowCronSecret: true },
)
