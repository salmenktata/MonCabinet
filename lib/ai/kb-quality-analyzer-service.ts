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
  KB_METADATA_ENRICHMENT_SYSTEM_PROMPT,
  KB_METADATA_ENRICHMENT_USER_PROMPT,
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
    content: truncateContent(content, 12000),
  })

  console.log(
    `[KB Quality] Doc ${documentId} - Longueur: ${content.length} chars - Provider: Gemini 2.5 Flash`
  )

  // Appeler le LLM unique (Gemini 2.5 Flash pour tous les docs, meilleur pour l'arabe)
  const messages: LLMMessage[] = [
    { role: 'system', content: KB_QUALITY_ANALYSIS_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]

  const llmResult: LLMResponse = await callLLMWithFallback(messages, {
    temperature: 0.1,
    maxTokens: 8000,
    operationName: 'kb-quality-analysis',
  })

  console.log('[KB Quality] Réponse LLM provider:', llmResult.provider, 'model:', llmResult.modelUsed)

  const parsed = parseKBQualityResponse(llmResult.answer)

  // Protection triple: String → parseFloat → Math.round pour garantir INTEGER
  // Fix: "invalid input syntax for type integer: '4.5'" en production
  const safeRound = (val: any): number => Math.round(parseFloat(String(val || 0)))

  const result: KBQualityResult = {
    qualityScore: safeRound(parsed.overall_score),
    clarity: safeRound(parsed.clarity_score),
    structure: safeRound(parsed.structure_score),
    completeness: safeRound(parsed.completeness_score),
    reliability: safeRound(parsed.reliability_score),
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

// =============================================================================
// ENRICHISSEMENT MÉTADONNÉES
// =============================================================================

export interface KBMetadataEnrichmentResult {
  description: string
  tags: string[]
  language: string
  documentId: string
  previousDescription: string | null
  qualityReanalized: boolean
  newQualityScore?: number
}

/**
 * Enrichit les métadonnées d'un document KB (description + tags) via LLM
 * puis re-déclenche l'analyse qualité pour améliorer le score de complétude
 */
export async function enrichKBDocumentMetadata(
  documentId: string,
  reanalyzeAfter: boolean = true
): Promise<KBMetadataEnrichmentResult> {
  // Récupérer le document
  const docResult = await db.query(
    `SELECT id, title, description, category, language, full_text, tags, quality_completeness
     FROM knowledge_base WHERE id = $1 AND is_active = true`,
    [documentId]
  )

  if (docResult.rows.length === 0) {
    throw new Error(`Document KB non trouvé: ${documentId}`)
  }

  const doc = docResult.rows[0]
  const content = doc.full_text || ''

  if (content.length < 50) {
    throw new Error(`Contenu trop court pour enrichissement: ${content.length} chars`)
  }

  // Préparer le prompt
  const userPrompt = formatPrompt(KB_METADATA_ENRICHMENT_USER_PROMPT, {
    title: doc.title || 'Sans titre',
    category: doc.category || 'autre',
    language: doc.language || 'ar',
    description: doc.description || 'Aucune description',
    tags: (doc.tags || []).join(', ') || 'Aucun tag',
    content: truncateContent(content, 6000),
  })

  const messages: LLMMessage[] = [
    { role: 'system', content: KB_METADATA_ENRICHMENT_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]

  const llmResult: LLMResponse = await callLLMWithFallback(messages, {
    temperature: 0.2,
    maxTokens: 1000,
    operationName: 'kb-quality-analysis',
  })

  // Parser la réponse
  let enriched: { description: string; tags: string[]; language: string } = {
    description: '',
    tags: [],
    language: doc.language || 'ar',
  }

  try {
    // Nettoyer les caractères de contrôle arabes avant parsing
    const cleaned = llmResult.answer.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '')
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      enriched = JSON.parse(jsonMatch[0])
    }
  } catch (error) {
    console.error('[KB Enrich] Erreur parsing réponse LLM:', error)
    throw new Error('Impossible de parser la réponse LLM pour enrichissement')
  }

  // Si la description générée est trop courte, utiliser le titre comme fallback minimal
  if (!enriched.description || enriched.description.trim().length < 5) {
    console.warn(`[KB Enrich] Description trop courte pour ${documentId} — skip enrichissement`)
    throw new Error('Description générée invalide ou trop courte')
  }

  // Normaliser les tags : s'assurer que c'est bien un array JS (pas une string JSON)
  // pg attend un array natif pour les colonnes text[]
  const tagsArray: string[] = Array.isArray(enriched.tags)
    ? enriched.tags
    : typeof enriched.tags === 'string'
      ? JSON.parse(enriched.tags as unknown as string)
      : []

  // Sauvegarder les métadonnées enrichies
  await db.query(
    `UPDATE knowledge_base SET
      description = $1,
      tags = $2,
      updated_at = NOW()
    WHERE id = $3`,
    [enriched.description.trim(), tagsArray, documentId]
  )

  console.log(`[KB Enrich] ✅ Doc ${documentId} enrichi: description ${enriched.description.length} chars, ${(enriched.tags || []).length} tags`)

  // Optionnellement re-analyser la qualité
  let newQualityScore: number | undefined
  if (reanalyzeAfter) {
    try {
      const qualityResult = await analyzeKBDocumentQuality(documentId)
      newQualityScore = qualityResult.qualityScore
      console.log(`[KB Enrich] Re-analyse qualité: ${newQualityScore}/100`)
    } catch (error) {
      console.error('[KB Enrich] Erreur re-analyse qualité:', error)
    }
  }

  return {
    description: enriched.description,
    tags: enriched.tags || [],
    language: enriched.language || doc.language || 'ar',
    documentId,
    previousDescription: doc.description || null,
    qualityReanalized: reanalyzeAfter && newQualityScore !== undefined,
    newQualityScore,
  }
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

  // 4. Nettoyage des caractères de contrôle arabes invisibles (zero-width, BOM)
  // Ces caractères causent des échecs silencieux de JSON.parse()
  if (jsonText) {
    jsonText = jsonText.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '')
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

// =============================================================================
// ENRICHISSEMENT MÉTADONNÉES JUDICIAIRES
// =============================================================================

export interface CourtMetadataEnrichmentResult {
  processed: number
  enriched: number
  skipped: number
  errors: number
}

/**
 * Enrichit les métadonnées judiciaires (numéro arrêt, date, chambre) en batch
 * via extraction regex sur le full_text. Cible les docs JURIS sans courtDecisionNumber.
 *
 * @param batchSize   Nombre de docs à traiter (défaut: 20)
 * @param sourceUrl   Filtrer par URL source (ex: 'cassation.tn')
 */
export async function enrichCourtMetadataBatch(
  batchSize = 20,
  sourceUrl?: string,
): Promise<CourtMetadataEnrichmentResult> {
  const result: CourtMetadataEnrichmentResult = { processed: 0, enriched: 0, skipped: 0, errors: 0 }

  // Sélectionner les docs JURIS sans courtDecisionNumber dans metadata
  const sourceFilter = sourceUrl
    ? `AND (kb.metadata->>'source_url' ILIKE $3 OR kb.metadata->>'sourceUrl' ILIKE $3)`
    : ''
  const queryParams: unknown[] = ['jurisprudence', batchSize]
  if (sourceUrl) queryParams.push(`%${sourceUrl}%`)

  const docsResult = await db.query<{
    id: string
    title: string
    full_text: string
    metadata: Record<string, unknown>
  }>(`
    SELECT id, title, full_text, metadata
    FROM knowledge_base
    WHERE category = $1
      AND is_active = true
      AND is_indexed = true
      AND (metadata->>'courtDecisionNumber' IS NULL OR metadata->>'courtDecisionNumber' = '')
      ${sourceFilter}
    ORDER BY created_at DESC
    LIMIT $2
  `, queryParams)

  for (const doc of docsResult.rows) {
    result.processed++
    try {
      const textToSearch = `${doc.title || ''} ${(doc.full_text || '').substring(0, 800)}`
      const extracted: Record<string, string> = {}

      // Numéro d'arrêt
      const numAr = textToSearch.match(/قرار(?:\s*تعقيبي)?\s*(?:عدد\s*)?(?:رقم\s*)?:?\s*([\d/\-]+)/i)
      const numFr = textToSearch.match(/[Aa]rr[êe]t\s*n[°o]?\s*\.?\s*([\d/\-]+)/i)
      if (numAr) extracted.courtDecisionNumber = numAr[1].trim()
      else if (numFr) extracted.courtDecisionNumber = numFr[1].trim()

      // Date
      const dateAr = textToSearch.match(/(?:بتاريخ|صادر في|في تاريخ)\s*(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{4})/i)
      const dateFr = textToSearch.match(/(?:du|en date du|le)\s*(\d{1,2})[\/\s](\d{1,2})[\/\s](\d{4})/i)
      if (dateAr) {
        const [, day, month, year] = dateAr
        extracted.courtDecisionDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      } else if (dateFr) {
        const [, day, month, year] = dateFr
        extracted.courtDecisionDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }

      // Chambre
      const chamberAr = textToSearch.match(/الدائرة\s+(المدنية|الجنائية|التجارية|الاجتماعية|العقارية|الإدارية|الجزائية)/i)
      const chamberFr = textToSearch.match(/[Cc]hambre\s+(civile|pénale|commerciale|sociale|administrative|correctionnelle)/i)
      if (chamberAr) extracted.courtChamber = `الدائرة ${chamberAr[1]}`
      else if (chamberFr) extracted.courtChamber = `Chambre ${chamberFr[1]}`

      if (Object.keys(extracted).length === 0) {
        result.skipped++
        continue
      }

      // Fusionner avec metadata existante
      await db.query(
        `UPDATE knowledge_base SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(extracted), doc.id]
      )
      result.enriched++
    } catch (err) {
      console.error(`[CourtMeta] Erreur doc ${doc.id}:`, err)
      result.errors++
    }
  }

  console.log(`[CourtMeta] Batch terminé: ${result.enriched}/${result.processed} enrichis, ${result.skipped} skippés, ${result.errors} erreurs`)
  return result
}
