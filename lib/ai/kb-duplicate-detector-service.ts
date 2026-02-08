/**
 * Service de détection de doublons et contradictions pour la base de connaissances
 *
 * Détecte les documents similaires via embeddings et analyse LLM les contradictions.
 */

import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { aiConfig } from './config'
import {
  CONTRADICTION_DETECTION_SYSTEM_PROMPT,
  CONTRADICTION_DETECTION_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from './prompts/legal-analysis'

// =============================================================================
// TYPES
// =============================================================================

export interface KBRelation {
  id: string
  sourceDocumentId: string
  targetDocumentId: string
  relationType: 'duplicate' | 'near_duplicate' | 'contradiction' | 'related'
  similarityScore: number
  contradictionType: string | null
  contradictionSeverity: 'low' | 'medium' | 'high' | 'critical' | null
  description: string | null
  sourceExcerpt: string | null
  targetExcerpt: string | null
  suggestedResolution: string | null
  status: 'pending' | 'confirmed' | 'dismissed' | 'resolved'
  createdAt: Date
}

export interface DuplicateCheckResult {
  duplicates: Array<{
    documentId: string
    title: string
    category: string
    similarity: number
    relationType: 'duplicate' | 'near_duplicate' | 'related'
  }>
  contradictions: KBRelation[]
}

interface SimilarDoc {
  id: string
  title: string
  category: string
  similarity: number
}

interface LLMResult {
  content: string
  provider: string
  model: string
}

// =============================================================================
// CLIENTS LLM
// =============================================================================

let ollamaClient: OpenAI | null = null
let deepseekClient: OpenAI | null = null
let groqClient: OpenAI | null = null

function getOllamaClient(): OpenAI {
  if (!ollamaClient) {
    ollamaClient = new OpenAI({ apiKey: 'ollama', baseURL: `${aiConfig.ollama.baseUrl}/v1`, timeout: 120000 })
  }
  return ollamaClient
}

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    if (!aiConfig.deepseek.apiKey) throw new Error('DEEPSEEK_API_KEY non configuré')
    deepseekClient = new OpenAI({ apiKey: aiConfig.deepseek.apiKey, baseURL: aiConfig.deepseek.baseUrl })
  }
  return deepseekClient
}

function getGroqClient(): OpenAI {
  if (!groqClient) {
    if (!aiConfig.groq.apiKey) throw new Error('GROQ_API_KEY non configuré')
    groqClient = new OpenAI({ apiKey: aiConfig.groq.apiKey, baseURL: aiConfig.groq.baseUrl })
  }
  return groqClient
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Détecte les doublons et contradictions pour un document
 */
export async function detectDuplicatesAndContradictions(documentId: string): Promise<DuplicateCheckResult> {
  // Trouver les documents similaires via embeddings
  const similarResult = await db.query(
    `SELECT * FROM find_similar_kb_documents($1, $2, $3)`,
    [documentId, 0.7, 10]
  )

  const similarDocs: SimilarDoc[] = similarResult.rows.map(row => ({
    id: row.id,
    title: row.title,
    category: row.category,
    similarity: parseFloat(row.similarity),
  }))

  const duplicates: DuplicateCheckResult['duplicates'] = []
  const contradictions: KBRelation[] = []

  for (const similar of similarDocs) {
    let relationType: 'duplicate' | 'near_duplicate' | 'related'

    if (similar.similarity >= 0.95) {
      relationType = 'duplicate'
    } else if (similar.similarity >= 0.85) {
      relationType = 'near_duplicate'
    } else {
      relationType = 'related'
    }

    duplicates.push({
      documentId: similar.id,
      title: similar.title,
      category: similar.category,
      similarity: similar.similarity,
      relationType,
    })

    // Enregistrer la relation
    await db.query(
      `INSERT INTO kb_document_relations
       (source_document_id, target_document_id, relation_type, similarity_score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source_document_id, target_document_id, relation_type) DO UPDATE SET
         similarity_score = EXCLUDED.similarity_score,
         updated_at = NOW()`,
      [documentId, similar.id, relationType, similar.similarity]
    )

    // Pour les candidats entre 0.7 et 0.85, analyser les contradictions
    if (similar.similarity >= 0.7 && similar.similarity < 0.85) {
      try {
        const contradictionResult = await analyzeContradiction(documentId, similar.id)
        if (contradictionResult) {
          contradictions.push(contradictionResult)
        }
      } catch (error) {
        console.error(`[KBDuplicates] Erreur analyse contradiction ${documentId} vs ${similar.id}:`, error)
      }
    }
  }

  return { duplicates, contradictions }
}

/**
 * Recherche synchrone de doublons SQL uniquement (rapide, pour retour immédiat à l'upload)
 */
export async function findQuickDuplicates(documentId: string): Promise<SimilarDoc[]> {
  const result = await db.query(
    `SELECT * FROM find_similar_kb_documents($1, $2, $3)`,
    [documentId, 0.85, 5]
  )

  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    category: row.category,
    similarity: parseFloat(row.similarity),
  }))
}

