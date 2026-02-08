/**
 * Service de classification juridique du contenu
 *
 * Classifie le contenu web selon:
 * - Catégorie principale (législation, jurisprudence, doctrine...)
 * - Domaine juridique (civil, commercial, pénal, famille...)
 * - Nature du document (loi, décret, arrêt, modèle...)
 *
 * Utilise une approche multi-signaux:
 * 1. Structure du site (breadcrumbs, URL, navigation) - poids: 0.3
 * 2. Règles de mapping configurées - poids: 0.4
 * 3. LLM (Ollama, DeepSeek, Groq) - poids: 0.3
 */

import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { aiConfig } from '@/lib/ai/config'
import {
  LEGAL_CLASSIFICATION_SYSTEM_PROMPT,
  LEGAL_CLASSIFICATION_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from '@/lib/ai/prompts/legal-analysis'
import type {
  LegalClassification,
  LegalContentCategory,
  LegalDomain,
  DocumentNature,
  AlternativeClassification,
  SiteStructure,
} from './types'
import {
  extractSiteStructure,
  generateStructuralHints,
  fuseStructuralHints,
  type StructuralHint,
} from './site-structure-extractor'
import {
  matchRules,
  incrementRuleMatch,
  type RuleMatch,
} from './classification-rules-service'
import {
  extractLegalKeywords,
  suggestDomainFromKeywords,
  analyzeLegalDensity,
  type KeywordMatch,
} from './legal-keywords-extractor'
import {
  enrichWithContext,
  type EnrichmentResult,
} from './contextual-enrichment-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

// Seuil de confiance minimum pour validation automatique
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.CLASSIFICATION_CONFIDENCE_MIN || '0.7'
)

// Longueur minimum pour classifier
const MIN_CONTENT_LENGTH = 100

// Poids des différentes sources de signaux
const SIGNAL_WEIGHTS = {
  structure: 0.3,  // Indices structurels (breadcrumbs, URL)
  rules: 0.4,      // Règles de mapping configurées
  llm: 0.3,        // Classification LLM
}

// Seuil pour utiliser le LLM (si structure+rules donnent confiance < ce seuil)
const LLM_THRESHOLD = 0.6

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

export interface ClassificationResult {
  primaryCategory: LegalContentCategory
  subcategory: string | null
  domain: LegalDomain | null
  subdomain: string | null
  documentNature: DocumentNature | null
  confidenceScore: number
  requiresValidation: boolean
  validationReason: string | null
  alternativeClassifications: AlternativeClassification[]
  legalKeywords: string[]
  llmProvider: string
  llmModel: string
  tokensUsed: number
  // Nouveaux champs pour multi-signaux
  classificationSource: 'llm' | 'rules' | 'structure' | 'hybrid'
  signalsUsed: ClassificationSignal[]
  rulesMatched: string[]
  structureHints: StructuralHint[] | null
}

export interface ClassificationSignal {
  source: 'structure' | 'rules' | 'llm'
  category: string | null
  domain: string | null
  documentType: string | null
  confidence: number
  weight: number
  evidence: string
}

export interface EnrichedClassificationContext {
  pageId: string
  url: string
  title: string
  content: string
  webSourceId: string
  sourceName: string
  sourceCategory: string
  html?: string
  siteStructure?: SiteStructure
}

