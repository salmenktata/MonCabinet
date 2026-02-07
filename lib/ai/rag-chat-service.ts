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
import {
  getConversationContext,
  triggerSummaryGenerationIfNeeded,
  SUMMARY_CONFIG,
} from './conversation-summary-service'
import { encode } from 'gpt-tokenizer'
import { getDynamicBoostFactors } from './feedback-service'
import {
  rerankDocuments,
  combineScores,
  isRerankerEnabled,
  DocumentToRerank,
} from './reranker-service'

// Configuration Query Expansion
const ENABLE_QUERY_EXPANSION = process.env.ENABLE_QUERY_EXPANSION !== 'false'

// =============================================================================
// CLIENTS LLM (Ollama prioritaire, puis Groq, puis Anthropic)
// =============================================================================

let anthropicClient: Anthropic | null = null
let groqClient: OpenAI | null = null
let ollamaClient: OpenAI | null = null

function getOllamaClient(): OpenAI {
  if (!ollamaClient) {
    ollamaClient = new OpenAI({
      apiKey: 'ollama', // Ollama n'a pas besoin de clé
      baseURL: `${aiConfig.ollama.baseUrl}/v1`,
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
}

export interface ChatOptions {
  dossierId?: string
  conversationId?: string
  maxContextChunks?: number
  includeJurisprudence?: boolean
  includeKnowledgeBase?: boolean
  temperature?: number
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

  // Récupérer les boosts dynamiques si non fournis
  const boosts = boostFactors || (await getDynamicBoostFactors()).factors

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

/**
 * Recherche les documents pertinents pour une question
 * Avec cache Redis pour les recherches répétées.
 */
async function searchRelevantContext(
  question: string,
  userId: string,
  options: ChatOptions = {}
): Promise<ChatSource[]> {
  const startTime = Date.now()
  const {
    dossierId,
    maxContextChunks = aiConfig.rag.maxResults,
    includeJurisprudence = false,
    includeKnowledgeBase = true, // Activé par défaut
  } = options

  // Générer l'embedding de la question
  const queryEmbedding = await generateEmbedding(question)
  const embeddingStr = formatEmbeddingForPostgres(queryEmbedding.embedding)

  // Vérifier le cache de recherche
  const searchScope: SearchScope = { userId, dossierId }
  const cachedResults = await getCachedSearchResults(queryEmbedding.embedding, searchScope)
  if (cachedResults) {
    console.log(`[RAG Search] Cache HIT - ${cachedResults.length} sources (${Date.now() - startTime}ms)`)
    return cachedResults as ChatSource[]
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
      const kbResults = await searchKnowledgeBase(question, {
        limit: maxContextChunks, // Plus de KB pour le re-ranking
        threshold: RAG_THRESHOLDS.knowledgeBase,
      })

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
  const rerankedSources = await rerankSources(aboveThreshold, question)

  // Limiter au nombre demandé
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

  return finalSources
}

/**
 * Recherche bilingue avec query expansion AR ↔ FR
 * Traduit la question et fusionne les résultats des deux langues.
 */
async function searchRelevantContextBilingual(
  question: string,
  userId: string,
  options: ChatOptions = {}
): Promise<ChatSource[]> {
  // Détecter la langue de la question
  const detectedLang = detectLanguage(question)
  console.log(`[RAG Bilingual] Langue détectée: ${detectedLang}`)

  // Recherche dans la langue originale (poids principal)
  const primarySources = await searchRelevantContext(question, userId, options)

  // Si query expansion désactivé ou traduction non disponible, retourner les résultats primaires
  if (!ENABLE_QUERY_EXPANSION || !isTranslationAvailable()) {
    return primarySources
  }

  // Traduire vers la langue opposée
  const targetLang = getOppositeLanguage(detectedLang)
  const translation = await translateQuery(question, detectedLang === 'mixed' ? 'fr' : detectedLang, targetLang)

  if (!translation.success || translation.translatedText === question) {
    console.log('[RAG Bilingual] Traduction échouée ou identique, retour résultats primaires')
    return primarySources
  }

  console.log(`[RAG Bilingual] Question traduite: "${translation.translatedText.substring(0, 50)}..."`)

  // Recherche dans la langue traduite
  const secondarySources = await searchRelevantContext(translation.translatedText, userId, options)

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

  console.log(`[RAG Bilingual] Fusion: ${primarySources.length} primaires + ${secondarySources.length} secondaires → ${finalSources.length} finaux`)

  return finalSources
}

// =============================================================================
// CONSTRUCTION DU PROMPT
// =============================================================================

// Limite de tokens pour le contexte RAG
const RAG_MAX_CONTEXT_TOKENS = parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '2000', 10)

/**
 * Compte le nombre de tokens dans un texte de manière précise
 * Utilise gpt-tokenizer pour un comptage exact compatible GPT-4/Claude
 */
function countTokens(text: string): number {
  try {
    return encode(text).length
  } catch {
    // Fallback si erreur d'encodage (caractères spéciaux)
    return Math.ceil(text.length / 4)
  }
}

/**
 * Construit le contexte à partir des sources avec limite de tokens
 */
function buildContextFromSources(sources: ChatSource[]): string {
  if (sources.length === 0) {
    return 'لا توجد وثائق ذات صلة. / Aucun document pertinent trouvé.'
  }

  const contextParts: string[] = []
  let totalTokens = 0
  let sourcesUsed = 0

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    const meta = source.metadata as any
    const sourceType = meta?.type

    let part: string
    if (sourceType === 'jurisprudence') {
      part = `[اجتهاد قضائي ${i + 1}] ${source.documentName}\n` +
        `الغرفة: ${meta?.chamber || 'غ/م'}, التاريخ: ${meta?.date || 'غ/م'}\n` +
        `الفصول المذكورة: ${meta?.articles?.join(', ') || 'غ/م'}\n\n` +
        source.chunkContent
    } else if (sourceType === 'knowledge_base') {
      const categoryLabels: Record<string, string> = {
        jurisprudence: 'اجتهاد قضائي',
        code: 'قانون',
        doctrine: 'فقه',
        modele: 'نموذج',
        autre: 'أخرى',
      }
      const categoryLabel = categoryLabels[meta?.category] || 'مرجع'
      part = `[قاعدة المعرفة - ${categoryLabel} ${i + 1}] ${source.documentName}\n\n` +
        source.chunkContent
    } else {
      part = `[وثيقة ${i + 1}] ${source.documentName}\n\n` + source.chunkContent
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

  console.log(`[RAG Context] ${sourcesUsed}/${sources.length} sources, ~${totalTokens} tokens`)

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
  if (!isChatEnabled()) {
    throw new Error('Chat IA désactivé (activer OLLAMA_ENABLED ou configurer GROQ_API_KEY)')
  }

  const provider = getChatProvider()

  // 1. Rechercher le contexte pertinent (bilingue si activé) avec fallback dégradé
  let sources: ChatSource[] = []
  let isDegradedMode = false

  try {
    sources = ENABLE_QUERY_EXPANSION
      ? await searchRelevantContextBilingual(question, userId, options)
      : await searchRelevantContext(question, userId, options)
  } catch (error) {
    // Mode dégradé: continuer sans contexte RAG
    console.error('[RAG] FALLBACK MODE - Erreur recherche contexte:', error instanceof Error ? error.message : error)
    isDegradedMode = true
    sources = []
  }

  // 2. Construire le contexte (adapté si mode dégradé)
  const context = isDegradedMode
    ? 'خطأ في الوصول إلى الوثائق. أجب بناءً على معرفتك العامة بالقانون التونسي. / Erreur d\'accès aux documents. Réponds selon tes connaissances générales du droit tunisien.'
    : buildContextFromSources(sources)

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
    ? `${SYSTEM_PROMPTS.qadhya}\n\n[Résumé de la conversation précédente]\n${conversationSummary}`
    : SYSTEM_PROMPTS.qadhya

  let answer: string
  let tokensUsed: { input: number; output: number; total: number }
  let modelUsed: string

  // 5. Appeler le LLM selon le provider configuré
  // Priorité: Ollama (local gratuit) > Groq (cloud rapide) > Anthropic
  if (provider === 'ollama') {
    // Ollama (local, gratuit, illimité)
    const client = getOllamaClient()
    const response = await client.chat.completions.create({
      model: aiConfig.ollama.chatModel,
      max_tokens: aiConfig.anthropic.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.qadhya },
        ...messagesOpenAI,
      ],
      temperature: options.temperature ?? 0.3,
    })

    answer = response.choices[0]?.message?.content || ''
    tokensUsed = {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
      total: response.usage?.total_tokens || 0,
    }
    modelUsed = `ollama/${aiConfig.ollama.chatModel}`
  } else if (provider === 'groq') {
    // Groq (API compatible OpenAI, fallback cloud)
    const client = getGroqClient()
    const response = await client.chat.completions.create({
      model: aiConfig.groq.model,
      max_tokens: aiConfig.anthropic.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.qadhya },
        ...messagesOpenAI,
      ],
      temperature: options.temperature ?? 0.3,
    })

    answer = response.choices[0]?.message?.content || ''
    tokensUsed = {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
      total: response.usage?.total_tokens || 0,
    }
    modelUsed = aiConfig.groq.model
  } else {
    // Anthropic Claude (dernier fallback)
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: aiConfig.anthropic.model,
      max_tokens: aiConfig.anthropic.maxTokens,
      system: systemPromptWithSummary,
      messages: messagesAnthropic,
      temperature: options.temperature ?? 0.3,
    })

    answer = response.content[0].type === 'text' ? response.content[0].text : ''
    tokensUsed = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      total: response.usage.input_tokens + response.usage.output_tokens,
    }
    modelUsed = aiConfig.anthropic.model
  }

  // Déclencher génération de résumé en async si seuil atteint
  if (options.conversationId && totalMessageCount >= SUMMARY_CONFIG.triggerMessageCount) {
    triggerSummaryGenerationIfNeeded(options.conversationId).catch((err) =>
      console.error('[RAG] Erreur trigger résumé:', err)
    )
  }

  return {
    answer,
    sources,
    tokensUsed,
    model: modelUsed,
    conversationId: options.conversationId,
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
