/**
 * Source Authority Service
 *
 * Gère le score d'autorité des sources web.
 * Utilisé pour départager les conflits de fraîcheur
 * quand deux sources fournissent le même document.
 */

import { db } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'

const log = createLogger('SourceAuthority')

// =============================================================================
// SCORES D'AUTORITÉ PRÉDÉFINIS
// =============================================================================

/**
 * Scores d'autorité par domaine de source
 *
 * | Score | Type                    | Exemples                     |
 * |-------|-------------------------|------------------------------|
 * | 0.95  | Sources officielles     | legislation.tn, iort.gov.tn  |
 * | 0.85  | Institutions judiciaires| cassation.tn                 |
 * | 0.50  | Agrégateurs juridiques  | 9anoun.tn                    |
 * | 0.30  | Blogs / doctrine privée | da5ira.com                   |
 */
const DOMAIN_AUTHORITY: Record<string, number> = {
  'legislation.tn': 0.95,
  'iort.gov.tn': 0.95,
  'www.legislation.tn': 0.95,
  'cassation.tn': 0.85,
  'www.cassation.tn': 0.85,
  '9anoun.tn': 0.50,
  'www.9anoun.tn': 0.50,
  'da5ira.com': 0.30,
  'www.da5ira.com': 0.30,
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Obtenir le score d'autorité d'une source
 *
 * Priorité:
 * 1. Score explicite dans web_sources.authority_score
 * 2. Score basé sur le domaine (DOMAIN_AUTHORITY)
 * 3. Score par défaut: 0.5
 */
export async function getSourceAuthority(sourceId: string): Promise<number> {
  const result = await db.query<any>(
    `SELECT authority_score, base_url FROM web_sources WHERE id = $1`,
    [sourceId]
  )

  if (result.rows.length === 0) return 0.5

  const row = result.rows[0]

  // Score explicite en DB
  if (row.authority_score !== null && row.authority_score !== undefined) {
    return row.authority_score
  }

  // Score basé sur le domaine
  if (row.base_url) {
    try {
      const domain = new URL(row.base_url).hostname
      if (DOMAIN_AUTHORITY[domain]) {
        return DOMAIN_AUTHORITY[domain]
      }
    } catch {
      // URL invalide, utiliser défaut
    }
  }

  return 0.5
}

/**
 * Définir le score d'autorité d'une source
 */
export async function setSourceAuthority(
  sourceId: string,
  score: number
): Promise<void> {
  const clampedScore = Math.max(0, Math.min(1, score))
  await db.query(
    `UPDATE web_sources SET authority_score = $2 WHERE id = $1`,
    [sourceId, clampedScore]
  )
  log.info(`Authority score mis à jour: source=${sourceId}, score=${clampedScore}`)
}

/**
 * Initialiser les scores d'autorité pour toutes les sources
 * basé sur le mapping DOMAIN_AUTHORITY
 */
export async function initializeAuthorityScores(): Promise<number> {
  let updated = 0

  for (const [domain, score] of Object.entries(DOMAIN_AUTHORITY)) {
    const result = await db.query(
      `UPDATE web_sources SET authority_score = $1
       WHERE base_url LIKE $2
       AND (authority_score IS NULL OR authority_score = 0.5)`,
      [score, `%${domain}%`]
    )
    updated += result.rowCount || 0
  }

  log.info(`Scores d'autorité initialisés: ${updated} sources mises à jour`)
  return updated
}