/**
 * Récupère les relations d'un document
 */
export async function getDocumentRelations(documentId: string): Promise<KBRelation[]> {
  const result = await db.query(
    `SELECT r.*, ks.title as source_title, kt.title as target_title
     FROM kb_document_relations r
     LEFT JOIN knowledge_base ks ON r.source_document_id = ks.id
     LEFT JOIN knowledge_base kt ON r.target_document_id = kt.id
     WHERE r.source_document_id = $1 OR r.target_document_id = $1
     ORDER BY r.similarity_score DESC`,
    [documentId]
  )

  return result.rows.map(mapRowToRelation)
}

/**
 * Met à jour le statut d'une relation
 */
export async function updateRelationStatus(
  relationId: string,
  status: 'confirmed' | 'dismissed' | 'resolved',
  reviewedBy: string,
  notes?: string
): Promise<void> {
  await db.query(
    `UPDATE kb_document_relations
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), resolution_notes = $3, updated_at = NOW()
     WHERE id = $4`,
    [status, reviewedBy, notes || null, relationId]
  )
}

// =============================================================================
// ANALYSE CONTRADICTION
// =============================================================================

async function analyzeContradiction(sourceId: string, targetId: string): Promise<KBRelation | null> {
  // Récupérer les deux documents
  const docsResult = await db.query(
    `SELECT id, title, category, full_text, created_at FROM knowledge_base WHERE id IN ($1, $2)`,
    [sourceId, targetId]
  )

  if (docsResult.rows.length < 2) return null

  const sourceDoc = docsResult.rows.find((r: Record<string, unknown>) => r.id === sourceId)
  const targetDoc = docsResult.rows.find((r: Record<string, unknown>) => r.id === targetId)
  if (!sourceDoc || !targetDoc) return null

  const userPrompt = formatPrompt(CONTRADICTION_DETECTION_USER_PROMPT, {
    source_url: `kb://${sourceId}`,
    source_title: sourceDoc.title,
    source_date: sourceDoc.created_at ? new Date(sourceDoc.created_at).toISOString().split('T')[0] : 'Inconnue',
    source_content: truncateContent(sourceDoc.full_text || '', 3000),
    target_url: `kb://${targetId}`,
    target_title: targetDoc.title,
    target_date: targetDoc.created_at ? new Date(targetDoc.created_at).toISOString().split('T')[0] : 'Inconnue',
    target_content: truncateContent(targetDoc.full_text || '', 3000),
  })

  const llmResult = await callLLMWithFallback(CONTRADICTION_DETECTION_SYSTEM_PROMPT, userPrompt)
  const parsed = parseContradictionResponse(llmResult.content)

  if (!parsed.has_contradiction || !parsed.contradictions?.length) return null

  const c = parsed.contradictions[0]

  // Enregistrer la contradiction
  const insertResult = await db.query(
    `INSERT INTO kb_document_relations
     (source_document_id, target_document_id, relation_type, similarity_score,
      contradiction_type, contradiction_severity, description, source_excerpt,
      target_excerpt, suggested_resolution)
     VALUES ($1, $2, 'contradiction', $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (source_document_id, target_document_id, relation_type) DO UPDATE SET
       contradiction_type = EXCLUDED.contradiction_type,
       contradiction_severity = EXCLUDED.contradiction_severity,
       description = EXCLUDED.description,
       source_excerpt = EXCLUDED.source_excerpt,
       target_excerpt = EXCLUDED.target_excerpt,
       suggested_resolution = EXCLUDED.suggested_resolution,
       updated_at = NOW()
     RETURNING *`,
    [
      sourceId, targetId,
      parsed.similarity_score || 0.75,
      c.contradiction_type,
      c.severity,
      c.description,
      c.source_excerpt,
      c.target_excerpt,
      c.suggested_resolution,
    ]
  )

  return mapRowToRelation(insertResult.rows[0])
}

