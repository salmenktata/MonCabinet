/**
 * Service de classification juridique du contenu
 *
 * Classifie le contenu web selon:
 * - Catégorie principale (législation, jurisprudence, doctrine...)
 * - Domaine juridique (civil, commercial, pénal, famille...)
 * - Nature du document (loi, décret, arrêt, modèle...)
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
} from './types'

// =============================================================================
// CONFIGURATION
// =============================================================================

// Seuil de confiance minimum pour validation automatique
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.CLASSIFICATION_CONFIDENCE_MIN || '0.7'
)

// Longueur minimum pour classifier
const MIN_CONTENT_LENGTH = 100

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
    source_name: string
    source_category: string
  }>(
    `SELECT wp.id, wp.url, wp.title, wp.extracted_text,
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
    }

    await saveClassification(pageId, result)
    return result
  }

  // Préparer le prompt
  const userPrompt = formatPrompt(LEGAL_CLASSIFICATION_USER_PROMPT, {
    url: page.url,
    title: page.title || 'Sans titre',
    source_name: page.source_name,
    declared_category: page.source_category,
    content: truncateContent(content, 6000),
  })

  // Appeler le LLM avec fallback
  const llmResult = await callLLMWithFallback(
    LEGAL_CLASSIFICATION_SYSTEM_PROMPT,
    userPrompt
  )

  // Parser la réponse
  const parsed = parseClassificationResponse(llmResult.content)

  // Construire le résultat
  const result: ClassificationResult = {
    primaryCategory: validateCategory(parsed.primary_category),
    subcategory: parsed.subcategory,
    domain: validateDomain(parsed.domain),
    subdomain: parsed.subdomain,
    documentNature: validateDocumentNature(parsed.document_nature),
    confidenceScore: parsed.confidence_score,
    requiresValidation: parsed.confidence_score < CLASSIFICATION_CONFIDENCE_THRESHOLD || parsed.requires_validation,
    validationReason: parsed.validation_reason,
    alternativeClassifications: (parsed.alternative_classifications || []).map((alt) => ({
      category: validateCategory(alt.category),
      domain: validateDomain(alt.domain),
      confidence: alt.confidence,
      reason: alt.reason,
    })),
    legalKeywords: parsed.legal_keywords || [],
    llmProvider: llmResult.provider,
    llmModel: llmResult.model,
    tokensUsed: llmResult.tokensUsed,
  }

  // Sauvegarder la classification
  await saveClassification(pageId, result)

  // Mettre à jour la page avec le domaine juridique
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
      llm_provider, llm_model, tokens_used
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
