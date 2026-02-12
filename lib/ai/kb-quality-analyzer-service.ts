/**
 * Service d'analyse qualité des documents KB
 *
 * Évalue la qualité d'un document de la base de connaissances
 * selon des critères de clarté, structure, complétude et fiabilité.
 *
 * Stratégie LLM (Février 2026) : DeepSeek → Gemini → Ollama
 * - DeepSeek prioritaire pour qualité d'analyse
 * - Gemini fallback économique
 * - Ollama dernier recours local gratuit
 */

import { db } from '@/lib/db/postgres'
import {
  KB_QUALITY_ANALYSIS_SYSTEM_PROMPT,
  KB_QUALITY_ANALYSIS_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from './prompts/legal-analysis'
import {
  callLLMWithFallback,
  LLMMessage,
  LLMResponse,
} from './llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

export interface KBQualityResult {
  qualityScore: number
  clarity: number
  structure: number
  completeness: number
  reliability: number
  analysisSummary: string
  detectedIssues: string[]
  recommendations: string[]
  requiresReview: boolean
  llmProvider: string
  llmModel: string
}

interface LLMKBQualityResponse {
  overall_score: number
  clarity_score: number
  structure_score: number
  completeness_score: number
  reliability_score: number
  analysis_summary: string
  detected_issues: string[]
  recommendations: string[]
  requires_review: boolean
}

// Plus besoin de clients LLM locaux - utilise le service global

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Analyse la qualité d'un document KB et stocke le résultat
 */
export async function analyzeKBDocumentQuality(documentId: string): Promise<KBQualityResult> {
  // Récupérer le document
  const docResult = await db.query(
    `SELECT id, title, description, category, language, full_text, tags
     FROM knowledge_base WHERE id = $1 AND is_active = true`,
    [documentId]
  )

  if (docResult.rows.length === 0) {
    throw new Error(`Document KB non trouvé: ${documentId}`)
  }

  const doc = docResult.rows[0]
  const content = doc.full_text || ''

  if (content.length < 100) {
    const result: KBQualityResult = {
      qualityScore: 20,
      clarity: 20,
      structure: 20,
      completeness: 20,
      reliability: 20,
      analysisSummary: 'Contenu trop court pour une analyse significative',
      detectedIssues: ['Contenu insuffisant (moins de 100 caractères)'],
      recommendations: ['Ajouter du contenu au document'],
      requiresReview: false,
      llmProvider: 'none',
      llmModel: 'none',
    }
    await saveKBQualityScores(documentId, result)
    return result
  }

  // Préparer le prompt
  const userPrompt = formatPrompt(KB_QUALITY_ANALYSIS_USER_PROMPT, {
    title: doc.title || 'Sans titre',
    category: doc.category || 'autre',
    language: doc.language || 'ar',
    description: doc.description || 'Aucune description',
    tags: (doc.tags || []).join(', ') || 'Aucun tag',
    content: truncateContent(content, 6000),
  })

  // Appeler le LLM avec configuration opération kb-quality-analysis (Gemini prioritaire)
  const messages: LLMMessage[] = [
    { role: 'system', content: KB_QUALITY_ANALYSIS_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]

  const llmResult: LLMResponse = await callLLMWithFallback(messages, {
    temperature: 0.1, // Précision maximale pour analyse
    maxTokens: 2000,
    operationName: 'kb-quality-analysis', // Utilise OpenAI en priorité
  })

  console.log('[KB Quality] Réponse LLM provider:', llmResult.provider, 'model:', llmResult.modelUsed)

  const parsed = parseKBQualityResponse(llmResult.answer)

  const result: KBQualityResult = {
    // Arrondir tous les scores car PostgreSQL attend des integers
    qualityScore: Math.round(parsed.overall_score),
    clarity: Math.round(parsed.clarity_score),
    structure: Math.round(parsed.structure_score),
    completeness: Math.round(parsed.completeness_score),
    reliability: Math.round(parsed.reliability_score),
    analysisSummary: parsed.analysis_summary,
    detectedIssues: parsed.detected_issues || [],
    recommendations: parsed.recommendations || [],
    requiresReview: parsed.requires_review || parsed.overall_score < 60,
    llmProvider: llmResult.provider,
    llmModel: llmResult.modelUsed,
  }

  console.log('[KB Quality] Scores finaux pour doc', documentId, ':', {
    qualityScore: result.qualityScore,
    clarity: result.clarity,
    structure: result.structure,
    completeness: result.completeness,
    reliability: result.reliability,
  })

  await saveKBQualityScores(documentId, result)
  return result
}

/**
 * Récupère les scores qualité d'un document
 */
export async function getKBQualityScores(documentId: string): Promise<KBQualityResult | null> {
  const result = await db.query(
    `SELECT quality_score, quality_clarity, quality_structure, quality_completeness,
            quality_reliability, quality_analysis_summary, quality_detected_issues,
            quality_recommendations, quality_requires_review, quality_llm_provider,
            quality_llm_model
     FROM knowledge_base WHERE id = $1`,
    [documentId]
  )

  if (result.rows.length === 0 || result.rows[0].quality_score === null) {
    return null
  }

  const row = result.rows[0]
  return {
    qualityScore: row.quality_score,
    clarity: row.quality_clarity,
    structure: row.quality_structure,
    completeness: row.quality_completeness,
    reliability: row.quality_reliability,
    analysisSummary: row.quality_analysis_summary,
    detectedIssues: row.quality_detected_issues || [],
    recommendations: row.quality_recommendations || [],
    requiresReview: row.quality_requires_review,
    llmProvider: row.quality_llm_provider,
    llmModel: row.quality_llm_model,
  }
}

// =============================================================================
// HELPERS
// =============================================================================

async function saveKBQualityScores(documentId: string, result: KBQualityResult): Promise<void> {
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
      result.qualityScore,
      result.clarity,
      result.structure,
      result.completeness,
      result.reliability,
      result.analysisSummary,
      JSON.stringify(result.detectedIssues),
      JSON.stringify(result.recommendations),
      result.requiresReview,
      result.llmProvider,
      result.llmModel,
      documentId,
    ]
  )
}