// =============================================================================
// HELPERS
// =============================================================================

async function callLLMWithFallback(systemPrompt: string, userPrompt: string): Promise<LLMResult> {
  const errors: string[] = []

  if (aiConfig.ollama.enabled) {
    try {
      const client = getOllamaClient()
      const response = await client.chat.completions.create({
        model: aiConfig.ollama.chatModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      })
      return { content: response.choices[0]?.message?.content || '', provider: 'ollama', model: aiConfig.ollama.chatModel }
    } catch (error) {
      errors.push(`Ollama: ${error instanceof Error ? error.message : 'Erreur'}`)
    }
  }

  if (aiConfig.deepseek.apiKey) {
    try {
      const client = getDeepSeekClient()
      const response = await client.chat.completions.create({
        model: aiConfig.deepseek.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      })
      return { content: response.choices[0]?.message?.content || '', provider: 'deepseek', model: aiConfig.deepseek.model }
    } catch (error) {
      errors.push(`DeepSeek: ${error instanceof Error ? error.message : 'Erreur'}`)
    }
  }

  if (aiConfig.groq.apiKey) {
    try {
      const client = getGroqClient()
      const response = await client.chat.completions.create({
        model: aiConfig.groq.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      })
      return { content: response.choices[0]?.message?.content || '', provider: 'groq', model: aiConfig.groq.model }
    } catch (error) {
      errors.push(`Groq: ${error instanceof Error ? error.message : 'Erreur'}`)
    }
  }

  throw new Error(`Aucun LLM disponible. Erreurs: ${errors.join('; ')}`)
}

function parseContradictionResponse(content: string) {
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { has_contradiction: false, contradictions: [], similarity_score: 0, overall_severity: 'none', analysis_notes: '' }
  }
  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return { has_contradiction: false, contradictions: [], similarity_score: 0, overall_severity: 'none', analysis_notes: '' }
  }
}

function mapRowToRelation(row: Record<string, unknown>): KBRelation {
  return {
    id: row.id as string,
    sourceDocumentId: row.source_document_id as string,
    targetDocumentId: row.target_document_id as string,
    relationType: row.relation_type as KBRelation['relationType'],
    similarityScore: parseFloat(row.similarity_score as string) || 0,
    contradictionType: row.contradiction_type as string | null,
    contradictionSeverity: row.contradiction_severity as KBRelation['contradictionSeverity'],
    description: row.description as string | null,
    sourceExcerpt: row.source_excerpt as string | null,
    targetExcerpt: row.target_excerpt as string | null,
    suggestedResolution: row.suggested_resolution as string | null,
    status: row.status as KBRelation['status'],
    createdAt: new Date(row.created_at as string),
  }
}
