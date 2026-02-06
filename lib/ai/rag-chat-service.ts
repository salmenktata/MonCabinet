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

// =============================================================================
// CLIENTS LLM (Groq prioritaire, puis Anthropic, puis OpenAI)
// =============================================================================

let anthropicClient: Anthropic | null = null
let groqClient: OpenAI | null = null

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
 * Re-rank les sources avec boost par type et diversité
 */
function rerankSources(sources: ChatSource[]): ChatSource[] {
  if (sources.length === 0) return sources

  // 1. Appliquer boost par type
  const rankedSources: RankedSource[] = sources.map((s) => {
    const sourceType = getSourceType(s.metadata as Record<string, unknown>)
    const boost = SOURCE_BOOST[sourceType] || SOURCE_BOOST.autre || 1.0
    return {
      ...s,
      boostedScore: s.similarity * boost,
      sourceType,
      sourceId: getSourceId(s),
    }
  })

  // 2. Trier par score boosté décroissant
  rankedSources.sort((a, b) => b.boostedScore - a.boostedScore)

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

  // Appliquer re-ranking avec boost et diversité
  const rerankedSources = rerankSources(aboveThreshold)

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

  return finalSources
}

// =============================================================================
// CONSTRUCTION DU PROMPT
// =============================================================================

/**
 * Construit le contexte à partir des sources
 */
function buildContextFromSources(sources: ChatSource[]): string {
  if (sources.length === 0) {
    return 'لا توجد وثائق ذات صلة. / Aucun document pertinent trouvé.'
  }

  const contextParts: string[] = []

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    const meta = source.metadata as any
    const sourceType = meta?.type

    if (sourceType === 'jurisprudence') {
      contextParts.push(
        `[اجتهاد قضائي ${i + 1}] ${source.documentName}\n` +
          `الغرفة: ${meta?.chamber || 'غ/م'}, التاريخ: ${meta?.date || 'غ/م'}\n` +
          `الفصول المذكورة: ${meta?.articles?.join(', ') || 'غ/م'}\n\n` +
          source.chunkContent
      )
    } else if (sourceType === 'knowledge_base') {
      const categoryLabels: Record<string, string> = {
        jurisprudence: 'اجتهاد قضائي',
        code: 'قانون',
        doctrine: 'فقه',
        modele: 'نموذج',
        autre: 'أخرى',
      }
      const categoryLabel = categoryLabels[meta?.category] || 'مرجع'
      contextParts.push(
        `[قاعدة المعرفة - ${categoryLabel} ${i + 1}] ${source.documentName}\n\n` +
          source.chunkContent
      )
    } else {
      contextParts.push(
        `[وثيقة ${i + 1}] ${source.documentName}\n\n` + source.chunkContent
      )
    }
  }

  return contextParts.join('\n\n---\n\n')
}

/**
 * Récupère l'historique de conversation pour le contexte
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
    throw new Error('Chat IA désactivé (configurer GROQ_API_KEY, ANTHROPIC_API_KEY ou OPENAI_API_KEY)')
  }

  const provider = getChatProvider()

  // 1. Rechercher le contexte pertinent
  const sources = await searchRelevantContext(question, userId, options)

  // 2. Construire le contexte
  const context = buildContextFromSources(sources)

  // 3. Récupérer l'historique si conversation existante
  let conversationHistory: ConversationMessage[] = []
  if (options.conversationId) {
    conversationHistory = await getConversationHistory(options.conversationId, 6)
  }

  // 4. Construire les messages
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  // Ajouter l'historique de conversation
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  // Ajouter la nouvelle question avec le contexte
  messages.push({
    role: 'user',
    content: `Documents du dossier:\n\n${context}\n\n---\n\nQuestion: ${question}`,
  })

  let answer: string
  let tokensUsed: { input: number; output: number; total: number }
  let modelUsed: string

  // 5. Appeler le LLM selon le provider configuré
  if (provider === 'groq') {
    // Groq (API compatible OpenAI)
    const client = getGroqClient()
    const response = await client.chat.completions.create({
      model: aiConfig.groq.model,
      max_tokens: aiConfig.anthropic.maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.qadhya },
        ...messages,
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
    // Anthropic Claude (fallback)
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: aiConfig.anthropic.model,
      max_tokens: aiConfig.anthropic.maxTokens,
      system: SYSTEM_PROMPTS.qadhya,
      messages,
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
