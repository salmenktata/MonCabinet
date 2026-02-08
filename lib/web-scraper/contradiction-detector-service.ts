/**
 * Service de détection des contradictions entre contenus juridiques
 *
 * Détecte les conflits entre sources:
 * - Versions différentes d'un texte
 * - Interprétations contradictoires
 * - Textes abrogés/modifiés
 * - Incohérences de dates
 */

import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { aiConfig } from '@/lib/ai/config'
import {
  CONTRADICTION_DETECTION_SYSTEM_PROMPT,
  CONTRADICTION_DETECTION_USER_PROMPT,
  SIMILARITY_ANALYSIS_SYSTEM_PROMPT,
  SIMILARITY_ANALYSIS_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from '@/lib/ai/prompts/legal-analysis'
import {
  generateEmbedding,
  formatEmbeddingForPostgres,
} from '@/lib/ai/embeddings-service'
import type {
  ContentContradiction,
  ContradictionType,
  ContradictionSeverity,
  ContradictionStatus,
  LegalReference,
  SimilarDocument,
  SimilarDocumentOptions,
} from './types'

// =============================================================================
// CONFIGURATION
// =============================================================================

// Seuil de similarité pour considérer deux documents comme potentiellement liés
// Baissé de 0.7 à 0.6 pour capturer plus d'abrogations/modifications
const SIMILARITY_THRESHOLD = parseFloat(process.env.CONTRADICTION_SIMILARITY_MIN || '0.6')

// Nombre maximum de documents similaires à analyser
// Augmenté de 10 à 25 pour mieux détecter les abrogations
const MAX_SIMILAR_DOCS = parseInt(process.env.CONTRADICTION_MAX_SIMILAR || '25', 10)

// Patterns d'abrogation/modification pour détection rapide (sans LLM)
const ABROGATION_PATTERNS = [
  // Arabe
  /ألغي\s*بموجب/i,
  /ألغي\s*بمقتضى/i,
  /نقح\s*بموجب/i,
  /نقح\s*بمقتضى/i,
  /عوض\s*بموجب/i,
  /وقع\s*تنقيحه/i,
  /وقع\s*إلغاؤه/i,
  /وقع\s*تعويضه/i,
  // Français
  /abrogé\s*par/i,
  /modifié\s*par/i,
  /remplacé\s*par/i,
  /annulé\s*par/i,
  /amendé\s*par/i,
  /complété\s*par/i,
  /abroge\s*(?:les?\s*)?(?:dispositions|articles?)/i,
]

// =============================================================================
// CLIENTS LLM
// =============================================================================

let ollamaClient: OpenAI | null = null
let deepseekClient: OpenAI | null = null
let groqClient: OpenAI | null = null

function getOllamaClient(): OpenAI {
  if (!ollamaClient) {
    ollamaClient = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${aiConfig.ollama.baseUrl}/v1`,
    })
  }
  return ollamaClient
}

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    if (!aiConfig.deepseek.apiKey) {
      throw new Error('DEEPSEEK_API_KEY non configuré')
    }
    deepseekClient = new OpenAI({
      apiKey: aiConfig.deepseek.apiKey,
      baseURL: aiConfig.deepseek.baseUrl,
    })
  }
  return deepseekClient
}

function getGroqClient(): OpenAI {
  if (!groqClient) {
    if (!aiConfig.groq.apiKey) {
      throw new Error('GROQ_API_KEY non configuré')
    }
    groqClient = new OpenAI({
      apiKey: aiConfig.groq.apiKey,
      baseURL: aiConfig.groq.baseUrl,
    })
  }
  return groqClient
}

// =============================================================================
// TYPES
// =============================================================================

export interface DetectedContradiction {
  contradictionType: ContradictionType
  severity: ContradictionSeverity
  description: string
  sourceExcerpt: string | null
  targetExcerpt: string | null
  legalImpact: string | null
  suggestedResolution: string | null
  affectedReferences: LegalReference[]
}

export interface ContradictionDetectionResult {
  hasContradictions: boolean
  contradictions: DetectedContradiction[]
  similarityScore: number
  overallSeverity: ContradictionSeverity | 'none'
  analysisNotes: string
  llmProvider: string
  llmModel: string
  tokensUsed: number
}

interface LLMContradictionResponse {
  has_contradiction: boolean
  contradictions: Array<{
    contradiction_type: string
    severity: string
    description: string
    source_excerpt: string | null
    target_excerpt: string | null
    legal_impact: string | null
    suggested_resolution: string | null
    affected_references: Array<{
      type: string
      reference: string
    }>
  }>
  similarity_score: number
  overall_severity: string
  analysis_notes: string
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Détecte les contradictions pour une page donnée
 * Recherche d'abord les documents similaires puis analyse les conflits potentiels
 */
export async function detectContradictions(pageId: string): Promise<{
  contradictions: ContentContradiction[]
  severity: ContradictionSeverity | 'none'
}> {
  // 1. Trouver les documents similaires
  const similarDocs = await findSimilarDocuments(pageId, {
    minSimilarity: SIMILARITY_THRESHOLD,
    maxResults: MAX_SIMILAR_DOCS,
    sameDomainOnly: false,
    includeIndexed: true,
  })

  if (similarDocs.length === 0) {
    return { contradictions: [], severity: 'none' }
  }

  // 2. Récupérer le contenu de la page source
  const sourceResult = await db.query<{
    id: string
    url: string
    title: string | null
    extracted_text: string | null
    meta_date: string | null
  }>(
    `SELECT id, url, title, extracted_text, meta_date
     FROM web_pages WHERE id = $1`,
    [pageId]
  )

  if (sourceResult.rows.length === 0) {
    throw new Error(`Page non trouvée: ${pageId}`)
  }

  const sourcePage = sourceResult.rows[0]
  const sourceContent = sourcePage.extracted_text || ''

  if (sourceContent.length < 100) {
    return { contradictions: [], severity: 'none' }
  }

  // 2b. Vérifier les patterns d'abrogation dans le contenu source
  // Si le contenu mentionne des abrogations, marquer comme potentiel de conflit
  for (const similar of similarDocs) {
    if (!similar.potentialConflict) {
      for (const pattern of ABROGATION_PATTERNS) {
        if (pattern.test(sourceContent)) {
          similar.potentialConflict = true
          similar.conflictReason = "Pattern d'abrogation/modification détecté dans le contenu source"
          break
        }
      }
    }
  }

  // 3. Analyser les documents avec potentiel de conflit
  const allContradictions: ContentContradiction[] = []
  let maxSeverity: ContradictionSeverity | 'none' = 'none'

  for (const similar of similarDocs.filter((d) => d.potentialConflict)) {
    // Récupérer le contenu de la page cible
    const targetResult = await db.query<{
      id: string
      url: string
      title: string | null
      extracted_text: string | null
      meta_date: string | null
    }>(
      `SELECT id, url, title, extracted_text, meta_date
       FROM web_pages WHERE id = $1`,
      [similar.pageId]
    )

    if (targetResult.rows.length === 0) continue

    const targetPage = targetResult.rows[0]
    const targetContent = targetPage.extracted_text || ''

    if (targetContent.length < 100) continue

    // Analyser les contradictions entre les deux pages
    const result = await analyzeContradictions(
      {
        url: sourcePage.url,
        title: sourcePage.title,
        content: sourceContent,
        date: sourcePage.meta_date,
      },
      {
        url: targetPage.url,
        title: targetPage.title,
        content: targetContent,
        date: targetPage.meta_date,
      }
    )

    if (result.hasContradictions) {
      // Sauvegarder chaque contradiction
      for (const contradiction of result.contradictions) {
        const saved = await saveContradiction(pageId, similar.pageId, contradiction, result)
        allContradictions.push(saved)
      }

      // Mettre à jour la sévérité maximale
      maxSeverity = getHighestSeverity(maxSeverity, result.overallSeverity)
    }
  }

  return {
    contradictions: allContradictions,
    severity: maxSeverity,
  }
}

/**
 * Trouve les documents similaires à une page donnée
 */
export async function findSimilarDocuments(
  pageId: string,
  options: SimilarDocumentOptions = {
    minSimilarity: 0.7,
    maxResults: 10,
    sameDomainOnly: false,
    includeIndexed: true,
  }
): Promise<SimilarDocument[]> {
  // Récupérer l'embedding de la page ou le générer
  const pageResult = await db.query<{
    id: string
    url: string
    title: string | null
    extracted_text: string | null
    legal_domain: string | null
    knowledge_base_id: string | null
  }>(
    `SELECT wp.id, wp.url, wp.title, wp.extracted_text, wp.legal_domain, wp.knowledge_base_id
     FROM web_pages wp
     WHERE wp.id = $1`,
    [pageId]
  )

  if (pageResult.rows.length === 0) {
    throw new Error(`Page non trouvée: ${pageId}`)
  }

  const page = pageResult.rows[0]
  const content = page.extracted_text || ''

  if (content.length < 100) {
    return []
  }

  // Générer l'embedding pour la recherche
  let embeddingResult: { embedding: number[]; tokenCount: number; provider: string }
  try {
    embeddingResult = await generateEmbedding(content.substring(0, 4000))
  } catch (error) {
    console.error('[ContradictionDetector] Erreur génération embedding:', error)
    return []
  }

  const embeddingStr = formatEmbeddingForPostgres(embeddingResult.embedding)

  // Rechercher les documents similaires dans la base de connaissances
  let query = `
    SELECT
      wp.id as page_id,
      wp.url,
      wp.title,
      wp.legal_domain,
      1 - (kb.embedding <=> $1::vector) as similarity
    FROM web_pages wp
    JOIN knowledge_base kb ON wp.knowledge_base_id = kb.id
    WHERE wp.id != $2
      AND wp.is_indexed = true
      AND kb.embedding IS NOT NULL
      AND 1 - (kb.embedding <=> $1::vector) >= $3
  `
  const params: (string | number)[] = [embeddingStr, pageId, options.minSimilarity]
  let paramIndex = 4

  if (options.sameDomainOnly && page.legal_domain) {
    query += ` AND wp.legal_domain = $${paramIndex++}`
    params.push(page.legal_domain)
  }

  if (!options.includeIndexed) {
    query += ` AND wp.is_indexed = false`
  }

  query += ` ORDER BY similarity DESC LIMIT $${paramIndex++}`
  params.push(options.maxResults)

  const result = await db.query(query, params)

  // Analyser le potentiel de conflit pour chaque document
  const similarDocs: SimilarDocument[] = []

  for (const row of result.rows) {
    const similarity = parseFloat(row.similarity)

    // Heuristique améliorée pour le potentiel de conflit
    let potentialConflict = similarity > 0.85
    let conflictReason: string | undefined

    if (potentialConflict) {
      conflictReason = 'Haute similarité - possible version différente ou doublon'
    }

    // Vérifier les patterns d'abrogation dans le titre (même si similarité < 0.85)
    if (!potentialConflict && row.title) {
      for (const pattern of ABROGATION_PATTERNS) {
        if (pattern.test(row.title)) {
          potentialConflict = true
          conflictReason = `Pattern d'abrogation/modification détecté dans le titre`
          break
        }
      }
    }

    similarDocs.push({
      pageId: row.page_id,
      url: row.url,
      title: row.title,
      similarity,
      potentialConflict,
      conflictReason,
    })
  }

  return similarDocs
}

