/**
 * Cross-Source Deduplication Service
 *
 * Détecte et gère les doublons entre sources différentes
 * (ex: même Code Pénal sur 9anoun.tn ET legislation.tn).
 *
 * Stratégie: "Plus récent gagne" (date de mise à jour la plus récente).
 */

import { db } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'
import {
  extractCitationKeyFromUrl,
  extractCitationKeyFromLawReference,
} from './citation-key-extractor'
import {
  getDocumentByCitationKey,
  addSourceUrl,
  type LegalDocument,
} from './document-service'
import { getSourceAuthority } from './source-authority-service'

const log = createLogger('CrossSourceDedup')

// =============================================================================
// TYPES
// =============================================================================

export interface DedupResult {
  action: 'new' | 'merged' | 'skipped' | 'updated'
  documentId: string | null
  citationKey: string | null
  reason: string
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Vérifier si une page correspond à un document existant avant indexation
 *
 * Retourne:
 * - `new`: Pas de document existant, indexer normalement
 * - `merged`: Document existe, URL ajoutée comme source alternative
 * - `updated`: Document existe, contenu mis à jour (plus récent)
 * - `skipped`: Document existe avec contenu plus récent, ne pas mettre à jour
 */
export async function checkForDuplicate(
  pageUrl: string,
  pageTitle: string | null,
  sourceId: string,
  lastModified: Date | null
): Promise<DedupResult> {
  // Extraire la citation_key depuis l'URL
  let citationKey = extractCitationKeyFromUrl(pageUrl)

  // Fallback: essayer depuis le titre de la page
  if (!citationKey && pageTitle) {
    citationKey = extractCitationKeyFromLawReference(pageTitle)
  }

  if (!citationKey) {
    return { action: 'new', documentId: null, citationKey: null, reason: 'Pas de citation_key extraite' }
  }

  // Chercher le document existant
  const existingDoc = await getDocumentByCitationKey(citationKey)
  if (!existingDoc) {
    return { action: 'new', documentId: null, citationKey, reason: 'Document non trouvé' }
  }

  // Document existe déjà - ajouter l'URL comme source alternative
  await addSourceUrl(existingDoc.id, pageUrl)

  // Comparer la fraîcheur
  if (!lastModified) {
    return {
      action: 'merged',
      documentId: existingDoc.id,
      citationKey,
      reason: 'URL ajoutée comme source alternative (pas de date de modification)',
    }
  }

  const existingLastChange = existingDoc.lastContentChangeAt
    ? new Date(existingDoc.lastContentChangeAt)
    : null

  // Si pas de date existante ou nouvelle version plus récente
  if (!existingLastChange || lastModified > existingLastChange) {
    // Vérifier l'autorité de la source
    const newAuthority = await getSourceAuthority(sourceId)
    const existingAuthority = existingDoc.canonicalSourceId
      ? await getSourceAuthority(existingDoc.canonicalSourceId)
      : 0.5

    // Plus récent gagne, sauf si autorité très inférieure
    if (newAuthority >= existingAuthority * 0.7) {
      return {
        action: 'updated',
        documentId: existingDoc.id,
        citationKey,
        reason: `Version plus récente (${lastModified.toISOString()} > ${existingLastChange?.toISOString() || 'null'})`,
      }
    }
  }

  return {
    action: 'skipped',
    documentId: existingDoc.id,
    citationKey,
    reason: 'Version existante plus récente ou autorité supérieure',
  }
}

/**
 * Trouver des documents potentiellement dupliqués par similarité de titre
 */
export async function findPotentialDuplicates(
  titleAr: string | null,
  titleFr: string | null,
  excludeDocId?: string
): Promise<LegalDocument[]> {
  if (!titleAr && !titleFr) return []

  const conditions: string[] = []
  const params: any[] = []
  let paramIdx = 1

  if (titleAr) {
    conditions.push(`official_title_ar % $${paramIdx}`)
    params.push(titleAr)
    paramIdx++
  }
  if (titleFr) {
    conditions.push(`official_title_fr % $${paramIdx}`)
    params.push(titleFr)
    paramIdx++
  }
  if (excludeDocId) {
    conditions.push(`id != $${paramIdx}`)
    params.push(excludeDocId)
    paramIdx++
  }

  // pg_trgm similarity - nécessite extension pg_trgm
  try {
    const result = await db.query<any>(
      `SELECT * FROM legal_documents
       WHERE ${conditions.join(' OR ')}
       LIMIT 5`,
      params
    )
    return result.rows
  } catch {
    // Fallback si pg_trgm non disponible: recherche exacte
    const fallbackConditions: string[] = []
    const fallbackParams: any[] = []
    let idx = 1

    if (titleAr) {
      fallbackConditions.push(`official_title_ar = $${idx}`)
      fallbackParams.push(titleAr)
      idx++
    }
    if (titleFr) {
      fallbackConditions.push(`official_title_fr = $${idx}`)
      fallbackParams.push(titleFr)
      idx++
    }
    if (excludeDocId) {
      fallbackConditions.push(`id != $${idx}`)
      fallbackParams.push(excludeDocId)
      idx++
    }

    const result = await db.query<any>(
      `SELECT * FROM legal_documents
       WHERE ${fallbackConditions.join(' OR ')}
       LIMIT 5`,
      fallbackParams
    )
    return result.rows
  }
}
