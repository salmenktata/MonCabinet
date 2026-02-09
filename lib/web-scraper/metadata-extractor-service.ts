/**
 * Service d'extraction de métadonnées structurées de pages web juridiques
 *
 * Utilise un LLM pour analyser le contenu d'une page et extraire
 * les métadonnées structurées (type de document, dates, références, etc.)
 *
 * Utilise un fallback entre providers: Ollama → DeepSeek → Groq
 */

import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { aiConfig } from '@/lib/ai/config'
import {
  METADATA_EXTRACTION_SYSTEM_PROMPT,
  METADATA_EXTRACTION_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from '@/lib/ai/prompts/legal-analysis'
import { logUsage, type Provider } from '@/lib/ai/usage-tracker'
import type { WebPageStructuredMetadata } from './types'

// =============================================================================
// CONFIGURATION
// =============================================================================

// Longueur minimum pour extraire des métadonnées
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
      timeout: 30000,
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

interface LLMResult {
  content: string
  provider: Provider
  model: string
  tokensUsed: number
  usage?: {
    promptTokens?: number
    completionTokens?: number
  }
}

interface LLMMetadataResponse {
  document_type: string | null
  document_date: string | null
  document_number: string | null
  title_official: string | null
  language: string | null
  tribunal: string | null
  chambre: string | null
  decision_number: string | null
  decision_date: string | null
  parties: Record<string, unknown> | null
  text_type: string | null
  text_number: string | null
  publication_date: string | null
  effective_date: string | null
  jort_reference: string | null
  author: string | null
  publication_name: string | null
  keywords: string[] | null
  abstract: string | null
  extraction_confidence: number
  extraction_method?: string
}

// =============================================================================
// LISTES DE RÉFÉRENCE POUR VALIDATION
// =============================================================================

/**
 * Juridictions tunisiennes reconnues (AR et FR)
 * Utilisé pour valider le champ "tribunal" extrait par le LLM
 */
const KNOWN_TRIBUNALS: string[] = [
  // Cour de Cassation
  'محكمة التعقيب', 'Cour de Cassation',
  // Cours d'Appel
  "محكمة الاستئناف بتونس", "Cour d'Appel de Tunis",
  "محكمة الاستئناف بسوسة", "Cour d'Appel de Sousse",
  "محكمة الاستئناف بصفاقس", "Cour d'Appel de Sfax",
  "محكمة الاستئناف بالمنستير", "Cour d'Appel de Monastir",
  "محكمة الاستئناف بنابل", "Cour d'Appel de Nabeul",
  "محكمة الاستئناف بقفصة", "Cour d'Appel de Gafsa",
  "محكمة الاستئناف بالكاف", "Cour d'Appel du Kef",
  "محكمة الاستئناف بقابس", "Cour d'Appel de Gabès",
  "محكمة الاستئناف بمدنين", "Cour d'Appel de Médenine",
  "محكمة الاستئناف ببنزرت", "Cour d'Appel de Bizerte",
  // Tribunaux de Première Instance (principaux)
  'المحكمة الابتدائية بتونس', 'Tribunal de Première Instance de Tunis',
  'المحكمة الابتدائية بتونس 2', 'Tribunal de Première Instance de Tunis 2',
  'المحكمة الابتدائية بأريانة', 'Tribunal de Première Instance de Ariana',
  'المحكمة الابتدائية ببن عروس', 'Tribunal de Première Instance de Ben Arous',
  'المحكمة الابتدائية بمنوبة', 'Tribunal de Première Instance de Manouba',
  'المحكمة الابتدائية بسوسة', 'Tribunal de Première Instance de Sousse',
  'المحكمة الابتدائية بصفاقس', 'Tribunal de Première Instance de Sfax',
  'المحكمة الابتدائية بنابل', 'Tribunal de Première Instance de Nabeul',
  'المحكمة الابتدائية بقابس', 'Tribunal de Première Instance de Gabès',
  'المحكمة الابتدائية بالقيروان', 'Tribunal de Première Instance de Kairouan',
  'المحكمة الابتدائية ببنزرت', 'Tribunal de Première Instance de Bizerte',
  // Tribunal Administratif
  'المحكمة الإدارية', 'Tribunal Administratif',
  // Formes génériques acceptées
  'محكمة الاستئناف', "Cour d'Appel",
  'المحكمة الابتدائية', 'Tribunal de Première Instance',
]

/**
 * Chambres connues
 */
const KNOWN_CHAMBERS: string[] = [
  // Arabe
  'مدنية', 'جزائية', 'تجارية', 'اجتماعية', 'أحوال شخصية', 'عقارية',
  // Français
  'civile', 'pénale', 'commerciale', 'sociale', 'statut personnel', 'immobilière',
]

/**
 * Valide et corrige le champ tribunal par rapport aux juridictions connues
 * Utilise la distance de Levenshtein simplifiée pour détecter les typos
 */
function validateTribunal(tribunal: string | null): { value: string | null; corrected: boolean } {
  if (!tribunal) return { value: null, corrected: false }

  const normalized = tribunal.trim()

  // Vérifier correspondance exacte
  if (KNOWN_TRIBUNALS.includes(normalized)) {
    return { value: normalized, corrected: false }
  }

  // Rechercher la meilleure correspondance approximative
  let bestMatch: string | null = null
  let bestScore = 0

  for (const known of KNOWN_TRIBUNALS) {
    const score = similarityScore(normalized.toLowerCase(), known.toLowerCase())
    if (score > bestScore && score >= 0.75) {
      bestScore = score
      bestMatch = known
    }
  }

  if (bestMatch) {
    console.warn(`[MetadataExtractor] Tribunal corrigé: "${normalized}" → "${bestMatch}" (similarité: ${(bestScore * 100).toFixed(0)}%)`)
    return { value: bestMatch, corrected: true }
  }

  // Pas de correspondance trouvée - garder la valeur mais logger un warning
  console.warn(`[MetadataExtractor] Tribunal non reconnu: "${normalized}"`)
  return { value: normalized, corrected: false }
}

/**
 * Valide le champ chambre
 */
function validateChambre(chambre: string | null): string | null {
  if (!chambre) return null

  const normalized = chambre.trim().toLowerCase()

  for (const known of KNOWN_CHAMBERS) {
    if (normalized.includes(known.toLowerCase())) {
      return known
    }
  }

  return chambre.trim()
}

/**
 * Score de similarité simple entre deux chaînes (Dice coefficient)
 */
function similarityScore(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigramsA = new Set<string>()
  for (let i = 0; i < a.length - 1; i++) {
    bigramsA.add(a.substring(i, i + 2))
  }

  let intersection = 0
  for (let i = 0; i < b.length - 1; i++) {
    if (bigramsA.has(b.substring(i, i + 2))) {
      intersection++
    }
  }

  return (2 * intersection) / (a.length - 1 + b.length - 1)
}

// =============================================================================
// HELPER FUNCTIONS - DÉTECTION CHAMPS APPLICABLES
// =============================================================================

/**
 * Retourne la liste des champs métadonnées applicables selon la catégorie
 *
 * Permet d'éviter des appels LLM inutiles pour extraction de champs non pertinents.
 * Par exemple : pas besoin d'extraire "loiNumber" pour une page de jurisprudence.
 *
 * @param category Catégorie de la page (legislation, jurisprudence, doctrine, etc.)
 * @returns Liste des noms de champs applicables
 */
function getApplicableFields(category: string): string[] {
  const fieldsByCategory: Record<string, string[]> = {
    legislation: [
      'loiNumber',
      'jortNumber',
      'jortDate',
      'effectiveDate',
      'ministry',
      'codeName',
      'legalReferences',
    ],
    jurisprudence: [
      'tribunalCode',
      'chambreCode',
      'decisionNumber',
      'decisionDate',
      'parties',
      'solution',
      'legalReferences',
      'summary',
    ],
    doctrine: [
      'author',
      'coAuthors',
      'publicationName',
      'publicationDate',
      'university',
      'keywords',
      'summary',
      'legalReferences',
    ],
    jort: [
      'jortNumber',
      'jortDate',
      'loiNumber',
      'ministry',
      'legalReferences',
    ],
    modeles: [
      'documentType',
      'keywords',
      'summary',
      'effectiveDate',
    ],
    procedures: [
      'keywords',
      'summary',
      'tribunalCode',
      'legalReferences',
    ],
    autre: [
      'keywords',
      'summary',
    ],
  }

  return fieldsByCategory[category] || fieldsByCategory.autre
}

/**
 * Décide s'il faut activer le LLM pour extraction métadonnées
 *
 * Skip LLM si < 3 champs applicables pour la catégorie (économie tokens).
 * Par exemple : une page "autre" n'a que 2 champs applicables → skip LLM.
 *
 * @param category Catégorie de la page
 * @returns true si LLM doit être activé, false sinon
 */
function shouldExtractWithLLM(category: string): boolean {
  const applicableFields = getApplicableFields(category)
  const threshold = 3 // Minimum 3 champs applicables pour justifier LLM

  if (applicableFields.length < threshold) {
    console.log(
      `[Metadata Extraction] Skip LLM - Seulement ${applicableFields.length} champs applicables pour catégorie "${category}"`
    )
    return false
  }

  console.log(
    `[Metadata Extraction] Activate LLM - ${applicableFields.length} champs applicables pour catégorie "${category}"`
  )
  return true
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Extrait les métadonnées structurées d'une page web et les stocke en base
 */
export async function extractStructuredMetadata(
  pageId: string
): Promise<WebPageStructuredMetadata> {
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
    // Contenu trop court - stocker des métadonnées minimales
    const minimalMetadata = getDefaultMetadataResponse()
    minimalMetadata.extraction_confidence = 0

    await upsertStructuredMetadata(pageId, minimalMetadata, 'none', 'none')

    return getStructuredMetadata(pageId) as Promise<WebPageStructuredMetadata>
  }

  // Décider si extraction LLM est nécessaire (économie tokens)
  // Skip LLM si < 3 champs applicables pour la catégorie
  const useLLM = shouldExtractWithLLM(page.source_category)

  let parsed: LLMMetadataResponse

  if (!useLLM) {
    // Skip LLM - retourner métadonnées minimales (extraction regex basique si disponible)
    // Note : L'extraction regex basique pourrait être implémentée ici dans une future itération
    // Pour l'instant, on retourne juste les métadonnées par défaut
    parsed = getDefaultMetadataResponse()
    parsed.extraction_confidence = 0.3 // Confiance faible sans LLM
    parsed.extraction_method = 'minimal' // Indiquer méthode minimal

    await upsertStructuredMetadata(pageId, parsed, 'none', 'minimal')

    return getStructuredMetadata(pageId) as Promise<WebPageStructuredMetadata>
  }

  // Préparer le prompt LLM
  const userPrompt = formatPrompt(METADATA_EXTRACTION_USER_PROMPT, {
    url: page.url,
    title: page.title || 'Sans titre',
    category: page.source_category,
    content: truncateContent(content, 6000),
  })

  // Appeler le LLM avec fallback
  const llmResult = await callLLMWithFallback(
    METADATA_EXTRACTION_SYSTEM_PROMPT,
    userPrompt
  )

  // Parser la réponse
  parsed = parseMetadataResponse(llmResult.content)

  // Valider les champs juridiques contre les listes de référence
  const tribunalValidation = validateTribunal(parsed.tribunal)
  parsed.tribunal = tribunalValidation.value
  parsed.chambre = validateChambre(parsed.chambre)

  // Track LLM usage for metadata extraction
  await logUsage({
    userId: 'system',
    operationType: 'extraction',
    provider: llmResult.provider,
    model: llmResult.model,
    inputTokens: llmResult.usage?.promptTokens || Math.floor(content.length / 4),
    outputTokens: llmResult.usage?.completionTokens || Math.floor(llmResult.content.length / 4),
    context: {
      pageId,
      category: page.source_category,
      fieldsExtracted: Object.keys(parsed).filter(k => parsed[k as keyof typeof parsed]).length
    }
  }).catch(err => {
    console.error('[MetadataExtractor] Failed to log usage:', err)
  })

  // UPSERT dans la table web_page_structured_metadata
  await upsertStructuredMetadata(
    pageId,
    parsed,
    llmResult.provider,
    llmResult.model
  )

  // Retourner les métadonnées structurées
  return getStructuredMetadata(pageId) as Promise<WebPageStructuredMetadata>
}

/**
 * Récupère les métadonnées structurées existantes d'une page
 */
export async function getStructuredMetadata(
  pageId: string
): Promise<WebPageStructuredMetadata | null> {
  const result = await db.query(
    `SELECT * FROM web_page_structured_metadata WHERE web_page_id = $1`,
    [pageId]
  )

  if (result.rows.length === 0) {
    return null
  }

  return mapRowToStructuredMetadata(result.rows[0])
}

// =============================================================================
// FONCTIONS INTERNES
// =============================================================================

/**
 * Appelle le LLM avec fallback entre providers
 * Priorité: Ollama → DeepSeek → Groq
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
 * Parse la réponse JSON du LLM pour extraire les métadonnées
 */
function parseMetadataResponse(content: string): LLMMetadataResponse {
  // Essayer de trouver le JSON dans la réponse
  const jsonMatch = content.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    console.error('[MetadataExtractor] Réponse LLM sans JSON valide:', content.substring(0, 500))
    return getDefaultMetadataResponse()
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as LLMMetadataResponse
    // S'assurer que extraction_confidence a une valeur valide
    if (
      typeof parsed.extraction_confidence !== 'number' ||
      parsed.extraction_confidence < 0 ||
      parsed.extraction_confidence > 1
    ) {
      parsed.extraction_confidence = 0.5
    }
    return parsed
  } catch (error) {
    console.error('[MetadataExtractor] Erreur parsing JSON:', error)
    return getDefaultMetadataResponse()
  }
}

