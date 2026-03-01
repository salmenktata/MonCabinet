/**
 * Service de gestion du Gold Eval Dataset
 *
 * Fournit les opérations CRUD sur la table rag_gold_dataset et un fallback
 * vers le fichier JSON statique pour la compatibilité avec l'existant.
 *
 * @module lib/ai/gold-dataset-service
 */

import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db/postgres'
import type { GoldEvalCase } from './rag-eval-types'

// =============================================================================
// TYPES INTERNES
// =============================================================================

export interface GoldDatasetStats {
  total: number
  byDomain: Record<string, number>
  byDifficulty: Record<string, number>
  byIntentType: Record<string, number>
}

export interface GoldDatasetFilters {
  domain?: string
  difficulty?: string
  intentType?: string
  search?: string
  limit?: number
  offset?: number
}

// =============================================================================
// LECTURE
// =============================================================================

/**
 * Charge le dataset gold depuis la DB, avec fallback vers le JSON si vide.
 * Utilisé par le runner d'évaluation.
 */
export async function loadGoldDatasetFromDB(): Promise<GoldEvalCase[]> {
  try {
    const result = await db.query<{
      id: string
      domain: string
      difficulty: string
      question: string
      intent_type: string
      key_points: string[]
      mandatory_citations: string[]
      expected_articles: string[]
      gold_chunk_ids: string[]
      gold_document_ids: string[]
      min_recall_at_5: number | null
      eval_criteria: Record<string, number> | null
      expert_validation: Record<string, unknown> | null
    }>(
      `SELECT id, domain, difficulty, question, intent_type,
              key_points, mandatory_citations, expected_articles,
              gold_chunk_ids, gold_document_ids,
              min_recall_at_5, eval_criteria, expert_validation
       FROM rag_gold_dataset
       ORDER BY domain, difficulty, id`
    )

    if (result.rows.length === 0) {
      console.warn('[GoldDataset] Table vide, fallback vers JSON statique')
      return loadGoldDatasetFromJSON()
    }

    return result.rows.map(rowToGoldEvalCase)
  } catch (err) {
    console.error('[GoldDataset] Erreur DB, fallback JSON:', err)
    return loadGoldDatasetFromJSON()
  }
}

/**
 * Fallback : charge depuis data/gold-eval-dataset.json
 */
function loadGoldDatasetFromJSON(): GoldEvalCase[] {
  const filePath = path.join(process.cwd(), 'data', 'gold-eval-dataset.json')
  if (!fs.existsSync(filePath)) return []
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as GoldEvalCase[]
}

/**
 * Liste avec filtres (pour l'UI admin).
 */