/**
 * Récupère les contradictions par statut
 */
export async function getContradictions(options: {
  status?: ContradictionStatus[]
  severity?: ContradictionSeverity[]
  limit?: number
  offset?: number
}): Promise<ContentContradiction[]> {
  const { status, severity, limit = 50, offset = 0 } = options

  let query = `SELECT * FROM content_contradictions WHERE 1=1`
  const params: (string | number)[] = []
  let paramIndex = 1

  if (status && status.length > 0) {
    query += ` AND status = ANY($${paramIndex++})`
    params.push(status as unknown as string)
  }

  if (severity && severity.length > 0) {
    query += ` AND severity = ANY($${paramIndex++})`
    params.push(severity as unknown as string)
  }

  query += ` ORDER BY
    CASE severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    created_at DESC
  `
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
  params.push(limit, offset)

  const result = await db.query(query, params)
  return result.rows.map(mapRowToContradiction)
}

/**
 * Résout une contradiction
 */
export async function resolveContradiction(
  contradictionId: string,
  userId: string,
  resolution: {
    status: 'resolved' | 'dismissed'
    notes: string
    action?: string
  }
): Promise<void> {
  await db.query(
    `UPDATE content_contradictions
     SET status = $1,
         resolution_notes = $2,
         resolution_action = $3,
         resolved_by = $4,
         resolved_at = NOW(),
         updated_at = NOW()
     WHERE id = $5`,
    [
      resolution.status,
      resolution.notes,
      resolution.action,
      userId,
      contradictionId,
    ]
  )
}

