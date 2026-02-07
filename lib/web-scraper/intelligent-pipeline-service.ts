/**
 * Service de pipeline intelligent pour le traitement du contenu juridique
 *
 * Orchestre le flux complet:
 * 1. Analyse de qualité
 * 2. Classification juridique
 * 3. Détection des contradictions
 * 4. Décision automatique (indexer / revue / rejeter)
 */

import { db } from '@/lib/db/postgres'
import {
  analyzeContentQuality,
  QUALITY_THRESHOLDS,
} from './content-analyzer-service'
import {
  classifyLegalContent,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
} from './legal-classifier-service'
import { detectContradictions } from './contradiction-detector-service'
import { createReviewRequest } from './human-review-service'
import type {
  PipelineResult,
  PipelineThresholds,
  LegalClassification,
  ContentContradiction,
  ReviewType,
  ReviewPriority,
  SuggestedAction,
} from './types'

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_THRESHOLDS: PipelineThresholds = {
  autoRejectBelow: parseInt(process.env.PIPELINE_AUTO_REJECT || '60', 10),
  reviewRequired: [
    parseInt(process.env.PIPELINE_REVIEW_MIN || '60', 10),
    parseInt(process.env.PIPELINE_REVIEW_MAX || '80', 10),
  ],
  autoIndexAbove: parseInt(process.env.PIPELINE_AUTO_INDEX || '80', 10),
  classificationConfidenceMin: parseFloat(
    process.env.PIPELINE_CLASSIFICATION_MIN || '0.7'
  ),
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Traite une page web à travers le pipeline intelligent complet
 */
export async function processPage(
  pageId: string,
  options: {
    thresholds?: Partial<PipelineThresholds>
    skipContradictionCheck?: boolean
  } = {}
): Promise<PipelineResult> {
  const startTime = Date.now()
  const errors: string[] = []

  const thresholds: PipelineThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...options.thresholds,
  }

  let qualityScore = 0
  let classification: LegalClassification | null = null
  let contradictions: ContentContradiction[] = []
  let decision: 'indexed' | 'review_required' | 'rejected' = 'rejected'
  let reviewId: string | undefined

  // ==========================================================================
  // ÉTAPE 1: Analyse de qualité
  // ==========================================================================

  try {
    console.log(`[Pipeline] Étape 1/3: Analyse qualité pour ${pageId}`)
    const qualityResult = await analyzeContentQuality(pageId)
    qualityScore = qualityResult.overallScore

    console.log(`[Pipeline] Score qualité: ${qualityScore}`)

    // Rejet immédiat si score trop bas
    if (qualityScore < thresholds.autoRejectBelow) {
      console.log(`[Pipeline] Score < ${thresholds.autoRejectBelow} → Rejet automatique`)

      await updatePageStatus(pageId, 'rejected')

      return {
        pageId,
        qualityScore,
        classification: null,
        contradictions: [],
        decision: 'rejected',
        processingTimeMs: Date.now() - startTime,
        errors,
      }
    }
  } catch (error) {
    errors.push(`Analyse qualité: ${error instanceof Error ? error.message : 'Erreur'}`)
    console.error('[Pipeline] Erreur analyse qualité:', error)
    // Continuer avec un score par défaut pour permettre la revue manuelle
    qualityScore = 50
  }

  // ==========================================================================
  // ÉTAPE 2: Classification juridique
  // ==========================================================================

  try {
    console.log(`[Pipeline] Étape 2/3: Classification juridique pour ${pageId}`)
    const classificationResult = await classifyLegalContent(pageId)

    classification = {
      id: '',
      webPageId: pageId,
      primaryCategory: classificationResult.primaryCategory,
      subcategory: classificationResult.subcategory,
      domain: classificationResult.domain,
      subdomain: classificationResult.subdomain,
      documentNature: classificationResult.documentNature,
      confidenceScore: classificationResult.confidenceScore,
      requiresValidation: classificationResult.requiresValidation,
      validationReason: classificationResult.validationReason,
      alternativeClassifications: classificationResult.alternativeClassifications,
      legalKeywords: classificationResult.legalKeywords,
      validatedBy: null,
      validatedAt: null,
      finalClassification: null,
      validationNotes: null,
      llmProvider: classificationResult.llmProvider,
      llmModel: classificationResult.llmModel,
      tokensUsed: classificationResult.tokensUsed,
      classifiedAt: new Date(),
    }

    console.log(
      `[Pipeline] Classification: ${classification.primaryCategory}/${classification.domain} ` +
      `(confiance: ${classification.confidenceScore.toFixed(2)})`
    )
  } catch (error) {
    errors.push(`Classification: ${error instanceof Error ? error.message : 'Erreur'}`)
    console.error('[Pipeline] Erreur classification:', error)
  }

  // ==========================================================================
  // ÉTAPE 3: Détection des contradictions (optionnel)
  // ==========================================================================

  if (!options.skipContradictionCheck) {
    try {
      console.log(`[Pipeline] Étape 3/3: Détection contradictions pour ${pageId}`)
      const contradictionResult = await detectContradictions(pageId)
      contradictions = contradictionResult.contradictions

      if (contradictions.length > 0) {
        console.log(
          `[Pipeline] ${contradictions.length} contradiction(s) détectée(s), ` +
          `sévérité: ${contradictionResult.severity}`
        )
      }
    } catch (error) {
      errors.push(`Contradictions: ${error instanceof Error ? error.message : 'Erreur'}`)
      console.error('[Pipeline] Erreur détection contradictions:', error)
    }
  } else {
    console.log(`[Pipeline] Étape 3/3: Détection contradictions ignorée`)
  }

  // ==========================================================================
  // DÉCISION FINALE
  // ==========================================================================

  decision = determineDecision(qualityScore, classification, contradictions, thresholds)
  console.log(`[Pipeline] Décision finale: ${decision}`)

  // Appliquer la décision
  if (decision === 'review_required') {
    reviewId = await createReviewForPage(pageId, qualityScore, classification, contradictions)
    await updatePageStatus(pageId, 'analyzed', true)
  } else if (decision === 'indexed') {
    await updatePageStatus(pageId, 'validated', false)
    // Ajouter à la queue d'indexation
    await queueForIndexing(pageId)
  } else {
    await updatePageStatus(pageId, 'rejected', false)
  }

  const processingTimeMs = Date.now() - startTime
  console.log(`[Pipeline] Traitement terminé en ${processingTimeMs}ms`)

  return {
    pageId,
    qualityScore,
    classification,
    contradictions,
    decision,
    reviewId,
    processingTimeMs,
    errors,
  }
}

