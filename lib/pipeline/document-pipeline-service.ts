/**
 * Service Pipeline Supervisé KB
 * Machine à états pour la validation manuelle des documents KB
 *
 * Étapes: source_configured → crawled → content_reviewed → classified →
 *         indexed → quality_analyzed → rag_active
 *
 * Transitions spéciales: rejected, needs_revision
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

export type PipelineStage =
  | 'source_configured'
  | 'crawled'
  | 'content_reviewed'
  | 'classified'
  | 'indexed'
  | 'quality_analyzed'
  | 'rag_active'
  | 'rejected'
  | 'needs_revision'

export type PipelineAction =
  | 'auto_advance'
  | 'admin_approve'
  | 'admin_reject'
  | 'admin_edit'
  | 'admin_replay'
  | 'admin_override'
  | 'system_error'
  | 'backfill'

export interface PipelineTransitionResult {
  success: boolean
  documentId: string
  fromStage: PipelineStage | null
  toStage: PipelineStage
  error?: string
}

export interface PipelineDocument {
  id: string
  title: string
  category: string
  subcategory: string | null
  language: string
  pipeline_stage: PipelineStage
  pipeline_stage_updated_at: string
  pipeline_notes: string | null
  pipeline_rejected_reason: string | null
  is_indexed: boolean
  is_approved: boolean
  is_active: boolean
  quality_score: number | null
  quality_clarity: number | null
  quality_structure: number | null
  quality_completeness: number | null
  quality_reliability: number | null
  quality_analysis_summary: string | null
  quality_detected_issues: unknown[] | null
  quality_recommendations: unknown[] | null
  quality_llm_provider: string | null
  quality_llm_model: string | null
  quality_assessed_at: string | null
  full_text: string | null
  source_file: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PipelineHistoryEntry {
  id: string
  knowledge_base_id: string
  from_stage: string | null
  to_stage: string
  action: string
  performed_by: string | null
  changes_made: Record<string, unknown>
  notes: string | null
  quality_score_at_transition: number | null
  metadata_snapshot: Record<string, unknown>
  created_at: string
  performer_name?: string
}

// =============================================================================
// PIPELINE ORDERED STAGES (normal flow)
// =============================================================================

const PIPELINE_ORDER: PipelineStage[] = [
  'source_configured',
  'crawled',
  'content_reviewed',
  'classified',
  'indexed',
  'quality_analyzed',
  'rag_active',
]

/**
 * Transitions valides: fromStage → toStage[]
 */
const VALID_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  source_configured: ['crawled', 'rejected'],
  crawled: ['content_reviewed', 'rejected', 'needs_revision'],
  content_reviewed: ['classified', 'rejected', 'needs_revision'],
  classified: ['indexed', 'rejected', 'needs_revision'],
  indexed: ['quality_analyzed', 'rejected', 'needs_revision'],
  quality_analyzed: ['rag_active', 'rejected', 'needs_revision'],
  rag_active: ['needs_revision', 'rejected'],
  rejected: ['crawled'],
  needs_revision: ['crawled', 'content_reviewed', 'classified'],
}

/**
 * Prochaine étape dans le flow normal
 */
