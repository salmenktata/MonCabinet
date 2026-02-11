/**
 * Service de découverte déterministe d'URLs pour 9anoun.tn
 *
 * Génère et valide des URLs basées sur la structure prévisible du site
 * au lieu de crawler récursivement (gain de temps ~30min vs 2h+)
 *
 * Structure 9anoun.tn :
 * - 50 codes juridiques : /kb/codes/{slug}
 * - Articles individuels : /kb/codes/{slug}/{slug}-article-{N}
 * - Pattern prévisible : articles numérotés 1-500+ par code
 */

import { NINEANOUN_CODE_DOMAINS } from './9anoun-code-domains'
import pMap from 'p-map'

export interface UrlDiscoveryResult {
  totalGenerated: number
  totalValid: number
  totalInvalid: number
  validUrls: string[]
  durationMs: number
}

/**
 * Génère toutes les URLs possibles pour 9anoun.tn
 * Basé sur la structure prévisible : 50 codes × 500 articles max
 *
 * @param maxArticlesPerCode - Nombre max d'articles à tester par code (défaut: 500)
 * @returns Array d'URLs générées (~25 000)
 */
export function generate9anounUrls(maxArticlesPerCode = 500): string[] {
  const codes = Object.keys(NINEANOUN_CODE_DOMAINS) // 50 codes
  const urls: string[] = []

  for (const slug of codes) {
    // Page principale du code
    urls.push(`https://9anoun.tn/kb/codes/${slug}`)

    // Articles individuels (1-N)
    for (let i = 1; i <= maxArticlesPerCode; i++) {
      urls.push(`https://9anoun.tn/kb/codes/${slug}/${slug}-article-${i}`)
    }
  }

  console.log(`[UrlDiscovery] ${urls.length} URLs générées pour ${codes.length} codes juridiques`)
  return urls
}

/**
 * Valide une liste d'URLs via HEAD requests
 * Filtre les 404 pour ne garder que les URLs valides (200/301/302)
 *
 * @param urls - Liste d'URLs à valider
 * @param concurrency - Nombre de requêtes parallèles (défaut: 50)
 * @param timeout - Timeout par requête en ms (défaut: 5000)
 * @returns Promise<UrlDiscoveryResult>
 */
export async function validateUrls(
  urls: string[],
  concurrency = 50,
  timeout = 5000
): Promise<UrlDiscoveryResult> {
  const startTime = Date.now()
  let validCount = 0
  let invalidCount = 0

  console.log(`[UrlDiscovery] Validation de ${urls.length} URLs (concurrency=${concurrency})...`)

  const validUrls = await pMap(
    urls,
    async (url: string, index: number) => {
      try {
        // HEAD request avec timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          // Anti-ban headers
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8',
            'Cache-Control': 'no-cache',
          },
        })

        clearTimeout(timeoutId)

        // Accepter 200, 301, 302 comme valides
        const isValid = [200, 301, 302].includes(response.status)

        if (isValid) {
          validCount++
        } else {
          invalidCount++
        }

        // Log progression tous les 1000 URLs
        if ((index + 1) % 1000 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
          const rate = ((index + 1) / (Date.now() - startTime) * 1000).toFixed(1)
          console.log(
            `[UrlDiscovery] Progression: ${index + 1}/${urls.length} ` +
            `(${validCount} valides, ${invalidCount} invalides) | ` +
            `${elapsed}s | ${rate} URLs/s`
          )
        }

        return isValid ? url : null
      } catch (error) {
        invalidCount++
        // Timeout, network error, etc. → considérer comme invalide
        return null
      }
    },
    { concurrency }
  )

  const durationMs = Date.now() - startTime
  const result: UrlDiscoveryResult = {
    totalGenerated: urls.length,
    totalValid: validCount,
    totalInvalid: invalidCount,
    validUrls: validUrls.filter((url: string | null): url is string => url !== null),
    durationMs,
  }

  console.log(
    `[UrlDiscovery] ✅ Terminé en ${(durationMs / 1000 / 60).toFixed(1)} min\n` +
    `  - ${result.totalValid} URLs valides (${((result.totalValid / result.totalGenerated) * 100).toFixed(1)}%)\n` +
    `  - ${result.totalInvalid} URLs invalides (404/timeout)\n` +
    `  - Débit: ${(result.totalGenerated / durationMs * 1000).toFixed(1)} URLs/s`
  )

  return result
}

/**
 * Génère et valide les URLs en une seule opération
 * API simplifiée pour usage direct
 *
 * @param maxArticlesPerCode - Nombre max d'articles par code
 * @param concurrency - Concurrency validation (défaut: 50)
 * @returns Promise<UrlDiscoveryResult>
 */
export async function discover9anounUrls(
  maxArticlesPerCode = 500,
  concurrency = 50
): Promise<UrlDiscoveryResult> {
  console.log('[UrlDiscovery] 🚀 Démarrage découverte URLs 9anoun.tn...')

  // Phase 1 : Génération (instantané)
  const urls = generate9anounUrls(maxArticlesPerCode)

  // Phase 2 : Validation (30-45 min)
  const result = await validateUrls(urls, concurrency)

  return result
}

/**
 * Injecte les URLs découvertes dans la table web_pages
 * Permet de bypasser le crawl récursif et de démarrer directement le scraping
 *
 * @param webSourceId - ID de la source web dans la DB
 * @param urls - Liste d'URLs à injecter
 * @returns Promise<number> - Nombre d'URLs insérées
 */
export async function injectUrlsToDatabase(
  webSourceId: string,
  urls: string[]
): Promise<number> {
  const { db } = await import('@/lib/db/postgres')
  const { hashUrl } = await import('./content-extractor')

  console.log(`[UrlDiscovery] Injection de ${urls.length} URLs dans web_pages...`)

  let insertedCount = 0

  // Batch insert par 500 URLs
  const batchSize = 500
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize)

    // Construire les valeurs pour l'INSERT
    const values = batch
      .map((url) => {
        const urlHash = hashUrl(url)
        return `('${urlHash}', '${webSourceId}', '${url}', 'pending', 0, NOW())`
      })
      .join(',\n')

    // INSERT avec ON CONFLICT pour éviter les doublons
    await db.query(`
      INSERT INTO web_pages (url_hash, web_source_id, url, status, depth, discovered_at)
      VALUES ${values}
      ON CONFLICT (url_hash, web_source_id) DO NOTHING
    `)

    insertedCount += batch.length

    console.log(`[UrlDiscovery] Progression: ${insertedCount}/${urls.length} URLs insérées`)
  }

  console.log(`[UrlDiscovery] ✅ ${insertedCount} URLs injectées dans la base de données`)

  return insertedCount
}
