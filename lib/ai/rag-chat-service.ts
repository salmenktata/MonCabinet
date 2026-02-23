/**
 * Service RAG Chat - Pipeline complet pour l'assistant juridique Qadhya
 *
 * Ce service orchestre:
 * 1. Récupération du contexte (documents pertinents via recherche sémantique)
 * 2. Construction du prompt avec le contexte
 * 3. Appel à Claude pour générer la réponse
 * 4. Extraction et formatage des sources
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import {
  generateEmbedding,
  formatEmbeddingForPostgres,
} from './embeddings-service'
import {
  aiConfig,
  SYSTEM_PROMPTS,
  isChatEnabled,
  getChatProvider,
  RAG_THRESHOLDS,
  SOURCE_BOOST,
  RAG_DIVERSITY,
} from './config'
import {
  batchEnrichSourcesWithMetadata,
  type ChatSource as EnhancedChatSource,
} from './enhanced-rag-search-service'
import {
  getSystemPromptForContext,
  PROMPT_CONFIG,
  type PromptContextType,
  type SupportedLanguage,
  type LegalStance,
} from './legal-reasoning-prompts'
import { searchKnowledgeBase, searchKnowledgeBaseHybrid } from './knowledge-base-service'
import {
  getCachedSearchResults,
  setCachedSearchResults,
  SearchScope,
} from '@/lib/cache/search-cache'
import {
  detectLanguage,
  getOppositeLanguage,
  DetectedLanguage,
} from './language-utils'
import { translateQuery, isTranslationAvailable } from './translation-service'
import { filterAbrogatedSources } from './rag-abrogation-filter'
import {
  validateCitationFirst,
  enforceCitationFirst,
  CITATION_FIRST_SYSTEM_PROMPT,
} from './citation-first-enforcer'
import {
  getConversationContext,
  triggerSummaryGenerationIfNeeded,
  SUMMARY_CONFIG,
} from './conversation-summary-service'
import { RAGLogger } from '@/lib/logging/rag-logger'
import { countTokens } from './token-utils'
import { getDynamicBoostFactors } from './feedback-service'
import {
  rerankDocuments,
  combineScores,
  isRerankerEnabled,
  DocumentToRerank,
} from './reranker-service'
import { recordRAGMetric } from '@/lib/metrics/rag-metrics'
import {
  callLLMWithFallback,
  callLLMStream,
  LLMMessage,
  LLMResponse,
  type StreamTokenUsage,
} from './llm-fallback-service'
import { type OperationName, getOperationProvider, getOperationModel } from './operations-config'
import {
  validateArticleCitations,
  formatValidationWarnings,
  verifyClaimSourceAlignment,
  verifyBranchAlignment,
} from './citation-validator-service'
import {
  detectAbrogatedReferences,
  formatAbrogationWarnings,
  type AbrogationWarning,
} from './abrogation-detector-service'

// Configuration Query Expansion
const ENABLE_QUERY_EXPANSION = process.env.ENABLE_QUERY_EXPANSION !== 'false'

// Timeout global pour la recherche bilingue (60 secondes par défaut)
// Réduit de 90s à 60s grâce à parallélisation recherche primaire + traduction (Phase 2.1)
const BILINGUAL_SEARCH_TIMEOUT_MS = parseInt(process.env.BILINGUAL_SEARCH_TIMEOUT_MS || '60000', 10)

// =============================================================================
// CLIENTS LLM (Ollama prioritaire, puis Groq, puis Anthropic)
// =============================================================================

let anthropicClient: Anthropic | null = null
let groqClient: OpenAI | null = null
let ollamaClient: OpenAI | null = null
let deepseekClient: OpenAI | null = null

function getOllamaClient(): OpenAI {
  if (!ollamaClient) {
    ollamaClient = new OpenAI({
      apiKey: 'ollama', // Ollama n'a pas besoin de clé
      baseURL: `${aiConfig.ollama.baseUrl}/v1`,
      timeout: 120000,
    })
  }
  return ollamaClient
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!aiConfig.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY non configuré')
    }
    anthropicClient = new Anthropic({ apiKey: aiConfig.anthropic.apiKey })
  }
  return anthropicClient
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

// =============================================================================
// TYPES
// =============================================================================

export interface ChatSource {
  documentId: string
  documentName: string
  chunkContent: string
  similarity: number
  metadata?: Record<string, unknown>
}

export interface ChatResponse {
  answer: string
  sources: ChatSource[]
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  model: string
  conversationId?: string
  citationWarnings?: string[] // Phase 2.2 - Citations non vérifiées
  abrogationWarnings?: import('./abrogation-detector-service').AbrogationWarning[] // Phase 2.3 - Lois abrogées
  qualityIndicator?: 'high' | 'medium' | 'low'
  averageSimilarity?: number
  abstentionReason?: string // Sprint 1 B1 - Raison de l'abstention si sources insuffisantes
  /** Sprint 3 RAG Audit-Proof : true si la réponse a été régénérée après détection cross-domaine */
  wasRegenerated?: boolean
  /** Sprint 3 : statut de validation des sources après génération */
  validationStatus?: 'passed' | 'regenerated' | 'insufficient_sources'
}

import type { DocumentType } from '@/lib/categories/doc-types'

export interface ChatOptions {
  dossierId?: string
  conversationId?: string
  maxContextChunks?: number
  includeJurisprudence?: boolean
  includeKnowledgeBase?: boolean
  temperature?: number
  /** Type de contexte pour sélectionner le prompt approprié */
  contextType?: PromptContextType
  /** Mode Premium: utiliser cloud providers (Groq/DeepSeek/Anthropic) au lieu d'Ollama */
  usePremiumModel?: boolean
  /** Type d'opération pour configuration spécifique */
  operationName?: OperationName
  /** Logger structuré pour traçabilité (auto-créé si non fourni) */
  logger?: RAGLogger
  /** Filtrer la recherche KB par type de document */
  docType?: DocumentType
  /** Posture stratégique : défense / attaque / neutre */
  stance?: LegalStance
  /** Exclure des catégories de sources (filtre post-retrieval). Ex: ['google_drive'] */
  excludeCategories?: string[]
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// Interface étendue pour le re-ranking
interface RankedSource extends ChatSource {
  boostedScore: number
  sourceType: string
  sourceId: string
}

// Interface pour les métriques de recherche
interface SearchMetrics {
  totalFound: number
  aboveThreshold: number
  scoreRange: {
    min: number
    max: number
    avg: number
  }
  sourceDistribution: Record<string, number>
  searchTimeMs: number
}

// =============================================================================
// RE-RANKING ET DIVERSITÉ DES SOURCES
// =============================================================================

/**
 * Détermine le type de source à partir des métadonnées
 */
function getSourceType(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return 'document'
  const type = metadata.type as string | undefined
  const category = metadata.category as string | undefined
  return category || type || 'document'
}

/**
 * Génère un identifiant unique pour une source
 */
function getSourceId(source: ChatSource): string {
  const meta = source.metadata as Record<string, unknown> | undefined
  const type = getSourceType(meta)
  // Pour les documents, utiliser documentId; pour KB, utiliser le titre
  if (type === 'knowledge_base') {
    return `kb:${source.documentName}`
  }
  return `doc:${source.documentId}`
}

// =============================================================================
// HIÉRARCHIE DES NORMES (BOOST DÉTERMINISTE)
// =============================================================================

type HierarchyClass = 'norme' | 'jurisprudence' | 'doctrine' | 'modeles' | 'autre'

const HIERARCHY_CLASS_BOOST: Record<HierarchyClass, number> = {
  norme: 1.08,
  jurisprudence: 1.04,
  doctrine: 0.97,
  modeles: 0.95,
  autre: 1.0,
}

const NORMATIVE_CATEGORIES = new Set([
  'constitution',
  'conventions',
  'legislation',
  'codes',
  'jort',
])

const JURIS_CATEGORIES = new Set(['jurisprudence'])
const MODEL_CATEGORIES = new Set(['modeles', 'templates', 'procedures', 'formulaires', 'google_drive'])
const DOCTRINE_CATEGORIES = new Set(['doctrine', 'guides', 'lexique', 'actualites', 'autre'])

const NORMATIVE_LEVEL_BOOSTS: Array<{ patterns: RegExp[]; boost: number }> = [
  { patterns: [/constitution|دستور/i], boost: 1.08 },
  { patterns: [/convention|conventions|traite|traité|اتفاقية|اتفاقيات|معاهدة/i], boost: 1.06 },
  { patterns: [/loi[\s_-]?organique|قانون\s*أساسي/i], boost: 1.04 },
  { patterns: [/^loi$|law|legislation|code|code_article|مجلة|قانون(?!\s*أساسي)/i], boost: 1.02 },
  { patterns: [/decret|décret|decree|مرسوم/i], boost: 1.01 },
  { patterns: [/ordre|order|أمر/i], boost: 1.0 },
  { patterns: [/arrete|arrêté|قرار|ministerial|وزاري/i], boost: 0.99 },
]

function normalizeHierarchyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length > 0 ? str.toLowerCase() : null
}

function classifyHierarchyType(
  category: string | null,
  docTypeMeta: string | null,
  docTypeRaw: string | null
): HierarchyClass {
  const meta = docTypeMeta || ''
  if (meta === 'textes') return 'norme'
  if (meta === 'juris') return 'jurisprudence'
  if (meta === 'doctrine') return 'doctrine'
  if (meta === 'templates' || meta === 'proc') return 'modeles'

  if (category && NORMATIVE_CATEGORIES.has(category)) return 'norme'
  if (category && JURIS_CATEGORIES.has(category)) return 'jurisprudence'
  if (category && MODEL_CATEGORIES.has(category)) return 'modeles'
  if (category && DOCTRINE_CATEGORIES.has(category)) return 'doctrine'

  if (docTypeRaw) {
    if (/juris|arret|arrêt|jugement|decision|cassation|appel/i.test(docTypeRaw)) return 'jurisprudence'
    if (/modele|formulaire|template|proc/i.test(docTypeRaw)) return 'modeles'
    if (/doctrine|commentaire|guide|lexique/i.test(docTypeRaw)) return 'doctrine'
    if (NORMATIVE_LEVEL_BOOSTS.some(level => level.patterns.some(p => p.test(docTypeRaw)))) return 'norme'
  }

  return 'autre'
}

function getNormativeLevelBoost(value: string | null): number {
  if (!value) return 1.0
  for (const level of NORMATIVE_LEVEL_BOOSTS) {
    if (level.patterns.some(p => p.test(value))) {
      return level.boost
    }
  }
  return 1.01
}

// --- Boost temporel (récence) ---
const CURRENT_YEAR = new Date().getFullYear()
const TEMPORAL_BOOST_CONFIG = {
  baseYear: 1956,
  maxYearRange: 70,
  maxBoost: 0.03,
  enabledClasses: new Set<HierarchyClass>(['norme', 'jurisprudence']),
} as const

const TEMPORAL_BOOST_ENABLED = process.env.ENABLE_TEMPORAL_BOOST !== 'false'

function extractDocumentYear(metadata: Record<string, unknown>): number | null {
  const dateFields = [
    'effective_date', 'jort_date', 'version_date',
    'document_date', 'decision_date', 'publication_date',
  ]
  for (const field of dateFields) {
    const val = metadata[field]
    if (typeof val === 'string' && val.length >= 4) {
      const year = parseInt(val.substring(0, 4), 10)
      if (year >= TEMPORAL_BOOST_CONFIG.baseYear && year <= CURRENT_YEAR) {
        return year
      }
    }
  }
  return null
}

function getTemporalRecencyBoost(
  metadata: Record<string, unknown> | undefined,
  hierarchyClass: HierarchyClass
): number {
  if (!TEMPORAL_BOOST_ENABLED) return 1.0
  if (!metadata || !TEMPORAL_BOOST_CONFIG.enabledClasses.has(hierarchyClass)) return 1.0

  const year = extractDocumentYear(metadata)
  if (year === null) return 1.0

  const { baseYear, maxYearRange, maxBoost } = TEMPORAL_BOOST_CONFIG
  const ratio = Math.min(Math.max((year - baseYear) / maxYearRange, 0), 1)
  return 1.0 + ratio * maxBoost
}

function getHierarchyBoost(metadata: Record<string, unknown> | undefined): number {
  if (!metadata) return 1.0

  const category = normalizeHierarchyValue(metadata.category)
  const docTypeMeta = normalizeHierarchyValue(metadata.doc_type)
  const docTypeRaw = normalizeHierarchyValue(
    (metadata.document_type as string | undefined) ||
    (metadata.documentType as string | undefined) ||
    (metadata.documentNature as string | undefined) ||
    (metadata.document_nature as string | undefined) ||
    (metadata.doc_type as string | undefined)
  )

  const classType = classifyHierarchyType(category, docTypeMeta, docTypeRaw)
  let boost = HIERARCHY_CLASS_BOOST[classType] || 1.0

  if (classType === 'norme') {
    boost *= getNormativeLevelBoost(docTypeRaw || category)
  }

  return boost
}