function getNextStage(current: PipelineStage): PipelineStage | null {
  const idx = PIPELINE_ORDER.indexOf(current)
  if (idx === -1 || idx >= PIPELINE_ORDER.length - 1) return null
  return PIPELINE_ORDER[idx + 1]
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Avance un document à l'étape suivante du pipeline
 */
export async function advanceStage(
  docId: string,
  userId: string,
  notes?: string,
  changes?: Record<string, unknown>
): Promise<PipelineTransitionResult> {
  const doc = await getDocumentForPipeline(docId)
  if (!doc) {
    return { success: false, documentId: docId, fromStage: null, toStage: 'crawled', error: 'Document non trouvé' }
  }

  const currentStage = doc.pipeline_stage
  const nextStage = getNextStage(currentStage)

  if (!nextStage) {
    return { success: false, documentId: docId, fromStage: currentStage, toStage: currentStage, error: `Pas d'étape suivante après ${currentStage}` }
  }

  if (!VALID_TRANSITIONS[currentStage]?.includes(nextStage)) {
    return { success: false, documentId: docId, fromStage: currentStage, toStage: nextStage, error: `Transition ${currentStage} → ${nextStage} non autorisée` }
  }

  // Quality gate checks
  const gateError = await checkQualityGate(doc, nextStage)
  if (gateError) {
    return { success: false, documentId: docId, fromStage: currentStage, toStage: nextStage, error: gateError }
  }

  // Execute stage-specific actions
  await executeStageAction(doc, nextStage, userId)

  // Perform transition
  await performTransition(docId, currentStage, nextStage, 'admin_approve', userId, notes, changes, doc.quality_score)

  // Tenter l'auto-advance sur les étapes suivantes
  const autoResult = await autoAdvanceIfEligible(docId, userId)
  const finalStage = autoResult ? autoResult.stoppedAt : nextStage

  return { success: true, documentId: docId, fromStage: currentStage, toStage: finalStage }
}

/**
 * Avance un document directement vers une étape spécifique
 */
export async function advanceToStage(
  docId: string,
  targetStage: PipelineStage,
  userId: string,
  notes?: string,
  changes?: Record<string, unknown>
): Promise<PipelineTransitionResult> {
  const doc = await getDocumentForPipeline(docId)
  if (!doc) {
    return { success: false, documentId: docId, fromStage: null, toStage: targetStage, error: 'Document non trouvé' }
  }

  const currentStage = doc.pipeline_stage

  if (!VALID_TRANSITIONS[currentStage]?.includes(targetStage)) {
    return { success: false, documentId: docId, fromStage: currentStage, toStage: targetStage, error: `Transition ${currentStage} → ${targetStage} non autorisée` }
  }

  const gateError = await checkQualityGate(doc, targetStage)
  if (gateError) {
    return { success: false, documentId: docId, fromStage: currentStage, toStage: targetStage, error: gateError }
  }

  await executeStageAction(doc, targetStage, userId)
  await performTransition(docId, currentStage, targetStage, 'admin_approve', userId, notes, changes, doc.quality_score)

  return { success: true, documentId: docId, fromStage: currentStage, toStage: targetStage }
}

/**
 * Rejette un document avec raison
 */
export async function rejectDocument(
  docId: string,
  userId: string,
  reason: string
): Promise<PipelineTransitionResult> {
  const doc = await getDocumentForPipeline(docId)
  if (!doc) {
    return { success: false, documentId: docId, fromStage: null, toStage: 'rejected', error: 'Document non trouvé' }
  }

  const currentStage = doc.pipeline_stage

  if (!VALID_TRANSITIONS[currentStage]?.includes('rejected')) {
    return { success: false, documentId: docId, fromStage: currentStage, toStage: 'rejected', error: `Rejet impossible depuis ${currentStage}` }
  }

  await db.query(
    `UPDATE knowledge_base SET
      pipeline_rejected_reason = $2,
      is_approved = false,
      is_active = false
    WHERE id = $1`,
    [docId, reason]
  )

  await performTransition(docId, currentStage, 'rejected', 'admin_reject', userId, reason, {}, doc.quality_score)

  return { success: true, documentId: docId, fromStage: currentStage, toStage: 'rejected' }
}

/**
 * Relance le traitement automatique de l'étape courante
 */
export async function replayStage(
  docId: string,
  userId: string
): Promise<PipelineTransitionResult> {
  const doc = await getDocumentForPipeline(docId)
  if (!doc) {
    return { success: false, documentId: docId, fromStage: null, toStage: 'crawled', error: 'Document non trouvé' }
  }

  const currentStage = doc.pipeline_stage

  try {
    await executeReplay(doc, currentStage)
    await logHistory(docId, currentStage, currentStage, 'admin_replay', userId, `Replay étape ${currentStage}`)
    return { success: true, documentId: docId, fromStage: currentStage, toStage: currentStage }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Erreur replay'
    await logHistory(docId, currentStage, currentStage, 'system_error', userId, errMsg)
    return { success: false, documentId: docId, fromStage: currentStage, toStage: currentStage, error: errMsg }
  }
}

/**
 * Renvoie un document à une étape antérieure
 */
export async function sendBackToStage(
  docId: string,
  targetStage: PipelineStage,
  userId: string,
  reason: string
): Promise<PipelineTransitionResult> {
  const doc = await getDocumentForPipeline(docId)
  if (!doc) {
    return { success: false, documentId: docId, fromStage: null, toStage: targetStage, error: 'Document non trouvé' }
  }

  const currentStage = doc.pipeline_stage

  // needs_revision can go to crawled, content_reviewed, classified
  // rag_active can go to needs_revision
  if (currentStage === 'rag_active' && targetStage !== 'needs_revision') {
    return { success: false, documentId: docId, fromStage: currentStage, toStage: targetStage, error: 'rag_active ne peut aller que vers needs_revision' }
  }

  if (currentStage !== 'needs_revision' && currentStage !== 'rag_active') {
    // For other stages, put to needs_revision first
    await performTransition(docId, currentStage, 'needs_revision', 'admin_reject', userId, reason, {}, doc.quality_score)
    if (targetStage !== 'needs_revision') {
      await performTransition(docId, 'needs_revision', targetStage, 'admin_approve', userId, `Retour à ${targetStage}: ${reason}`, {}, doc.quality_score)
    }
  } else if (currentStage === 'needs_revision') {
    if (!VALID_TRANSITIONS.needs_revision.includes(targetStage)) {
      return { success: false, documentId: docId, fromStage: currentStage, toStage: targetStage, error: `Transition needs_revision → ${targetStage} non autorisée` }
    }
    await performTransition(docId, currentStage, targetStage, 'admin_approve', userId, reason, {}, doc.quality_score)
  } else {
    await performTransition(docId, currentStage, 'needs_revision', 'admin_reject', userId, reason, {}, doc.quality_score)
  }

  // If going to needs_revision from rag_active, revoke approval
  if (currentStage === 'rag_active') {
    await db.query(
      `UPDATE knowledge_base SET is_approved = false WHERE id = $1`,
      [docId]
    )
  }

  return { success: true, documentId: docId, fromStage: currentStage, toStage: targetStage }
}

/**
 * Édite le contenu/metadata d'un document à son étape courante
 */
export async function editDocumentAtStage(
  docId: string,
  userId: string,
  updates: {
    title?: string
    full_text?: string
    category?: string
    subcategory?: string | null
    description?: string
    tags?: string[]
    language?: string
    pipeline_notes?: string
  }
): Promise<PipelineTransitionResult> {
  const doc = await getDocumentForPipeline(docId)
  if (!doc) {
    return { success: false, documentId: docId, fromStage: null, toStage: 'crawled', error: 'Document non trouvé' }
  }

  const currentStage = doc.pipeline_stage
  const setClauses: string[] = []
  const values: unknown[] = []
  let paramIndex = 1

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`)
    values.push(updates.title)
  }
  if (updates.full_text !== undefined) {
    setClauses.push(`full_text = $${paramIndex++}`)
    values.push(updates.full_text)
  }
  if (updates.category !== undefined) {
    setClauses.push(`category = $${paramIndex++}`)
    values.push(updates.category)
  }
  if (updates.subcategory !== undefined) {
    setClauses.push(`subcategory = $${paramIndex++}`)
    values.push(updates.subcategory)
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`)
    values.push(updates.description)
  }
  if (updates.tags !== undefined) {
    setClauses.push(`tags = $${paramIndex++}`)
    values.push(updates.tags)
  }
  if (updates.language !== undefined) {
    setClauses.push(`language = $${paramIndex++}`)
    values.push(updates.language)
  }
  if (updates.pipeline_notes !== undefined) {
    setClauses.push(`pipeline_notes = $${paramIndex++}`)
    values.push(updates.pipeline_notes)
  }

  if (setClauses.length === 0) {
    return { success: false, documentId: docId, fromStage: currentStage, toStage: currentStage, error: 'Aucune modification' }
  }

  setClauses.push(`updated_at = NOW()`)
  values.push(docId)

  await db.query(
    `UPDATE knowledge_base SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
    values
  )

  await logHistory(docId, currentStage, currentStage, 'admin_edit', userId, updates.pipeline_notes || 'Modification manuelle', updates)

  return { success: true, documentId: docId, fromStage: currentStage, toStage: currentStage }
}

/**
 * Avance plusieurs documents en batch
 */
export async function bulkAdvance(
  docIds: string[],
  userId: string,
  notes?: string
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  for (const docId of docIds.slice(0, 100)) {
    const result = await advanceStage(docId, userId, notes)
    if (result.success) {
      succeeded.push(docId)
    } else {
      failed.push({ id: docId, error: result.error || 'Erreur inconnue' })
    }
  }

  return { succeeded, failed }
}

/**
 * Rejette plusieurs documents en batch
 */
export async function bulkReject(
  docIds: string[],
  userId: string,
  reason: string
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  for (const docId of docIds.slice(0, 100)) {
    const result = await rejectDocument(docId, userId, reason)
    if (result.success) {
      succeeded.push(docId)
    } else {
      failed.push({ id: docId, error: result.error || 'Erreur inconnue' })
    }
  }

  return { succeeded, failed }
}

/**
 * Reclassifie plusieurs documents en batch avec une nouvelle catégorie
 */
export async function bulkReclassify(
  docIds: string[],
  userId: string,
  category: string,
  subcategory?: string | null
): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
  const succeeded: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  for (const docId of docIds.slice(0, 100)) {
    try {
      const doc = await getDocumentForPipeline(docId)
      if (!doc) {
        failed.push({ id: docId, error: 'Document non trouvé' })
        continue
      }

      const oldCategory = doc.category
      await db.query(
        `UPDATE knowledge_base SET category = $2, subcategory = $3, updated_at = NOW() WHERE id = $1`,
        [docId, category, subcategory ?? null]
      )

      await logHistory(docId, doc.pipeline_stage, doc.pipeline_stage, 'admin_edit', userId,
        `Reclassification: ${oldCategory} → ${category}`,
        { old_category: oldCategory, new_category: category, new_subcategory: subcategory ?? null }
      )

      succeeded.push(docId)
    } catch (error) {
      failed.push({ id: docId, error: error instanceof Error ? error.message : 'Erreur inconnue' })
    }
  }

  return { succeeded, failed }
}

// =============================================================================
// HELPERS
// =============================================================================

async function getDocumentForPipeline(docId: string): Promise<PipelineDocument | null> {
  const result = await db.query(
    `SELECT id, title, category, subcategory, language,
      pipeline_stage, pipeline_stage_updated_at, pipeline_notes, pipeline_rejected_reason,
      is_indexed, is_approved, is_active, quality_score,
      quality_clarity, quality_structure, quality_completeness, quality_reliability,
      quality_analysis_summary, quality_detected_issues, quality_recommendations,
      quality_llm_provider, quality_llm_model, quality_assessed_at,
      full_text, source_file, metadata, created_at, updated_at
    FROM knowledge_base WHERE id = $1`,
    [docId]
  )
  return result.rows[0] || null
}

/**
 * Vérifie les quality gates avant une transition
 */
async function checkQualityGate(doc: PipelineDocument, targetStage: PipelineStage): Promise<string | null> {
  switch (targetStage) {
    case 'content_reviewed':
      if (!doc.full_text || doc.full_text.length < 100) {
        return 'Contenu insuffisant (< 100 caractères)'
      }
      break
    case 'classified':
      // Admin explicitly approves content
      break
    case 'indexed':
      if (!doc.category || doc.category === '') {
        return 'Catégorie requise avant indexation'
      }
      break
    case 'quality_analyzed':
      // Check chunks exist
      const chunksResult = await db.query(
        'SELECT COUNT(*) as cnt FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
        [doc.id]
      )
      if (parseInt(chunksResult.rows[0].cnt) === 0) {
        return 'Aucun chunk créé - indexation échouée'
      }
      break
    case 'rag_active':
      if (doc.quality_score !== null && doc.quality_score < 50) {
        return `Score qualité trop bas (${doc.quality_score}/100, minimum 50)`
      }
      // Vérifier cohérence is_indexed vs chunks réels
      if (doc.is_indexed) {
        const ragChunksResult = await db.query(
          'SELECT COUNT(*) as cnt FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
          [doc.id]
        )
        if (parseInt(ragChunksResult.rows[0].cnt) === 0) {
          return 'Incohérence: document marqué indexé mais 0 chunks trouvés'
        }
      } else {
        return 'Document non indexé - indexation requise avant activation RAG'
      }
      break
  }
  return null
}

/**
 * Retry helper: exécute fn avec N tentatives et délai entre chaque
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number = 2, delayMs: number = 5000): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[Pipeline] Tentative ${attempt}/${maxAttempts} échouée: ${lastError.message}`)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError!
}

