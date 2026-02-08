/**
 * Service d'apprentissage automatique pour la classification
 *
 * Analyse les corrections humaines pour:
 * - Suggérer de nouvelles règles de classification
 * - Proposer de nouveaux types à la taxonomie
 * - Améliorer la précision du système
 */

import { db } from '@/lib/db/postgres'
import type { SiteStructure } from './site-structure-extractor'
import {
  suggestRuleFromCorrections,
  createRule,
  type CreateRuleInput,
} from './classification-rules-service'
import { createTaxonomySuggestion } from './taxonomy-service'

// =============================================================================
// TYPES
// =============================================================================

export interface ClassificationCorrection {
  id: string
  webPageId: string
  pageUrl: string
  pageTitle: string | null
  pageStructure: SiteStructure | null
  originalCategory: string | null
  originalDomain: string | null
  originalDocumentType: string | null
  originalConfidence: number | null
  correctedCategory: string | null
  correctedDomain: string | null
  correctedDocumentType: string | null
  classificationSignals: Record<string, unknown>
  usedForLearning: boolean
  generatedRuleId: string | null
  correctedBy: string
  correctedAt: Date
}

export interface CorrectionPattern {
  pattern: PatternMatch
  occurrences: number
  pages: string[]
  correction: {
    category: string | null
    domain: string | null
    documentType: string | null
  }
}

export interface PatternMatch {
  type: 'url_segment' | 'url_contains' | 'breadcrumb_contains'
  value: string
  position?: number
}

export interface LearningStats {
  totalCorrections: number
  unusedCorrections: number
  rulesGenerated: number
  taxonomySuggestions: number
  avgAccuracyImprovement: number
}

// =============================================================================
// ENREGISTREMENT DES CORRECTIONS
// =============================================================================

/**
 * Enregistre une correction de classification
 */
export async function recordClassificationCorrection(
  webPageId: string,
  correctedBy: string,
  correctedClassification: {
    category?: string
    domain?: string
    documentType?: string
  }
): Promise<string> {
  // Récupérer la page et sa classification actuelle
  const pageResult = await db.query(
    `SELECT
      wp.url, wp.title, wp.site_structure,
      lc.primary_category, lc.domain, lc.document_nature,
      lc.confidence_score, lc.signals_used
     FROM web_pages wp
     LEFT JOIN legal_classifications lc ON lc.web_page_id = wp.id
     WHERE wp.id = $1`,
    [webPageId]
  )

  if (pageResult.rows.length === 0) {
    throw new Error(`Page non trouvée: ${webPageId}`)
  }

  const page = pageResult.rows[0]

  // Insérer la correction
  const result = await db.query(
    `INSERT INTO classification_corrections (
      web_page_id,
      page_url, page_title, page_structure,
      original_category, original_domain, original_document_type,
      original_confidence, classification_signals,
      corrected_category, corrected_domain, corrected_document_type,
      corrected_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id`,
    [
      webPageId,
      page.url,
      page.title,
      page.site_structure ? JSON.stringify(page.site_structure) : null,
      page.primary_category,
      page.domain,
      page.document_nature,
      page.confidence_score,
      page.signals_used ? JSON.stringify(page.signals_used) : '{}',
      correctedClassification.category || null,
      correctedClassification.domain || null,
      correctedClassification.documentType || null,
      correctedBy,
    ]
  )

  const correctionId = result.rows[0].id

  // Mettre à jour la classification finale de la page
  await db.query(
    `UPDATE legal_classifications
     SET
       validated_by = $1,
       validated_at = NOW(),
       final_classification = $2,
       requires_validation = false
     WHERE web_page_id = $3`,
    [
      correctedBy,
      JSON.stringify({
        primaryCategory: correctedClassification.category,
        domain: correctedClassification.domain,
        documentNature: correctedClassification.documentType,
        modifiedBy: correctedBy,
        modifiedAt: new Date().toISOString(),
      }),
      webPageId,
    ]
  )

  // Déclencher l'analyse d'apprentissage en arrière-plan
  analyzeCorrectionPatterns(webPageId).catch(err => {
    console.error('[LearningService] Erreur analyse patterns:', err)
  })

  return correctionId
}