/**
 * Détecte si la query mentionne un domaine juridique spécifique
 * et retourne les patterns de titre à booster
 */
function detectDomainBoost(query: string): { pattern: string; factor: number }[] | null {
  // ✨ Fix (Feb 2026): factor 1.25→2.5 pour compenser l'écart sémantique entre queries naturelles et textes légaux.
  // Seul le code EXACT attendu reçoit 2.5×. Les mauvais codes reçoivent seulement le CODE_BOOST générique.
  const DOMAIN_KEYWORDS: { keywords: string[]; titlePatterns: string[]; factor: number }[] = [
    // Pénal
    {
      keywords: ['جزائي', 'جزائية', 'جنائي', 'عقوبة', 'عقوبات', 'جريمة', 'القتل', 'السرقة', 'الدفاع الشرعي', 'الرشوة', 'pénal', 'criminel', 'légitime défense'],
      titlePatterns: ['المجلة الجزائية'],
      factor: 2.5,
    },
    // Civil
    {
      keywords: ['مدني', 'التزامات', 'عقود', 'تعويض', 'مسؤولية مدنية', 'تقادم', 'civil', 'responsabilité', 'délictuel'],
      titlePatterns: ['مجلة الالتزامات والعقود'],
      factor: 2.5,
    },
    // Famille
    {
      keywords: ['أحوال شخصية', 'طلاق', 'زواج', 'نفقة', 'حضانة', 'ميراث', 'divorce', 'mariage', 'garde', 'famille'],
      titlePatterns: ['مجلة الأحوال الشخصية'],
      factor: 2.5,
    },
    // Travail
    {
      keywords: ['شغل', 'عمل', 'طرد تعسفي', 'إضراب', 'أجر', 'عامل', 'مؤجر', 'travail', 'licenciement', 'grève'],
      titlePatterns: ['مجلة الشغل'],
      factor: 2.5,
    },
    // Commercial: "مجلة الشركات التجارية" retiré (causait des faux positifs car raw score > المجلة التجارية)
    {
      keywords: ['تجاري', 'تجارية', 'شيك', 'إفلاس', 'تفليس', 'كمبيالة', 'commercial', 'chèque', 'faillite'],
      titlePatterns: ['المجلة التجارية'],
      factor: 2.5,
    },
    // Procédure civile
    {
      keywords: ['مرافعات', 'استئناف', 'تعقيب', 'دعوى', 'إجراءات مدنية', 'procédure'],
      titlePatterns: ['مجلة المرافعات المدنية والتجارية'],
      factor: 2.0,
    },
    // Saisies conservatoires / طرق التنفيذ
    {
      keywords: ['عقلة', 'تحفظي', 'تحفظية', 'طرق التنفيذ', 'اعتراض تحفظي', 'عريضة', 'ضرب عقلة', 'saisie', 'conservatoire'],
      titlePatterns: ['عقلة', 'طرق التنفيذ', 'تحفظ'],
      factor: 2.5,
    },
  ]

  const matches: { pattern: string; factor: number }[] = []

  for (const domain of DOMAIN_KEYWORDS) {
    const queryLower = query.toLowerCase()
    const hasKeyword = domain.keywords.some(kw => query.includes(kw) || queryLower.includes(kw))
    if (hasKeyword) {
      for (const pattern of domain.titlePatterns) {
        matches.push({ pattern, factor: domain.factor })
      }
    }
  }

  return matches.length > 0 ? matches : null
}

/**
 * Re-rank les sources avec boost par type, cross-encoder et diversité
 * Utilise:
 * 1. Boost factors dynamiques basés sur le feedback utilisateur
 * 2. Cross-encoder pour re-scorer les paires (query, document)
 * 3. Diversité pour limiter les chunks par source
 */
async function rerankSources(
  sources: ChatSource[],
  query?: string,
  boostFactors?: Record<string, number>,
  branchOptions?: { forbiddenBranches?: string[]; allowedBranches?: string[] },
  stance?: LegalStance
): Promise<ChatSource[]> {
  if (sources.length === 0) return sources

  // Récupérer les boosts dynamiques si non fournis (avec fallback sur valeurs statiques)
  let boosts: Record<string, number>
  if (boostFactors) {
    boosts = boostFactors
  } else {
    try {
      boosts = (await getDynamicBoostFactors()).factors
    } catch (err) {
      console.warn('[RAG] Erreur getDynamicBoostFactors, utilisation valeurs statiques:', err)
      boosts = SOURCE_BOOST
    }
  }

  // 1. Appliquer boost par type (dynamique ou statique) + boost sémantique par domaine
  const domainBoost = query ? detectDomainBoost(query) : null
  let rankedSources: RankedSource[] = sources.map((s) => {
    const sourceType = getSourceType(s.metadata as Record<string, unknown>)
    let boost = boosts[sourceType] || boosts.autre || SOURCE_BOOST.autre || 1.0

    // Boost sémantique: si la query mentionne un domaine, booster les résultats correspondants
    if (domainBoost && s.documentName) {
      for (const { pattern, factor } of domainBoost) {
        if (s.documentName.includes(pattern)) {
          boost *= factor
          break
        }
      }
    }

    // Sprint 1 RAG Audit-Proof: pénalité forte pour branches hors-scope (×0.05 ≈ élimination)
    if (branchOptions?.forbiddenBranches && branchOptions.forbiddenBranches.length > 0) {
      const branch = s.metadata?.branch as string | undefined
      if (branch && branch !== 'autre' && branchOptions.forbiddenBranches.includes(branch)) {
        boost *= 0.05
        console.log(`[RAG Branch] Pénalité 0.05× sur "${s.documentName}" (branch=${branch}, forbidden=[${branchOptions.forbiddenBranches.join(',')}])`)
      }
    }

    // Boost hiérarchique (normes > jurisprudence > doctrine > modèles)
    const _meta = s.metadata as Record<string, unknown> | undefined
    boost *= getHierarchyBoost(_meta)

    // Boost temporel (récence) : +0% à +3% selon l'année du document (norme/jurisprudence uniquement)
    const _hierarchyClass = classifyHierarchyType(
      (_meta?.category as string | null) ?? null,
      normalizeHierarchyValue(_meta?.doc_type),
      normalizeHierarchyValue(
        (_meta?.document_type as string | undefined) ||
        (_meta?.documentType as string | undefined) ||
        (_meta?.doc_type as string | undefined)
      )
    )
    boost *= getTemporalRecencyBoost(_meta, _hierarchyClass)

    // Boost stance-aware : favoriser les types de documents pertinents à la posture
    // Fix 4 : fallback sur category si doc_type absent (évite boost nul silencieux)
    if (stance === 'defense' || stance === 'attack') {
      const CATEGORY_TO_DOCTYPE: Record<string, string> = {
        codes: 'TEXTES', legislation: 'TEXTES', lois: 'TEXTES',
        jurisprudence: 'JURIS', cassation: 'JURIS',
        procedure: 'PROC', modeles: 'TEMPLATES', doctrine: 'DOCTRINE',
      }
      const rawDocType = s.metadata?.doc_type as string | undefined
      const rawCategory = s.metadata?.category as string | undefined
      const docType = rawDocType ?? (rawCategory ? CATEGORY_TO_DOCTYPE[rawCategory] : undefined)

      if (stance === 'defense') {
        if (docType === 'JURIS') boost *= 1.3
        if (docType === 'PROC') boost *= 1.2
      } else {
        if (docType === 'TEXTES') boost *= 1.3
        if (docType === 'JURIS') boost *= 1.2
      }
    }

    return {
      ...s,
      boostedScore: s.similarity * boost,
      sourceType,
      sourceId: getSourceId(s),
    }
  })

  // 2. Appliquer cross-encoder re-ranking si activé et query fournie
  if (isRerankerEnabled() && query && rankedSources.length > 1) {
    try {
      const docsToRerank: DocumentToRerank[] = rankedSources.map((s) => ({
        content: s.chunkContent,
        originalScore: s.boostedScore,
        metadata: s.metadata as Record<string, unknown>,
      }))

      const rerankedResults = await rerankDocuments(query, docsToRerank, undefined, { useCrossEncoder: true })

      // Combiner scores cross-encoder avec boosts existants
      rankedSources = rerankedResults.map((result) => {
        const original = rankedSources[result.index]
        const finalScore = combineScores(result.score, original.boostedScore)
        return {
          ...original,
          boostedScore: finalScore,
        }
      })

      // Re-trier par score combiné
      rankedSources.sort((a, b) => b.boostedScore - a.boostedScore)
    } catch (error) {
      console.error('[RAG] Erreur cross-encoder, fallback boost simple:', error)
      // Continuer avec le tri par boost simple
      rankedSources.sort((a, b) => b.boostedScore - a.boostedScore)
    }
  } else {
    // Trier par score boosté décroissant
    rankedSources.sort((a, b) => b.boostedScore - a.boostedScore)
  }

  // 3. Appliquer diversité : limiter chunks par source
  const sourceCount = new Map<string, number>()
  const diversifiedSources: ChatSource[] = []

  for (const source of rankedSources) {
    const count = sourceCount.get(source.sourceId) || 0
    if (count < RAG_DIVERSITY.maxChunksPerSource) {
      sourceCount.set(source.sourceId, count + 1)
      // Retourner ChatSource sans les champs ajoutés
      const { boostedScore, sourceType, sourceId, ...originalSource } = source
      diversifiedSources.push(originalSource)
    }
  }

  return diversifiedSources
}

/**
 * Compte les sources par type
 */
function countSourcesByType(sources: ChatSource[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const source of sources) {
    const type = getSourceType(source.metadata as Record<string, unknown>)
    counts[type] = (counts[type] || 0) + 1
  }
  return counts
}

/**
 * Log les métriques de recherche RAG
 */
function logSearchMetrics(metrics: SearchMetrics): void {
  console.log('[RAG Search]', JSON.stringify({
    totalFound: metrics.totalFound,
    aboveThreshold: metrics.aboveThreshold,
    scores: {
      min: metrics.scoreRange.min.toFixed(3),
      max: metrics.scoreRange.max.toFixed(3),
      avg: metrics.scoreRange.avg.toFixed(3),
    },
    sources: metrics.sourceDistribution,
    timeMs: metrics.searchTimeMs,
  }))
}

// =============================================================================
// RECHERCHE CONTEXTUELLE
// =============================================================================

// Type de retour pour les recherches avec info de cache
interface SearchResult {
  sources: ChatSource[]
  cacheHit: boolean
}

/**
 * Recherche les documents pertinents pour une question
 * Avec cache Redis pour les recherches répétées.
 *
 * @exported Pour tests unitaires
 */
