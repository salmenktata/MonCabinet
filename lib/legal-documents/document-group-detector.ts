/**
 * Document Group Detector
 *
 * Analyse une web_source et détecte les groupes de pages web
 * consolidables en legal_documents.
 *
 * Supporte :
 * - 9anoun.tn : groupement par slug /kb/codes/{slug}/
 * - Sources génériques : groupement par 2ème segment de path
 */

import { db } from '@/lib/db/postgres'
import { NINEANOUN_CODE_DOMAINS } from '@/lib/web-scraper/9anoun-code-domains'
import {
  getCodeMetadata,
  extractCitationKeyFromCodeSlug,
} from '@/lib/legal-documents/citation-key-extractor'
import { getDocumentByCitationKey } from '@/lib/legal-documents/document-service'

// =============================================================================
// TYPES
// =============================================================================

export interface DocumentGroup {
  slug: string
  citationKey: string
  label: string
  documentType: string
  primaryCategory: string
  pageCount: number
  sampleUrls: string[]
  alreadyExists: boolean
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Détecter les groupes de pages consolidables pour une web_source
 */
export async function detectDocumentGroups(sourceId: string): Promise<DocumentGroup[]> {
  // Récupérer l'URL de base de la source
  const sourceResult = await db.query<{ base_url: string }>(
    `SELECT base_url FROM web_sources WHERE id = $1`,
    [sourceId]
  )

  if (sourceResult.rows.length === 0) {
    return []
  }

  const baseUrl = sourceResult.rows[0].base_url

  // Router vers la bonne stratégie de détection
  if (baseUrl.includes('9anoun.tn')) {
    return detect9anounGroups(sourceId)
  }

  return detectGenericGroups(sourceId)
}

// =============================================================================
// 9ANOUN DETECTION
// =============================================================================

async function detect9anounGroups(sourceId: string): Promise<DocumentGroup[]> {
  const groups: DocumentGroup[] = []

  for (const [slug, def] of Object.entries(NINEANOUN_CODE_DOMAINS)) {
    // Compter les pages crawlées pour ce code
    const countResult = await db.query<{ count: string; sample_urls: string[] }>(
      `SELECT
        COUNT(*)::TEXT as count,
        ARRAY(
          SELECT url FROM web_pages
          WHERE web_source_id = $1
            AND url LIKE $2
            AND status IN ('crawled', 'indexed')
          ORDER BY url ASC
          LIMIT 3
        ) as sample_urls
       FROM web_pages
       WHERE web_source_id = $1
         AND url LIKE $2
         AND status IN ('crawled', 'indexed')`,
      [sourceId, `%/kb/codes/${slug}/%`]
    )

    const pageCount = parseInt(countResult.rows[0].count, 10)
    if (pageCount === 0) continue

    const meta = getCodeMetadata(slug)
    const citationKey = extractCitationKeyFromCodeSlug(slug) || `${slug}-tunisien`

    // Vérifier si le document existe déjà
    const existing = await getDocumentByCitationKey(citationKey)

    groups.push({
      slug,
      citationKey,
      label: meta?.officialTitleFr || def.nameFr,
      documentType: 'code',
      primaryCategory: 'codes',
      pageCount,
      sampleUrls: countResult.rows[0].sample_urls || [],
      alreadyExists: existing !== null,
    })
  }

  // Trier par pageCount décroissant
  groups.sort((a, b) => b.pageCount - a.pageCount)
  return groups
}

// =============================================================================
// GENERIC DETECTION
// =============================================================================

async function detectGenericGroups(sourceId: string): Promise<DocumentGroup[]> {
  // Récupérer toutes les pages crawlées de cette source
  const pagesResult = await db.query<{ url: string }>(
    `SELECT url FROM web_pages
     WHERE web_source_id = $1
       AND status IN ('crawled', 'indexed')
     ORDER BY url ASC`,
    [sourceId]
  )

  if (pagesResult.rows.length === 0) return []

  // Grouper par 2ème segment de path
  const groupMap = new Map<string, string[]>()

  for (const row of pagesResult.rows) {
    try {
      const parsed = new URL(row.url)
      const segments = parsed.pathname.split('/').filter(Boolean)
      // Utiliser le 2ème segment si disponible, sinon le 1er
      const groupKey = segments.length >= 2 ? segments[1] : segments[0]
      if (!groupKey) continue

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, [])
      }
      groupMap.get(groupKey)!.push(row.url)
    } catch {
      continue
    }
  }

  // Filtrer : minimum 3 pages par groupe
  const groups: DocumentGroup[] = []

  for (const [slug, urls] of groupMap.entries()) {
    if (urls.length < 3) continue

    const citationKey = slug
    const existing = await getDocumentByCitationKey(citationKey)

    groups.push({
      slug,
      citationKey,
      label: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      documentType: 'autre',
      primaryCategory: 'legislation',
      pageCount: urls.length,
      sampleUrls: urls.slice(0, 3),
      alreadyExists: existing !== null,
    })
  }

  // Trier par pageCount décroissant
  groups.sort((a, b) => b.pageCount - a.pageCount)
  return groups
}