/**
 * Retourne une réponse de métadonnées par défaut en cas d'erreur
 */
function getDefaultMetadataResponse(): LLMMetadataResponse {
  return {
    document_type: null,
    document_date: null,
    document_number: null,
    title_official: null,
    language: null,
    tribunal: null,
    chambre: null,
    decision_number: null,
    decision_date: null,
    parties: null,
    text_type: null,
    text_number: null,
    publication_date: null,
    effective_date: null,
    jort_reference: null,
    author: null,
    publication_name: null,
    keywords: null,
    abstract: null,
    extraction_confidence: 0,
  }
}

/**
 * UPSERT les métadonnées structurées dans la base de données
 */
async function upsertStructuredMetadata(
  pageId: string,
  metadata: LLMMetadataResponse,
  llmProvider: string,
  llmModel: string
): Promise<void> {
  await db.query(
    `INSERT INTO web_page_structured_metadata (
      web_page_id,
      document_type, document_date, document_number,
      title_official, language,
      tribunal, chambre, decision_number, decision_date, parties,
      text_type, text_number, publication_date, effective_date, jort_reference,
      author, publication_name, keywords, abstract,
      extraction_confidence,
      llm_provider, llm_model,
      extracted_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW())
    ON CONFLICT (web_page_id) DO UPDATE SET
      document_type = EXCLUDED.document_type,
      document_date = EXCLUDED.document_date,
      document_number = EXCLUDED.document_number,
      title_official = EXCLUDED.title_official,
      language = EXCLUDED.language,
      tribunal = EXCLUDED.tribunal,
      chambre = EXCLUDED.chambre,
      decision_number = EXCLUDED.decision_number,
      decision_date = EXCLUDED.decision_date,
      parties = EXCLUDED.parties,
      text_type = EXCLUDED.text_type,
      text_number = EXCLUDED.text_number,
      publication_date = EXCLUDED.publication_date,
      effective_date = EXCLUDED.effective_date,
      jort_reference = EXCLUDED.jort_reference,
      author = EXCLUDED.author,
      publication_name = EXCLUDED.publication_name,
      keywords = EXCLUDED.keywords,
      abstract = EXCLUDED.abstract,
      extraction_confidence = EXCLUDED.extraction_confidence,
      llm_provider = EXCLUDED.llm_provider,
      llm_model = EXCLUDED.llm_model,
      extracted_at = NOW()`,
    [
      pageId,
      metadata.document_type,
      metadata.document_date,
      metadata.document_number,
      metadata.title_official,
      metadata.language,
      metadata.tribunal,
      metadata.chambre,
      metadata.decision_number,
      metadata.decision_date,
      metadata.parties ? JSON.stringify(metadata.parties) : null,
      metadata.text_type,
      metadata.text_number,
      metadata.publication_date,
      metadata.effective_date,
      metadata.jort_reference,
      metadata.author,
      metadata.publication_name,
      metadata.keywords ? JSON.stringify(metadata.keywords) : null,
      metadata.abstract,
      metadata.extraction_confidence,
      llmProvider,
      llmModel,
    ]
  )
}