export async function searchRelevantContext(
  question: string,
  userId: string,
  options: ChatOptions = {}
): Promise<SearchResult> {
  const startTime = Date.now()
  const {
    dossierId,
    maxContextChunks = aiConfig.rag.maxResults,
    includeJurisprudence = false,
    includeKnowledgeBase = true, // Activé par défaut
  } = options

  // Phase 1: Legal Router — remplace classifyQuery par routeQuery (classification + tracks en 1 appel)
  // Lancé en parallèle avec l'expansion/embedding pour recouvrir la latence
  const _earlyRouterPromise = includeKnowledgeBase
    ? import('./legal-router-service').then(m => m.routeQuery(question, { maxTracks: 4 }))
    : null

  // ✨ OPTIMISATION RAG - Sprint 2 (Feb 2026) + Fix requêtes longues (Feb 16, 2026)
  // 1. Query Expansion pour requêtes courtes / Condensation pour requêtes longues
  let embeddingQuestion = question // Question utilisée pour l'embedding
  if (ENABLE_QUERY_EXPANSION) {
    if (question.length < 50) {
      // Requêtes courtes : expansion LLM (ajouter termes juridiques)
      const { expandQuery } = await import('./query-expansion-service')
      try {
        embeddingQuestion = await expandQuery(question)
        if (embeddingQuestion !== question) {
          console.log(`[RAG Search] Query expandée: ${question} → ${embeddingQuestion.substring(0, 80)}...`)
        }
      } catch (error) {
        console.error('[RAG Search] Erreur expansion query:', error)
        embeddingQuestion = question
      }
    } else if (question.length > 200) {
      // Requêtes longues : condensation (extraire concepts clés pour embedding ciblé)
      const { condenseQuery } = await import('./query-expansion-service')
      try {
        // Timeout 5s : condenseQuery appelle un LLM → peut bloquer si lent
        embeddingQuestion = await withTimeout(condenseQuery(question), 5000, 'condenseQuery')
          .catch(() => question) // Fallback silencieux : question originale
        if (embeddingQuestion !== question) {
          console.log(`[RAG Search] Query condensée: ${question.length} chars → "${embeddingQuestion}" (${embeddingQuestion.length} chars)`)
        }
      } catch (error) {
        console.error('[RAG Search] Erreur condensation query:', error)
        embeddingQuestion = question
      }
    }
  }

  // 2. Enrichissement synonymes juridiques arabes (applicable à toutes les queries)
  // Lookup instantané O(n) - pas de LLM, pas de latence ajoutée
  try {
    const { enrichQueryWithLegalSynonyms } = await import('./query-expansion-service')
    const enriched = enrichQueryWithLegalSynonyms(embeddingQuestion)
    if (enriched !== embeddingQuestion) {
      console.log(`[RAG Search] Synonymes juridiques: ${embeddingQuestion.substring(0, 50)}... → +synonymes`)
      embeddingQuestion = enriched
    }
  } catch (error) {
    // Non-bloquant : si enrichissement échoue, on continue avec la query existante
  }

  // Enrichissement stance-aware : ajout de termes spécifiques à la posture juridique
  // Fix 2 : uniquement pour les requêtes arabes (évite pollution embedding FR)
  const stanceTerms: Record<string, string> = {
    defense: 'بطلان دفع رفض عدم قبول تقادم عدم الاختصاص',
    attack: 'مسؤولية تعويض إخلال التزام ضرر مطالبة',
  }
  if (options.stance && options.stance !== 'neutral' && stanceTerms[options.stance]) {
    const embeddingLang = detectLanguage(embeddingQuestion)
    if (embeddingLang === 'ar') {
      embeddingQuestion = `${embeddingQuestion} ${stanceTerms[options.stance]}`
    }
  }

  // Générer l'embedding de la question transformée (expandée ou condensée)
  const queryEmbedding = await generateEmbedding(embeddingQuestion, {
    operationName: options.operationName,
  })
  const embeddingStr = formatEmbeddingForPostgres(queryEmbedding.embedding)

  // Vérifier le cache de recherche
  const searchScope: SearchScope = { userId, dossierId }
  const cachedResults = await getCachedSearchResults(queryEmbedding.embedding, searchScope)
  if (cachedResults) {
    console.log(`[RAG Search] Cache HIT - ${cachedResults.length} sources (${Date.now() - startTime}ms)`)
    return { sources: cachedResults as ChatSource[], cacheHit: true }
  }

  const allSources: ChatSource[] = []

  // Recherche dans les documents du dossier ou de l'utilisateur
  // Skip si userId n'est pas un UUID valide (ex: 'eval-system' dans les benchmarks)
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
  let docSql: string
  let docParams: (string | number)[]

  if (!isValidUUID) {
    // Skip document_embeddings search for non-UUID userIds (eval, system, etc.)
    docSql = 'SELECT 1 WHERE false'
    docParams = []
  } else if (dossierId) {
    docSql = `
      SELECT
        de.document_id,
        d.nom as document_name,
        de.content_chunk,
        (1 - (de.embedding <=> $1::vector)) as similarity,
        de.metadata
      FROM document_embeddings de
      JOIN documents d ON de.document_id = d.id
      WHERE de.user_id = $2
        AND d.dossier_id = $3
        AND (1 - (de.embedding <=> $1::vector)) >= $4
      ORDER BY de.embedding <=> $1::vector
      LIMIT $5
    `
    docParams = [
      embeddingStr,
      userId,
      dossierId,
      RAG_THRESHOLDS.documents,
      maxContextChunks * 2, // Récupérer plus pour le re-ranking
    ]
  } else {
    docSql = `
      SELECT
        de.document_id,
        d.nom as document_name,
        de.content_chunk,
        (1 - (de.embedding <=> $1::vector)) as similarity,
        de.metadata
      FROM document_embeddings de
      JOIN documents d ON de.document_id = d.id
      WHERE de.user_id = $2
        AND (1 - (de.embedding <=> $1::vector)) >= $3
      ORDER BY de.embedding <=> $1::vector
      LIMIT $4
    `
    docParams = [
      embeddingStr,
      userId,
      RAG_THRESHOLDS.documents,
      maxContextChunks * 2, // Récupérer plus pour le re-ranking
    ]
  }

  const docResult = await db.query(docSql, docParams)

  for (const row of docResult.rows) {
    allSources.push({
      documentId: row.document_id,
      documentName: row.document_name,
      chunkContent: row.content_chunk,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata,
    })
  }

  // Optionnel: Recherche dans la jurisprudence
  if (includeJurisprudence) {
    const juriSql = `
      SELECT
        j.id as document_id,
        j.decision_number || ' - ' || j.court as document_name,
        COALESCE(j.summary, LEFT(j.full_text, 800)) as content_chunk,
        (1 - (j.embedding <=> $1::vector)) as similarity,
        jsonb_build_object(
          'type', 'jurisprudence',
          'court', j.court,
          'chamber', j.chamber,
          'domain', j.domain,
          'date', j.decision_date,
          'articles', j.articles_cited
        ) as metadata
      FROM jurisprudence j
      WHERE j.embedding IS NOT NULL
        AND (1 - (j.embedding <=> $1::vector)) >= $2
      ORDER BY j.embedding <=> $1::vector
      LIMIT $3
    `

    const juriResult = await db.query(juriSql, [
      embeddingStr,
      RAG_THRESHOLDS.jurisprudence,
      Math.ceil(maxContextChunks / 2), // Plus de jurisprudence pour le re-ranking
    ])

    for (const row of juriResult.rows) {
      allSources.push({
        documentId: row.document_id,
        documentName: row.document_name,
        chunkContent: row.content_chunk,
        similarity: parseFloat(row.similarity),
        metadata: row.metadata,
      })
    }
  }

  // Détection langue pour seuils adaptatifs (arabe → scores plus bas)
  const queryLangForSearch = detectLanguage(question)

  // Résoudre le router une seule fois (hissé pour réutilisation par relevance gating + multi-track)
  // Si le routeur échoue (rate limit, timeout), on continue sans classification → recherche KB globale
  let routerResult: Awaited<ReturnType<typeof import('./legal-router-service').routeQuery>> | null = null
  if (includeKnowledgeBase) {
    try {
      routerResult = _earlyRouterPromise
        ? await _earlyRouterPromise
        : await (await import('./legal-router-service')).routeQuery(question, { maxTracks: 4 })
    } catch (routerError) {
      console.warn('[RAG Search] Router échoué, fallback recherche KB sans classification:', routerError instanceof Error ? routerError.message : routerError)
    }
  }
  const classification = routerResult?.classification || null

  // Recherche dans la base de connaissances partagée
  // Note: si classification est null (routeQuery échoué/rate limited), on fait quand même une recherche globale
  if (includeKnowledgeBase) {
    try {

      let kbResults: Array<{
        knowledgeBaseId: string
        title: string
        chunkContent: string
        similarity: number
        category: string
        metadata: Record<string, unknown>
      }> = []

      // Recherche globale hybride + multi-track si tracks disponibles
      const globalThreshold = queryLangForSearch === 'ar'
        ? Math.min(RAG_THRESHOLDS.knowledgeBase, 0.30)
        : RAG_THRESHOLDS.knowledgeBase

      // Phase 1: Multi-track retrieval si le router a généré plusieurs tracks ET classification disponible
      const tracks = routerResult?.tracks || []
      if (tracks.length > 1 && classification) {
        console.log(
          `[RAG Search] Multi-track: ${tracks.length} tracks, ${tracks.reduce((a, t) => a + t.searchQueries.length, 0)} queries (source: ${routerResult?.source}, confiance: ${(classification.confidence * 100).toFixed(1)}%)`
        )
        const { searchMultiTrack } = await import('./knowledge-base-service')
        kbResults = await searchMultiTrack(tracks, {
          topKPerQuery: 5,
          threshold: globalThreshold,
          operationName: options.operationName,
          limit: maxContextChunks,
        })
      } else {
        // Fallback: recherche globale hybride classique (aussi utilisé si classification null)
        if (!classification) {
          console.warn('[RAG Search] Classification null (routeQuery échoué?), fallback recherche KB globale')
        } else {
          console.log(
            `[RAG Search] Recherche KB globale hybride (classifieur: ${classification.categories.join(', ')}, domaines: ${classification.domains.join(',') || 'aucun'}, confiance: ${(classification.confidence * 100).toFixed(1)}%, seuil: ${globalThreshold})`
          )
        }
        kbResults = await searchKnowledgeBaseHybrid(embeddingQuestion, {
          limit: maxContextChunks,
          threshold: globalThreshold,
          operationName: options.operationName,
          docType: options.docType,
        })
      }

      // Filtrer les catégories exclues (post-retrieval)
      if (options.excludeCategories && options.excludeCategories.length > 0) {
        const before = kbResults.length
        kbResults = kbResults.filter(
          r => !options.excludeCategories!.includes(r.category as string)
        )
        const excluded = before - kbResults.length
        if (excluded > 0) {
          console.log(`[RAG Search] excludeCategories: ${excluded} chunks exclus (${options.excludeCategories.join(', ')})`)
        }
      }

      // Ajouter résultats KB aux sources
      for (const result of kbResults) {
        allSources.push({
          documentId: result.knowledgeBaseId,
          documentName: `[قاعدة المعرفة] ${result.title}`,
          chunkContent: result.chunkContent,
          similarity: result.similarity,
          metadata: {
            type: 'knowledge_base',
            category: result.category,
            ...result.metadata,
          },
        })
      }
    } catch (error) {
      // CRITIQUE: Ne PAS avaler silencieusement les erreurs KB
      // Si la KB search échoue, le chat retournera "pas de documents" → mauvaise UX
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[RAG Search] ❌ ERREUR CRITIQUE recherche knowledge base:', errMsg)
      console.error('[RAG Search] Stack:', error instanceof Error ? error.stack : 'N/A')
      // Propager l'erreur pour déclencher le mode dégradé au lieu de retourner 0 sources
      throw error
    }
  }

  // Filtrer par seuil minimum absolu (plus bas pour l'arabe: embeddings produisent des scores plus faibles)
  const queryLangForThreshold = detectLanguage(question)
  const effectiveMinimum = queryLangForThreshold === 'ar'
    ? Math.min(RAG_THRESHOLDS.minimum, 0.30)
    : RAG_THRESHOLDS.minimum
  const aboveThreshold = allSources.filter(
    (s) => s.similarity >= effectiveMinimum
  )

  // Sprint 1 RAG Audit-Proof: branches issues du routeur pour pénaliser sources hors-domaine
  const branchOptions = routerResult
    ? { forbiddenBranches: routerResult.forbiddenBranches, allowedBranches: routerResult.allowedBranches }
    : undefined

  // Appliquer re-ranking avec boost dynamique, cross-encoder et diversité
  let rerankedSources = await rerankSources(aboveThreshold, question, undefined, branchOptions, options.stance)

  // Seuils adaptatifs: si moins de 3 résultats, baisser le seuil de 20% (une seule fois)
  // Plancher plus bas pour l'arabe (embeddings arabes produisent des scores plus faibles)
  const queryLang = detectLanguage(question)
  const ADAPTIVE_FLOOR = queryLang === 'ar' ? 0.35 : 0.45
  if (rerankedSources.length < 3 && allSources.length > rerankedSources.length) {
    const adaptiveThreshold = Math.max(RAG_THRESHOLDS.minimum * 0.8, ADAPTIVE_FLOOR)
    if (adaptiveThreshold < RAG_THRESHOLDS.minimum) {
      const adaptiveResults = allSources.filter(
        (s) => s.similarity >= adaptiveThreshold
      )
      if (adaptiveResults.length > rerankedSources.length) {
        console.log(`[RAG Search] Seuil adaptatif: ${rerankedSources.length} → ${adaptiveResults.length} résultats (seuil ${adaptiveThreshold.toFixed(2)}, plancher ${ADAPTIVE_FLOOR})`)
        rerankedSources = await rerankSources(adaptiveResults, question, undefined, branchOptions, options.stance)
      }
    }
  }

  // Phase 2: Relevance Gating — bloquer sources hors-domaine
  if (classification && classification.confidence >= 0.7 && classification.domains.length > 0) {
    try {
      const { gateSourceRelevance } = await import('./relevance-gate-service')
      const gating = await gateSourceRelevance(question, rerankedSources, classification)
      if (gating.blocked.length > 0) {
        console.log(`[RAG Gate] Bloqué ${gating.blocked.length} sources hors-domaine`)
        rerankedSources = gating.passed
      }
    } catch (error) {
      console.error('[RAG Gate] Erreur gating, skip:', error instanceof Error ? error.message : error)
    }
  }

  // FILTRAGE ABROGATIONS : Exclure documents abrogés/suspendus
  const filteredResult = await filterAbrogatedSources(rerankedSources, {
    enableFilter: true,
    warnOnModified: true,
    logExclusions: true,
  })

  // Si trop de sources filtrées, logger pour monitoring
  if (filteredResult.filteredCount > 0) {
    console.log(`[RAG Filter] ⚠️  ${filteredResult.filteredCount} source(s) filtrée(s) (abrogées/suspendues)`)
  }

  // Limiter au nombre demandé (sur sources valides filtrées)
  let finalSources = filteredResult.validSources.slice(0, maxContextChunks)

  // Hard quality gate: si TOUTES les sources sont en dessous du seuil, ne pas les envoyer au LLM
  // Seuil différencié : résultats vectoriels (similarity = vecSim réel) sont plus fiables que BM25-only
  // Seuils plus bas pour l'arabe : embeddings OpenAI donnent des scores 0.35-0.65 pour contenu pertinent
  // BM25-only: synthetic similarity = max(0.35, bm25Rank*10) → plancher 0.35, donc gate < 0.35 = jamais filtré
  const HARD_QUALITY_GATE = queryLang === 'ar' ? 0.30 : 0.50
  const HARD_QUALITY_GATE_VECTOR = queryLang === 'ar' ? 0.20 : 0.35
  const hasVectorResults = finalSources.some(s => s.metadata?.searchType === 'vector' || s.metadata?.searchType === 'hybrid')
  const effectiveGate = hasVectorResults ? HARD_QUALITY_GATE_VECTOR : HARD_QUALITY_GATE
  if (finalSources.length > 0 && finalSources.every(s => s.similarity < effectiveGate)) {
    const bestScore = Math.max(...finalSources.map(s => s.similarity))
    console.warn(`[RAG Search] ⚠️ Hard quality gate (${effectiveGate}, lang=${queryLang}): toutes ${finalSources.length} sources < seuil, meilleur score=${bestScore.toFixed(3)}, retour 0 sources`)
    return { sources: [], cacheHit: false }
  }

  // Calculer et logger les métriques
  const scores = allSources.map((s) => s.similarity)
  const searchTimeMs = Date.now() - startTime

  if (scores.length > 0) {
    const metrics: SearchMetrics = {
      totalFound: allSources.length,
      aboveThreshold: aboveThreshold.length,
      scoreRange: {
        min: Math.min(...scores),
        max: Math.max(...scores),
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      },
      sourceDistribution: countSourcesByType(finalSources),
      searchTimeMs,
    }
    logSearchMetrics(metrics)
  } else {
    console.log('[RAG Search]', JSON.stringify({
      totalFound: 0,
      aboveThreshold: 0,
      timeMs: searchTimeMs,
    }))
  }

  // Mettre en cache les résultats
  if (finalSources.length > 0) {
    await setCachedSearchResults(queryEmbedding.embedding, finalSources, searchScope)
  }

  return { sources: finalSources, cacheHit: false }
}

