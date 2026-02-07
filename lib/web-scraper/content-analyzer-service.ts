/**
 * Service d'analyse de qualité du contenu juridique
 *
 * Évalue la qualité d'un contenu web selon plusieurs critères:
 * - Clarté, Structure, Complétude, Fiabilité, Actualité, Pertinence
 *
 * Utilise un LLM pour l'analyse avec fallback entre providers
 */

import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { aiConfig, getChatProvider } from '@/lib/ai/config'
import {
  QUALITY_ANALYSIS_SYSTEM_PROMPT,
  QUALITY_ANALYSIS_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from '@/lib/ai/prompts/legal-analysis'
import type {
  ContentQualityAssessment,
  LegalReference,
  WebPage,
  WebSource,
} from './types'

// =============================================================================
// CONFIGURATION
// =============================================================================

// Seuils de décision
export const QUALITY_THRESHOLDS = {
  autoReject: parseInt(process.env.QUALITY_AUTO_REJECT_THRESHOLD || '60', 10),
  reviewRequired: parseInt(process.env.QUALITY_REVIEW_THRESHOLD || '80', 10),
}

// Longueur minimum pour analyser
const MIN_CONTENT_LENGTH = 200

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

export interface QualityAnalysisResult {
  overallScore: number
  scores: {
    clarity: number | null
    structure: number | null
    completeness: number | null
    reliability: number | null
    freshness: number | null
    relevance: number | null
  }
  analysisSummary: string | null
  detectedIssues: string[]
  recommendations: string[]
  legalReferences: LegalReference[]
  documentDate: Date | null
  documentType: string | null
  jurisdiction: string | null
  requiresReview: boolean
  reviewReason: string | null
  llmProvider: string
  llmModel: string
  tokensUsed: number
  processingTimeMs: number
}

interface LLMQualityResponse {
  overall_score: number
  clarity_score: number
  structure_score: number
  completeness_score: number
  reliability_score: number
  freshness_score: number
  relevance_score: number
  analysis_summary: string
  detected_issues: string[]
  recommendations: string[]
  legal_references: Array<{
    type: string
    reference: string
    date?: string
    description?: string
  }>
  document_date: string | null
  document_type_detected: string | null
  jurisdiction: string | null
  requires_review: boolean
  review_reason: string | null
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Analyse la qualité d'une page web et stocke le résultat
 */
export async function analyzeContentQuality(
  pageId: string
): Promise<QualityAnalysisResult> {
  const startTime = Date.now()

  // Récupérer la page et sa source
  const pageResult = await db.query<{
    id: string
    url: string
    title: string | null
    extracted_text: string | null
    language_detected: string | null
    source_name: string
    source_category: string
  }>(
    `SELECT wp.id, wp.url, wp.title, wp.extracted_text, wp.language_detected,
            ws.name as source_name,
            ws.category as source_category
     FROM web_pages wp
     JOIN web_sources ws ON wp.web_source_id = ws.id
     WHERE wp.id = $1`,
    [pageId]
  )

  if (pageResult.rows.length === 0) {
    throw new Error(`Page non trouvée: ${pageId}`)
  }

  const page = pageResult.rows[0]

  // Vérifier le contenu minimum
  const content = page.extracted_text || ''
  if (content.length < MIN_CONTENT_LENGTH) {
    // Contenu trop court = score faible
    const result: QualityAnalysisResult = {
      overallScore: 20,
      scores: {
        clarity: null,
        structure: null,
        completeness: null,
        reliability: null,
        freshness: null,
        relevance: null,
      },
      analysisSummary: 'Contenu trop court pour une analyse significative',
      detectedIssues: ['Contenu insuffisant (moins de 200 caractères)'],
      recommendations: ['Vérifier que le contenu a été correctement extrait'],
      legalReferences: [],
      documentDate: null,
      documentType: null,
      jurisdiction: null,
      requiresReview: false,
      reviewReason: null,
      llmProvider: 'none',
      llmModel: 'none',
      tokensUsed: 0,
      processingTimeMs: Date.now() - startTime,
    }

    await saveQualityAssessment(pageId, result)
    return result
  }

  // Préparer le prompt
  const userPrompt = formatPrompt(QUALITY_ANALYSIS_USER_PROMPT, {
    url: page.url,
    title: page.title || 'Sans titre',
    source_name: page.source_name,
    category: page.source_category,
    language: page.language_detected || 'fr',
    content: truncateContent(content, 8000),
  })

  // Appeler le LLM avec fallback
  const llmResult = await callLLMWithFallback(
    QUALITY_ANALYSIS_SYSTEM_PROMPT,
    userPrompt
  )

  // Parser la réponse
  const parsed = parseQualityResponse(llmResult.content)

  // Construire le résultat
  const result: QualityAnalysisResult = {
    overallScore: parsed.overall_score,
    scores: {
      clarity: parsed.clarity_score,
      structure: parsed.structure_score,
      completeness: parsed.completeness_score,
      reliability: parsed.reliability_score,
      freshness: parsed.freshness_score,
      relevance: parsed.relevance_score,
    },
    analysisSummary: parsed.analysis_summary,
    detectedIssues: parsed.detected_issues || [],
    recommendations: parsed.recommendations || [],
    legalReferences: (parsed.legal_references || []).map((ref) => ({
      type: ref.type as LegalReference['type'],
      reference: ref.reference,
      date: ref.date,
      description: ref.description,
    })),
    documentDate: parsed.document_date ? new Date(parsed.document_date) : null,
    documentType: parsed.document_type_detected,
    jurisdiction: parsed.jurisdiction,
    requiresReview: determineReviewRequired(parsed),
    reviewReason: parsed.review_reason,
    llmProvider: llmResult.provider,
    llmModel: llmResult.model,
    tokensUsed: llmResult.tokensUsed,
    processingTimeMs: Date.now() - startTime,
  }

  // Sauvegarder l'évaluation
  await saveQualityAssessment(pageId, result)

  // Mettre à jour la page avec le score
  await db.query(
    `UPDATE web_pages
     SET quality_score = $1,
         requires_human_review = $2,
         processing_status = 'analyzed',
         updated_at = NOW()
     WHERE id = $3`,
    [result.overallScore, result.requiresReview, pageId]
  )

  return result
}

/**
 * Récupère l'évaluation de qualité d'une page
 */
export async function getQualityAssessment(
  pageId: string
): Promise<ContentQualityAssessment | null> {
  const result = await db.query(
    `SELECT * FROM content_quality_assessments WHERE web_page_id = $1`,
    [pageId]
  )

  if (result.rows.length === 0) {
    return null
  }

  return mapRowToAssessment(result.rows[0])
}

/**
 * Récupère les évaluations nécessitant une revue
 */
export async function getAssessmentsRequiringReview(options: {
  limit?: number
  offset?: number
  minScore?: number
  maxScore?: number
}): Promise<ContentQualityAssessment[]> {
  const { limit = 50, offset = 0, minScore, maxScore } = options

  let query = `
    SELECT cqa.*
    FROM content_quality_assessments cqa
    WHERE cqa.requires_review = true
  `
  const params: (number | string)[] = []
  let paramIndex = 1

  if (minScore !== undefined) {
    query += ` AND cqa.overall_score >= $${paramIndex++}`
    params.push(minScore)
  }

  if (maxScore !== undefined) {
    query += ` AND cqa.overall_score <= $${paramIndex++}`
    params.push(maxScore)
  }

  query += ` ORDER BY cqa.overall_score ASC, cqa.assessed_at DESC`
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
  params.push(limit, offset)

  const result = await db.query(query, params)

  return result.rows.map(mapRowToAssessment)
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

interface LLMResult {
  content: string
  provider: string
  model: string
  tokensUsed: number
}

/**
 * Appelle le LLM avec fallback entre providers
 * Priorité: Ollama → DeepSeek → Groq → Anthropic
 */
async function callLLMWithFallback(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResult> {
  const errors: string[] = []

  // 1. Essayer Ollama (gratuit, local)
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

      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'ollama',
        model: aiConfig.ollama.chatModel,
        tokensUsed: response.usage?.total_tokens || 0,
      }
    } catch (error) {
      errors.push(`Ollama: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  // 2. Essayer DeepSeek (économique)
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

      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'deepseek',
        model: aiConfig.deepseek.model,
        tokensUsed: response.usage?.total_tokens || 0,
      }
    } catch (error) {
      errors.push(`DeepSeek: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  // 3. Essayer Groq (rapide)
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

      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'groq',
        model: aiConfig.groq.model,
        tokensUsed: response.usage?.total_tokens || 0,
      }
    } catch (error) {
      errors.push(`Groq: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  throw new Error(`Aucun LLM disponible. Erreurs: ${errors.join('; ')}`)
}

/**
 * Parse la réponse JSON du LLM
 */
function parseQualityResponse(content: string): LLMQualityResponse {
  // Essayer de trouver le JSON dans la réponse
  const jsonMatch = content.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    console.error('[ContentAnalyzer] Réponse LLM sans JSON valide:', content.substring(0, 500))
    // Retourner des valeurs par défaut
    return {
      overall_score: 50,
      clarity_score: 50,
      structure_score: 50,
      completeness_score: 50,
      reliability_score: 50,
      freshness_score: 50,
      relevance_score: 50,
      analysis_summary: 'Analyse incomplète - réponse LLM non structurée',
      detected_issues: ['Réponse LLM non structurée'],
      recommendations: [],
      legal_references: [],
      document_date: null,
      document_type_detected: null,
      jurisdiction: null,
      requires_review: true,
      review_reason: 'Analyse LLM incomplète',
    }
  }

  try {
    return JSON.parse(jsonMatch[0])
  } catch (error) {
    console.error('[ContentAnalyzer] Erreur parsing JSON:', error)
    return {
      overall_score: 50,
      clarity_score: 50,
      structure_score: 50,
      completeness_score: 50,
      reliability_score: 50,
      freshness_score: 50,
      relevance_score: 50,
      analysis_summary: 'Erreur de parsing de la réponse LLM',
      detected_issues: ['Erreur parsing JSON'],
      recommendations: [],
      legal_references: [],
      document_date: null,
      document_type_detected: null,
      jurisdiction: null,
      requires_review: true,
      review_reason: 'Erreur parsing LLM',
    }
  }
}

/**
 * Détermine si une revue humaine est nécessaire
 */
function determineReviewRequired(parsed: LLMQualityResponse): boolean {
  // Si le LLM le recommande
  if (parsed.requires_review) return true

  // Si le score est dans la zone de revue
  const score = parsed.overall_score
  if (score >= QUALITY_THRESHOLDS.autoReject && score < QUALITY_THRESHOLDS.reviewRequired) {
    return true
  }

  return false
}

/**
 * Sauvegarde l'évaluation de qualité dans la base de données
 */
async function saveQualityAssessment(
  pageId: string,
  result: QualityAnalysisResult
): Promise<void> {
  await db.query(
    `INSERT INTO content_quality_assessments (
      web_page_id,
      overall_score, clarity_score, structure_score,
      completeness_score, reliability_score, freshness_score, relevance_score,
      analysis_summary, detected_issues, recommendations,
      legal_references, document_date, document_type_detected, jurisdiction,
      requires_review, review_reason,
      llm_provider, llm_model, tokens_used, processing_time_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT (web_page_id) DO UPDATE SET
      overall_score = EXCLUDED.overall_score,
      clarity_score = EXCLUDED.clarity_score,
      structure_score = EXCLUDED.structure_score,
      completeness_score = EXCLUDED.completeness_score,
      reliability_score = EXCLUDED.reliability_score,
      freshness_score = EXCLUDED.freshness_score,
      relevance_score = EXCLUDED.relevance_score,
      analysis_summary = EXCLUDED.analysis_summary,
      detected_issues = EXCLUDED.detected_issues,
      recommendations = EXCLUDED.recommendations,
      legal_references = EXCLUDED.legal_references,
      document_date = EXCLUDED.document_date,
      document_type_detected = EXCLUDED.document_type_detected,
      jurisdiction = EXCLUDED.jurisdiction,
      requires_review = EXCLUDED.requires_review,
      review_reason = EXCLUDED.review_reason,
      llm_provider = EXCLUDED.llm_provider,
      llm_model = EXCLUDED.llm_model,
      tokens_used = EXCLUDED.tokens_used,
      processing_time_ms = EXCLUDED.processing_time_ms,
      assessed_at = NOW()`,
    [
      pageId,
      result.overallScore,
      result.scores.clarity,
      result.scores.structure,
      result.scores.completeness,
      result.scores.reliability,
      result.scores.freshness,
      result.scores.relevance,
      result.analysisSummary,
      JSON.stringify(result.detectedIssues),
      JSON.stringify(result.recommendations),
      JSON.stringify(result.legalReferences),
      result.documentDate,
      result.documentType,
      result.jurisdiction,
      result.requiresReview,
      result.reviewReason,
      result.llmProvider,
      result.llmModel,
      result.tokensUsed,
      result.processingTimeMs,
    ]
  )
}

/**
 * Mapper une row DB vers l'interface ContentQualityAssessment
 */
function mapRowToAssessment(row: Record<string, unknown>): ContentQualityAssessment {
  return {
    id: row.id as string,
    webPageId: row.web_page_id as string,
    overallScore: row.overall_score as number,
    clarityScore: row.clarity_score as number | null,
    structureScore: row.structure_score as number | null,
    completenessScore: row.completeness_score as number | null,
    reliabilityScore: row.reliability_score as number | null,
    freshnessScore: row.freshness_score as number | null,
    relevanceScore: row.relevance_score as number | null,
    analysisSummary: row.analysis_summary as string | null,
    detectedIssues: row.detected_issues as string[],
    recommendations: row.recommendations as string[],
    legalReferences: row.legal_references as LegalReference[],
    documentDate: row.document_date ? new Date(row.document_date as string) : null,
    documentTypeDetected: row.document_type_detected as string | null,
    jurisdiction: row.jurisdiction as string | null,
    requiresReview: row.requires_review as boolean,
    reviewReason: row.review_reason as string | null,
    llmProvider: row.llm_provider as string | null,
    llmModel: row.llm_model as string | null,
    tokensUsed: row.tokens_used as number | null,
    processingTimeMs: row.processing_time_ms as number | null,
    assessedAt: new Date(row.assessed_at as string),
  }
}