/**
 * Mapper une row DB vers l'interface WebPageStructuredMetadata
 */
function mapRowToStructuredMetadata(
  row: Record<string, unknown>
): WebPageStructuredMetadata {
  return {
    id: row.id as string,
    webPageId: row.web_page_id as string,
    documentType: row.document_type as string | null,
    documentDate: row.document_date ? new Date(row.document_date as string) : null,
    documentNumber: row.document_number as string | null,
    titleOfficial: row.title_official as string | null,
    language: row.language as string | null,
    tribunal: row.tribunal as string | null,
    chambre: row.chambre as string | null,
    decisionNumber: row.decision_number as string | null,
    decisionDate: row.decision_date ? new Date(row.decision_date as string) : null,
    parties: row.parties as Record<string, unknown> | null,
    textType: row.text_type as string | null,
    textNumber: row.text_number as string | null,
    publicationDate: row.publication_date ? new Date(row.publication_date as string) : null,
    effectiveDate: row.effective_date ? new Date(row.effective_date as string) : null,
    jortReference: row.jort_reference as string | null,
    author: row.author as string | null,
    publicationName: row.publication_name as string | null,
    keywords: (row.keywords as string[]) || [],
    abstract: row.abstract as string | null,
    extractionConfidence: row.extraction_confidence as number,
    llmProvider: row.llm_provider as string | null,
    llmModel: row.llm_model as string | null,
    extractedAt: new Date(row.extracted_at as string),
  }
}