/**
 * Helper pour créer une promesse avec timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, context: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${context} (${ms}ms)`)), ms)
    ),
  ])
}

/**
 * Recherche bilingue avec query expansion AR ↔ FR
 * Traduit la question et fusionne les résultats des deux langues.
 * Applique un timeout global pour éviter les latences excessives.
 */
async function searchRelevantContextBilingual(
  question: string,
  userId: string,
  options: ChatOptions = {}
): Promise<SearchResult> {
  const startTime = Date.now()

  // Détecter la langue de la question
  const detectedLang = detectLanguage(question)
  console.log(`[RAG Bilingual] Langue détectée: ${detectedLang}`)

  // ========================================
  // PARALLÉLISATION Phase 2.1 : Recherche primaire + Traduction en parallèle
  // ========================================
  const targetLang = getOppositeLanguage(detectedLang)
  const canTranslate = ENABLE_QUERY_EXPANSION && isTranslationAvailable()

  // Lancer recherche primaire ET traduction en PARALLÈLE
  const [primaryResult, translationResult] = await Promise.allSettled([
    // Recherche primaire avec timeout global
    withTimeout(
      searchRelevantContext(question, userId, options),
      BILINGUAL_SEARCH_TIMEOUT_MS,
      'recherche primaire'
    ),

    // Traduction parallèle (ou reject si désactivé)
    canTranslate
      ? withTimeout(
          translateQuery(question, detectedLang === 'mixed' ? 'fr' : detectedLang, targetLang),
          5000, // 5s max pour traduction (augmenté de 3s pour éviter timeouts)
          'traduction'
        )
      : Promise.reject(new Error('Translation disabled')),
  ])

  // Vérifier résultat recherche primaire — fallback KB search simple si timeout
  if (primaryResult.status === 'rejected') {
    const errMsg = primaryResult.reason instanceof Error ? primaryResult.reason.message : String(primaryResult.reason)
    console.error('[RAG Bilingual] Erreur recherche primaire:', errMsg)

    // Fallback : recherche KB simple (sans router/expansion) pour éviter 0 résultats
    try {
      console.log('[RAG Bilingual] Fallback recherche KB simple...')
      const fallbackResults = await withTimeout(
        searchKnowledgeBaseHybrid(question, { limit: 10 }),
        15000,
        'fallback KB search'
      )
      if (fallbackResults.length > 0) {
        const fallbackSources: ChatSource[] = fallbackResults.slice(0, 5).map(r => ({
          documentId: r.knowledgeBaseId,
          documentName: r.title || 'Document',
          chunkContent: r.chunkContent,
          similarity: r.similarity || 0,
          metadata: r.metadata,
        }))
        console.log(`[RAG Bilingual] Fallback: ${fallbackSources.length} sources récupérées`)
        return { sources: fallbackSources, cacheHit: false }
      }
    } catch (fallbackErr) {
      console.error('[RAG Bilingual] Fallback KB search échoué:', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr)
    }

    return { sources: [], cacheHit: false }
  }

  // Si traduction non disponible ou échouée, retourner résultats primaires seuls
  if (!canTranslate || translationResult.status === 'rejected') {
    console.log(
      `[RAG Bilingual] Traduction ${!canTranslate ? 'désactivée' : 'échouée'}, retour résultats primaires seuls`
    )
    return primaryResult.value
  }

  // Vérifier temps restant pour recherche secondaire
  const elapsed = Date.now() - startTime
  const remaining = BILINGUAL_SEARCH_TIMEOUT_MS - elapsed

  // Si moins de 15s restantes, ne pas lancer la recherche secondaire
  if (remaining < 15000) {
    console.log(
      `[RAG Bilingual] Temps restant insuffisant (${remaining}ms < 15s), skip recherche secondaire`
    )
    return primaryResult.value
  }

  // Vérifier validité traduction
  const translation = translationResult.value
  if (!translation.success || translation.translatedText === question) {
    console.log('[RAG Bilingual] Traduction identique ou invalide, retour résultats primaires')
    return primaryResult.value
  }

  console.log(`[RAG Bilingual] Question traduite: "${translation.translatedText.substring(0, 50)}..."`)

  // ========================================
  // Recherche secondaire avec timeout adaptatif
  // ========================================
  let secondaryResult: SearchResult = { sources: [], cacheHit: false }

  try {
    secondaryResult = await withTimeout(
      searchRelevantContext(translation.translatedText, userId, options),
      Math.max(15000, remaining), // Au moins 15s pour recherche secondaire
      'recherche secondaire'
    )
  } catch (error) {
    console.warn(
      '[RAG Bilingual] Timeout recherche secondaire, retour résultats primaires seuls:',
      error instanceof Error ? error.message : error
    )
    return primaryResult.value
  }

  // ========================================
  // Fusion résultats primaires + secondaires
  // ========================================
  const primarySources = primaryResult.value.sources
  const secondarySources = secondaryResult.sources

  // Poids: primaire 0.7, secondaire 0.3
  const PRIMARY_WEIGHT = 0.7
  const SECONDARY_WEIGHT = 0.3

  const mergedSources: ChatSource[] = []
  const seenChunks = new Set<string>()

  // Ajouter les sources primaires avec poids ajusté
  for (const source of primarySources) {
    const key = `${source.documentId}:${source.chunkContent.substring(0, 100)}`
    if (!seenChunks.has(key)) {
      seenChunks.add(key)
      mergedSources.push({
        ...source,
        similarity: source.similarity * PRIMARY_WEIGHT + (1 - source.similarity) * 0.1,
      })
    }
  }

  // Ajouter les sources secondaires avec poids ajusté
  for (const source of secondarySources) {
    const key = `${source.documentId}:${source.chunkContent.substring(0, 100)}`
    if (!seenChunks.has(key)) {
      seenChunks.add(key)
      mergedSources.push({
        ...source,
        similarity: source.similarity * SECONDARY_WEIGHT,
      })
    }
  }

  // Re-trier par similarité ajustée
  mergedSources.sort((a, b) => b.similarity - a.similarity)

  // Limiter au nombre demandé
  const maxResults = options.maxContextChunks || aiConfig.rag.maxResults
  const finalSources = mergedSources.slice(0, maxResults)

  const totalTimeMs = Date.now() - startTime
  console.log(
    `[RAG Bilingual PARALLEL] Fusion: ${primarySources.length} primaires + ${secondarySources.length} secondaires → ${finalSources.length} finaux (${totalTimeMs}ms, -${Math.round((1 - totalTimeMs / BILINGUAL_SEARCH_TIMEOUT_MS) * 100)}% vs timeout)`
  )

  // Cache hit si au moins une des deux recherches était en cache
  return {
    sources: finalSources,
    cacheHit: primaryResult.value.cacheHit || secondaryResult.cacheHit,
  }
}

// =============================================================================
// CONSTRUCTION DU PROMPT
// =============================================================================

// Limite de tokens pour le contexte RAG (6000 par défaut pour les LLM modernes 8k+)
const RAG_MAX_CONTEXT_TOKENS = parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '6000', 10)

// Templates bilingues pour le message utilisateur
const USER_MESSAGE_TEMPLATES = {
  ar: {
    prefix: 'وثائق مرجعية:',
    questionLabel: 'السؤال:',
    analysisHint: 'تعليمات: استخرج الشروط القانونية من كل فصل، حدّد الآجال والإجراءات العملية، واربط بين النصوص المختلفة.',
  },
  fr: {
    prefix: 'Documents du dossier:',
    questionLabel: 'Question:',
    analysisHint: 'Instructions: extraire les conditions légales de chaque article, identifier les délais et procédures, relier les textes entre eux.',
  },
}

/**
 * Calcule les métriques de qualité des sources pour avertir le LLM
 */
function computeSourceQualityMetrics(sources: ChatSource[]): {
  averageSimilarity: number
  qualityLevel: 'high' | 'medium' | 'low'
  warningMessage: string | null
} {
  if (sources.length === 0) {
    return { averageSimilarity: 0, qualityLevel: 'low', warningMessage: null }
  }
  const avg = sources.reduce((a, s) => a + s.similarity, 0) / sources.length

  if (avg >= 0.70) {
    return { averageSimilarity: avg, qualityLevel: 'high', warningMessage: null }
  }
  if (avg >= 0.55) {
    return {
      averageSimilarity: avg,
      qualityLevel: 'medium',
      warningMessage: `⚠️ AVERTISSEMENT: Les documents ci-dessous ont une pertinence MOYENNE (similarité ~${Math.round(avg * 100)}%). Vérifie leur pertinence thématique avant de les citer. Si aucun ne correspond au domaine de la question, dis-le explicitement.`,
    }
  }
  return {
    averageSimilarity: avg,
    qualityLevel: 'low',
    warningMessage: `🚨 ATTENTION: Les documents ci-dessous ont une FAIBLE pertinence (similarité ~${Math.round(avg * 100)}%).
Ils proviennent probablement d'un domaine juridique DIFFÉRENT de la question posée.

INSTRUCTIONS STRICTES:
1. NE CITE PAS ces sources comme si elles répondaient à la question
2. NE CONSTRUIS PAS de raisonnement juridique basé sur ces sources
3. Indique clairement que la base de connaissances ne contient pas de documents pertinents
4. Fournis des orientations GÉNÉRALES basées sur tes connaissances du droit tunisien
5. Recommande de consulter les textes officiels pour une réponse précise`,
  }
}

// Labels bilingues pour le contexte RAG
const CONTEXT_LABELS = {
  ar: {
    jurisprudence: 'اجتهاد قضائي',
    chamber: 'الغرفة',
    date: 'التاريخ',
    articles: 'الفصول المذكورة',
    na: 'غ/م',
    knowledgeBase: 'قاعدة المعرفة',
    document: 'وثيقة',
    noDocuments: 'لا توجد وثائق ذات صلة.',
    categoryLabels: {
      jurisprudence: 'اجتهاد قضائي',
      code: 'قانون',
      doctrine: 'فقه',
      modele: 'نموذج',
      autre: 'أخرى',
    } as Record<string, string>,
    defaultCategory: 'مرجع',
  },
  fr: {
    jurisprudence: 'Jurisprudence',
    chamber: 'Chambre',
    date: 'Date',
    articles: 'Articles cités',
    na: 'N/D',
    knowledgeBase: 'Base de connaissances',
    document: 'Document',
    noDocuments: 'Aucun document pertinent trouvé.',
    categoryLabels: {
      jurisprudence: 'Jurisprudence',
      code: 'Code',
      doctrine: 'Doctrine',
      modele: 'Modèle',
      autre: 'Autre',
    } as Record<string, string>,
    defaultCategory: 'Référence',
  },
}