export async function listGoldCases(filters: GoldDatasetFilters = {}): Promise<GoldEvalCase[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  let idx = 1

  if (filters.domain) {
    conditions.push(`domain = $${idx++}`)
    params.push(filters.domain)
  }
  if (filters.difficulty) {
    conditions.push(`difficulty = $${idx++}`)
    params.push(filters.difficulty)
  }
  if (filters.intentType) {
    conditions.push(`intent_type = $${idx++}`)
    params.push(filters.intentType)
  }
  if (filters.search) {
    conditions.push(`(question ILIKE $${idx} OR id ILIKE $${idx})`)
    params.push(`%${filters.search}%`)
    idx++
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0

  const result = await db.query<{
    id: string
    domain: string
    difficulty: string
    question: string
    intent_type: string
    key_points: string[]
    mandatory_citations: string[]
    expected_articles: string[]
    gold_chunk_ids: string[]
    gold_document_ids: string[]
    min_recall_at_5: number | null
    eval_criteria: Record<string, number> | null
    expert_validation: Record<string, unknown> | null
  }>(
    `SELECT id, domain, difficulty, question, intent_type,
            key_points, mandatory_citations, expected_articles,
            gold_chunk_ids, gold_document_ids,
            min_recall_at_5, eval_criteria, expert_validation
     FROM rag_gold_dataset
     ${where}
     ORDER BY domain, difficulty, id
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  )

  return result.rows.map(rowToGoldEvalCase)
}

/**
 * Stats agrégées.
 */
export async function getGoldDatasetStats(): Promise<GoldDatasetStats> {
  const [totalRes, domainRes, difficultyRes, intentRes] = await Promise.all([
    db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM rag_gold_dataset'),
    db.query<{ domain: string; count: string }>(
      'SELECT domain, COUNT(*)::text AS count FROM rag_gold_dataset GROUP BY domain ORDER BY domain'
    ),
    db.query<{ difficulty: string; count: string }>(
      'SELECT difficulty, COUNT(*)::text AS count FROM rag_gold_dataset GROUP BY difficulty ORDER BY difficulty'
    ),
    db.query<{ intent_type: string; count: string }>(
      'SELECT intent_type, COUNT(*)::text AS count FROM rag_gold_dataset GROUP BY intent_type ORDER BY intent_type'
    ),
  ])

  return {
    total: parseInt(totalRes.rows[0]?.count ?? '0'),
    byDomain: Object.fromEntries(domainRes.rows.map((r: { domain: string; count: string }) => [r.domain, parseInt(r.count)])),
    byDifficulty: Object.fromEntries(difficultyRes.rows.map((r: { difficulty: string; count: string }) => [r.difficulty, parseInt(r.count)])),
    byIntentType: Object.fromEntries(intentRes.rows.map((r: { intent_type: string; count: string }) => [r.intent_type, parseInt(r.count)])),
  }
}

/**
 * Récupère une question par son id.
 */
export async function getGoldCase(id: string): Promise<GoldEvalCase | null> {
  const result = await db.query<{
    id: string
    domain: string
    difficulty: string
    question: string
    intent_type: string
    key_points: string[]
    mandatory_citations: string[]
    expected_articles: string[]
    gold_chunk_ids: string[]
    gold_document_ids: string[]
    min_recall_at_5: number | null
    eval_criteria: Record<string, number> | null
    expert_validation: Record<string, unknown> | null
  }>(
    `SELECT id, domain, difficulty, question, intent_type,
            key_points, mandatory_citations, expected_articles,
            gold_chunk_ids, gold_document_ids,
            min_recall_at_5, eval_criteria, expert_validation
     FROM rag_gold_dataset WHERE id = $1`,
    [id]
  )
  return result.rows[0] ? rowToGoldEvalCase(result.rows[0]) : null
}

// =============================================================================
// ÉCRITURE
// =============================================================================

export interface GoldCaseInput {
  id?: string
  domain: string
  difficulty: string
  question: string
  intentType: string
  keyPoints: string[]
  mandatoryCitations: string[]
  expectedArticles?: string[]
  goldChunkIds?: string[]
  goldDocumentIds?: string[]
  minRecallAt5?: number | null
  evaluationCriteria?: { completeness: number; accuracy: number; citations: number; reasoning: number } | null
  notes?: string | null
}

/**
 * Crée une nouvelle question gold.
 * L'id est auto-généré si absent (slug depuis domaine+horodatage).
 */
export async function createGoldCase(input: GoldCaseInput): Promise<GoldEvalCase> {
  const id = input.id ?? generateGoldId(input.domain)

  await db.query(
    `INSERT INTO rag_gold_dataset (
      id, domain, difficulty, question, intent_type,
      key_points, mandatory_citations, expected_articles,
      gold_chunk_ids, gold_document_ids,
      min_recall_at_5, eval_criteria, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      input.domain,
      input.difficulty,
      input.question,
      input.intentType,
      input.keyPoints,
      input.mandatoryCitations,
      input.expectedArticles ?? [],
      input.goldChunkIds ?? [],
      input.goldDocumentIds ?? [],
      input.minRecallAt5 ?? null,
      input.evaluationCriteria ? JSON.stringify(input.evaluationCriteria) : null,
      input.notes ?? null,
    ]
  )

  return (await getGoldCase(id))!
}

/**
 * Met à jour une question gold existante (champs partiels).
 */
export async function updateGoldCase(id: string, input: Partial<GoldCaseInput>): Promise<GoldEvalCase | null> {
  const setClauses: string[] = []
  const params: unknown[] = []
  let idx = 1

  const fieldMap: Record<keyof Partial<GoldCaseInput>, string> = {
    domain: 'domain',
    difficulty: 'difficulty',
    question: 'question',
    intentType: 'intent_type',
    keyPoints: 'key_points',
    mandatoryCitations: 'mandatory_citations',
    expectedArticles: 'expected_articles',
    goldChunkIds: 'gold_chunk_ids',
    goldDocumentIds: 'gold_document_ids',
    minRecallAt5: 'min_recall_at_5',
    evaluationCriteria: 'eval_criteria',
    notes: 'notes',
    id: 'id',
  }

  for (const [key, col] of Object.entries(fieldMap)) {
    if (key === 'id') continue
    const value = input[key as keyof Partial<GoldCaseInput>]
    if (value === undefined) continue
    setClauses.push(`${col} = $${idx++}`)
    if (key === 'evaluationCriteria' && value !== null) {
      params.push(JSON.stringify(value))
    } else {
      params.push(value)
    }
  }

  if (setClauses.length === 0) return getGoldCase(id)

  params.push(id)
  await db.query(
    `UPDATE rag_gold_dataset SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    params
  )

  return getGoldCase(id)
}

/**
 * Supprime une question gold.
 */
export async function deleteGoldCase(id: string): Promise<boolean> {
  const result = await db.query('DELETE FROM rag_gold_dataset WHERE id = $1 RETURNING id', [id])
  return (result.rowCount ?? 0) > 0
}

/**
 * Exporte tout le dataset au format GoldEvalCase[] (compatible JSON).
 */
export async function exportGoldDataset(): Promise<GoldEvalCase[]> {
  return loadGoldDatasetFromDB()
}

// =============================================================================
// HELPERS
// =============================================================================

function rowToGoldEvalCase(row: {
  id: string
  domain: string
  difficulty: string
  question: string
  intent_type: string
  key_points: string[]
  mandatory_citations: string[]
  expected_articles: string[]
  gold_chunk_ids: string[]
  gold_document_ids: string[]
  min_recall_at_5: number | null
  eval_criteria: Record<string, number> | null
  expert_validation: Record<string, unknown> | null
}): GoldEvalCase {
  return {
    id: row.id,
    domain: row.domain,
    difficulty: row.difficulty,
    question: row.question,
    intentType: row.intent_type,
    expectedAnswer: {
      keyPoints: row.key_points ?? [],
      mandatoryCitations: row.mandatory_citations ?? [],
    },
    expectedArticles: row.expected_articles ?? [],
    goldChunkIds: row.gold_chunk_ids ?? [],
    goldDocumentIds: row.gold_document_ids ?? [],
    minRecallAt5: row.min_recall_at_5 ?? undefined,
    evaluationCriteria: row.eval_criteria
      ? {
          completeness: row.eval_criteria.completeness ?? 0,
          accuracy: row.eval_criteria.accuracy ?? 0,
          citations: row.eval_criteria.citations ?? 0,
          reasoning: row.eval_criteria.reasoning ?? 0,
        }
      : undefined,
    expertValidation: row.expert_validation as GoldEvalCase['expertValidation'] ?? undefined,
  }
}

function generateGoldId(domain: string): string {
  const domainSlug = domain.replace('droit_', '').replace('_', '-')
  const ts = Date.now().toString(36)
  return `${domainSlug}_${ts}`
}