/**
 * Récupère les corrections non utilisées pour l'apprentissage
 */
export async function getUnusedCorrections(
  webSourceId?: string,
  limit: number = 100
): Promise<ClassificationCorrection[]> {
  let query = `
    SELECT cc.*, wp.web_source_id
    FROM classification_corrections cc
    JOIN web_pages wp ON cc.web_page_id = wp.id
    WHERE cc.used_for_learning = false
  `
  const params: unknown[] = []

  if (webSourceId) {
    query += ` AND wp.web_source_id = $1`
    params.push(webSourceId)
  }

  query += ` ORDER BY cc.corrected_at DESC LIMIT $${params.length + 1}`
  params.push(limit)

  const result = await db.query(query, params)

  return result.rows.map(mapRowToCorrection)
}

// =============================================================================
// ANALYSE DES PATTERNS
// =============================================================================

/**
 * Analyse les patterns de correction pour une page spécifique
 */
async function analyzeCorrectionPatterns(webPageId: string): Promise<void> {
  // Récupérer la source de la page
  const sourceResult = await db.query(
    `SELECT web_source_id FROM web_pages WHERE id = $1`,
    [webPageId]
  )

  if (sourceResult.rows.length === 0) return

  const webSourceId = sourceResult.rows[0].web_source_id

  // Vérifier s'il y a assez de corrections pour générer une règle
  const correctionsCount = await db.query(
    `SELECT COUNT(*) as count
     FROM classification_corrections cc
     JOIN web_pages wp ON cc.web_page_id = wp.id
     WHERE wp.web_source_id = $1
       AND cc.used_for_learning = false`,
    [webSourceId]
  )

  if (parseInt(correctionsCount.rows[0].count, 10) >= 3) {
    // Tenter de générer une règle
    await tryGenerateRuleFromCorrections(webSourceId)
  }
}

/**
 * Tente de générer une règle à partir des corrections
 */
export async function tryGenerateRuleFromCorrections(
  webSourceId: string
): Promise<CreateRuleInput | null> {
  const suggestedRule = await suggestRuleFromCorrections(webSourceId)

  if (!suggestedRule) {
    return null
  }

  console.log(`[LearningService] Règle suggérée pour source ${webSourceId}:`, suggestedRule.name)

  // Créer la règle
  const rule = await createRule(suggestedRule)

  // Marquer les corrections comme utilisées
  await markCorrectionsAsUsed(webSourceId, rule.id)

  return suggestedRule
}

/**
 * Marque les corrections comme utilisées pour l'apprentissage
 */
async function markCorrectionsAsUsed(
  webSourceId: string,
  ruleId: string
): Promise<void> {
  await db.query(
    `UPDATE classification_corrections cc
     SET used_for_learning = true,
         generated_rule_id = $1
     FROM web_pages wp
     WHERE cc.web_page_id = wp.id
       AND wp.web_source_id = $2
       AND cc.used_for_learning = false`,
    [ruleId, webSourceId]
  )
}

// =============================================================================
// DÉTECTION DE NOUVEAUX TYPES
// =============================================================================

/**
 * Analyse les corrections pour détecter de nouveaux types de taxonomie
 */