/**
 * Construit le contexte à partir des sources avec limite de tokens
 * Les labels sont adaptés à la langue détectée de la question
 */
/**
 * Enrichit les métadonnées d'une source avec les données structurées de la DB
 */
async function enrichSourceWithStructuredMetadata(source: ChatSource): Promise<any> {
  if (!source.documentId) return source.metadata

  try {
    const result = await db.query(
      `SELECT
        meta.tribunal_code,
        trib_tax.label_ar AS tribunal_label_ar,
        trib_tax.label_fr AS tribunal_label_fr,
        meta.chambre_code,
        chambre_tax.label_ar AS chambre_label_ar,
        chambre_tax.label_fr AS chambre_label_fr,
        meta.decision_date,
        meta.decision_number,
        meta.legal_basis,
        meta.solution,
        meta.extraction_confidence,
        -- Compteurs relations
        (SELECT COUNT(*) FROM kb_legal_relations WHERE source_kb_id = $1 AND validated = true) AS cites_count,
        (SELECT COUNT(*) FROM kb_legal_relations WHERE target_kb_id = $1 AND validated = true) AS cited_by_count
      FROM kb_structured_metadata meta
      LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
      LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
      WHERE meta.knowledge_base_id = $1`,
      [source.documentId]
    )

    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        ...source.metadata,
        structuredMetadata: {
          tribunalCode: row.tribunal_code,
          tribunalLabelAr: row.tribunal_label_ar,
          tribunalLabelFr: row.tribunal_label_fr,
          chambreCode: row.chambre_code,
          chambreLabelAr: row.chambre_label_ar,
          chambreLabelFr: row.chambre_label_fr,
          decisionDate: row.decision_date,
          decisionNumber: row.decision_number,
          legalBasis: row.legal_basis,
          solution: row.solution,
          extractionConfidence: row.extraction_confidence,
          citesCount: parseInt(row.cites_count || '0', 10),
          citedByCount: parseInt(row.cited_by_count || '0', 10),
        },
      }
    }
  } catch (error) {
    console.error('[RAG Context] Erreur enrichissement métadonnées:', error)
  }

  return source.metadata
}

/**
 * Construit le contexte à partir des sources avec métadonnées enrichies
 *
 * @exported Pour tests unitaires
 */
export async function buildContextFromSources(sources: ChatSource[], questionLang?: DetectedLanguage): Promise<string> {
  // Choisir les labels selon la langue
  const lang = questionLang === 'ar' ? 'ar' : 'fr'
  const labels = CONTEXT_LABELS[lang]

  if (sources.length === 0) {
    return labels.noDocuments
  }

  const contextParts: string[] = []
  let totalTokens = 0
  let sourcesUsed = 0

  // Enrichir sources avec métadonnées structurées (batch - une seule requête SQL)
  const metadataMap = await batchEnrichSourcesWithMetadata(sources)

  const enrichedSources = sources.map((source) => {
    if (!source.documentId) return source

    const batchMetadata = metadataMap.get(source.documentId)
    if (batchMetadata) {
      return {
        ...source,
        metadata: {
          ...source.metadata,
          ...batchMetadata,
        },
      }
    }
    return source
  })

  for (let i = 0; i < enrichedSources.length; i++) {
    const source = enrichedSources[i]
    const meta = source.metadata as any
    const sourceType = meta?.type
    const structuredMeta = meta?.structuredMetadata

    // Indicateur de pertinence visible par le LLM
    const relevanceLabel = source.similarity >= 0.75 ? '✅ Très pertinent'
      : source.similarity >= 0.60 ? '⚠️ Pertinence moyenne'
      : '❌ Pertinence faible'
    const relevancePct = `${Math.round(source.similarity * 100)}%`

    // Labels fixes [Source-N], [Juris-N], [KB-N] — compatibles avec le regex frontend
    let part: string
    if (sourceType === 'jurisprudence') {
      // Format enrichi pour jurisprudence
      let enrichedHeader = `[Juris-${i + 1}] ${source.documentName} (${relevanceLabel} - ${relevancePct})\n`

      // Ajouter métadonnées structurées si disponibles
      if (structuredMeta) {
        const tribunalLabel = lang === 'ar' ? structuredMeta.tribunalLabelAr : structuredMeta.tribunalLabelFr
        const chambreLabel = lang === 'ar' ? structuredMeta.chambreLabelAr : structuredMeta.chambreLabelFr

        enrichedHeader += lang === 'ar' ? '🏛️ ' : '🏛️ '
        enrichedHeader += `${lang === 'ar' ? 'المحكمة' : 'Tribunal'}: ${tribunalLabel || labels.na}\n`

        if (chambreLabel) {
          enrichedHeader += lang === 'ar' ? '⚖️ ' : '⚖️ '
          enrichedHeader += `${labels.chamber}: ${chambreLabel}\n`
        }

        if (structuredMeta.decisionDate) {
          enrichedHeader += '📅 '
          enrichedHeader += `${labels.date}: ${new Date(structuredMeta.decisionDate).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN')}\n`
        }

        if (structuredMeta.decisionNumber) {
          enrichedHeader += lang === 'ar' ? '📋 عدد القرار: ' : '📋 N° décision: '
          enrichedHeader += `${structuredMeta.decisionNumber}\n`
        }

        if (structuredMeta.legalBasis && structuredMeta.legalBasis.length > 0) {
          enrichedHeader += '📚 '
          enrichedHeader += `${labels.articles}: ${structuredMeta.legalBasis.join(', ')}\n`
        }

        if (structuredMeta.solution) {
          enrichedHeader += lang === 'ar' ? '✅ المنطوق: ' : '✅ Solution: '
          enrichedHeader += `${structuredMeta.solution}\n`
        }

        // Relations juridiques
        if (structuredMeta.citesCount > 0 || structuredMeta.citedByCount > 0) {
          enrichedHeader += '🔗 '
          enrichedHeader += lang === 'ar' ? 'علاقات: ' : 'Relations: '
          if (structuredMeta.citesCount > 0) {
            enrichedHeader += lang === 'ar' ? `يشير إلى ${structuredMeta.citesCount}` : `Cite ${structuredMeta.citesCount}`
          }
          if (structuredMeta.citedByCount > 0) {
            if (structuredMeta.citesCount > 0) enrichedHeader += ', '
            enrichedHeader += lang === 'ar' ? `مشار إليه من ${structuredMeta.citedByCount}` : `Cité par ${structuredMeta.citedByCount}`
          }
          enrichedHeader += '\n'
        }
      } else {
        // Fallback sur métadonnées legacy
        enrichedHeader += `${labels.chamber}: ${meta?.chamber || labels.na}, ${labels.date}: ${meta?.date || labels.na}\n`
        enrichedHeader += `${labels.articles}: ${meta?.articles?.join(', ') || labels.na}\n`
      }

      part = enrichedHeader + '\n' + source.chunkContent
    } else if (meta?.sourceType === 'legal_document' || meta?.citationKey) {
      // Format enrichi pour documents juridiques consolidés
      let enrichedHeader = `[KB-${i + 1}] ${source.documentName} (${relevanceLabel} - ${relevancePct})\n`
      enrichedHeader += `📌 ${lang === 'ar' ? 'المصدر' : 'Source'}: ${meta.codeName || meta.citationKey || source.documentName}\n`

      if (meta.articleNumber) {
        enrichedHeader += `⚖️ ${lang === 'ar' ? 'الفصل' : 'Article'} ${meta.articleNumber}\n`
      }

      if (meta.sourceUrl) {
        enrichedHeader += `🔗 ${lang === 'ar' ? 'الرابط' : 'Lien'}: ${meta.sourceUrl}\n`
      }

      if (meta.lastVerifiedAt) {
        enrichedHeader += `📅 ${lang === 'ar' ? 'آخر تحقق' : 'Dernière vérification'}: ${new Date(meta.lastVerifiedAt).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN')}\n`
      }

      if (meta.isAbrogated) {
        enrichedHeader += `⚠️ ${lang === 'ar' ? 'ملغى' : 'Abrogé'}\n`
      }

      if (meta.amendments && Array.isArray(meta.amendments)) {
        for (const amendment of meta.amendments.slice(0, 3)) {
          enrichedHeader += `🔄 ${lang === 'ar' ? 'تنقيح' : 'Modifié par'}: ${amendment}\n`
        }
      }

      part = enrichedHeader + '\n' + source.chunkContent
    } else if (sourceType === 'knowledge_base') {
      let enrichedHeader = `[KB-${i + 1}] ${source.documentName} (${relevanceLabel} - ${relevancePct})\n`

      // Ajouter métadonnées structurées KB si disponibles
      if (structuredMeta) {
        if (structuredMeta.author) {
          enrichedHeader += lang === 'ar' ? '✍️ المؤلف: ' : '✍️ Auteur: '
          enrichedHeader += `${structuredMeta.author}\n`
        }

        if (structuredMeta.publicationDate) {
          enrichedHeader += '📅 '
          enrichedHeader += `${labels.date}: ${new Date(structuredMeta.publicationDate).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN')}\n`
        }

        if (structuredMeta.keywords && structuredMeta.keywords.length > 0) {
          enrichedHeader += lang === 'ar' ? '🔑 كلمات مفتاحية: ' : '🔑 Mots-clés: '
          enrichedHeader += `${structuredMeta.keywords.join(', ')}\n`
        }
      }

      part = enrichedHeader + '\n' + source.chunkContent
    } else {
      part = `[Source-${i + 1}] ${source.documentName} (${relevanceLabel} - ${relevancePct})\n\n` + source.chunkContent
    }

    // ── SPRINT 2 : Avertissement OCR faible confiance ──
    if (meta?.ocr_low_confidence === true) {
      const ocrConf = meta.ocr_page_confidence as number | undefined
      const ocrWarning = lang === 'ar'
        ? `⚠️ مصدر OCR (موثوقية منخفضة${ocrConf !== undefined ? ` - ${ocrConf.toFixed(0)}%` : ''} - يُرجى التحقق من الأصل)\n`
        : `⚠️ Source OCR (fiabilité faible${ocrConf !== undefined ? ` - ${ocrConf.toFixed(0)}%` : ''} - à vérifier sur original)\n`
      part = ocrWarning + part
    }

    // ── SPRINT 3 : Préfixe pour chunks TABLE ──
    if (meta?.chunk_type === 'table') {
      part = `[TABLE]\n${part}`
    }

    const partTokens = countTokens(part)
    const separatorTokens = contextParts.length > 0 ? countTokens('\n\n---\n\n') : 0

    // Vérifier si on dépasse la limite
    if (totalTokens + partTokens + separatorTokens > RAG_MAX_CONTEXT_TOKENS) {
      console.log(`[RAG Context] Limite atteinte: ${sourcesUsed}/${sources.length} sources, ~${totalTokens} tokens`)
      break
    }

    contextParts.push(part)
    totalTokens += partTokens + separatorTokens
    sourcesUsed++
  }

  console.log(`[RAG Context] ${sourcesUsed}/${sources.length} sources, ~${totalTokens} tokens, métadonnées enrichies`)

  // Grouper les sources par type pour faciliter le croisement par le LLM
  // On garde les index originaux pour préserver le numérotage [KB-N]
  const grouped: { codes: string[]; jurisprudence: string[]; doctrine: string[]; other: string[] } = {
    codes: [], jurisprudence: [], doctrine: [], other: [],
  }

  for (let i = 0; i < contextParts.length; i++) {
    const source = enrichedSources[i]
    const meta = source?.metadata as any
    const sourceType = meta?.type
    const category = meta?.category

    if (sourceType === 'jurisprudence') {
      grouped.jurisprudence.push(contextParts[i])
    } else if (category === 'codes' || category === 'codes_juridiques') {
      grouped.codes.push(contextParts[i])
    } else if (category === 'doctrine' || category === 'articles_juridiques') {
      grouped.doctrine.push(contextParts[i])
    } else {
      grouped.other.push(contextParts[i])
    }
  }

  // Si tout est dans "other" (pas de métadonnées type/category), retourner en ordre original
  if (grouped.codes.length === 0 && grouped.jurisprudence.length === 0 && grouped.doctrine.length === 0) {
    return contextParts.join('\n\n---\n\n')
  }

  // Construire le contexte groupé avec headers (réutilise `lang` déjà déclaré plus haut)
  const sections: string[] = []

  if (grouped.codes.length > 0) {
    const header = lang === 'ar' ? '📚 النصوص القانونية' : '📚 Textes juridiques'
    sections.push(`${header}\n\n${grouped.codes.join('\n\n---\n\n')}`)
  }
  if (grouped.jurisprudence.length > 0) {
    const header = lang === 'ar' ? '⚖️ الاجتهاد القضائي' : '⚖️ Jurisprudence'
    sections.push(`${header}\n\n${grouped.jurisprudence.join('\n\n---\n\n')}`)
  }
  if (grouped.doctrine.length > 0) {
    const header = lang === 'ar' ? '📖 الفقه والمقالات' : '📖 Doctrine'
    sections.push(`${header}\n\n${grouped.doctrine.join('\n\n---\n\n')}`)
  }
  if (grouped.other.length > 0) {
    const header = lang === 'ar' ? '📄 مصادر أخرى' : '📄 Autres sources'
    sections.push(`${header}\n\n${grouped.other.join('\n\n---\n\n')}`)
  }

  return sections.join('\n\n===\n\n')
}