/**
 * Statistiques des contradictions
 */
export async function getContradictionStats(): Promise<{
  total: number
  pending: number
  resolved: number
  bySeverity: Record<ContradictionSeverity, number>
  byType: Record<ContradictionType, number>
}> {
  const result = await db.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
      jsonb_object_agg(severity, sev_count) FILTER (WHERE severity IS NOT NULL) as by_severity,
      jsonb_object_agg(contradiction_type, type_count) FILTER (WHERE contradiction_type IS NOT NULL) as by_type
    FROM (
      SELECT
        status,
        severity,
        contradiction_type,
        COUNT(*) OVER (PARTITION BY severity) as sev_count,
        COUNT(*) OVER (PARTITION BY contradiction_type) as type_count
      FROM content_contradictions
    ) sub
  `)

  const row = result.rows[0]

  return {
    total: parseInt(row.total, 10),
    pending: parseInt(row.pending, 10),
    resolved: parseInt(row.resolved, 10),
    bySeverity: row.by_severity || {},
    byType: row.by_type || {},
  }
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

interface DocumentInfo {
  url: string
  title: string | null
  content: string
  date: string | null
}

interface LLMResult {
  content: string
  provider: string
  model: string
  tokensUsed: number
}

/**
 * Analyse les contradictions entre deux documents
 */
async function analyzeContradictions(
  source: DocumentInfo,
  target: DocumentInfo
): Promise<ContradictionDetectionResult> {
  const userPrompt = formatPrompt(CONTRADICTION_DETECTION_USER_PROMPT, {
    source_url: source.url,
    source_title: source.title || 'Sans titre',
    source_date: source.date || 'Non spécifiée',
    source_content: truncateContent(source.content, 4000),
    target_url: target.url,
    target_title: target.title || 'Sans titre',
    target_date: target.date || 'Non spécifiée',
    target_content: truncateContent(target.content, 4000),
  })

  const llmResult = await callLLMWithFallback(
    CONTRADICTION_DETECTION_SYSTEM_PROMPT,
    userPrompt
  )

  const parsed = parseContradictionResponse(llmResult.content)

  return {
    hasContradictions: parsed.has_contradiction,
    contradictions: (parsed.contradictions || []).map((c) => ({
      contradictionType: validateContradictionType(c.contradiction_type),
      severity: validateSeverityStrict(c.severity),
      description: c.description,
      sourceExcerpt: c.source_excerpt,
      targetExcerpt: c.target_excerpt,
      legalImpact: c.legal_impact,
      suggestedResolution: c.suggested_resolution,
      affectedReferences: (c.affected_references || []).map((ref) => ({
        type: ref.type as LegalReference['type'],
        reference: ref.reference,
      })),
    })),
    similarityScore: parsed.similarity_score,
    overallSeverity: validateSeverity(parsed.overall_severity),
    analysisNotes: parsed.analysis_notes,
    llmProvider: llmResult.provider,
    llmModel: llmResult.model,
    tokensUsed: llmResult.tokensUsed,
  }
}

/**
 * Appelle le LLM avec fallback
 */
async function callLLMWithFallback(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResult> {
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
        temperature: 0.2,
        max_tokens: 2000,
      })

      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'ollama',
        model: aiConfig.ollama.chatModel,
        tokensUsed: response.usage?.total_tokens || 0,
      }
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
        temperature: 0.2,
        max_tokens: 2000,
      })

      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'deepseek',
        model: aiConfig.deepseek.model,
        tokensUsed: response.usage?.total_tokens || 0,
      }
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
        temperature: 0.2,
        max_tokens: 2000,
      })

      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'groq',
        model: aiConfig.groq.model,
        tokensUsed: response.usage?.total_tokens || 0,
      }
    } catch (error) {
      errors.push(`Groq: ${error instanceof Error ? error.message : 'Erreur'}`)
    }
  }

  throw new Error(`Aucun LLM disponible. Erreurs: ${errors.join('; ')}`)
}

/**
 * Parse la réponse JSON du LLM
 */
function parseContradictionResponse(content: string): LLMContradictionResponse {
  const jsonMatch = content.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    return {
      has_contradiction: false,
      contradictions: [],
      similarity_score: 0,
      overall_severity: 'none',
      analysis_notes: 'Réponse LLM non structurée',
    }
  }

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return {
      has_contradiction: false,
      contradictions: [],
      similarity_score: 0,
      overall_severity: 'none',
      analysis_notes: 'Erreur parsing JSON',
    }
  }
}

/**
 * Valide le type de contradiction
 */
function validateContradictionType(type: string | null): ContradictionType {
  const validTypes: ContradictionType[] = [
    'version_conflict',
    'interpretation_conflict',
    'date_conflict',
    'legal_update',
    'doctrine_vs_practice',
    'cross_reference_error',
  ]

  if (!type) return 'interpretation_conflict'
  return validTypes.includes(type as ContradictionType)
    ? (type as ContradictionType)
    : 'interpretation_conflict'
}

/**
 * Valide la sévérité (retourne ContradictionSeverity, jamais 'none')
 */
function validateSeverityStrict(severity: string | null): ContradictionSeverity {
  const validSeverities: ContradictionSeverity[] = ['low', 'medium', 'high', 'critical']
  if (!severity || severity === 'none') return 'medium'
  return validSeverities.includes(severity as ContradictionSeverity)
    ? (severity as ContradictionSeverity)
    : 'medium'
}

/**
 * Valide la sévérité (peut retourner 'none' pour overallSeverity)
 */
function validateSeverity(severity: string | null): ContradictionSeverity | 'none' {
  const validSeverities = ['none', 'low', 'medium', 'high', 'critical']
  if (!severity) return 'medium'
  return validSeverities.includes(severity)
    ? (severity as ContradictionSeverity | 'none')
    : 'medium'
}

/**
 * Compare deux sévérités et retourne la plus haute
 */
function getHighestSeverity(
  a: ContradictionSeverity | 'none',
  b: ContradictionSeverity | 'none'
): ContradictionSeverity | 'none' {
  const order = { none: 0, low: 1, medium: 2, high: 3, critical: 4 }
  return order[a] >= order[b] ? a : b
}

/**
 * Sauvegarde une contradiction en base
 */
async function saveContradiction(
  sourcePageId: string,
  targetPageId: string,
  contradiction: DetectedContradiction,
  result: ContradictionDetectionResult
): Promise<ContentContradiction> {
  const insertResult = await db.query<{ id: string }>(
    `INSERT INTO content_contradictions (
      source_page_id, target_page_id,
      contradiction_type, severity,
      description, source_excerpt, target_excerpt,
      similarity_score, legal_impact, suggested_resolution,
      affected_references,
      llm_provider, llm_model
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id`,
    [
      sourcePageId,
      targetPageId,
      contradiction.contradictionType,
      contradiction.severity,
      contradiction.description,
      contradiction.sourceExcerpt,
      contradiction.targetExcerpt,
      result.similarityScore,
      contradiction.legalImpact,
      contradiction.suggestedResolution,
      JSON.stringify(contradiction.affectedReferences),
      result.llmProvider,
      result.llmModel,
    ]
  )

  return {
    id: insertResult.rows[0].id,
    sourcePageId,
    targetPageId,
    contradictionType: contradiction.contradictionType,
    severity: contradiction.severity,
    description: contradiction.description,
    sourceExcerpt: contradiction.sourceExcerpt,
    targetExcerpt: contradiction.targetExcerpt,
    similarityScore: result.similarityScore,
    legalImpact: contradiction.legalImpact,
    suggestedResolution: contradiction.suggestedResolution,
    affectedReferences: contradiction.affectedReferences,
    status: 'pending',
    resolutionNotes: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionAction: null,
    llmProvider: result.llmProvider,
    llmModel: result.llmModel,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Mapper une row DB vers ContentContradiction
 */
function mapRowToContradiction(row: Record<string, unknown>): ContentContradiction {
  return {
    id: row.id as string,
    sourcePageId: row.source_page_id as string,
    targetPageId: row.target_page_id as string | null,
    contradictionType: row.contradiction_type as ContradictionType,
    severity: row.severity as ContradictionSeverity,
    description: row.description as string,
    sourceExcerpt: row.source_excerpt as string | null,
    targetExcerpt: row.target_excerpt as string | null,
    similarityScore: row.similarity_score ? parseFloat(row.similarity_score as string) : null,
    legalImpact: row.legal_impact as string | null,
    suggestedResolution: row.suggested_resolution as string | null,
    affectedReferences: row.affected_references as LegalReference[],
    status: row.status as ContradictionStatus,
    resolutionNotes: row.resolution_notes as string | null,
    resolvedBy: row.resolved_by as string | null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
    resolutionAction: row.resolution_action as string | null,
    llmProvider: row.llm_provider as string | null,
    llmModel: row.llm_model as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }
}