export async function detectNewTaxonomyTypes(): Promise<number> {
  // Récupérer les corrections avec des types non reconnus
  const result = await db.query(`
    SELECT
      corrected_category,
      corrected_domain,
      corrected_document_type,
      COUNT(*) as occurrence_count,
      array_agg(DISTINCT page_url) as sample_urls,
      array_agg(DISTINCT web_page_id) as page_ids
    FROM classification_corrections
    WHERE used_for_learning = false
    GROUP BY corrected_category, corrected_domain, corrected_document_type
    HAVING COUNT(*) >= 2
  `)

  let suggestionsCreated = 0

  for (const row of result.rows) {
    // Vérifier si les types existent dans la taxonomie
    if (row.corrected_category) {
      const exists = await db.query(
        `SELECT 1 FROM legal_taxonomy WHERE code = $1`,
        [row.corrected_category]
      )

      if (exists.rows.length === 0) {
        await createTaxonomySuggestion(
          'category',
          row.corrected_category,
          formatLabelFromCode(row.corrected_category),
          undefined,
          `Détecté dans ${row.occurrence_count} corrections`,
          row.page_ids[0],
          row.sample_urls[0]
        )
        suggestionsCreated++
      }
    }

    if (row.corrected_domain) {
      const exists = await db.query(
        `SELECT 1 FROM legal_taxonomy WHERE code = $1`,
        [row.corrected_domain]
      )

      if (exists.rows.length === 0) {
        await createTaxonomySuggestion(
          'domain',
          row.corrected_domain,
          formatLabelFromCode(row.corrected_domain),
          undefined,
          `Détecté dans ${row.occurrence_count} corrections`,
          row.page_ids[0],
          row.sample_urls[0]
        )
        suggestionsCreated++
      }
    }

    if (row.corrected_document_type) {
      const exists = await db.query(
        `SELECT 1 FROM legal_taxonomy WHERE code = $1`,
        [row.corrected_document_type]
      )

      if (exists.rows.length === 0) {
        await createTaxonomySuggestion(
          'document_type',
          row.corrected_document_type,
          formatLabelFromCode(row.corrected_document_type),
          undefined,
          `Détecté dans ${row.occurrence_count} corrections`,
          row.page_ids[0],
          row.sample_urls[0]
        )
        suggestionsCreated++
      }
    }
  }

  return suggestionsCreated
}

/**
 * Formate un code en label lisible
 */
