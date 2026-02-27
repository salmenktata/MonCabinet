/**
 * Service de génération automatique de Silver test cases
 *
 * Crée des cas de test "Silver" depuis les requêtes prod ayant reçu
 * un feedback positif et une similarité élevée.
 *
 * Silver ≠ Gold :
 * - Gold  = expert-validé, annotations manuelles précises, goldChunkIds certifiés
 * - Silver = auto-généré depuis trafic réel, key points par LLM, validation avocat recommandée
 *
 * Pipeline :
 * 1. Sélection : rag_query_log WHERE user_feedback='positive' AND avg_similarity>0.50
 * 2. Extraction : LLM extrait les key points depuis la réponse réelle
 * 3. Stockage  : rag_silver_dataset avec statut 'draft'
 * 4. Validation: avocat → status 'validated' → éligible pour eval benchmark
 *
 * @module lib/ai/silver-dataset-service
 */

import { db } from '@/lib/db/postgres'
import { callLLMWithFallback } from './llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

export interface SilverCase {
  id: string
  domain: string | null
  question: string
  actualAnswer: string | null
  keyPoints: string[]
  goldChunkIds: string[]
  avgSimilarity: number | null
  status: 'draft' | 'validated' | 'rejected'
  createdAt: string
}

export interface GenerateSilverOptions {
  domain?: string
  daysBack?: number
  limit?: number
  minAvgSimilarity?: number
}

export interface GenerateSilverResult {
  generated: number
  skipped: number       // Déjà existants dans silver_dataset
  errors: number
  cases: SilverCase[]
}

// =============================================================================
// GÉNÉRATION
// =============================================================================

/**
 * Génère des Silver cases depuis les query logs avec feedback positif.
 * Retourne les cas créés (statut 'draft').
 */
export async function generateSilverCasesFromLogs(
  opts: GenerateSilverOptions = {}
): Promise<GenerateSilverResult> {
  const {
    domain,
    daysBack = 30,
    limit = 20,
    minAvgSimilarity = 0.50,
  } = opts

  // Récupérer les candidats depuis rag_query_log
  const candidateQuery = domain
    ? `SELECT ql.id, ql.conversation_id, ql.question, ql.domain, ql.avg_similarity,
              ql.retrieved_chunk_ids, cm.content as actual_answer
       FROM rag_query_log ql
       LEFT JOIN chat_conversations cc ON cc.id = ql.conversation_id
       LEFT JOIN chat_messages cm ON cm.conversation_id = cc.id AND cm.role = 'assistant'
       WHERE ql.user_feedback = 'positive'
         AND ql.avg_similarity >= $1
         AND ql.domain = $2
         AND ql.created_at >= NOW() - ($3 || ' days')::INTERVAL
         AND ql.abstention_reason IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM rag_silver_dataset sd
           WHERE sd.source_query_log_id = ql.id
         )
       ORDER BY ql.avg_similarity DESC
       LIMIT $4`
    : `SELECT ql.id, ql.conversation_id, ql.question, ql.domain, ql.avg_similarity,
              ql.retrieved_chunk_ids, cm.content as actual_answer
       FROM rag_query_log ql
       LEFT JOIN chat_conversations cc ON cc.id = ql.conversation_id
       LEFT JOIN chat_messages cm ON cm.conversation_id = cc.id AND cm.role = 'assistant'
       WHERE ql.user_feedback = 'positive'
         AND ql.avg_similarity >= $1
         AND ql.created_at >= NOW() - ($2 || ' days')::INTERVAL
         AND ql.abstention_reason IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM rag_silver_dataset sd
           WHERE sd.source_query_log_id = ql.id
         )
       ORDER BY ql.avg_similarity DESC
       LIMIT $3`

  const candidateParams = domain
    ? [minAvgSimilarity, domain, daysBack, limit]
    : [minAvgSimilarity, daysBack, limit]

  const candidates = await db.query(candidateQuery, candidateParams)

  const result: GenerateSilverResult = {
    generated: 0,
    skipped: 0,
    errors: 0,
    cases: [],
  }

  for (const row of candidates.rows) {
    if (!row.actual_answer || row.actual_answer.trim().length < 50) {
      result.skipped++
      continue
    }

    try {
      // Extraire les key points via LLM
      const keyPoints = await extractKeyPoints(row.question, row.actual_answer)

      if (keyPoints.length === 0) {
        result.skipped++
        continue
      }

      // Insérer dans rag_silver_dataset
      const insertResult = await db.query(
        `INSERT INTO rag_silver_dataset (
          source_query_log_id, domain, difficulty, question, actual_answer,
          key_points, gold_chunk_ids, avg_similarity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
        RETURNING id, created_at`,
        [
          row.id,
          row.domain || null,
          guessDifficulty(row.question),
          row.question,
          row.actual_answer.substring(0, 5000),
          keyPoints,
          row.retrieved_chunk_ids || [],
          row.avg_similarity,
        ]
      )

      result.generated++
      result.cases.push({
        id: insertResult.rows[0].id,
        domain: row.domain,
        question: row.question,
        actualAnswer: row.actual_answer,
        keyPoints,
        goldChunkIds: row.retrieved_chunk_ids || [],
        avgSimilarity: row.avg_similarity,
        status: 'draft',
        createdAt: insertResult.rows[0].created_at,
      })
    } catch (err) {
      console.error('[Silver] Erreur génération case:', err instanceof Error ? err.message : err)
      result.errors++
    }
  }

  return result
}

