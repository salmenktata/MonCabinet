/**
 * Service KB Quality Analysis — Mode Batch Ollama (séquentiel)
 *
 * Remplace l'ancien mode Groq Batch API par des appels séquentiels
 * via callLLMWithFallback (route vers Ollama local, gratuit).
 *
 * Flow :
 *   submitKBQualityBatch()         → sélectionne docs → traite séquentiellement via Ollama
 *   checkAndProcessPendingBatches() → vérifie les jobs en DB (rétrocompatibilité polling)
 */

import { db } from '@/lib/db/postgres'
import {
  KB_QUALITY_ANALYSIS_SYSTEM_PROMPT,
  KB_QUALITY_ANALYSIS_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from '@/lib/ai/prompts/legal-analysis'
import { parseKBQualityResponse } from '@/lib/ai/kb-quality-analyzer-service'
import {
  callLLMWithFallback,
  type LLMMessage,
} from '@/lib/ai/llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

export interface KBBatchSubmitOptions {
  /** Nombre max de documents à inclure dans le batch (défaut: 500) */
  batchSize?: number
  /** Filtrer par catégorie */
  category?: string
  /** Si true, ignore les docs déjà analysés (défaut: true) */
  skipAnalyzed?: boolean
  /** Si true, inclut les docs avec score = 50 (échecs précédents) */
  includeFailedScores?: boolean
}

export interface KBBatchSubmitResult {
  success: boolean
  batchJobId: string
  groqBatchId: string
  totalDocuments: number
  message: string
}

export interface KBBatchProcessResult {
  batchJobId: string
  groqBatchId: string
  status: string
  processed?: number
  succeeded?: number
  failed?: number
  message: string
}

// =============================================================================
// SOUMISSION ET TRAITEMENT D'UN BATCH (séquentiel via Ollama)
// =============================================================================

/**
 * Sélectionne des documents KB et les analyse séquentiellement via Ollama.
 * Remplace l'ancien flow Groq Batch API (upload JSONL → poll → download).
 */
export async function submitKBQualityBatch(
  options: KBBatchSubmitOptions = {}
): Promise<KBBatchSubmitResult> {
  const {
    batchSize = 500,
    category = null,
    skipAnalyzed = true,
    includeFailedScores = false,
  } = options

  // 1. Sélectionner les documents à analyser
  const params: unknown[] = []
  let paramIdx = 1
  let whereClause = 'WHERE is_active = true AND (full_text IS NOT NULL AND length(full_text) >= 100)'

  if (category) {
    whereClause += ` AND category = $${paramIdx++}`
    params.push(category)
  }

  if (skipAnalyzed) {
    if (includeFailedScores) {
      whereClause += ` AND (quality_score IS NULL OR quality_score = 50)`
    } else {
      whereClause += ` AND quality_score IS NULL`
    }
  }

  params.push(batchSize)
  const query = `
    SELECT id, title, category, language, description, tags, full_text
    FROM knowledge_base
    ${whereClause}
    ORDER BY quality_assessed_at ASC NULLS FIRST
    LIMIT $${paramIdx}
  `

  const docsResult = await db.query<{
    id: string
    title: string
    category: string
    language: string
    description: string | null
    tags: string[] | null
    full_text: string
  }>(query, params)

  const docs = docsResult.rows

  if (docs.length === 0) {
    throw new Error('Aucun document à analyser avec les critères fournis')
  }

  console.log(`[KB Batch] ${docs.length} documents sélectionnés pour analyse séquentielle (Ollama)`)

  // 2. Créer un job en DB pour tracking
  const documentIds = docs.map(d => d.id)
  const insertResult = await db.query<{ id: string }>(
    `INSERT INTO groq_batch_jobs
       (groq_batch_id, groq_file_id, operation, document_ids, status, total_requests)
     VALUES ($1, $2, 'kb-quality-analysis', $3, $4, $5)
     RETURNING id`,
    [
      `ollama-batch-${Date.now()}`,
      'local',
      JSON.stringify(documentIds),
      'in_progress',
      docs.length,
    ]
  )

  const batchJobId = insertResult.rows[0].id
  console.log(`[KB Batch] Job créé en DB: ${batchJobId} → traitement séquentiel Ollama`)

  // 3. Traiter les documents séquentiellement
  const safeRound = (val: unknown): number =>
    Math.round(parseFloat(String(val || 0)))

  let succeeded = 0
  let failed = 0

  for (const doc of docs) {
    try {
      const userPrompt = formatPrompt(KB_QUALITY_ANALYSIS_USER_PROMPT, {
        title: doc.title || 'Sans titre',
        category: doc.category || 'autre',
        language: doc.language || 'ar',
        description: doc.description || 'Aucune description',
        tags: (doc.tags || []).join(', ') || 'Aucun tag',
        content: truncateContent(doc.full_text, 12000),
      })

      const messages: LLMMessage[] = [
        { role: 'system', content: KB_QUALITY_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ]

      const llmResult = await callLLMWithFallback(messages, {
        temperature: 0.1,
        maxTokens: 8000,
        operationName: 'kb-quality-analysis',
      })

      const parsed = parseKBQualityResponse(llmResult.answer)

      await db.query(
        `UPDATE knowledge_base SET
          quality_score = $1,
          quality_clarity = $2,
          quality_structure = $3,
          quality_completeness = $4,
          quality_reliability = $5,
          quality_analysis_summary = $6,
          quality_detected_issues = $7,
          quality_recommendations = $8,
          quality_requires_review = $9,
          quality_assessed_at = NOW(),
          quality_llm_provider = $10,
          quality_llm_model = $11,
          updated_at = NOW()
        WHERE id = $12`,
        [
          safeRound(parsed.overall_score),
          safeRound(parsed.clarity_score),
          safeRound(parsed.structure_score),
          safeRound(parsed.completeness_score),
          safeRound(parsed.reliability_score),
          parsed.analysis_summary,
          JSON.stringify(parsed.detected_issues || []),
          JSON.stringify(parsed.recommendations || []),
          parsed.requires_review || parsed.overall_score < 60,
          llmResult.provider,
          llmResult.modelUsed,
          doc.id,
        ]
      )

      succeeded++
      if (succeeded % 10 === 0) {
        console.log(`[KB Batch] Progression: ${succeeded}/${docs.length} analysés`)
      }
    } catch (error) {
      console.error(`[KB Batch] Erreur analyse doc ${doc.id}:`, error instanceof Error ? error.message : error)
      failed++
    }
  }

  // 4. Marquer le job comme complété
  await db.query(
    `UPDATE groq_batch_jobs SET
       status = 'completed',
       completed_at = NOW(),
       completed_requests = $1,
       failed_requests = $2
     WHERE id = $3`,
    [succeeded, failed, batchJobId]
  )

  console.log(`[KB Batch] Batch ${batchJobId} terminé: ${succeeded} OK, ${failed} échecs`)

  return {
    success: true,
    batchJobId,
    groqBatchId: `ollama-batch-${Date.now()}`,
    totalDocuments: docs.length,
    message: `Batch traité : ${succeeded} scores sauvegardés, ${failed} échecs (Ollama séquentiel)`,
  }
}

// =============================================================================
// POLLING (rétrocompatibilité — les nouveaux batches sont synchrones)
// =============================================================================

/**
 * Vérifie le statut d'un batch job en DB.
 * Les nouveaux batches Ollama sont synchrones, donc cette fonction
 * retourne simplement le statut stocké en DB.
 */
export async function checkAndProcessBatch(batchJobId: string): Promise<KBBatchProcessResult> {
  const jobResult = await db.query<{
    id: string
    groq_batch_id: string
    status: string
    completed_requests: number
    failed_requests: number
  }>(
    `SELECT id, groq_batch_id, status, completed_requests, failed_requests FROM groq_batch_jobs WHERE id = $1`,
    [batchJobId]
  )

  if (jobResult.rows.length === 0) {
    throw new Error(`Job batch non trouvé: ${batchJobId}`)
  }

  const job = jobResult.rows[0]

  return {
    batchJobId,
    groqBatchId: job.groq_batch_id,
    status: job.status,
    succeeded: job.completed_requests,
    failed: job.failed_requests,
    message: job.status === 'completed'
      ? `Batch terminé : ${job.completed_requests} OK, ${job.failed_requests} échecs`
      : `Statut: ${job.status}`,
  }
}

/**
 * Vérifie tous les batches en attente (rétrocompatibilité).
 */
export async function checkAndProcessAllPendingBatches(): Promise<KBBatchProcessResult[]> {
  const pendingResult = await db.query<{ id: string }>(
    `SELECT id FROM groq_batch_jobs
     WHERE status IN ('submitted', 'validating', 'in_progress', 'finalizing')
     ORDER BY created_at ASC`
  )

  if (pendingResult.rows.length === 0) {
    console.log('[KB Batch] Aucun batch en attente')
    return []
  }

  const results: KBBatchProcessResult[] = []
  for (const row of pendingResult.rows) {
    try {
      const result = await checkAndProcessBatch(row.id)
      results.push(result)
    } catch (error) {
      console.error(`[KB Batch] Erreur traitement batch ${row.id}:`, error)
      results.push({
        batchJobId: row.id,
        groqBatchId: '',
        status: 'error',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      })
    }
  }

  return results
}
