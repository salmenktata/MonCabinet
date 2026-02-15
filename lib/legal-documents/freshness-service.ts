/**
 * Freshness Service
 *
 * Surveille la fraîcheur des documents juridiques et détecte
 * ceux qui nécessitent une vérification (re-crawl).
 */

import { db } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'

const log = createLogger('Freshness')

// =============================================================================
// SEUILS DE FRAÎCHEUR (en jours)
// =============================================================================

const STALENESS_THRESHOLDS: Record<string, number> = {
  code: 90,           // Codes juridiques - fréquemment amendés
  loi: 180,           // Lois individuelles
  decret: 180,        // Décrets
  arrete: 180,        // Arrêtés
  circulaire: 90,     // Circulaires - peuvent changer souvent
  jurisprudence: 365, // Jurisprudence - stable une fois publiée
  doctrine: 365,      // Doctrine - articles académiques stables
  guide: 180,         // Guides pratiques
  formulaire: 90,     // Formulaires - peuvent changer avec la réglementation
  autre: 180,         // Défaut
}

// =============================================================================
// TYPES
// =============================================================================

export interface StaleDocument {
  id: string
  citationKey: string
  documentType: string
  officialTitleAr: string | null
  officialTitleFr: string | null
  stalenessDays: number
  threshold: number
  lastVerifiedAt: string | null
  canonicalSourceId: string | null
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export interface FreshnessReport {
  totalDocuments: number
  freshDocuments: number
  staleDocuments: StaleDocument[]
  criticalCount: number
  highCount: number
  mediumCount: number
  checkedAt: string
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Obtenir le seuil de fraîcheur pour un type de document
 */
export function getStalenessThreshold(documentType: string): number {
  return STALENESS_THRESHOLDS[documentType] || STALENESS_THRESHOLDS['autre']
}

/**
 * Vérifier la fraîcheur de tous les documents actifs
 */
export async function checkFreshness(): Promise<FreshnessReport> {
  const result = await db.query<any>(
    `SELECT id, citation_key, document_type,
            official_title_ar, official_title_fr,
            staleness_days, last_verified_at,
            canonical_source_id
     FROM legal_documents
     WHERE is_active = true AND is_abrogated = false
     ORDER BY staleness_days DESC NULLS FIRST`
  )

  const staleDocuments: StaleDocument[] = []
  let freshCount = 0

  for (const row of result.rows) {
    const threshold = getStalenessThreshold(row.document_type || 'autre')
    const stalenessDays = row.staleness_days || 0

    if (stalenessDays > threshold) {
      const priority = calculatePriority(stalenessDays, threshold)
      staleDocuments.push({
        id: row.id,
        citationKey: row.citation_key,
        documentType: row.document_type,
        officialTitleAr: row.official_title_ar,
        officialTitleFr: row.official_title_fr,
        stalenessDays,
        threshold,
        lastVerifiedAt: row.last_verified_at,
        canonicalSourceId: row.canonical_source_id,
        priority,
      })
    } else {
      freshCount++
    }
  }

  const report: FreshnessReport = {
    totalDocuments: result.rows.length,
    freshDocuments: freshCount,
    staleDocuments,
    criticalCount: staleDocuments.filter(d => d.priority === 'critical').length,
    highCount: staleDocuments.filter(d => d.priority === 'high').length,
    mediumCount: staleDocuments.filter(d => d.priority === 'medium').length,
    checkedAt: new Date().toISOString(),
  }

  log.info(
    `Freshness check: ${report.totalDocuments} docs, ` +
    `${report.freshDocuments} fresh, ${staleDocuments.length} stale ` +
    `(${report.criticalCount} critical)`
  )

  return report
}

/**
 * Obtenir les documents qui nécessitent un re-crawl prioritaire
 */
export async function getDocumentsNeedingRefresh(limit: number = 10): Promise<StaleDocument[]> {
  const report = await checkFreshness()
  return report.staleDocuments
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
    .slice(0, limit)
}

/**
 * Marquer un document comme vérifié (fraîcheur mise à jour)
 */
export async function markDocumentVerified(documentId: string): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET
      last_verified_at = NOW(),
      updated_at = NOW()
    WHERE id = $1`,
    [documentId]
  )
}

// =============================================================================
// HELPERS
// =============================================================================

function calculatePriority(
  stalenessDays: number,
  threshold: number
): 'critical' | 'high' | 'medium' | 'low' {
  const ratio = stalenessDays / threshold
  if (ratio >= 3) return 'critical'   // 3x le seuil
  if (ratio >= 2) return 'high'       // 2x le seuil
  if (ratio >= 1.5) return 'medium'   // 1.5x le seuil
  return 'low'
}
