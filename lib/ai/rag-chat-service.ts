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
} from './legal-reasoning-prompts'
import { searchKnowledgeBase } from './knowledge-base-service'
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
// TEMPORARILY DISABLED - Conflicting with deploy (formatAbrogationWarnings duplicate)
// import { filterAbrogatedSources } from './rag-abrogation-filter'
import {
  getConversationContext,
  triggerSummaryGenerationIfNeeded,
  SUMMARY_CONFIG,
} from './conversation-summary-service'
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
  LLMMessage,
  LLMResponse,
} from './llm-fallback-service'
import { type OperationName } from './operations-config'
import {
  validateArticleCitations,
  formatValidationWarnings,
} from './citation-validator-service'
import {
  detectAbrogatedReferences,
  formatAbrogationWarnings,
  type AbrogationWarning,
} from './abrogation-detector-service'

// Configuration Query Expansion
const ENABLE_QUERY_EXPANSION = process.env.ENABLE_QUERY_EXPANSION !== 'false'

// Timeout global pour la recherche bilingue (90 secondes par défaut)
// Augmenté de 40s à 90s car Ollama CPU-only + indexation parallèle = très lent
const BILINGUAL_SEARCH_TIMEOUT_MS = parseInt(process.env.BILINGUAL_SEARCH_TIMEOUT_MS || '90000', 10)

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
}

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
  boostFactors?: Record<string, number>
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

  // 1. Appliquer boost par type (dynamique ou statique)
  let rankedSources: RankedSource[] = sources.map((s) => {
    const sourceType = getSourceType(s.metadata as Record<string, unknown>)
    const boost = boosts[sourceType] || boosts.autre || SOURCE_BOOST.autre || 1.0
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

      const rerankedResults = await rerankDocuments(query, docsToRerank)

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

  // ✨ OPTIMISATION RAG - Sprint 2 (Feb 2026)
  // 1. Query Expansion pour requêtes courtes
  let expandedQuestion = question
  if (ENABLE_QUERY_EXPANSION && question.length < 50) {
    const { expandQuery } = await import('./query-expansion-service')
    try {
      expandedQuestion = await expandQuery(question)
      if (expandedQuestion !== question) {
        console.log(`[RAG Search] Query expandée: ${question} → ${expandedQuestion.substring(0, 80)}...`)
      }
    } catch (error) {
      console.error('[RAG Search] Erreur expansion query:', error)
      expandedQuestion = question // Fallback
    }
  }

  // Générer l'embedding de la question EXPANDÉE avec config opération
  const queryEmbedding = await generateEmbedding(expandedQuestion, {
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
  let docSql: string
  let docParams: (string | number)[]

  if (dossierId) {
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

  // Recherche dans la base de connaissances partagée
  if (includeKnowledgeBase) {
    try {
      // ✨ OPTIMISATION RAG - Sprint 2 (Feb 2026)
      // 2. Metadata Filtering Intelligent via classification query
      const { classifyQuery, isClassificationConfident } = await import('./query-classifier-service')

      // Classifier la query pour déterminer catégories pertinentes
      const classification = await classifyQuery(question)

      let kbResults: Array<{
        knowledgeBaseId: string
        title: string
        chunkContent: string
        similarity: number
        category: string
        metadata: Record<string, unknown>
      }> = []

      // Recherche filtrée par catégorie si classification confiante
      if (isClassificationConfident(classification) && classification.categories.length > 0) {
        console.log(
          `[RAG Search] Filtrage KB par catégories: ${classification.categories.join(', ')} (confiance: ${(classification.confidence * 100).toFixed(1)}%)`
        )

        // Recherche dans chaque catégorie pertinente
        for (const category of classification.categories) {
          const categoryResults = await searchKnowledgeBase(question, {
            category: category as any,
            limit: Math.ceil(maxContextChunks / classification.categories.length),
            threshold: RAG_THRESHOLDS.knowledgeBase,
            operationName: options.operationName,
          })
          kbResults.push(...categoryResults)
        }

        // Re-trier par similarité globale et limiter
        kbResults.sort((a, b) => b.similarity - a.similarity)
        kbResults = kbResults.slice(0, maxContextChunks)
      } else {
        // Recherche globale (fallback si classification non confiante)
        console.log(
          `[RAG Search] Recherche KB globale (classification confiance: ${(classification.confidence * 100).toFixed(1)}%)`
        )
        kbResults = await searchKnowledgeBase(question, {
          limit: maxContextChunks,
          threshold: RAG_THRESHOLDS.knowledgeBase,
          operationName: options.operationName,
        })
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
      // Log mais continuer sans la base de connaissances en cas d'erreur
      console.error('Erreur recherche knowledge base:', error)
    }
  }

  // Filtrer par seuil minimum absolu
  const aboveThreshold = allSources.filter(
    (s) => s.similarity >= RAG_THRESHOLDS.minimum
  )

  // Appliquer re-ranking avec boost dynamique, cross-encoder et diversité
  let rerankedSources = await rerankSources(aboveThreshold, question)

  // Seuils adaptatifs: si moins de 3 résultats, baisser le seuil de 20% (une seule fois)
  // Plancher absolu à 0.35 pour éviter d'inclure du bruit
  const ADAPTIVE_FLOOR = 0.35
  if (rerankedSources.length < 3 && allSources.length > rerankedSources.length) {
    const adaptiveThreshold = Math.max(RAG_THRESHOLDS.minimum * 0.8, ADAPTIVE_FLOOR)
    if (adaptiveThreshold < RAG_THRESHOLDS.minimum) {
      const adaptiveResults = allSources.filter(
        (s) => s.similarity >= adaptiveThreshold
      )
      if (adaptiveResults.length > rerankedSources.length) {
        console.log(`[RAG Search] Seuil adaptatif: ${rerankedSources.length} → ${adaptiveResults.length} résultats (seuil ${adaptiveThreshold.toFixed(2)}, plancher ${ADAPTIVE_FLOOR})`)
        rerankedSources = await rerankSources(adaptiveResults, question)
      }
    }
  }

  // FILTRAGE ABROGATIONS : Exclure documents abrogés/suspendus
  // TEMPORARILY DISABLED - Conflicting with deploy (formatAbrogationWarnings duplicate)
  // const filteredResult = await filterAbrogatedSources(rerankedSources, {
  //   enableFilter: true,
  //   warnOnModified: true,
  //   logExclusions: true,
  // })

  // Si trop de sources filtrées, logger pour monitoring
  // if (filteredResult.filteredCount > 0) {
  //   console.log(`[RAG Filter] ⚠️  ${filteredResult.filteredCount} source(s) filtrée(s) (abrogées/suspendues)`)
  // }

  // Limiter au nombre demandé (sur sources valides)
  const finalSources = rerankedSources.slice(0, maxContextChunks)

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

  // Recherche dans la langue originale (poids principal) avec timeout
  let primaryResult: SearchResult
  try {
    primaryResult = await withTimeout(
      searchRelevantContext(question, userId, options),
      BILINGUAL_SEARCH_TIMEOUT_MS,
      'recherche primaire'
    )
  } catch (error) {
    console.error('[RAG Bilingual] Timeout recherche primaire:', error instanceof Error ? error.message : error)
    return { sources: [], cacheHit: false } // Retourner vide en cas de timeout total
  }

  // Si query expansion désactivé ou traduction non disponible, retourner les résultats primaires
  if (!ENABLE_QUERY_EXPANSION || !isTranslationAvailable()) {
    return primaryResult
  }

  // Vérifier le temps restant pour la recherche secondaire
  const elapsedMs = Date.now() - startTime
  const remainingMs = BILINGUAL_SEARCH_TIMEOUT_MS - elapsedMs

  // Si moins de 2s restantes, ne pas lancer la recherche secondaire
  if (remainingMs < 2000) {
    console.log(`[RAG Bilingual] Temps restant insuffisant (${remainingMs}ms), skip recherche secondaire`)
    return primaryResult
  }

  // Traduire vers la langue opposée
  const targetLang = getOppositeLanguage(detectedLang)
  let translation: { success: boolean; translatedText: string }

  try {
    translation = await withTimeout(
      translateQuery(question, detectedLang === 'mixed' ? 'fr' : detectedLang, targetLang),
      Math.min(3000, remainingMs / 2), // Max 3s pour la traduction
      'traduction'
    )
  } catch {
    console.log('[RAG Bilingual] Timeout traduction, retour résultats primaires')
    return primaryResult
  }

  if (!translation.success || translation.translatedText === question) {
    console.log('[RAG Bilingual] Traduction échouée ou identique, retour résultats primaires')
    return primaryResult
  }

  console.log(`[RAG Bilingual] Question traduite: "${translation.translatedText.substring(0, 50)}..."`)

  // Recherche dans la langue traduite avec timeout restant
  const newRemainingMs = BILINGUAL_SEARCH_TIMEOUT_MS - (Date.now() - startTime)
  let secondaryResult: SearchResult = { sources: [], cacheHit: false }

  try {
    secondaryResult = await withTimeout(
      searchRelevantContext(translation.translatedText, userId, options),
      Math.max(2000, newRemainingMs), // Au moins 2s
      'recherche secondaire'
    )
  } catch (error) {
    console.warn('[RAG Bilingual] Timeout recherche secondaire, retour résultats primaires seuls:', error instanceof Error ? error.message : error)
    return primaryResult
  }

  const primarySources = primaryResult.sources
  const secondarySources = secondaryResult.sources

  // Fusionner et re-rank les résultats
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
  console.log(`[RAG Bilingual] Fusion: ${primarySources.length} primaires + ${secondarySources.length} secondaires → ${finalSources.length} finaux (${totalTimeMs}ms)`)

  // Cache hit si au moins une des deux recherches était en cache
  return {
    sources: finalSources,
    cacheHit: primaryResult.cacheHit || secondaryResult.cacheHit,
  }
}

// =============================================================================
// CONSTRUCTION DU PROMPT
// =============================================================================

// Limite de tokens pour le contexte RAG (4000 par défaut pour les LLM modernes 8k+)
const RAG_MAX_CONTEXT_TOKENS = parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '4000', 10)

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

    // Labels fixes [Source-N], [Juris-N], [KB-N] — compatibles avec le regex frontend
    let part: string
    if (sourceType === 'jurisprudence') {
      // Format enrichi pour jurisprudence
      let enrichedHeader = `[Juris-${i + 1}] ${source.documentName}\n`

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
    } else if (sourceType === 'knowledge_base') {
      let enrichedHeader = `[KB-${i + 1}] ${source.documentName}\n`

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
      part = `[Source-${i + 1}] ${source.documentName}\n\n` + source.chunkContent
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

  return contextParts.join('\n\n---\n\n')
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

  if (!isChatEnabled()) {
    throw new Error('Chat IA désactivé (activer OLLAMA_ENABLED ou configurer GROQ_API_KEY)')
  }

  const provider = getChatProvider()

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
    console.error('[RAG] ERREUR RECHERCHE CONTEXTE - Sources indisponibles:', error instanceof Error ? error.message : error)
    isDegradedMode = true
    sources = []
    searchTimeMs = Date.now() - startSearch
  }

  // 2. Si la recherche a réussi mais n'a trouvé aucune source pertinente,
  // retourner un message clair au lieu d'appeler le LLM (évite les hallucinations)
  if (!isDegradedMode && sources.length === 0) {
    const noSourcesLang = detectLanguage(question)
    const noSourcesMessage = noSourcesLang === 'ar'
      ? 'لم أجد وثائق ذات صلة بسؤالك في قاعدة البيانات. يرجى إعادة صياغة السؤال أو التأكد من رفع المستندات المتعلقة بالموضوع.'
      : 'Je n\'ai trouvé aucun document pertinent pour votre question. Veuillez reformuler ou vérifier que les documents nécessaires ont été téléversés.'

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

    throw new Error(
      'Sources juridiques temporairement indisponibles. Veuillez réessayer dans quelques instants. ' +
      '/ المصادر القانونية غير متوفرة مؤقتًا. يرجى المحاولة مرة أخرى بعد قليل.'
    )
  }

  // Détecter la langue de la question pour adapter les labels du contexte
  const questionLang = detectLanguage(question)
  const context = await buildContextFromSources(sources, questionLang)

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
  const supportedLang: SupportedLanguage = questionLang === 'ar' ? 'ar' : 'fr'
  const baseSystemPrompt = getSystemPromptForContext(contextType, supportedLang)

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

  // Ajouter la nouvelle question avec le contexte
  messagesOpenAI.push({
    role: 'user',
    content: `Documents du dossier:\n\n${context}\n\n---\n\nQuestion: ${question}`,
  })

  // Messages format Anthropic (sans 'system' dans les messages)
  const messagesAnthropic: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const msg of conversationHistory) {
    messagesAnthropic.push({ role: msg.role, content: msg.content })
  }
  messagesAnthropic.push({
    role: 'user',
    content: `Documents du dossier:\n\n${context}\n\n---\n\nQuestion: ${question}`,
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

    console.error('[RAG] Erreur LLM (tous providers épuisés):', error)
    throw error // Re-throw pour que l'appelant puisse gérer
  }

  // Déclencher génération de résumé en async si seuil atteint
  if (options.conversationId && totalMessageCount >= SUMMARY_CONFIG.triggerMessageCount) {
    triggerSummaryGenerationIfNeeded(options.conversationId).catch((err) =>
      console.error('[RAG] Erreur trigger résumé:', err)
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

  // Phase 2.2 : Valider citations juridiques
  let citationWarnings: string[] = []
  if (process.env.ENABLE_CITATION_VALIDATION !== 'false') {
    try {
      const validationResult = validateArticleCitations(answer, sources)

      if (validationResult.warnings.length > 0) {
        console.warn('[RAG] Citations non vérifiées:', formatValidationWarnings(validationResult))
        citationWarnings = validationResult.warnings.map(w => w.citation)
      }
    } catch (error) {
      console.error('[RAG] Erreur validation citations:', error)
      // Ne pas bloquer la réponse
    }
  }

  // Phase 2.3 : Détecter lois/articles abrogés
  let abrogationWarnings: AbrogationWarning[] = []
  if (process.env.ENABLE_ABROGATION_DETECTION !== 'false') {
    try {
      abrogationWarnings = await detectAbrogatedReferences(answer, sources)

      if (abrogationWarnings.length > 0) {
        console.warn('[RAG] Lois abrogées détectées:', formatAbrogationWarnings(abrogationWarnings))
      }
    } catch (error) {
      console.error('[RAG] Erreur détection abrogations:', error)
      // Ne pas bloquer la réponse
    }
  }

  return {
    answer,
    sources,
    tokensUsed,
    model: modelUsed,
    conversationId: options.conversationId,
    citationWarnings: citationWarnings.length > 0 ? citationWarnings : undefined,
    abrogationWarnings: abrogationWarnings.length > 0 ? abrogationWarnings : undefined,
  }
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
  model?: string
): Promise<string> {
  const result = await db.query(
    `INSERT INTO chat_messages (conversation_id, role, content, sources, tokens_used, model)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      conversationId,
      role,
      content,
      sources ? JSON.stringify(sources) : null,
      tokensUsed || null,
      model || null,
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
  limit: number = 20
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

  if (dossierId) {
    sql += ` AND c.dossier_id = $2`
    params.push(dossierId)
    sql += ` ORDER BY c.updated_at DESC LIMIT $3`
    params.push(limit)
  } else {
    sql += ` ORDER BY c.updated_at DESC LIMIT $2`
    params.push(limit)
  }

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
  // Tronquer et nettoyer pour faire un titre
  const title = firstMessage
    .replace(/Documents du dossier:[\s\S]*?---\s*Question:\s*/i, '')
    .substring(0, 60)
    .trim()

  if (title.length === 60) {
    return title + '...'
  }

  return title || 'Nouvelle conversation'
}