/**
 * Récupère l'historique de conversation pour le contexte (version simple)
 */
async function getConversationHistory(
  conversationId: string,
  limit: number = 10
): Promise<ConversationMessage[]> {
  const result = await db.query(
    `SELECT role, content
     FROM chat_messages
     WHERE conversation_id = $1
       AND role IN ('user', 'assistant')
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit]
  )

  // Inverser pour avoir l'ordre chronologique
  return result.rows
    .reverse()
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }))
}

/**
 * Récupère l'historique de conversation avec résumé si disponible
 * Retourne le résumé + les messages récents pour un contexte optimal
 */
async function getConversationHistoryWithSummary(
  conversationId: string,
  recentLimit: number = SUMMARY_CONFIG.recentMessagesLimit
): Promise<{
  summary: string | null
  messages: ConversationMessage[]
  totalCount: number
}> {
  const context = await getConversationContext(conversationId, recentLimit)

  return {
    summary: context.summary,
    messages: context.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    totalCount: context.totalCount,
  }
}

// =============================================================================
// SANITIZER CITATIONS — Supprime les citations inventées par le LLM
// =============================================================================

/**
 * Supprime les citations dont le numéro dépasse le nombre de sources réelles.
 * Empêche le LLM d'halluciner des [Source-5] quand il n'y a que 3 sources.
 *
 * @exported Pour tests unitaires
 */
export function sanitizeCitations(answer: string, sourceCount: number): string {
  return answer.replace(
    /\[(Source|KB|Juris)-?(\d+)\]/g,
    (fullMatch, _type: string, numStr: string) => {
      const num = parseInt(numStr, 10)
      return (num >= 1 && num <= sourceCount) ? fullMatch : ''
    }
  )
}

// =============================================================================
// FONCTION PRINCIPALE: RÉPONDRE À UNE QUESTION
// =============================================================================

/**
 * Répond à une question en utilisant le pipeline RAG complet
 */
export async function answerQuestion(
  question: string,
  userId: string,
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const startTotal = Date.now()

  // Initialiser logger structuré (ou utiliser celui fourni)
  const logger = options.logger || new RAGLogger(undefined, { userId, operation: options.operationName })
  logger.addContext('question', question.substring(0, 100)) // Truncate pour éviter logs massifs
  logger.info('search', 'Pipeline RAG démarré', {
    enableExpansion: ENABLE_QUERY_EXPANSION,
    operationName: options.operationName,
  })

  if (!isChatEnabled()) {
    logger.error('search', 'Chat IA désactivé')
    throw new Error('Chat IA désactivé (activer OLLAMA_ENABLED ou configurer GROQ_API_KEY)')
  }

  const provider = getChatProvider()
  logger.addContext('provider', provider)

  // Métriques RAG
  let searchTimeMs = 0
  let cacheHit = false

  // 1. Rechercher le contexte pertinent (bilingue si activé) avec fallback dégradé
  let sources: ChatSource[] = []
  let isDegradedMode = false

  const startSearch = Date.now()
  try {
    const searchResult = ENABLE_QUERY_EXPANSION
      ? await searchRelevantContextBilingual(question, userId, options)
      : await searchRelevantContext(question, userId, options)
    sources = searchResult.sources
    cacheHit = searchResult.cacheHit
    searchTimeMs = Date.now() - startSearch
  } catch (error) {
    // Mode dégradé: retourner une erreur claire au lieu de continuer sans contexte
    // Évite les hallucinations juridiques en mode sans source
    logger.error('search', 'Erreur recherche contexte - Sources indisponibles', error)
    isDegradedMode = true
    sources = []
    searchTimeMs = Date.now() - startSearch
  }

  // 2. Si la recherche a réussi mais n'a trouvé aucune source pertinente,
  // retourner un message clair au lieu d'appeler le LLM (évite les hallucinations)
  if (!isDegradedMode && sources.length === 0) {
    const noSourcesLang = detectLanguage(question)
    console.warn(`[RAG Diagnostic] 🔍 Aucune source trouvée pour requête:`, {
      queryLength: question.length,
      language: noSourcesLang,
      queryPreview: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
      searchTimeMs,
      enableExpansion: ENABLE_QUERY_EXPANSION,
    })
    const noSourcesMessage = noSourcesLang === 'fr'
      ? 'Je n\'ai trouvé aucun document pertinent pour votre question. Veuillez reformuler ou vérifier que les documents nécessaires ont été téléversés.'
      : 'لم أجد وثائق ذات صلة بسؤالك في قاعدة البيانات. يرجى إعادة صياغة السؤال أو التأكد من رفع المستندات المتعلقة بالموضوع.'

    return {
      answer: noSourcesMessage,
      sources: [],
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'none',
      conversationId: options.conversationId,
    }
  }

  // 3. Construire le contexte (bloquer si mode dégradé pour éviter les hallucinations)
  if (isDegradedMode) {
    // Enregistrer la métrique d'erreur
    const totalTimeMs = Date.now() - startTotal
    recordRAGMetric({
      searchTimeMs,
      llmTimeMs: 0,
      totalTimeMs,
      inputTokens: 0,
      outputTokens: 0,
      resultsCount: 0,
      cacheHit: false,
      degradedMode: true,
      provider: provider || 'unknown',
      error: 'Sources indisponibles - mode dégradé bloqué',
    })

    // Retourner un message explicite au lieu de throw (évite 500 error)
    const degradedLang = detectLanguage(question)
    const degradedMessage = degradedLang === 'fr'
      ? 'Les sources juridiques sont temporairement indisponibles. Veuillez réessayer dans quelques instants.'
      : 'المصادر القانونية غير متوفرة مؤقتًا. يرجى المحاولة مرة أخرى بعد قليل.'

    return {
      answer: degradedMessage,
      sources: [],
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'degraded',
      conversationId: options.conversationId,
    }
  }

  // Détecter la langue de la question pour adapter les labels du contexte
  const questionLang = detectLanguage(question)
  const context = await buildContextFromSources(sources, questionLang)

  // Calculer métriques qualité et injecter avertissement si nécessaire
  const qualityMetrics = computeSourceQualityMetrics(sources)

  // B1: Abstention progressive — quality gate à 3 niveaux (zone grise 0.30-0.40)
  // < 0.30 → abstention directe (sources non pertinentes)
  // 0.30-0.40 → zone grise : accepté si ≥2 sources, sinon abstention
  // ≥ 0.40 → accepté (comportement standard)
  const avg = qualityMetrics.averageSimilarity
  const isHardAbstention = avg < 0.30
  const isGreyZone = avg >= 0.30 && avg < 0.40 && qualityMetrics.qualityLevel === 'low'
  const isGreyZoneAbstention = isGreyZone && sources.length < 2

  if (isHardAbstention || isGreyZoneAbstention) {
    const abstentionReason = isHardAbstention
      ? `Similarité ${Math.round(avg * 100)}% < 30% (sources non pertinentes)`
      : `Zone grise: similarité ${Math.round(avg * 100)}% (30-40%) avec seulement ${sources.length} source(s)`
    console.log(`[RAG] Abstention: ${abstentionReason}`)
    const abstentionMsg = questionLang === 'fr'
      ? 'Je n\'ai pas trouvé de sources suffisamment pertinentes dans la base de connaissances pour répondre à cette question de manière fiable. Je vous recommande de consulter directement les textes juridiques officiels ou un professionnel du droit.'
      : 'لم أجد مصادر كافية في قاعدة المعرفة للإجابة على هذا السؤال بشكل موثوق. أنصحك بالرجوع مباشرة إلى النصوص القانونية الرسمية أو استشارة مختص في القانون.'
    return {
      answer: abstentionMsg,
      sources: [],
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'abstained',
      conversationId: options.conversationId,
      qualityIndicator: 'low',
      averageSimilarity: avg,
      abstentionReason,
    }
  }

  // Zone grise acceptée (0.30-0.40 avec ≥2 sources) → log avertissement
  if (isGreyZone) {
    console.log(`[RAG] Zone grise acceptée: similarité ${Math.round(avg * 100)}%, ${sources.length} sources — réponse avec avertissement`)
  }

  let contextWithWarning = context
  if (qualityMetrics.warningMessage) {
    contextWithWarning = `${qualityMetrics.warningMessage}\n\n---\n\n${context}`
    logger.warn('search', 'Low quality sources', {
      averageSimilarity: qualityMetrics.averageSimilarity,
      qualityLevel: qualityMetrics.qualityLevel,
    })
  }

  // Phase 3b: Avertissement conditionnel si domaine principal non couvert par les sources
  // Détection rapide basée sur les catégories des sources (pas d'appel LLM supplémentaire)
  const sourceCategories = new Set(
    sources.map(s => (s.metadata as Record<string, unknown>)?.category).filter(Boolean) as string[]
  )
  // Si toutes les sources proviennent d'un seul domaine et que la qualité est moyenne/basse,
  // injecter un avertissement pour déclencher le raisonnement conditionnel
  if (sources.length > 0 && qualityMetrics.qualityLevel !== 'high' && sourceCategories.size <= 1) {
    contextWithWarning = `⚠️ تنبيه: المصادر المتوفرة محدودة النطاق. استخدم الرأي المشروط وقدّم افتراضات بديلة إن لزم الأمر.\n\n${contextWithWarning}`
  }

  // 3b. Multi-Chain Reasoning (optionnel — activé via ENABLE_MULTI_CHAIN_CONSULTATION=true)
  // Déclenché uniquement pour les consultations formelles avec suffisamment de sources
  if (
    process.env.ENABLE_MULTI_CHAIN_CONSULTATION === 'true' &&
    options.operationName === 'dossiers-consultation' &&
    sources.length >= 3
  ) {
    try {
      const { multiChainReasoning } = await import('./multi-chain-legal-reasoning')
      const multiChainSources = sources.map((s) => ({
        id: s.documentId,
        content: s.chunkContent,
        category: (s.metadata?.category as string) || 'autre',
        metadata: s.metadata as Parameters<typeof multiChainReasoning>[0]['sources'][0]['metadata'],
      }))
      const mcResult = await multiChainReasoning({
        question,
        sources: multiChainSources,
        language: questionLang === 'fr' ? 'fr' : 'ar',
        usePremiumModel: options.usePremiumModel ?? false,
      })
      // Préfixer le contexte RAG avec l'analyse multi-chain
      contextWithWarning = `## Analyse Multi-Chain (Raisonnement juridique structuré)\n\n${mcResult.finalResponse}\n\n---\n\n${contextWithWarning}`
      logger.info('search', '[MultiChain] Raisonnement multi-chain intégré', {
        confidence: mcResult.overallConfidence,
        durationMs: mcResult.totalDurationMs,
        chains: mcResult.metadata.chainsExecuted,
      })
    } catch (mcError) {
      // Non-bloquant : si le multi-chain échoue, on continue sans lui
      console.error('[MultiChain] Erreur (non-bloquant):', mcError instanceof Error ? mcError.message : mcError)
    }
  }

  // 3. Récupérer l'historique avec résumé si conversation existante
  let conversationHistory: ConversationMessage[] = []
  let conversationSummary: string | null = null
  let totalMessageCount = 0

  if (options.conversationId) {
    const historyContext = await getConversationHistoryWithSummary(
      options.conversationId,
      SUMMARY_CONFIG.recentMessagesLimit
    )
    conversationHistory = historyContext.messages
    conversationSummary = historyContext.summary
    totalMessageCount = historyContext.totalCount
  }

  // Sélectionner le prompt système approprié selon le contexte
  // Par défaut: 'chat' si conversation, 'consultation' sinon
  const contextType: PromptContextType = options.contextType || (options.conversationId ? 'chat' : 'consultation')
  const supportedLang: SupportedLanguage = questionLang === 'fr' ? 'fr' : 'ar'
  const stance = options.stance ?? 'defense'
  const baseSystemPrompt = getSystemPromptForContext(contextType, supportedLang, stance)

  // 4. Construire les messages (format OpenAI-compatible pour Ollama/Groq)
  const messagesOpenAI: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = []

  // Injecter le résumé de la conversation si disponible (pour Ollama/Groq)
  if (conversationSummary) {
    messagesOpenAI.push({
      role: 'system',
      content: `[Résumé de la conversation précédente]\n${conversationSummary}`,
    })
  }

  // Ajouter l'historique de conversation récent
  for (const msg of conversationHistory) {
    messagesOpenAI.push({ role: msg.role, content: msg.content })
  }

  // Ajouter la nouvelle question avec le contexte (template bilingue)
  const msgTemplate = USER_MESSAGE_TEMPLATES[supportedLang]
  // Ajouter l'instruction d'analyse seulement pour le chat (pas consultation/structuration)
  const analysisLine = contextType === 'chat' ? `\n${msgTemplate.analysisHint}\n` : ''
  messagesOpenAI.push({
    role: 'user',
    content: `${msgTemplate.prefix}\n\n${contextWithWarning}\n${analysisLine}\n---\n\n${msgTemplate.questionLabel} ${question}`,
  })

  // Messages format Anthropic (sans 'system' dans les messages)
  const messagesAnthropic: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const msg of conversationHistory) {
    messagesAnthropic.push({ role: msg.role, content: msg.content })
  }
  messagesAnthropic.push({
    role: 'user',
    content: `${msgTemplate.prefix}\n\n${contextWithWarning}\n${analysisLine}\n---\n\n${msgTemplate.questionLabel} ${question}`,
  })

  // Log si résumé utilisé
  if (conversationSummary) {
    console.log(`[RAG] Conversation ${options.conversationId}: résumé injecté (${totalMessageCount} messages total)`)
  }

  // Construire le système prompt avec résumé pour Anthropic
  const systemPromptWithSummary = conversationSummary
    ? `${baseSystemPrompt}\n\n[Résumé de la conversation précédente]\n${conversationSummary}`
    : baseSystemPrompt

  console.log(`[RAG] Utilisation du prompt structuré: contextType=${contextType}, langue=${supportedLang}`)

  let answer: string
  let tokensUsed: { input: number; output: number; total: number }
  let modelUsed: string
  let llmError: string | undefined
  let fallbackUsed = false

  // 5. Appeler le LLM avec fallback automatique sur erreur 429
  // Ollama est traité séparément (local, pas de fallback cloud)
  // Pour les autres: Groq → DeepSeek → Anthropic → OpenAI
  try {
    if (provider === 'ollama') {
      // Ollama (local, gratuit, illimité) - pas de fallback
      const client = getOllamaClient()

      // Adapter température selon le contexte (consultation = plus précis)
      const promptConfig = PROMPT_CONFIG[contextType]
      const temperature = options.temperature ?? promptConfig.temperature

      const response = await client.chat.completions.create({
        model: aiConfig.ollama.chatModelDefault,
        max_tokens: promptConfig.maxTokens,
        messages: [
          { role: 'system', content: baseSystemPrompt },
          ...messagesOpenAI,
        ],
        temperature,
      })

      answer = response.choices[0]?.message?.content || ''
      tokensUsed = {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0,
      }
      modelUsed = `ollama/${aiConfig.ollama.chatModelDefault}`
    } else {
      // Utiliser le service de fallback pour les providers cloud
      // Convertir les messages au format LLMMessage
      const llmMessages: LLMMessage[] = messagesOpenAI.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }))

      // Adapter température et maxTokens selon le contexte
      const promptConfig = PROMPT_CONFIG[contextType]
      const temperature = options.temperature ?? promptConfig.temperature

      const llmResponse = await callLLMWithFallback(
        llmMessages,
        {
          temperature,
          maxTokens: promptConfig.maxTokens,
          systemPrompt: systemPromptWithSummary,
          context: 'rag-chat', // Stratégie optimisée : Gemini → DeepSeek → Ollama
          operationName: options.operationName, // Configuration par opération
        },
        options.usePremiumModel ?? false // Mode premium si demandé
      )

      answer = llmResponse.answer
      tokensUsed = llmResponse.tokensUsed
      modelUsed = llmResponse.modelUsed
      fallbackUsed = llmResponse.fallbackUsed

      // ✨ PHASE 5: Citation-First Enforcement
      // Valider que la réponse commence par une citation (seulement pour consultation, pas chat)
      if (contextType !== 'chat' && sources.length > 0) {
        const citationValidation = validateCitationFirst(answer)

        if (!citationValidation.valid) {
          console.warn(
            `[RAG] Citation-first violation detected: ${citationValidation.issue} ` +
            `(words before citation: ${citationValidation.metrics.wordsBeforeFirstCitation})`
          )

          // Conversion des sources au format attendu par l'enforcer
          const enforcerSources = sources.map((src, idx) => ({
            label: `[Source-${idx + 1}]`,
            content: src.chunkContent,
            title: src.documentName,
            category: src.metadata?.category as string | undefined,
          }))

          // Auto-correction
          const correctedAnswer = enforceCitationFirst(answer, enforcerSources)

          // Vérifier si correction réussie
          const correctedValidation = validateCitationFirst(correctedAnswer)

          if (correctedValidation.valid) {
            console.log(
              `[RAG] Citation-first enforced successfully ` +
              `(${citationValidation.issue} → valid)`
            )
            answer = correctedAnswer
          } else {
            console.warn(
              `[RAG] Citation-first enforcement partial ` +
              `(issue: ${correctedValidation.issue})`
            )
            // Utiliser réponse corrigée même si pas parfaite (mieux que rien)
            answer = correctedAnswer
          }
        } else {
          console.log(
            `[RAG] Citation-first validation passed ` +
            `(${citationValidation.metrics.totalCitations} citations, ` +
            `${citationValidation.metrics.wordsBeforeFirstCitation} words before first)`
          )
        }
      }

      // Log si fallback utilisé
      if (fallbackUsed && llmResponse.originalProvider) {
        console.log(
          `[RAG] Fallback LLM activé: ${llmResponse.originalProvider} → ${llmResponse.provider}`
        )
      }
    }
  } catch (error) {
    // Enregistrer l'erreur LLM dans les métriques
    const totalTimeMs = Date.now() - startTotal
    const llmTimeMs = totalTimeMs - searchTimeMs
    llmError = `LLM error: ${error instanceof Error ? error.message : String(error)}`

    recordRAGMetric({
      searchTimeMs,
      llmTimeMs,
      totalTimeMs,
      inputTokens: 0,
      outputTokens: 0,
      resultsCount: sources.length,
      cacheHit,
      degradedMode: isDegradedMode,
      provider: provider || 'unknown',
      error: llmError,
    })

    logger.error('llm', 'Erreur LLM - Tous providers épuisés', error)
    throw error // Re-throw pour que l'appelant puisse gérer
  }

  // Déclencher génération de résumé en async si seuil atteint
  if (options.conversationId && totalMessageCount >= SUMMARY_CONFIG.triggerMessageCount) {
    triggerSummaryGenerationIfNeeded(options.conversationId).catch((err) =>
      logger.error('llm', 'Erreur trigger résumé conversation', err)
    )
  }

  // Logging métriques RAG structuré
  const totalTimeMs = Date.now() - startTotal
  const llmTimeMs = totalTimeMs - searchTimeMs

  // Enregistrer dans le service de métriques
  recordRAGMetric({
    searchTimeMs,
    llmTimeMs,
    totalTimeMs,
    inputTokens: tokensUsed.input,
    outputTokens: tokensUsed.output,
    resultsCount: sources.length,
    cacheHit: cacheHit,
    degradedMode: isDegradedMode,
    provider: modelUsed,
  })

  console.log('RAG_METRICS', JSON.stringify({
    searchTimeMs,
    llmTimeMs,
    totalTimeMs,
    contextTokens: tokensUsed.input,
    outputTokens: tokensUsed.output,
    resultsCount: sources.length,
    degradedMode: isDegradedMode,
    provider: modelUsed,
    fallbackUsed,
    conversationId: options.conversationId || null,
    dossierId: options.dossierId || null,
  }))

  // Sanitizer: supprimer les citations inventées par le LLM
  answer = sanitizeCitations(answer, sources.length)

  // Phase 2.2+2.3 : Validation citations + détection abrogations (parallèle)
  let citationWarnings: string[] = []
  let abrogationWarnings: AbrogationWarning[] = []

  const [citationResult, abrogationResult] = await Promise.all([
    (process.env.ENABLE_CITATION_VALIDATION !== 'false')
      ? Promise.resolve(validateArticleCitations(answer, sources)).catch((error) => {
          logger.error('filter', 'Erreur validation citations', error)
          return null
        })
      : Promise.resolve(null),
    (process.env.ENABLE_ABROGATION_DETECTION !== 'false')
      ? detectAbrogatedReferences(answer, sources).catch((error) => {
          logger.error('abrogation', 'Erreur détection abrogations', error)
          return [] as AbrogationWarning[]
        })
      : Promise.resolve([] as AbrogationWarning[]),
  ])

  if (citationResult?.warnings?.length) {
    logger.warn('filter', 'Citations non vérifiées détectées', {
      count: citationResult.warnings.length,
      warnings: formatValidationWarnings(citationResult),
    })
    citationWarnings = citationResult.warnings.map(w => w.citation)
  }

  // Sprint 4: logger les sources sans citation_locator (non auditables)
  if (citationResult?.locatorsMissing && citationResult.locatorsMissing.length > 0) {
    logger.warn('filter', 'Sources sans citation_locator (non auditables)', {
      count: citationResult.locatorsMissing.length,
      sources: citationResult.locatorsMissing,
    })
  }

  abrogationWarnings = abrogationResult || []
  if (abrogationWarnings.length > 0) {
    logger.warn('abrogation', 'Lois abrogées détectées dans la réponse', {
      count: abrogationWarnings.length,
      warnings: formatAbrogationWarnings(abrogationWarnings),
    })
  }

  // Phase 4: Claim verification — vérifier alignement claims↔sources
  if (process.env.ENABLE_CLAIM_VERIFICATION !== 'false') {
    try {
      const claimResult = verifyClaimSourceAlignment(answer, sources)
      if (claimResult.unsupportedClaims.length > 0) {
        const ratio = claimResult.totalClaims > 0
          ? claimResult.supportedClaims / claimResult.totalClaims
          : 1
        if (ratio < 0.7) {
          answer += '\n\n⚠️ تنبيه: بعض الاستنتاجات قد لا تكون مدعومة بشكل كافٍ بالمصادر المتوفرة. يُرجى التحقق.'
        }
        console.log(`[Claim Verify] ${claimResult.supportedClaims}/${claimResult.totalClaims} claims supportées`)
      }
    } catch (error) {
      console.error('[Claim Verify] Erreur:', error instanceof Error ? error.message : error)
    }
  }

  // Sprint 3 RAG Audit-Proof : détection cross-domaine + régénération automatique (1 tentative)
  let wasRegenerated = false
  let validationStatus: 'passed' | 'regenerated' | 'insufficient_sources' = 'passed'

  if (process.env.ENABLE_BRANCH_REGENERATION !== 'false') {
    try {
      // Le router est déjà appelé dans searchRelevantContext — cache Redis hit ici (~0ms)
      const { routeQuery } = await import('./legal-router-service')
      const routerForValidation = await routeQuery(question, { maxTracks: 1 })
      const allowedBranches = routerForValidation.allowedBranches

      if (allowedBranches && allowedBranches.length > 0) {
        const branchCheck = verifyBranchAlignment(sources, allowedBranches)

        if (branchCheck.violatingCount > 0) {
          console.warn(
            `[RAG Sprint3] ${branchCheck.violatingCount}/${branchCheck.totalSources} sources hors-domaine détectées:`,
            branchCheck.violatingSources.map(v => `${v.documentName} (branch=${v.branch})`).join(', ')
          )

          // Filtrer pour ne garder que sources dans le domaine autorisé
          const alignedSources = sources.filter(s => {
            const branch = s.metadata?.branch as string | undefined
            if (!branch || branch === 'autre') return true // pas de branch = on garde
            return allowedBranches.includes(branch)
          })

          if (alignedSources.length >= 2) {
            // Régénérer avec sources filtrées (appel LLM synchrone, 1 tentative max)
            const filteredContext = await buildContextFromSources(alignedSources, questionLang)
            const regenMessages: LLMMessage[] = [
              {
                role: 'user',
                content: `${msgTemplate.prefix}\n\n[تنبيه: تم استبعاد المصادر خارج النطاق القانوني للسؤال]\n\n${filteredContext}\n${analysisLine}\n---\n\n${msgTemplate.questionLabel} ${question}`,
              },
            ]
            const regenResponse = await callLLMWithFallback(regenMessages, {
              systemPrompt: systemPromptWithSummary,
              operationName: options.operationName,
            })
            answer = sanitizeCitations(regenResponse.answer, alignedSources.length)
            sources = alignedSources
            wasRegenerated = true
            validationStatus = 'regenerated'
            console.log('[RAG Sprint3] ✅ Réponse régénérée avec sources filtrées par domaine')
          } else {
            validationStatus = 'insufficient_sources'
            console.warn('[RAG Sprint3] Sources filtrées insuffisantes (<2) — pas de régénération')
          }
        }
      }
    } catch (error) {
      // Non-bloquant : si la régénération échoue, on garde la réponse originale
      console.error('[RAG Sprint3] Erreur validation branche:', error instanceof Error ? error.message : error)
    }
  }

  // Log métriques finales du pipeline complet
  logger.metrics({
    totalTimeMs: Date.now() - startTotal,
    searchTimeMs,
    sourcesCount: sources.length,
    tokensInput: tokensUsed.input,
    tokensOutput: tokensUsed.output,
    tokensTotal: tokensUsed.total,
    model: modelUsed,
    cacheHit,
    degradedMode: isDegradedMode,
    citationWarnings: citationWarnings.length,
    abrogationWarnings: abrogationWarnings.length,
    requestId: logger.getRequestId(),
  })

  return {
    answer,
    sources,
    tokensUsed,
    model: modelUsed,
    conversationId: options.conversationId,
    citationWarnings: citationWarnings.length > 0 ? citationWarnings : undefined,
    abrogationWarnings: abrogationWarnings.length > 0 ? abrogationWarnings : undefined,
    qualityIndicator: qualityMetrics.qualityLevel,
    averageSimilarity: qualityMetrics.averageSimilarity,
    wasRegenerated: wasRegenerated || undefined,
    validationStatus: validationStatus !== 'passed' ? validationStatus : undefined,
  }
}