// =============================================================================
// EXTRACTION KEY POINTS VIA LLM
// =============================================================================

async function extractKeyPoints(question: string, answer: string): Promise<string[]> {
  const prompt = `Tu es un expert juridique tunisien. Extrais les points clés de cette réponse RAG.

Question : ${question.substring(0, 300)}

Réponse : ${answer.substring(0, 1500)}

Extrais 3 à 6 points clés factuels et vérifiables de cette réponse.
Chaque point doit être une affirmation courte (1-2 phrases max).
Ne répète pas la question. Sois précis et factuel.

Réponds UNIQUEMENT avec un JSON array de strings :
["point 1", "point 2", "point 3"]`

  try {
    const response = await callLLMWithFallback(
      [{ role: 'user', content: prompt }],
      {
        operationName: 'rag-eval-judge',
        temperature: 0.1,
        maxTokens: 400,
      }
    )

    const text = response.answer.trim()

    // Parser le JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 10)
      .slice(0, 6)
  } catch {
    return []
  }
}

/**
 * Heuristique simple pour estimer la difficulté d'une question.
 */
function guessDifficulty(question: string): 'easy' | 'medium' | 'hard' {
  const len = question.length
  const hasComparison = /compar|différence|entre.*et|vs\.?/i.test(question)
  const hasProcedure = /comment|procédure|étape|délai|tribunal/i.test(question)
  const hasException = /exception|sauf|mais|cependant|toutefois/i.test(question)

  if (len < 60 && !hasComparison && !hasProcedure) return 'easy'
  if (hasComparison || hasException || len > 200) return 'hard'
  return 'medium'
}

// =============================================================================
// STATISTIQUES
// =============================================================================

export interface SilverStats {
  total: number
  byStatus: { draft: number; validated: number; rejected: number }
  byDomain: Array<{ domain: string; count: number }>
  readyForBenchmark: number   // validated cases
}

export async function getSilverStats(): Promise<SilverStats> {
  try {
    const [statsResult, domainResult] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
           COUNT(*) FILTER (WHERE status = 'validated') as validated_count,
           COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count
         FROM rag_silver_dataset`
      ),
      db.query(
        `SELECT COALESCE(domain, 'unknown') as domain, COUNT(*) as count
         FROM rag_silver_dataset
         WHERE status != 'rejected'
         GROUP BY domain ORDER BY count DESC LIMIT 10`
      ),
    ])

    const s = statsResult.rows[0]
    return {
      total: parseInt(s.total) || 0,
      byStatus: {
        draft: parseInt(s.draft_count) || 0,
        validated: parseInt(s.validated_count) || 0,
        rejected: parseInt(s.rejected_count) || 0,
      },
      byDomain: domainResult.rows.map(r => ({
        domain: r.domain,
        count: parseInt(r.count) || 0,
      })),
      readyForBenchmark: parseInt(s.validated_count) || 0,
    }
  } catch {
    return {
      total: 0,
      byStatus: { draft: 0, validated: 0, rejected: 0 },
      byDomain: [],
      readyForBenchmark: 0,
    }
  }
}

/**
 * Récupère les Silver cases pour revue ou export.
 */
export async function getSilverCases(opts: {
  status?: 'draft' | 'validated' | 'rejected'
  domain?: string
  limit?: number
  offset?: number
} = {}): Promise<SilverCase[]> {
  const { status, domain, limit = 50, offset = 0 } = opts

  const conditions: string[] = []
  const params: unknown[] = []

  if (status) {
    conditions.push(`status = $${params.length + 1}`)
    params.push(status)
  }
  if (domain) {
    conditions.push(`domain = $${params.length + 1}`)
    params.push(domain)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)

  const result = await db.query(
    `SELECT id, domain, question, actual_answer, key_points,
            gold_chunk_ids, avg_similarity, status, created_at
     FROM rag_silver_dataset
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )

  return result.rows.map(r => ({
    id: r.id,
    domain: r.domain,
    question: r.question,
    actualAnswer: r.actual_answer,
    keyPoints: r.key_points || [],
    goldChunkIds: r.gold_chunk_ids || [],
    avgSimilarity: r.avg_similarity,
    status: r.status,
    createdAt: r.created_at,
  }))
}