/**
 * Exécute les actions automatiques spécifiques à une étape
 */
async function executeStageAction(doc: PipelineDocument, targetStage: PipelineStage, userId: string): Promise<void> {
  switch (targetStage) {
    case 'indexed':
      // Skip si déjà indexé avec chunks (ex: crawl a déjà fait le travail)
      if (doc.is_indexed) {
        const existingChunks = await db.query(
          'SELECT COUNT(*) as cnt FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
          [doc.id]
        )
        if (parseInt(existingChunks.rows[0].cnt) > 0) {
          console.log(`[Pipeline] Doc ${doc.id} déjà indexé (${existingChunks.rows[0].cnt} chunks) - skip indexation`)
          break
        }
      }
      // Lance l'indexation (chunking + embeddings) avec retry
      try {
        await withRetry(async () => {
          const { indexKnowledgeDocument } = await import('@/lib/ai/knowledge-base-service')
          await indexKnowledgeDocument(doc.id)
        })
      } catch (error) {
        console.error(`[Pipeline] Erreur indexation doc ${doc.id} après retries:`, error)
        throw new Error(`Indexation échouée: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
      }
      break

    case 'quality_analyzed':
      // Skip si déjà analysé (score existant)
      if (doc.quality_score !== null) {
        console.log(`[Pipeline] Doc ${doc.id} déjà analysé (score: ${doc.quality_score}) - skip analyse qualité`)
        break
      }
      // Lance l'analyse qualité avec retry
      try {
        await withRetry(async () => {
          const { analyzeKBDocumentQuality } = await import('@/lib/ai/kb-quality-analyzer-service')
          await analyzeKBDocumentQuality(doc.id)
        })
      } catch (error) {
        console.error(`[Pipeline] Erreur analyse qualité doc ${doc.id} après retries:`, error)
        throw new Error(`Analyse qualité échouée: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
      }
      break

    case 'rag_active':
      // Approuver le document pour le RAG
      await db.query(
        `UPDATE knowledge_base SET
          is_approved = true,
          approved_at = NOW(),
          approved_by = $2
        WHERE id = $1`,
        [doc.id, userId]
      )
      break
  }
}

/**
 * Exécute un replay de l'étape courante
 */
async function executeReplay(doc: PipelineDocument, stage: PipelineStage): Promise<void> {
  switch (stage) {
    case 'crawled':
      // Re-crawl: find source page and re-fetch
      if (doc.metadata && typeof doc.metadata === 'object' && 'pageId' in doc.metadata) {
        const { indexWebPage } = await import('@/lib/web-scraper/web-indexer-service')
        await indexWebPage(doc.metadata.pageId as string)
      }
      break

    case 'classified':
      // Re-classify
      try {
        const { classify } = await import('@/lib/ai/unified-classification-service')
        const result = await classify({
          url: doc.source_file || '',
          textContent: (doc.full_text || '').substring(0, 2000),
        })
        if (result.primaryCategory) {
          await db.query(
            `UPDATE knowledge_base SET category = $2, updated_at = NOW() WHERE id = $1`,
            [doc.id, result.primaryCategory]
          )
        }
      } catch (error) {
        console.error(`[Pipeline] Erreur re-classification doc ${doc.id}:`, error)
      }
      break

    case 'indexed':
      // Re-index: delete chunks and re-generate
      await db.query('DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1', [doc.id])
      await db.query('UPDATE knowledge_base SET is_indexed = false WHERE id = $1', [doc.id])
      try {
        const { indexKnowledgeDocument } = await import('@/lib/ai/knowledge-base-service')
        await indexKnowledgeDocument(doc.id)
      } catch (error) {
        console.error(`[Pipeline] Erreur re-indexation doc ${doc.id}:`, error)
        throw error
      }
      break

    case 'quality_analyzed':
      // Re-analyze quality
      try {
        const { analyzeKBDocumentQuality } = await import('@/lib/ai/kb-quality-analyzer-service')
        await analyzeKBDocumentQuality(doc.id)
      } catch (error) {
        console.error(`[Pipeline] Erreur re-analyse qualité doc ${doc.id}:`, error)
        throw error
      }
      break
  }
}

/**
 * Effectue la transition DB + historique
 */
async function performTransition(
  docId: string,
  fromStage: PipelineStage | null,
  toStage: PipelineStage,
  action: PipelineAction,
  userId: string,
  notes?: string,
  changes?: Record<string, unknown>,
  qualityScore?: number | null
): Promise<void> {
  await db.query(
    `UPDATE knowledge_base SET
      pipeline_stage = $2,
      pipeline_stage_updated_at = NOW(),
      pipeline_notes = $3,
      updated_at = NOW()
    WHERE id = $1`,
    [docId, toStage, notes || null]
  )

  await logHistory(docId, fromStage, toStage, action, userId, notes, changes, qualityScore)
}

async function logHistory(
  docId: string,
  fromStage: PipelineStage | string | null,
  toStage: PipelineStage | string,
  action: PipelineAction,
  userId: string,
  notes?: string,
  changes?: Record<string, unknown>,
  qualityScore?: number | null
): Promise<void> {
  await db.query(
    `INSERT INTO document_pipeline_history
      (knowledge_base_id, from_stage, to_stage, action, performed_by, changes_made, notes, quality_score_at_transition)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      docId,
      fromStage,
      toStage,
      action,
      userId,
      JSON.stringify(changes || {}),
      notes || null,
      qualityScore ?? null,
    ]
  )
}

/**
 * Récupère l'historique pipeline d'un document
 */
export async function getDocumentHistory(docId: string): Promise<PipelineHistoryEntry[]> {
  const result = await db.query(
    `SELECT h.*, u.name as performer_name
    FROM document_pipeline_history h
    LEFT JOIN users u ON h.performed_by = u.id
    WHERE h.knowledge_base_id = $1
    ORDER BY h.created_at DESC`,
    [docId]
  )
  return result.rows
}

/**
 * Récupère le détail pipeline d'un document
 */
export async function getDocumentPipelineDetail(docId: string): Promise<{
  document: PipelineDocument
  history: PipelineHistoryEntry[]
  chunks: { count: number; providers: string[] }
  nextStage: PipelineStage | null
  validTransitions: PipelineStage[]
} | null> {
  const doc = await getDocumentForPipeline(docId)
  if (!doc) return null

  const history = await getDocumentHistory(docId)

  const chunksResult = await db.query(
    `SELECT COUNT(*) as cnt,
      ARRAY_AGG(DISTINCT CASE
        WHEN embedding_openai IS NOT NULL THEN 'openai'
        WHEN embedding IS NOT NULL THEN 'ollama'
        ELSE 'none'
      END) as providers
    FROM knowledge_base_chunks WHERE knowledge_base_id = $1`,
    [docId]
  )

  return {
    document: doc,
    history,
    chunks: {
      count: parseInt(chunksResult.rows[0]?.cnt || '0'),
      providers: chunksResult.rows[0]?.providers?.filter((p: string) => p !== 'none') || [],
    },
    nextStage: getNextStage(doc.pipeline_stage),
    validTransitions: VALID_TRANSITIONS[doc.pipeline_stage] || [],
  }
}

/**
 * Auto-avance un document si tous les quality gates sont remplis automatiquement.
 * Appelé après les actions automatiques (indexation, crawl, etc.)
 * Retourne les étapes traversées ou null si aucun avancement.
 */
export async function autoAdvanceIfEligible(
  docId: string,
  systemUserId: string = 'system'
): Promise<{ advanced: PipelineStage[]; stoppedAt: PipelineStage } | null> {
  const { canAutoAdvance } = await import('./pipeline-config')

  const doc = await getDocumentForPipeline(docId)
  if (!doc) return null

  const advanced: PipelineStage[] = []
  let current = doc

  // Avancer tant que possible (max 5 étapes pour éviter boucle infinie)
  for (let i = 0; i < 5; i++) {
    const nextStage = getNextStage(current.pipeline_stage)
    if (!nextStage) break

    // Compter les chunks pour le check
    const chunksResult = await db.query(
      'SELECT COUNT(*) as cnt FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
      [docId]
    )
    const chunksCount = parseInt(chunksResult.rows[0].cnt)

    if (!canAutoAdvance(current, nextStage, chunksCount)) break

    // Vérifier le quality gate standard
    const gateError = await checkQualityGate(current, nextStage)
    if (gateError) break

    // Exécuter les actions de l'étape
    try {
      await executeStageAction(current, nextStage, systemUserId)
    } catch {
      break // Arrêter si l'action échoue
    }

    // Effectuer la transition
    await performTransition(docId, current.pipeline_stage, nextStage, 'auto_advance', systemUserId, 'Auto-avancement', {}, current.quality_score)

    advanced.push(nextStage)

    // Re-lire le document pour la prochaine itération
    const updated = await getDocumentForPipeline(docId)
    if (!updated) break
    current = updated
  }

  if (advanced.length === 0) return null

  return { advanced, stoppedAt: current.pipeline_stage }
}