interface LLMClassificationResponse {
  primary_category: string
  subcategory: string | null
  domain: string | null
  subdomain: string | null
  document_nature: string | null
  confidence_score: number
  requires_validation: boolean
  validation_reason: string | null
  alternative_classifications: Array<{
    category: string
    domain: string | null
    confidence: number
    reason?: string
  }>
  legal_keywords: string[]
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Classifie le contenu juridique d'une page web
 * Utilise une approche multi-signaux (structure, règles, LLM)
 */
export async function classifyLegalContent(
  pageId: string
): Promise<ClassificationResult> {
  // Récupérer la page et sa source
  const pageResult = await db.query<{
    id: string
    url: string
    title: string | null
    extracted_text: string | null
    web_source_id: string
    source_name: string
    source_category: string
    site_structure: SiteStructure | null
  }>(
    `SELECT wp.id, wp.url, wp.title, wp.extracted_text, wp.web_source_id,
            wp.site_structure,
            ws.name as source_name, ws.category as source_category
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
    // Contenu trop court - utiliser la catégorie de la source
    const result: ClassificationResult = {
      primaryCategory: mapSourceCategory(page.source_category),
      subcategory: null,
      domain: null,
      subdomain: null,
      documentNature: null,
      confidenceScore: 0.3,
      requiresValidation: true,
      validationReason: 'Contenu trop court pour classification automatique',
      alternativeClassifications: [],
      legalKeywords: [],
      llmProvider: 'fallback',
      llmModel: 'source-category',
      tokensUsed: 0,
      classificationSource: 'structure',
      signalsUsed: [],
      rulesMatched: [],
      structureHints: null,
    }

    await saveClassification(pageId, result)
    return result
  }

  // Contexte enrichi pour la classification
  const context: EnrichedClassificationContext = {
    pageId,
    url: page.url,
    title: page.title || 'Sans titre',
    content,
    webSourceId: page.web_source_id,
    sourceName: page.source_name,
    sourceCategory: page.source_category,
    siteStructure: page.site_structure || undefined,
  }

  // Classification multi-signaux
  const result = await classifyWithMultiSignals(context)

  // Sauvegarder la classification
  await saveClassification(pageId, result)

  // Mettre à jour la page avec le domaine juridique et la structure
  await db.query(
    `UPDATE web_pages
     SET legal_domain = $1,
         processing_status = CASE
           WHEN processing_status = 'analyzed' THEN 'classified'
           ELSE processing_status
         END,
         updated_at = NOW()
     WHERE id = $2`,
    [result.domain, pageId]
  )

  return result
}

/**
 * Classification multi-signaux avec fusion intelligente
 */
async function classifyWithMultiSignals(
  context: EnrichedClassificationContext
): Promise<ClassificationResult> {
  const signals: ClassificationSignal[] = []
  let structureHints: StructuralHint[] | null = null
  const rulesMatched: string[] = []

  // 1. SIGNAL: Structure du site (breadcrumbs, URL, navigation)
  if (context.siteStructure) {
    structureHints = generateStructuralHints(context.siteStructure)
    const structureFusion = fuseStructuralHints(structureHints)

    if (structureFusion.category || structureFusion.domain || structureFusion.documentType) {
      signals.push({
        source: 'structure',
        category: structureFusion.category,
        domain: structureFusion.domain,
        documentType: structureFusion.documentType,
        confidence: structureFusion.confidence,
        weight: SIGNAL_WEIGHTS.structure,
        evidence: `${structureHints.length} indices structurels détectés`,
      })
    }
  }

  // 2. SIGNAL: Règles de mapping configurées
  const ruleMatches = await matchRules(context.webSourceId, {
    url: context.url,
    title: context.title,
    structure: context.siteStructure,
  })

  if (ruleMatches.length > 0) {
    // Prendre la meilleure règle
    const bestMatch = ruleMatches[0]
    rulesMatched.push(bestMatch.rule.id)

    signals.push({
      source: 'rules',
      category: bestMatch.rule.targetCategory,
      domain: bestMatch.rule.targetDomain,
      documentType: bestMatch.rule.targetDocumentType,
      confidence: bestMatch.confidence,
      weight: SIGNAL_WEIGHTS.rules,
      evidence: `Règle "${bestMatch.rule.name}" (${bestMatch.matchedConditions}/${bestMatch.totalConditions} conditions)`,
    })

    // Incrémenter le compteur de match
    await incrementRuleMatch(bestMatch.rule.id)
  }

  // 3. EXTRACTION DE MOTS-CLÉS (gratuit, sans LLM)
  const keywords = extractLegalKeywords(context.content, {
    minOccurrences: 1,
    maxKeywords: 15,
    includePositions: false,
  })

  const keywordDomain = suggestDomainFromKeywords(keywords)
  const legalDensity = analyzeLegalDensity(context.content)

  // Si les mots-clés suggèrent fortement un domaine et qu'on n'en a pas encore
  if (keywordDomain.confidence > 0.7 && !signals.some(s => s.domain)) {
    signals.push({
      source: 'structure', // Catégorisé comme structure car c'est de l'analyse de contenu
      category: null,
      domain: keywordDomain.domain,
      documentType: null,
      confidence: keywordDomain.confidence,
      weight: 0.15, // Poids modéré
      evidence: keywordDomain.evidence,
    })
  }

  console.log(`[Keywords] Trouvés: ${keywords.length}, Densité: ${(legalDensity.density * 100).toFixed(2)}%`)

  // 4. SIGNAL: LLM (seulement si les autres signaux ne sont pas suffisants)
  const structureRulesConfidence = calculateCombinedConfidence(
    signals.filter(s => s.source !== 'llm')
  )

  let llmResult: LLMResult | null = null
  let parsedLLM: LLMClassificationResponse | null = null

  if (structureRulesConfidence < LLM_THRESHOLD || signals.length === 0) {
    // Préparer le prompt
    const userPrompt = formatPrompt(LEGAL_CLASSIFICATION_USER_PROMPT, {
      url: context.url,
      title: context.title,
      source_name: context.sourceName,
      declared_category: context.sourceCategory,
      content: truncateContent(context.content, 6000),
    })

    try {
      llmResult = await callLLMWithFallback(
        LEGAL_CLASSIFICATION_SYSTEM_PROMPT,
        userPrompt
      )
      parsedLLM = parseClassificationResponse(llmResult.content)

      signals.push({
        source: 'llm',
        category: parsedLLM.primary_category,
        domain: parsedLLM.domain,
        documentType: parsedLLM.document_nature,
        confidence: parsedLLM.confidence_score,
        weight: SIGNAL_WEIGHTS.llm,
        evidence: `LLM ${llmResult.provider}/${llmResult.model}`,
      })
    } catch (error) {
      console.warn('[LegalClassifier] LLM indisponible, utilisation des autres signaux uniquement')
    }
  }

  // 4. ENRICHISSEMENT CONTEXTUEL (pages voisines)
  let contextualEnrichment: EnrichmentResult | null = null
  try {
    const preliminaryFusion = fuseClassificationSignals(signals)
    contextualEnrichment = await enrichWithContext(
      context.pageId,
      context.url,
      context.webSourceId,
      {
        category: validateCategory(preliminaryFusion.category),
        domain: validateDomain(preliminaryFusion.domain),
        documentType: validateDocumentNature(preliminaryFusion.documentType),
      }
    )

    // Ajouter les signaux contextuels
    for (const contextSignal of contextualEnrichment.signals) {
      signals.push({
        source: 'structure', // Catégorisé comme structure car basé sur analyse
        category: contextSignal.category,
        domain: contextSignal.domain,
        documentType: contextSignal.documentType,
        confidence: contextSignal.confidence,
        weight: 0.10, // Poids modéré pour contexte
        evidence: `Contexte: ${contextSignal.evidence}`,
      })
    }

    console.log(`[Context] ${contextualEnrichment.signals.length} signaux contextuels, boost: +${(contextualEnrichment.confidenceBoost * 100).toFixed(0)}%`)
  } catch (error) {
    console.warn('[Context] Erreur enrichissement contextuel:', error)
  }

  // 5. FUSION DES SIGNAUX
  const fused = fuseClassificationSignals(signals)

  // Déterminer la source principale
  let classificationSource: 'llm' | 'rules' | 'structure' | 'hybrid' = 'hybrid'
  if (signals.length === 1) {
    classificationSource = signals[0].source
  } else if (signals.length > 1) {
    // Trouver le signal dominant
    const dominant = signals.reduce((a, b) =>
      (a.confidence * a.weight) > (b.confidence * b.weight) ? a : b
    )
    if ((dominant.confidence * dominant.weight) > 0.5) {
      classificationSource = dominant.source
    }
  }

  // Appliquer le boost de confiance du contexte
  const finalConfidence = contextualEnrichment
    ? Math.min(0.98, fused.confidence + contextualEnrichment.confidenceBoost)
    : fused.confidence

  // Utiliser les suggestions contextuelles si nécessaire
  const finalDomain = fused.domain || contextualEnrichment?.suggestedDomain

  // Construire le résultat final
  const result: ClassificationResult = {
    primaryCategory: validateCategory(fused.category),
    subcategory: null,
    domain: validateDomain(finalDomain),
    subdomain: null,
    documentNature: validateDocumentNature(fused.documentType),
    confidenceScore: finalConfidence,
    requiresValidation: finalConfidence < CLASSIFICATION_CONFIDENCE_THRESHOLD,
    validationReason: fused.confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD
      ? `Confiance faible (${(fused.confidence * 100).toFixed(0)}%)`
      : null,
    alternativeClassifications: parsedLLM?.alternative_classifications?.map(alt => ({
      category: validateCategory(alt.category),
      domain: validateDomain(alt.domain),
      confidence: alt.confidence,
      reason: alt.reason,
    })) || [],
    legalKeywords: [
      ...keywords.slice(0, 10).map(kw => kw.keyword),
      ...(parsedLLM?.legal_keywords || []),
    ],
    llmProvider: llmResult?.provider || 'none',
    llmModel: llmResult?.model || 'none',
    tokensUsed: llmResult?.tokensUsed || 0,
    classificationSource,
    signalsUsed: signals,
    rulesMatched,
    structureHints,
  }

  return result
}

/**
 * Calcule la confiance combinée de plusieurs signaux
 */
function calculateCombinedConfidence(signals: ClassificationSignal[]): number {
  if (signals.length === 0) return 0

  let totalWeight = 0
  let weightedConfidence = 0

  for (const signal of signals) {
    weightedConfidence += signal.confidence * signal.weight
    totalWeight += signal.weight
  }

  return totalWeight > 0 ? weightedConfidence / totalWeight : 0
}

/**
 * Fusionne plusieurs signaux de classification en une classification finale
 */
function fuseClassificationSignals(signals: ClassificationSignal[]): {
  category: string | null
  domain: string | null
  documentType: string | null
  confidence: number
} {
  if (signals.length === 0) {
    return { category: null, domain: null, documentType: null, confidence: 0 }
  }

  // Vote pondéré pour chaque attribut
  const categoryVotes: Record<string, number> = {}
  const domainVotes: Record<string, number> = {}
  const documentTypeVotes: Record<string, number> = {}

  let totalWeight = 0

  for (const signal of signals) {
    const effectiveWeight = signal.confidence * signal.weight

    if (signal.category) {
      categoryVotes[signal.category] = (categoryVotes[signal.category] || 0) + effectiveWeight
    }
    if (signal.domain) {
      domainVotes[signal.domain] = (domainVotes[signal.domain] || 0) + effectiveWeight
    }
    if (signal.documentType) {
      documentTypeVotes[signal.documentType] = (documentTypeVotes[signal.documentType] || 0) + effectiveWeight
    }

    totalWeight += signal.weight
  }

  // Sélectionner les gagnants
  const getWinner = (votes: Record<string, number>): string | null => {
    const entries = Object.entries(votes)
    if (entries.length === 0) return null
    entries.sort((a, b) => b[1] - a[1])
    return entries[0][0]
  }

  const category = getWinner(categoryVotes)
  const domain = getWinner(domainVotes)
  const documentType = getWinner(documentTypeVotes)

  // Calculer la confiance finale
  const categoryConfidence = category ? (categoryVotes[category] / totalWeight) : 0
  const domainConfidence = domain ? (domainVotes[domain] / totalWeight) : 0
  const documentTypeConfidence = documentType ? (documentTypeVotes[documentType] / totalWeight) : 0

  // Moyenne pondérée des confiances
  let confidenceSum = 0
  let confidenceCount = 0

  if (category) { confidenceSum += categoryConfidence; confidenceCount++ }
  if (domain) { confidenceSum += domainConfidence; confidenceCount++ }
  if (documentType) { confidenceSum += documentTypeConfidence; confidenceCount++ }

  const confidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0

  return { category, domain, documentType, confidence }
}

/**
 * Récupère la classification d'une page
 */
export async function getClassification(
  pageId: string
): Promise<LegalClassification | null> {
  const result = await db.query(
    `SELECT * FROM legal_classifications WHERE web_page_id = $1`,
    [pageId]
  )

  if (result.rows.length === 0) {
    return null
  }

  return mapRowToClassification(result.rows[0])
}

/**
 * Valide manuellement une classification
 */
export async function validateClassification(
  classificationId: string,
  userId: string,
  finalClassification: {
    primaryCategory: LegalContentCategory
    subcategory?: string
    domain?: LegalDomain
    subdomain?: string
    documentNature?: DocumentNature
  },
  notes?: string
): Promise<void> {
  await db.query(
    `UPDATE legal_classifications
     SET validated_by = $1,
         validated_at = NOW(),
         final_classification = $2,
         validation_notes = $3,
         requires_validation = false
     WHERE id = $4`,
    [
      userId,
      JSON.stringify({
        ...finalClassification,
        modifiedBy: userId,
        modifiedAt: new Date().toISOString(),
      }),
      notes,
      classificationId,
    ]
  )
}

/**
 * Récupère les classifications nécessitant validation
 */
export async function getClassificationsRequiringValidation(options: {
  limit?: number
  offset?: number
  domain?: LegalDomain
}): Promise<LegalClassification[]> {
  const { limit = 50, offset = 0, domain } = options

  let query = `
    SELECT lc.*
    FROM legal_classifications lc
    WHERE lc.requires_validation = true
      AND lc.validated_by IS NULL
  `
  const params: (string | number)[] = []
  let paramIndex = 1

  if (domain) {
    query += ` AND lc.domain = $${paramIndex++}`
    params.push(domain)
  }

  query += ` ORDER BY lc.confidence_score ASC, lc.classified_at DESC`
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
  params.push(limit, offset)

  const result = await db.query(query, params)

  return result.rows.map(mapRowToClassification)
}

/**
 * Statistiques de classification par domaine
 */
export async function getClassificationStats(): Promise<{
  total: number
  byDomain: Record<string, number>
  byCategory: Record<string, number>
  pendingValidation: number
  avgConfidence: number
}> {
  const statsResult = await db.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE requires_validation = true AND validated_by IS NULL) as pending_validation,
      AVG(confidence_score) as avg_confidence,
      jsonb_object_agg(
        COALESCE(domain, 'autre'),
        domain_count
      ) FILTER (WHERE domain IS NOT NULL OR domain_count > 0) as by_domain,
      jsonb_object_agg(
        primary_category,
        category_count
      ) as by_category
    FROM (
      SELECT
        domain,
        primary_category,
        confidence_score,
        requires_validation,
        validated_by,
        COUNT(*) OVER (PARTITION BY domain) as domain_count,
        COUNT(*) OVER (PARTITION BY primary_category) as category_count
      FROM legal_classifications
    ) sub
  `)

  const row = statsResult.rows[0]

  return {
    total: parseInt(row.total, 10),
    byDomain: row.by_domain || {},
    byCategory: row.by_category || {},
    pendingValidation: parseInt(row.pending_validation, 10),
    avgConfidence: parseFloat(row.avg_confidence || '0'),
  }
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
        temperature: 0.2,
        max_tokens: 1500,
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
        temperature: 0.2,
        max_tokens: 1500,
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
        temperature: 0.2,
        max_tokens: 1500,
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
function parseClassificationResponse(content: string): LLMClassificationResponse {
  const jsonMatch = content.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    console.error('[LegalClassifier] Réponse LLM sans JSON valide:', content.substring(0, 500))
    return {
      primary_category: 'autre',
      subcategory: null,
      domain: null,
      subdomain: null,
      document_nature: null,
      confidence_score: 0.3,
      requires_validation: true,
      validation_reason: 'Réponse LLM non structurée',
      alternative_classifications: [],
      legal_keywords: [],
    }
  }

  try {
    return JSON.parse(jsonMatch[0])
  } catch (error) {
    console.error('[LegalClassifier] Erreur parsing JSON:', error)
    return {
      primary_category: 'autre',
      subcategory: null,
      domain: null,
      subdomain: null,
      document_nature: null,
      confidence_score: 0.3,
      requires_validation: true,
      validation_reason: 'Erreur parsing JSON',
      alternative_classifications: [],
      legal_keywords: [],
    }
  }
}

/**
 * Valide et normalise la catégorie
 */
function validateCategory(category: string | null): LegalContentCategory {
  const validCategories: LegalContentCategory[] = [
    'legislation', 'jurisprudence', 'doctrine', 'jort',
    'modeles', 'procedures', 'formulaires', 'actualites', 'autre',
  ]

  if (!category) return 'autre'
  const normalized = category.toLowerCase().trim()
  return validCategories.includes(normalized as LegalContentCategory)
    ? (normalized as LegalContentCategory)
    : 'autre'
}

/**
 * Valide et normalise le domaine
 */
function validateDomain(domain: string | null): LegalDomain | null {
  const validDomains: LegalDomain[] = [
    'civil', 'commercial', 'penal', 'famille', 'fiscal',
    'social', 'administratif', 'immobilier', 'bancaire',
    'propriete_intellectuelle', 'international', 'autre',
  ]

  if (!domain) return null
  const normalized = domain.toLowerCase().trim()
  return validDomains.includes(normalized as LegalDomain)
    ? (normalized as LegalDomain)
    : 'autre'
}

/**
 * Valide et normalise la nature du document
 */
function validateDocumentNature(nature: string | null): DocumentNature | null {
  const validNatures: DocumentNature[] = [
    'loi', 'decret', 'arrete', 'circulaire', 'ordonnance',
    'arret', 'jugement', 'ordonnance_jud', 'avis',
    'article_doctrine', 'these', 'commentaire', 'note',
    'modele_contrat', 'modele_acte', 'formulaire',
    'guide_pratique', 'faq', 'actualite', 'autre',
  ]

  if (!nature) return null
  const normalized = nature.toLowerCase().trim()
  return validNatures.includes(normalized as DocumentNature)
    ? (normalized as DocumentNature)
    : 'autre'
}

/**
 * Mappe la catégorie source vers la catégorie de contenu
 */
function mapSourceCategory(sourceCategory: string): LegalContentCategory {
  const mapping: Record<string, LegalContentCategory> = {
    legislation: 'legislation',
    jurisprudence: 'jurisprudence',
    doctrine: 'doctrine',
    jort: 'jort',
    modeles: 'modeles',
    procedures: 'procedures',
    formulaires: 'formulaires',
    autre: 'autre',
  }
  return mapping[sourceCategory] || 'autre'
}

/**
 * Sauvegarde la classification dans la base de données
 */
async function saveClassification(
  pageId: string,
  result: ClassificationResult
): Promise<void> {
  await db.query(
    `INSERT INTO legal_classifications (
      web_page_id,
      primary_category, subcategory, domain, subdomain, document_nature,
      confidence_score, requires_validation, validation_reason,
      alternative_classifications, legal_keywords,
      llm_provider, llm_model, tokens_used,
      classification_source, signals_used, rules_matched, structure_hints
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT (web_page_id) DO UPDATE SET
      primary_category = EXCLUDED.primary_category,
      subcategory = EXCLUDED.subcategory,
      domain = EXCLUDED.domain,
      subdomain = EXCLUDED.subdomain,
      document_nature = EXCLUDED.document_nature,
      confidence_score = EXCLUDED.confidence_score,
      requires_validation = EXCLUDED.requires_validation,
      validation_reason = EXCLUDED.validation_reason,
      alternative_classifications = EXCLUDED.alternative_classifications,
      legal_keywords = EXCLUDED.legal_keywords,
      llm_provider = EXCLUDED.llm_provider,
      llm_model = EXCLUDED.llm_model,
      tokens_used = EXCLUDED.tokens_used,
      classification_source = EXCLUDED.classification_source,
      signals_used = EXCLUDED.signals_used,
      rules_matched = EXCLUDED.rules_matched,
      structure_hints = EXCLUDED.structure_hints,
      classified_at = NOW()`,
    [
      pageId,
      result.primaryCategory,
      result.subcategory,
      result.domain,
      result.subdomain,
      result.documentNature,
      result.confidenceScore,
      result.requiresValidation,
      result.validationReason,
      JSON.stringify(result.alternativeClassifications),
      JSON.stringify(result.legalKeywords),
      result.llmProvider,
      result.llmModel,
      result.tokensUsed,
      result.classificationSource,
      JSON.stringify(result.signalsUsed),
      result.rulesMatched,
      result.structureHints ? JSON.stringify(result.structureHints) : null,
    ]
  )
}

/**
 * Mapper une row DB vers l'interface LegalClassification
 */
function mapRowToClassification(row: Record<string, unknown>): LegalClassification {
  return {
    id: row.id as string,
    webPageId: row.web_page_id as string,
    primaryCategory: row.primary_category as LegalContentCategory,
    subcategory: row.subcategory as string | null,
    domain: row.domain as LegalDomain | null,
    subdomain: row.subdomain as string | null,
    documentNature: row.document_nature as DocumentNature | null,
    confidenceScore: parseFloat(row.confidence_score as string),
    requiresValidation: row.requires_validation as boolean,
    validationReason: row.validation_reason as string | null,
    alternativeClassifications: row.alternative_classifications as AlternativeClassification[],
    legalKeywords: row.legal_keywords as string[],
    validatedBy: row.validated_by as string | null,
    validatedAt: row.validated_at ? new Date(row.validated_at as string) : null,
    finalClassification: row.final_classification as LegalClassification['finalClassification'],
    validationNotes: row.validation_notes as string | null,
    llmProvider: row.llm_provider as string | null,
    llmModel: row.llm_model as string | null,
    tokensUsed: row.tokens_used as number | null,
    classifiedAt: new Date(row.classified_at as string),
  }
}
