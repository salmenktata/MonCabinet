/**
 * GET /api/admin/iort/crawl-year-type?year=2026&type=notice&lang=ar&resume=true
 *
 * Crawle IORT pour une année et un type donnés.
 * Paramètres :
 *   - year   : année (ex: 2026). Obligatoire.
 *   - type   : law | decree | order | decision | notice. Optionnel (défaut: tous).
 *   - lang   : ar | fr | both. Optionnel (défaut: ar).
 *              ar   = textes arabes uniquement (comportement original)
 *              fr   = textes français uniquement (via menu JORT FR)
 *              both = crawl AR puis FR dans la même session
 *   - resume : true = skip si des pages existent déjà pour ce combo.
 *
 * Auth : CRON_SECRET (x-cron-secret) OU session admin.
 * maxDuration 300s — pour des crawls longs, chaîner plusieurs appels par année.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import {
  IortSessionManager,
  IORT_TEXT_TYPES,
  IortTextType,
  IortLanguage,
  crawlYearType,
  getOrCreateIortSource,
} from '@/lib/web-scraper/iort-scraper-utils'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type CrawlResult = {
  year: number
  type: string
  lang: string
  totalResults: number
  crawled: number
  skipped: number
  errors: number
}

async function isComboCompleted(
  sourceId: string,
  year: number,
  textType: IortTextType,
  language: IortLanguage,
): Promise<boolean> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM web_pages
     WHERE web_source_id = $1
     AND structured_data->>'year' = $2
     AND structured_data->>'textType' = $3
     AND (
       structured_data->>'language' = $4
       OR ($4 = 'ar' AND structured_data->>'language' IS NULL)
     )`,
    [sourceId, String(year), IORT_TEXT_TYPES[textType].ar, language],
  )
  return parseInt(result.rows[0].count) > 0
}

export const GET = withAdminApiAuth(
  async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now()
    const { searchParams } = request.nextUrl

    const yearParam = searchParams.get('year')
    const typeParam = searchParams.get('type')
    const langParam = searchParams.get('lang') ?? 'ar'
    const resume = searchParams.get('resume') === 'true'

    if (!yearParam) {
      return NextResponse.json({ success: false, error: 'Paramètre year obligatoire' }, { status: 400 })
    }

    const year = parseInt(yearParam, 10)
    if (isNaN(year) || year < 1956 || year > 2030) {
      return NextResponse.json({ success: false, error: `Année invalide: ${yearParam}` }, { status: 400 })
    }

    if (!['ar', 'fr', 'both'].includes(langParam)) {
      return NextResponse.json(
        { success: false, error: `Langue invalide: ${langParam}. Valides: ar, fr, both` },
        { status: 400 },
      )
    }

    const allTypes = Object.keys(IORT_TEXT_TYPES) as IortTextType[]
    let types: IortTextType[]

    if (typeParam) {
      if (!(typeParam in IORT_TEXT_TYPES)) {
        return NextResponse.json(
          { success: false, error: `Type invalide: ${typeParam}. Valides: ${allTypes.join(', ')}` },
          { status: 400 },
        )
      }
      types = [typeParam as IortTextType]
    } else {
      types = allTypes
    }

    // Langues à crawler
    const languages: IortLanguage[] = langParam === 'both' ? ['ar', 'fr'] : [langParam as IortLanguage]

    logger.info(`[IORT crawl-year-type] Démarrage: year=${year}, types=${types.join(',')}, lang=${langParam}, resume=${resume}`)

    const session = new IortSessionManager()
    const results: CrawlResult[] = []
    const skippedCombos: string[] = []

    try {
      const sourceId = await getOrCreateIortSource()
      await session.init()

      for (const language of languages) {
        // Naviguer vers le bon menu selon la langue
        await session.navigateToSearch(language)

        for (const type of types) {
          if (resume) {
            const completed = await isComboCompleted(sourceId, year, type, language)
            if (completed) {
              skippedCombos.push(`${language.toUpperCase()}/${year}/${IORT_TEXT_TYPES[type].fr}`)
              continue
            }
          }

          logger.info(`[IORT crawl-year-type] Crawl ${language.toUpperCase()}/${year}/${IORT_TEXT_TYPES[type].fr}...`)
          const stats = await crawlYearType(session, sourceId, year, type, undefined, language)

          results.push({
            year: stats.year,
            type: stats.textType,
            lang: language,
            totalResults: stats.totalResults,
            crawled: stats.crawled,
            skipped: stats.skipped,
            errors: stats.errors,
          })
        }

        // Pause entre les deux langues si lang=both
        if (langParam === 'both' && language === 'ar') {
          logger.info('[IORT crawl-year-type] Pause entre AR et FR...')
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000)
      const totalCrawled = results.reduce((sum, r) => sum + r.crawled, 0)

      logger.info(`[IORT crawl-year-type] ✅ ${totalCrawled} pages crawlées en ${elapsed}s (lang=${langParam})`)

      return NextResponse.json({
        success: true,
        year,
        lang: langParam,
        results,
        skippedCombos,
        totalCrawled,
        elapsed,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[IORT crawl-year-type] Erreur fatale:', message)
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    } finally {
      await session.close().catch(() => {})
    }
  },
  { allowCronSecret: true },
)