function formatLabelFromCode(code: string): string {
  return code
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// =============================================================================
// ANALYSE DE L'EFFICACITÉ DES RÈGLES
// =============================================================================

/**
 * Analyse l'efficacité des règles générées
 */
export async function analyzeRulesEffectiveness(): Promise<Array<{
  ruleId: string
  ruleName: string
  accuracy: number
  totalMatches: number
  correctMatches: number
  recommendation: 'keep' | 'review' | 'disable'
}>> {
  const result = await db.query(`
    SELECT
      scr.id as rule_id,
      scr.name as rule_name,
      scr.times_matched,
      scr.times_correct,
      CASE
        WHEN scr.times_matched > 0
        THEN scr.times_correct::float / scr.times_matched
        ELSE 0
      END as accuracy
    FROM source_classification_rules scr
    WHERE scr.times_matched >= 5
    ORDER BY accuracy DESC
  `)

  return result.rows.map(row => {
    const accuracy = parseFloat(row.accuracy)
    let recommendation: 'keep' | 'review' | 'disable' = 'keep'

    if (accuracy < 0.5) {
      recommendation = 'disable'
    } else if (accuracy < 0.7) {
      recommendation = 'review'
    }

    return {
      ruleId: row.rule_id,
      ruleName: row.rule_name,
      accuracy,
      totalMatches: row.times_matched,
      correctMatches: row.times_correct,
      recommendation,
    }
  })
}

/**
 * Met à jour la précision d'une règle après validation
 */
export async function updateRuleAccuracy(
  ruleId: string,
  isCorrect: boolean
): Promise<void> {
  await db.query(
    `UPDATE source_classification_rules
     SET times_correct = times_correct + $1
     WHERE id = $2`,
    [isCorrect ? 1 : 0, ruleId]
  )
}

// =============================================================================
// STATISTIQUES D'APPRENTISSAGE
// =============================================================================

/**
 * Récupère les statistiques d'apprentissage
 */
export async function getLearningStats(): Promise<LearningStats> {
  const result = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM classification_corrections) as total_corrections,
      (SELECT COUNT(*) FROM classification_corrections WHERE used_for_learning = false) as unused_corrections,
      (SELECT COUNT(DISTINCT generated_rule_id) FROM classification_corrections WHERE generated_rule_id IS NOT NULL) as rules_generated,
      (SELECT COUNT(*) FROM taxonomy_suggestions WHERE status = 'pending') as taxonomy_suggestions
  `)

  // Calculer l'amélioration moyenne de précision
  const accuracyResult = await db.query(`
    SELECT
      AVG(CASE WHEN times_matched > 0 THEN times_correct::float / times_matched ELSE 0 END) as avg_accuracy
    FROM source_classification_rules
    WHERE times_matched >= 5
  `)

  const row = result.rows[0]

  return {
    totalCorrections: parseInt(row.total_corrections, 10),
    unusedCorrections: parseInt(row.unused_corrections, 10),
    rulesGenerated: parseInt(row.rules_generated, 10),
    taxonomySuggestions: parseInt(row.taxonomy_suggestions, 10),
    avgAccuracyImprovement: parseFloat(accuracyResult.rows[0]?.avg_accuracy || '0'),
  }
}

/**
 * Récupère les corrections récentes avec leur impact
 */
export async function getRecentCorrectionsWithImpact(
  limit: number = 20
): Promise<Array<{
  correction: ClassificationCorrection
  impact: {
    rulesAffected: number
    taxonomySuggestionsCreated: boolean
  }
}>> {
  const corrections = await getUnusedCorrections(undefined, limit)

  const results = []

  for (const correction of corrections) {
    // Vérifier si cette correction a généré une règle
    const rulesResult = await db.query(
      `SELECT COUNT(*) as count
       FROM source_classification_rules
       WHERE id = $1`,
      [correction.generatedRuleId]
    )

    // Vérifier les suggestions de taxonomie
    const taxonomyResult = await db.query(
      `SELECT COUNT(*) as count
       FROM taxonomy_suggestions
       WHERE $1 = ANY(based_on_pages)`,
      [correction.webPageId]
    )

    results.push({
      correction,
      impact: {
        rulesAffected: parseInt(rulesResult.rows[0].count, 10),
        taxonomySuggestionsCreated: parseInt(taxonomyResult.rows[0].count, 10) > 0,
      },
    })
  }

  return results
}

// =============================================================================
// TÂCHES PLANIFIÉES
// =============================================================================

/**
 * Tâche d'apprentissage à exécuter périodiquement
 */
export async function runLearningCycle(): Promise<{
  rulesGenerated: number
  taxonomySuggestions: number
  rulesReviewed: number
}> {
  console.log('[LearningService] Démarrage du cycle d\'apprentissage...')

  // 1. Analyser les corrections par source
  const sourcesResult = await db.query(`
    SELECT DISTINCT wp.web_source_id
    FROM classification_corrections cc
    JOIN web_pages wp ON cc.web_page_id = wp.id
    WHERE cc.used_for_learning = false
  `)

  let rulesGenerated = 0
  for (const row of sourcesResult.rows) {
    const rule = await tryGenerateRuleFromCorrections(row.web_source_id)
    if (rule) rulesGenerated++
  }

  // 2. Détecter de nouveaux types de taxonomie
  const taxonomySuggestions = await detectNewTaxonomyTypes()

  // 3. Analyser l'efficacité des règles
  const effectiveness = await analyzeRulesEffectiveness()
  const rulesReviewed = effectiveness.filter(r => r.recommendation !== 'keep').length

  console.log(`[LearningService] Cycle terminé: ${rulesGenerated} règles, ${taxonomySuggestions} suggestions taxonomie, ${rulesReviewed} règles à revoir`)

  return {
    rulesGenerated,
    taxonomySuggestions,
    rulesReviewed,
  }
}

// =============================================================================
// MAPPERS
// =============================================================================

function mapRowToCorrection(row: Record<string, unknown>): ClassificationCorrection {
  return {
    id: row.id as string,
    webPageId: row.web_page_id as string,
    pageUrl: row.page_url as string,
    pageTitle: row.page_title as string | null,
    pageStructure: row.page_structure as SiteStructure | null,
    originalCategory: row.original_category as string | null,
    originalDomain: row.original_domain as string | null,
    originalDocumentType: row.original_document_type as string | null,
    originalConfidence: row.original_confidence ? parseFloat(row.original_confidence as string) : null,
    correctedCategory: row.corrected_category as string | null,
    correctedDomain: row.corrected_domain as string | null,
    correctedDocumentType: row.corrected_document_type as string | null,
    classificationSignals: (row.classification_signals as Record<string, unknown>) || {},
    usedForLearning: row.used_for_learning as boolean,
    generatedRuleId: row.generated_rule_id as string | null,
    correctedBy: row.corrected_by as string,
    correctedAt: new Date(row.corrected_at as string),
  }
}