// =============================================================================
// PARSING
// =============================================================================

/**
 * Parse la réponse LLM pour extraire les scores de qualité
 * @exported Pour tests unitaires
 */
export function parseKBQualityResponse(content: string): LLMKBQualityResponse {
  // Log la réponse brute pour debug (premiers 500 chars)
  console.log('[KB Quality] Réponse LLM brute (500 chars):', content.substring(0, 500))

  // Essayer d'extraire le JSON de plusieurs façons
  let jsonText: string | null = null

  // 1. Chercher un bloc JSON avec accolades (non-gourmand)
  const jsonMatch = content.match(/\{[\s\S]*?\}(?=\s*$|\s*```)/m)
  if (jsonMatch) {
    jsonText = jsonMatch[0]
  }

  // 2. Si pas trouvé, chercher entre des blocs de code markdown
  if (!jsonText) {
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1]
    }
  }

  // 3. Si toujours pas trouvé, prendre tout ce qui ressemble à du JSON
  if (!jsonText) {
    const anyJsonMatch = content.match(/\{[\s\S]*\}/)
    if (anyJsonMatch) {
      jsonText = anyJsonMatch[0]
    }
  }

  if (!jsonText) {
    console.error('[KB Quality] Aucun JSON trouvé dans la réponse LLM')
    return {
      overall_score: 50,
      clarity_score: 50,
      structure_score: 50,
      completeness_score: 50,
      reliability_score: 50,
      analysis_summary: 'Analyse incomplète - réponse LLM non structurée',
      detected_issues: ['Réponse LLM non structurée'],
      recommendations: [],
      requires_review: true,
    }
  }

  try {
    const parsed = JSON.parse(jsonText)
    console.log('[KB Quality] JSON parsé avec succès:', {
      overall_score: parsed.overall_score,
      clarity_score: parsed.clarity_score,
      structure_score: parsed.structure_score,
      completeness_score: parsed.completeness_score,
      reliability_score: parsed.reliability_score,
    })
    return parsed
  } catch (error) {
    console.error('[KB Quality] Erreur parsing JSON:', error)
    console.error('[KB Quality] JSON extrait qui a échoué:', jsonText.substring(0, 200))
    return {
      overall_score: 50,
      clarity_score: 50,
      structure_score: 50,
      completeness_score: 50,
      reliability_score: 50,
      analysis_summary: 'Erreur de parsing de la réponse LLM',
      detected_issues: ['Erreur parsing JSON'],
      recommendations: [],
      requires_review: true,
    }
  }
}
