/**
 * Service d'analyse qualité des documents KB
 *
 * Évalue la qualité d'un document de la base de connaissances
 * selon des critères de clarté, structure, complétude et fiabilité.
 * Réutilise le pattern callLLMWithFallback (Ollama→DeepSeek→Groq).
 */

import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { aiConfig } from './config'
import {
  KB_QUALITY_ANALYSIS_SYSTEM_PROMPT,
  KB_QUALITY_ANALYSIS_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from './prompts/legal-analysis'

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
    ollamaClient = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${aiConfig.ollama.baseUrl}/v1`,
      timeout: 120000,
    })
  }
  return ollamaClient
}

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    if (!aiConfig.deepseek.apiKey) throw new Error('DEEPSEEK_API_KEY non configuré')
    deepseekClient = new OpenAI({
      apiKey: aiConfig.deepseek.apiKey,
      baseURL: aiConfig.deepseek.baseUrl,
    })
  }
  return deepseekClient
}

function getGroqClient(): OpenAI {
  if (!groqClient) {
    if (!aiConfig.groq.apiKey) throw new Error('GROQ_API_KEY non configuré')
    groqClient = new OpenAI({
      apiKey: aiConfig.groq.apiKey,
      baseURL: aiConfig.groq.baseUrl,
    })
  }
  return groqClient
}

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

  // Appeler le LLM
  const llmResult = await callLLMWithFallback(KB_QUALITY_ANALYSIS_SYSTEM_PROMPT, userPrompt)
  const parsed = parseKBQualityResponse(llmResult.content)

  const result: KBQualityResult = {
    qualityScore: parsed.overall_score,
    clarity: parsed.clarity_score,
    structure: parsed.structure_score,
    completeness: parsed.completeness_score,
    reliability: parsed.reliability_score,
    analysisSummary: parsed.analysis_summary,
    detectedIssues: parsed.detected_issues || [],
    recommendations: parsed.recommendations || [],
    requiresReview: parsed.requires_review || parsed.overall_score < 60,
    llmProvider: llmResult.provider,
    llmModel: llmResult.model,
  }

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

async function callLLMWithFallback(systemPrompt: string, userPrompt: string): Promise<LLMResult> {
  const errors: string[] = []

  if (aiConfig.ollama.enabled) {
    try {
      const client = getOllamaClient()
      const response = await client.chat.completions.create({
        model: aiConfig.ollama.chatModelDefault,
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
        model: aiConfig.ollama.chatModelDefault,
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
        temperature: 0.3,
        max_tokens: 2000,
      })
      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'deepseek',
        model: aiConfig.deepseek.model,
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
        temperature: 0.3,
        max_tokens: 2000,
      })
      return {
        content: response.choices[0]?.message?.content || '',
        provider: 'groq',
        model: aiConfig.groq.model,
      }
    } catch (error) {
      errors.push(`Groq: ${error instanceof Error ? error.message : 'Erreur'}`)
    }
  }

  throw new Error(`Aucun LLM disponible. Erreurs: ${errors.join('; ')}`)
}

function parseKBQualityResponse(content: string): LLMKBQualityResponse {
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
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
    return JSON.parse(jsonMatch[0])
  } catch {
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