/**
 * Traite plusieurs pages en batch
 */
export async function processBatch(
  pageIds: string[],
  options: {
    thresholds?: Partial<PipelineThresholds>
    skipContradictionCheck?: boolean
    concurrency?: number
  } = {}
): Promise<{
  results: PipelineResult[]
  summary: {
    total: number
    indexed: number
    reviewRequired: number
    rejected: number
    errors: number
    avgProcessingTimeMs: number
  }
}> {
  const { concurrency = 3 } = options
  const results: PipelineResult[] = []

  // Traiter par lots pour éviter la surcharge
  for (let i = 0; i < pageIds.length; i += concurrency) {
    const batch = pageIds.slice(i, i + concurrency)

    const batchResults = await Promise.all(
      batch.map((pageId) =>
        processPage(pageId, options).catch((error) => ({
          pageId,
          qualityScore: 0,
          classification: null,
          contradictions: [],
          decision: 'rejected' as const,
          processingTimeMs: 0,
          errors: [error instanceof Error ? error.message : 'Erreur inconnue'],
        }))
      )
    )

    results.push(...batchResults)
  }

  // Calculer le résumé
  const summary = {
    total: results.length,
    indexed: results.filter((r) => r.decision === 'indexed').length,
    reviewRequired: results.filter((r) => r.decision === 'review_required').length,
    rejected: results.filter((r) => r.decision === 'rejected').length,
    errors: results.filter((r) => r.errors.length > 0).length,
    avgProcessingTimeMs:
      results.reduce((sum, r) => sum + r.processingTimeMs, 0) / results.length,
  }

  return { results, summary }
}