// =============================================================================
// STREAMING NATIF GEMINI
// =============================================================================

/**
 * Événements émis par answerQuestionStream()
 */
export type StreamChunk =
  | { type: 'metadata'; sources: ChatSource[]; model: string; qualityIndicator: 'high' | 'medium' | 'low'; averageSimilarity: number }
  | { type: 'chunk'; text: string }
  | { type: 'done'; tokensUsed: { input: number; output: number; total: number } }
  | { type: 'error'; message: string }

/**
 * Répond à une question en streaming natif Gemini.
 *
 * Phase 1 : Pipeline RAG complet (non-streaming) → sources + contexte
 * Phase 2 : callLLMStream() → yield chunks texte en temps réel (Groq ou Gemini)
 * Phase 3 : Post-processing (sanitize citations, métriques)
 *
 * Format des événements :
 * - 'metadata' → sources trouvées, à envoyer en premier au client
 * - 'chunk'    → fragment de texte généré par Gemini
 * - 'done'     → fin du stream avec tokensUsed estimés
 * - 'error'    → erreur fatale (rate limit, timeout…)
 */
export async function* answerQuestionStream(
  question: string,
  userId: string,
  options: ChatOptions = {}
): AsyncGenerator<StreamChunk> {
  if (!isChatEnabled()) {
    yield { type: 'error', message: 'Chat IA désactivé (activer OLLAMA_ENABLED ou configurer GROQ_API_KEY)' }
    return
  }

  // 1. Phase RAG (non-streaming)
  let sources: ChatSource[] = []
  try {
    const searchResult = ENABLE_QUERY_EXPANSION
      ? await searchRelevantContextBilingual(question, userId, options)
      : await searchRelevantContext(question, userId, options)
    sources = searchResult.sources
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Erreur recherche contexte'
    console.error('[RAG Stream] Erreur recherche:', errMsg)
    yield { type: 'error', message: errMsg }
    return
  }

  const questionLang = detectLanguage(question)

  // Aucune source → réponse rapide sans appel LLM
  if (sources.length === 0) {
    const noSourcesMsg = questionLang === 'fr'
      ? 'Je n\'ai trouvé aucun document pertinent pour votre question. Veuillez reformuler.'
      : 'لم أجد وثائق ذات صلة بسؤالك. يرجى إعادة صياغة السؤال.'
    yield { type: 'metadata', sources: [], model: 'groq/llama-3.3-70b-versatile', qualityIndicator: 'low', averageSimilarity: 0 }
    yield { type: 'chunk', text: noSourcesMsg }
    yield { type: 'done', tokensUsed: { input: 0, output: 0, total: 0 } }
    return
  }

  // 2. Construire le contexte RAG
  const context = await buildContextFromSources(sources, questionLang)
  const qualityMetrics = computeSourceQualityMetrics(sources)

  // B1: Abstention progressive en streaming — quality gate à 3 niveaux (zone grise 0.30-0.40)
  const streamAvg = qualityMetrics.averageSimilarity
  const streamIsHardAbstention = streamAvg < 0.30
  const streamIsGreyZone = streamAvg >= 0.30 && streamAvg < 0.40 && qualityMetrics.qualityLevel === 'low'
  const streamIsGreyZoneAbstention = streamIsGreyZone && sources.length < 2

  if (streamIsHardAbstention || streamIsGreyZoneAbstention) {
    const abstentionReason = streamIsHardAbstention
      ? `Similarité ${Math.round(streamAvg * 100)}% < 30%`
      : `Zone grise: similarité ${Math.round(streamAvg * 100)}% avec ${sources.length} source(s)`
    console.log(`[RAG Stream] Abstention: ${abstentionReason}`)
    const abstentionMsg = questionLang === 'fr'
      ? 'Je n\'ai pas trouvé de sources suffisamment pertinentes dans la base de connaissances pour répondre à cette question de manière fiable. Je vous recommande de consulter directement les textes juridiques officiels ou un professionnel du droit.'
      : 'لم أجد مصادر كافية في قاعدة المعرفة للإجابة على هذا السؤال بشكل موثوق. أنصحك بالرجوع مباشرة إلى النصوص القانونية الرسمية أو استشارة مختص في القانون.'
    yield { type: 'metadata', sources: [], model: 'abstained', qualityIndicator: 'low', averageSimilarity: streamAvg }
    yield { type: 'chunk', text: abstentionMsg }
    yield { type: 'done', tokensUsed: { input: 0, output: 0, total: 0 } }
    return
  }

  if (streamIsGreyZone) {
    console.log(`[RAG Stream] Zone grise acceptée: similarité ${Math.round(streamAvg * 100)}%, ${sources.length} sources`)
  }

  const contextWithWarning = qualityMetrics.warningMessage
    ? `${qualityMetrics.warningMessage}\n\n---\n\n${context}`
    : context

  // 3. Historique conversation
  let conversationHistory: ConversationMessage[] = []
  let conversationSummary: string | null = null
  if (options.conversationId) {
    const historyContext = await getConversationHistoryWithSummary(
      options.conversationId,
      SUMMARY_CONFIG.recentMessagesLimit
    )
    conversationHistory = historyContext.messages
    conversationSummary = historyContext.summary
  }

  // 4. Construire messages
  const contextType: PromptContextType = options.contextType || (options.conversationId ? 'chat' : 'consultation')
  const supportedLang: SupportedLanguage = questionLang === 'fr' ? 'fr' : 'ar'
  const stance = options.stance ?? 'defense'
  const baseSystemPrompt = getSystemPromptForContext(contextType, supportedLang, stance)
  const systemPrompt = conversationSummary
    ? `${baseSystemPrompt}\n\n[Résumé de la conversation précédente]\n${conversationSummary}`
    : baseSystemPrompt

  const messagesForLLM: Array<{ role: string; content: string }> = []
  for (const msg of conversationHistory) {
    messagesForLLM.push({ role: msg.role, content: msg.content })
  }
  const msgTemplate = USER_MESSAGE_TEMPLATES[supportedLang]
  // Ajouter l'instruction d'analyse seulement pour le chat
  const analysisLine = contextType === 'chat' ? `\n${msgTemplate.analysisHint}\n` : ''
  messagesForLLM.push({
    role: 'user',
    content: `${msgTemplate.prefix}\n\n${contextWithWarning}\n${analysisLine}\n---\n\n${msgTemplate.questionLabel} ${question}`,
  })

  // 5. Yield metadata (sources disponibles avant le stream LLM)
  const opName = options.operationName ?? 'assistant-ia'
  const streamProvider = getOperationProvider(opName)
  const streamModel = getOperationModel(opName)
  const modelName = `${streamProvider}/${streamModel}`
  yield {
    type: 'metadata',
    sources,
    model: modelName,
    qualityIndicator: qualityMetrics.qualityLevel,
    averageSimilarity: qualityMetrics.averageSimilarity,
  }

  // 6. Stream LLM → yield chunks (Groq ou Gemini selon operations-config)
  const promptConfig = PROMPT_CONFIG[contextType]
  let fullText = ''
  const streamUsage: StreamTokenUsage = { input: 0, output: 0, total: 0 }
  try {
    const streamGen = callLLMStream(messagesForLLM, {
      temperature: options.temperature ?? promptConfig.temperature,
      maxTokens: promptConfig.maxTokens,
      operationName: options.operationName ?? 'assistant-ia',
      systemInstruction: systemPrompt,
    }, streamUsage)

    for await (const chunk of streamGen) {
      fullText += chunk
      yield { type: 'chunk', text: chunk }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Erreur streaming LLM'
    console.error('[RAG Stream] Erreur streaming:', errMsg)
    yield { type: 'error', message: errMsg }
    return
  }

  // 7. Post-processing : sanitize citations
  fullText = sanitizeCitations(fullText, sources.length)

  // Tokens : utiliser les stats réelles Groq si disponibles, sinon estimation
  const tokensUsed = streamUsage.total > 0
    ? streamUsage
    : { input: 0, output: Math.ceil(fullText.length / 4), total: Math.ceil(fullText.length / 4) }

  yield { type: 'done', tokensUsed }
}

// =============================================================================
// GESTION DES CONVERSATIONS
// =============================================================================

/**
 * Crée une nouvelle conversation
 */
export async function createConversation(
  userId: string,
  dossierId?: string,
  title?: string
): Promise<string> {
  const result = await db.query(
    `INSERT INTO chat_conversations (user_id, dossier_id, title)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, dossierId || null, title || null]
  )

  return result.rows[0].id
}

/**
 * Sauvegarde un message dans une conversation
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: ChatSource[],
  tokensUsed?: number,
  model?: string,
  metadata?: Record<string, any>
): Promise<string> {
  const result = await db.query(
    `INSERT INTO chat_messages (conversation_id, role, content, sources, tokens_used, model, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      conversationId,
      role,
      content,
      sources ? JSON.stringify(sources) : null,
      tokensUsed != null ? tokensUsed : null,
      model || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  )

  // Mettre à jour la conversation
  await db.query(
    `UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1`,
    [conversationId]
  )

  return result.rows[0].id
}

/**
 * Récupère les conversations d'un utilisateur
 */
export async function getUserConversations(
  userId: string,
  dossierId?: string,
  limit: number = 20,
  actionType?: 'chat' | 'structure' | 'consult'
): Promise<
  Array<{
    id: string
    title: string | null
    dossierId: string | null
    dossierNumero: string | null
    messageCount: number
    lastMessageAt: Date
    createdAt: Date
  }>
> {
  let sql = `
    SELECT
      c.id,
      c.title,
      c.dossier_id,
      d.numero as dossier_numero,
      c.updated_at as last_message_at,
      c.created_at,
      (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count
    FROM chat_conversations c
    LEFT JOIN dossiers d ON c.dossier_id = d.id
    WHERE c.user_id = $1
  `

  const params: (string | number)[] = [userId]
  let paramIndex = 2

  if (dossierId) {
    sql += ` AND c.dossier_id = $${paramIndex}`
    params.push(dossierId)
    paramIndex++
  }

  if (actionType) {
    if (actionType === 'chat') {
      // Mode 'chat' = par défaut : inclure aussi les conversations sans actionType (historiques)
      sql += ` AND (
        NOT EXISTS (
          SELECT 1 FROM chat_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.metadata->>'actionType' IS NOT NULL
            AND cm.metadata->>'actionType' != 'chat'
          LIMIT 1
        )
      )`
    } else {
      // Modes 'structure'/'consult' : filtre strict
      sql += ` AND EXISTS (
        SELECT 1 FROM chat_messages cm
        WHERE cm.conversation_id = c.id
          AND cm.metadata->>'actionType' = $${paramIndex}
        LIMIT 1
      )`
      params.push(actionType)
      paramIndex++
    }
  }

  sql += ` ORDER BY c.updated_at DESC LIMIT $${paramIndex}`
  params.push(limit)

  const result = await db.query(sql, params)

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    dossierId: row.dossier_id,
    dossierNumero: row.dossier_numero,
    messageCount: parseInt(row.message_count),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  }))
}

/**
 * Supprime une conversation
 */
export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM chat_conversations
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  )

  return (result.rowCount || 0) > 0
}

/**
 * Génère un titre automatique pour une conversation
 */
export async function generateConversationTitle(
  conversationId: string
): Promise<string> {
  // Récupérer le premier message utilisateur
  const result = await db.query(
    `SELECT content FROM chat_messages
     WHERE conversation_id = $1 AND role = 'user'
     ORDER BY created_at ASC
     LIMIT 1`,
    [conversationId]
  )

  if (result.rows.length === 0) {
    return 'Nouvelle conversation'
  }

  const firstMessage = result.rows[0].content
  // Tronquer et nettoyer pour faire un titre (supporte formats FR et AR)
  const title = firstMessage
    .replace(/(?:Documents du dossier|وثائق مرجعية):[\s\S]*?---\s*(?:Question|السؤال):\s*/i, '')
    .substring(0, 60)
    .trim()

  if (title.length === 60) {
    return title + '...'
  }

  return title || 'Nouvelle conversation'
}