/**
 * Récupère les pages en attente de traitement
 */
export async function getPendingPages(options: {
  sourceId?: string
  limit?: number
}): Promise<string[]> {
  const { sourceId, limit = 100 } = options

  let query = `
    SELECT id FROM web_pages
    WHERE processing_status = 'pending'
      AND status = 'crawled'
      AND extracted_text IS NOT NULL
      AND LENGTH(extracted_text) > 100
  `
  const params: (string | number)[] = []
  let paramIndex = 1

  if (sourceId) {
    query += ` AND web_source_id = $${paramIndex++}`
    params.push(sourceId)
  }

  query += ` ORDER BY created_at ASC LIMIT $${paramIndex++}`
  params.push(limit)

  const result = await db.query<{ id: string }>(query, params)
  return result.rows.map((row) => row.id)
}

/**
 * Statistiques du pipeline
 */
export async function getPipelineStats(): Promise<{
  totalProcessed: number
  autoIndexed: number
  autoRejected: number
  pendingReview: number
  avgQualityScore: number
  byDomain: Record<string, number>
  byCategory: Record<string, number>
  contradictionsCount: number
  contradictionsCritical: number
}> {
  const result = await db.query(`SELECT * FROM get_intelligent_pipeline_stats()`)

  if (result.rows.length === 0) {
    return {
      totalProcessed: 0,
      autoIndexed: 0,
      autoRejected: 0,
      pendingReview: 0,
      avgQualityScore: 0,
      byDomain: {},
      byCategory: {},
      contradictionsCount: 0,
      contradictionsCritical: 0,
    }
  }

  const row = result.rows[0]
  return {
    totalProcessed: parseInt(row.total_processed, 10),
    autoIndexed: parseInt(row.auto_indexed, 10),
    autoRejected: parseInt(row.auto_rejected, 10),
    pendingReview: parseInt(row.pending_review, 10),
    avgQualityScore: parseFloat(row.avg_quality_score || '0'),
    byDomain: row.by_domain || {},
    byCategory: row.by_category || {},
    contradictionsCount: parseInt(row.contradictions_count, 10),
    contradictionsCritical: parseInt(row.contradictions_critical, 10),
  }
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Détermine la décision finale basée sur tous les facteurs
 */
function determineDecision(
  qualityScore: number,
  classification: LegalClassification | null,
  contradictions: ContentContradiction[],
  thresholds: PipelineThresholds
): 'indexed' | 'review_required' | 'rejected' {
  // Règle 1: Score trop bas = rejet
  if (qualityScore < thresholds.autoRejectBelow) {
    return 'rejected'
  }

  // Règle 2: Contradictions critiques = revue obligatoire
  const hasCriticalContradiction = contradictions.some(
    (c) => c.severity === 'critical' || c.severity === 'high'
  )
  if (hasCriticalContradiction) {
    return 'review_required'
  }

  // Règle 3: Classification incertaine = revue
  if (
    classification &&
    classification.confidenceScore < thresholds.classificationConfidenceMin
  ) {
    return 'review_required'
  }

  // Règle 4: Score dans la zone intermédiaire = revue
  if (
    qualityScore >= thresholds.reviewRequired[0] &&
    qualityScore < thresholds.reviewRequired[1]
  ) {
    return 'review_required'
  }

  // Règle 5: Score élevé = indexation automatique
  if (qualityScore >= thresholds.autoIndexAbove) {
    return 'indexed'
  }

  // Par défaut, revue requise
  return 'review_required'
}

/**
 * Crée une demande de revue pour une page
 */
async function createReviewForPage(
  pageId: string,
  qualityScore: number,
  classification: LegalClassification | null,
  contradictions: ContentContradiction[]
): Promise<string> {
  // Déterminer le type de revue principal
  let reviewType: ReviewType = 'quality_low'
  let priority: ReviewPriority = 'normal'

  if (contradictions.length > 0) {
    reviewType = 'contradiction_detected'
    const hasCritical = contradictions.some((c) => c.severity === 'critical')
    priority = hasCritical ? 'urgent' : 'high'
  } else if (classification && classification.requiresValidation) {
    reviewType = 'classification_uncertain'
    priority = classification.confidenceScore < 0.5 ? 'high' : 'normal'
  } else if (qualityScore < 70) {
    reviewType = 'quality_low'
    priority = qualityScore < 50 ? 'high' : 'normal'
  }

  // Récupérer les infos de la page
  const pageResult = await db.query<{ title: string; url: string }>(
    `SELECT title, url FROM web_pages WHERE id = $1`,
    [pageId]
  )
  const page = pageResult.rows[0]

  // Construire les actions suggérées
  const suggestedActions: SuggestedAction[] = []

  if (reviewType === 'quality_low') {
    suggestedActions.push(
      {
        action: 'approve',
        description: 'Approuver malgré le score faible',
        recommended: qualityScore >= 60,
      },
      {
        action: 'reject',
        description: 'Rejeter le contenu',
        recommended: qualityScore < 50,
      }
    )
  } else if (reviewType === 'classification_uncertain') {
    suggestedActions.push(
      {
        action: 'validate',
        description: 'Valider la classification proposée',
        recommended: classification ? classification.confidenceScore >= 0.6 : false,
      },
      {
        action: 'modify',
        description: 'Modifier la classification',
        recommended: classification ? classification.confidenceScore < 0.6 : true,
      }
    )
  } else if (reviewType === 'contradiction_detected') {
    suggestedActions.push(
      {
        action: 'resolve',
        description: 'Résoudre la contradiction',
        recommended: true,
      },
      {
        action: 'dismiss',
        description: 'Ignorer la contradiction (faux positif)',
        recommended: false,
      }
    )
  }

  // Créer la demande de revue
  return createReviewRequest({
    reviewType,
    targetType: 'web_page',
    targetId: pageId,
    title: page?.title || 'Page sans titre',
    description: buildReviewDescription(qualityScore, classification, contradictions),
    context: {
      url: page?.url,
      qualityScore,
      classification: classification
        ? {
            category: classification.primaryCategory,
            domain: classification.domain,
            confidence: classification.confidenceScore,
          }
        : null,
      contradictionsCount: contradictions.length,
    },
    suggestedActions,
    priority,
    qualityScore,
    confidenceScore: classification?.confidenceScore,
  })
}

/**
 * Construit la description pour la revue
 */
function buildReviewDescription(
  qualityScore: number,
  classification: LegalClassification | null,
  contradictions: ContentContradiction[]
): string {
  const parts: string[] = []

  parts.push(`Score qualité: ${qualityScore}/100`)

  if (classification) {
    parts.push(
      `Classification: ${classification.primaryCategory}/${classification.domain || 'N/A'} ` +
      `(confiance: ${(classification.confidenceScore * 100).toFixed(0)}%)`
    )
  }

  if (contradictions.length > 0) {
    parts.push(`Contradictions détectées: ${contradictions.length}`)
    const critical = contradictions.filter((c) => c.severity === 'critical').length
    if (critical > 0) {
      parts.push(`⚠️ ${critical} contradiction(s) critique(s)`)
    }
  }

  return parts.join('\n')
}

/**
 * Met à jour le statut de traitement d'une page
 */
async function updatePageStatus(
  pageId: string,
  status: 'analyzed' | 'validated' | 'rejected',
  requiresReview: boolean = false
): Promise<void> {
  await db.query(
    `UPDATE web_pages
     SET processing_status = $1,
         requires_human_review = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [status, requiresReview, pageId]
  )
}

/**
 * Ajoute une page à la queue d'indexation
 */
async function queueForIndexing(pageId: string): Promise<void> {
  try {
    // Importer dynamiquement pour éviter les dépendances circulaires
    const { addToQueue } = await import('@/lib/ai/indexing-queue-service')
    await addToQueue('web_page_index', pageId, 5)
  } catch (error) {
    console.error('[Pipeline] Erreur ajout à la queue d\'indexation:', error)
    // Ne pas faire échouer le pipeline
  }
}
