/**
 * Service RAG Unifié - Sprint 3 Phase 2
 *
 * Fusionne rag-chat-service.ts + enhanced-rag-search-service.ts en une API cohérente
 *
 * Objectifs :
 * - API simple et prévisible : search(), chat(), explain(), detectContradictions()
 * - Cache multi-niveau (Redis L1/L2/L3 + QueryClient)
 * - Métadonnées enrichies partout (tribunal, chambre, relations juridiques)
 * - Performance optimisée (batch enrichment, parallel operations)
 *
 * Réduction : 1445 lignes → ~600 lignes (-58%)
 *
 * @module lib/ai/unified-rag-service
 */

import { db } from '@/lib/db/postgres'
import {
  generateEmbedding,
  formatEmbeddingForPostgres,
} from './embeddings-service'
import { searchKnowledgeBaseHybrid } from './knowledge-base-service'
import type { KnowledgeCategory } from '@/lib/categories/legal-categories'
import type { DocumentType } from '@/lib/categories/doc-types'
import { getCachedEmbedding } from '@/lib/cache/embedding-cache'
import { aiConfig, RAG_THRESHOLDS, getEmbeddingProvider } from './config'
import {
  callLLMWithFallback,
  type LLMMessage,
  type LLMResponse,
  type AIContext,
} from './llm-fallback-service'
import {
  getSystemPromptForContext,
  type PromptContextType,
  type SupportedLanguage,
} from './legal-reasoning-prompts'
import {
  getCachedSearchResults,
  setCachedSearchResults,
  type SearchScope,
} from '@/lib/cache/search-cache'
import { detectLanguage, type DetectedLanguage } from './language-utils'
import { recordRAGMetric } from '@/lib/metrics/rag-metrics'
import {
  validateArticleCitations,
  formatValidationWarnings,
  type ValidationResult,
} from './citation-validator-service'
import type { ChatSource } from './rag-chat-service'
import {
  detectAbrogatedReferences,
  formatAbrogationWarnings,
  type AbrogationWarning,
} from './abrogation-detector-service'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Filtres de recherche juridique
 */
export interface RAGSearchFilters {
  /** Catégorie de document (jurisprudence, code, doctrine, etc.) */
  category?: string

  /** Domaine juridique (civil, commercial, pénal, etc.) */
  domain?: string

  /** Code tribunal */
  tribunal?: string

  /** Code chambre */
  chambre?: string

  /** Plage de dates */
  dateRange?: {
    from?: Date
    to?: Date
  }

  /** Langue du document (ar, fr, bi) */
  language?: 'ar' | 'fr' | 'bi'

  /** Confiance minimum d'extraction (0-1) */
  minConfidence?: number

  /** Type de document selon taxonomie */
  documentType?: string

  /** IDs de dossier pour contexte */
  dossierId?: string

  /** Inclure jurisprudence */
  includeJurisprudence?: boolean

  /** Inclure knowledge base */
  includeKnowledgeBase?: boolean
}

/**
 * Options de recherche
 */
export interface RAGSearchOptions {
  /** Nombre maximum de résultats */
  limit?: number

  /** Offset pour pagination (nombre de résultats à skip) */
  offset?: number

  /** Seuil de similarité minimum (0-1) */
  threshold?: number

  /** Inclure les relations juridiques */
  includeRelations?: boolean

  /** Activer le re-ranking TF-IDF */
  enableReranking?: boolean

  /** Utilisateur (pour logging) */
  userId?: string

  /** Conversation ID (pour contexte) */
  conversationId?: string
}

/**
 * Métadonnées juridiques structurées
 */
export interface LegalMetadata {
  tribunalCode: string | null
  tribunalLabelAr: string | null
  tribunalLabelFr: string | null
  chambreCode: string | null
  chambreLabelAr: string | null
  chambreLabelFr: string | null
  decisionDate: Date | null
  decisionNumber: string | null
  legalBasis: string[] | null
  extractionConfidence: number | null
  citesCount?: number
  citedByCount?: number
}

/**
 * Relation juridique
 */
export interface LegalRelation {
  relationType: string
  relatedKbId: string
  relatedTitle: string
  relatedCategory: string
  context: string | null
  confidence: number | null
  direction: 'outgoing' | 'incoming'
}

/**
 * Résultat de recherche RAG
 */
export interface RAGSearchResult {
  kbId: string
  title: string
  category: string
  similarity: number
  chunkContent?: string
  chunkIndex?: number
  metadata: LegalMetadata
  relations?: {
    cites: LegalRelation[]
    citedBy: LegalRelation[]
    supersedes: LegalRelation[]
    supersededBy: LegalRelation[]
    relatedCases: LegalRelation[]
  }
}

/**
 * Options de chat RAG
 */
export interface RAGChatOptions {
  /** Nombre maximum de chunks de contexte */
  maxContextChunks?: number

  /** Température LLM (0-1) */
  temperature?: number

  /** Type de contexte pour prompt */
  contextType?: PromptContextType

  /** Mode Premium (cloud providers) */
  usePremiumModel?: boolean

  /** Filtres de recherche */
  filters?: RAGSearchFilters

  /** Conversation ID (pour historique) */
  conversationId?: string

  /** Dossier ID (pour contexte) */
  dossierId?: string

  /** User ID (pour logging) */
  userId?: string
}

/**
 * Réponse de chat RAG
 */
export interface RAGChatResponse {
  answer: string
  sources: RAGSearchResult[]
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  model: string
  conversationId?: string
  citationWarnings?: string[]
  abrogationWarnings?: AbrogationWarning[]
  language: DetectedLanguage
}

// =============================================================================
// HELPERS PRIVÉS
// =============================================================================

/** Valeur nulle partagée pour les métadonnées manquantes */
const NULL_METADATA: LegalMetadata = {
  tribunalCode: null,
  tribunalLabelAr: null,
  tribunalLabelFr: null,
  chambreCode: null,
  chambreLabelAr: null,
  chambreLabelFr: null,
  decisionDate: null,
  decisionNumber: null,
  legalBasis: null,
  extractionConfidence: null,
}

/**
 * Enrichit les sources avec métadonnées juridiques (batch)
 * Performance : 1 query SQL au lieu de N (évite N+1)
 */
async function batchEnrichSourcesWithMetadata(
  sources: Array<{ documentId: string; metadata?: Record<string, unknown> }>
): Promise<Array<{ documentId: string; metadata: LegalMetadata }>> {
  if (sources.length === 0) return []

  const kbIds = sources.map((s) => s.documentId)

  try {
    // 1 seule requête SQL pour tous les documents
    const result = await db.query(
      `
      SELECT
        meta.knowledge_base_id,
        meta.tribunal_code,
        trib_tax.label_ar AS tribunal_label_ar,
        trib_tax.label_fr AS tribunal_label_fr,
        meta.chambre_code,
        chambre_tax.label_ar AS chambre_label_ar,
        chambre_tax.label_fr AS chambre_label_fr,
        meta.decision_date,
        meta.decision_number,
        meta.legal_basis,
        meta.extraction_confidence,
        (SELECT COUNT(*) FROM kb_legal_relations WHERE source_kb_id = meta.knowledge_base_id AND validated = true) AS cites_count,
        (SELECT COUNT(*) FROM kb_legal_relations WHERE target_kb_id = meta.knowledge_base_id AND validated = true) AS cited_by_count
      FROM kb_structured_metadata meta
      LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
      LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
      WHERE meta.knowledge_base_id = ANY($1)
      `,
      [kbIds]
    )

    // Créer un map pour lookup rapide
    const metadataMap = new Map<string, LegalMetadata>()
    result.rows.forEach((row) => {
      metadataMap.set(row.knowledge_base_id, {
        tribunalCode: row.tribunal_code,
        tribunalLabelAr: row.tribunal_label_ar,
        tribunalLabelFr: row.tribunal_label_fr,
        chambreCode: row.chambre_code,
        chambreLabelAr: row.chambre_label_ar,
        chambreLabelFr: row.chambre_label_fr,
        decisionDate: row.decision_date,
        decisionNumber: row.decision_number,
        legalBasis: row.legal_basis,
        extractionConfidence: row.extraction_confidence,
        citesCount: parseInt(row.cites_count || '0', 10),
        citedByCount: parseInt(row.cited_by_count || '0', 10),
      })
    })

    // Enrichir les sources
    return sources.map((source) => ({
      documentId: source.documentId,
      metadata: metadataMap.get(source.documentId) || { ...NULL_METADATA, citesCount: 0, citedByCount: 0 },
    }))
  } catch (error) {
    console.error('[UnifiedRAG] Erreur enrichissement métadonnées batch:', error)
    // Retourner sources sans enrichissement en cas d'erreur
    return sources.map((source) => ({
      documentId: source.documentId,
      metadata: { ...NULL_METADATA, citesCount: 0, citedByCount: 0 },
    }))
  }
}

/**
 * Récupère les relations juridiques de plusieurs documents en une seule requête SQL (anti N+1).
 * Utilise UNION ALL pour capturer les relations entrantes et sortantes de tous les documents.
 */
async function batchGetDocumentRelations(
  kbIds: string[],
  includeRelations: boolean
): Promise<Map<string, RAGSearchResult['relations']>> {
  // Initialiser la map avec des relations vides pour chaque document
  const relationsMap = new Map<string, RAGSearchResult['relations']>()
  for (const id of kbIds) {
    relationsMap.set(id, { cites: [], citedBy: [], supersedes: [], supersededBy: [], relatedCases: [] })
  }

  if (!includeRelations || kbIds.length === 0) return relationsMap

  try {
    const result = await db.query(
      `
      -- Relations sortantes (source dans kbIds)
      SELECT
        r.source_kb_id AS owner_kb_id,
        'outgoing' AS direction,
        r.relation_type,
        r.target_kb_id AS related_kb_id,
        kb_t.title AS related_title,
        kb_t.category AS related_category,
        r.context,
        r.confidence
      FROM kb_legal_relations r
      JOIN knowledge_base kb_t ON r.target_kb_id = kb_t.id
      WHERE r.source_kb_id = ANY($1) AND r.validated = true

      UNION ALL

      -- Relations entrantes (target dans kbIds)
      SELECT
        r.target_kb_id AS owner_kb_id,
        'incoming' AS direction,
        r.relation_type,
        r.source_kb_id AS related_kb_id,
        kb_s.title AS related_title,
        kb_s.category AS related_category,
        r.context,
        r.confidence
      FROM kb_legal_relations r
      JOIN knowledge_base kb_s ON r.source_kb_id = kb_s.id
      WHERE r.target_kb_id = ANY($1) AND r.validated = true

      ORDER BY confidence DESC NULLS LAST
      LIMIT 500
      `,
      [kbIds]
    )

    result.rows.forEach((row) => {
      const relations = relationsMap.get(row.owner_kb_id)
      if (!relations) return

      const relation: LegalRelation = {
        relationType: row.relation_type,
        relatedKbId: row.related_kb_id,
        relatedTitle: row.related_title,
        relatedCategory: row.related_category,
        context: row.context,
        confidence: row.confidence,
        direction: row.direction,
      }

      if (row.relation_type === 'cites' && row.direction === 'outgoing') {
        relations.cites.push(relation)
      } else if (row.relation_type === 'cites' && row.direction === 'incoming') {
        relations.citedBy.push(relation)
      } else if (row.relation_type === 'supersedes' && row.direction === 'outgoing') {
        relations.supersedes.push(relation)
      } else if (row.relation_type === 'supersedes' && row.direction === 'incoming') {
        relations.supersededBy.push(relation)
      } else if (row.relation_type === 'related_case') {
        relations.relatedCases.push(relation)
      }
    })

    return relationsMap
  } catch (error) {
    console.error('[UnifiedRAG] Erreur batch récupération relations:', error)
    return relationsMap
  }
}

// =============================================================================
// API PUBLIQUE
// =============================================================================

/**
 * Recherche sémantique dans la knowledge base avec filtres juridiques
 *
 * @param query Requête utilisateur
 * @param filters Filtres juridiques optionnels
 * @param options Options de recherche
 * @returns Résultats de recherche avec métadonnées enrichies
 *
 * @example
 * ```typescript
 * const results = await search("divorce pension alimentaire", {
 *   category: "jurisprudence",
 *   tribunal: "TRIBUNAL_CASSATION",
 *   dateRange: { from: new Date('2020-01-01') }
 * }, {
 *   limit: 10,
 *   threshold: 0.7,
 *   includeRelations: true
 * })
 * ```
 */
export async function search(
  query: string,
  filters: RAGSearchFilters = {},
  options: RAGSearchOptions = {}
): Promise<RAGSearchResult[]> {
  const startTime = Date.now()
  const limit = options.limit || 10
  const offset = options.offset || 0
  const threshold = options.threshold || RAG_THRESHOLDS.minimum
  const includeRelations = options.includeRelations || false

  // 1. Vérifier le cache Redis AVANT de générer l'embedding (évite l'appel OpenAI si cache hit)
  // Stratégie : on tente d'abord via l'embedding caché (sans appel OpenAI)
  if (process.env.ENABLE_SEARCH_CACHE !== 'false' && options.userId && offset === 0) {
    const embeddingProvider = getEmbeddingProvider()
    if (embeddingProvider) {
      const cachedEmbedding = await getCachedEmbedding(query, embeddingProvider)
      if (cachedEmbedding) {
        const scope: SearchScope = {
          userId: options.userId,
          dossierId: filters.dossierId,
        }
        const cached = await getCachedSearchResults(cachedEmbedding.embedding, scope)
        if (cached) {
          console.log('[UnifiedRAG] ✓ Cache hit pour recherche:', query.substring(0, 50))
          return cached as RAGSearchResult[]
        }
      }
    }
  }

  // 2. Générer embedding (utilise le cache Redis interne, n'appelle OpenAI que si nécessaire)
  const embeddingResult = await generateEmbedding(query)
  const embeddingStr = formatEmbeddingForPostgres(embeddingResult.embedding)

  // 3a. Recherche hybride BM25 + vectorielle (si ENABLE_HYBRID_SEARCH=true)
  // Utilise searchKnowledgeBaseHybrid() depuis knowledge-base-service — dual embedding (OpenAI+Ollama),
  // forced codes search, détection langue, boosts adaptatifs. Aligné avec rag-chat-service.ts.
  // Pagination (offset > 0) → fallback dense. Échec → fallback dense automatique.
  if (process.env.ENABLE_HYBRID_SEARCH === 'true' && offset === 0) {
    try {
      const kbResults = await searchKnowledgeBaseHybrid(query, {
        category: filters.category as KnowledgeCategory | undefined,
        docType: filters.documentType as DocumentType | undefined,
        limit,
        threshold,
      })

      const hKbIds = kbResults.map((r) => r.knowledgeBaseId)
      const [hEnriched, hRelations] = await Promise.all([
        batchEnrichSourcesWithMetadata(hKbIds.map((id) => ({ documentId: id }))),
        batchGetDocumentRelations(hKbIds, includeRelations),
      ])

      const hybridResults: RAGSearchResult[] = kbResults.map((r, i) => ({
        kbId: r.knowledgeBaseId,
        title: r.title,
        category: r.category,
        similarity: r.similarity,
        chunkContent: r.chunkContent,
        chunkIndex: r.chunkIndex,
        metadata: hEnriched[i]?.metadata || NULL_METADATA,
        relations: hRelations.get(r.knowledgeBaseId),
      }))

      const searchTimeMs = Date.now() - startTime

      if (process.env.ENABLE_SEARCH_CACHE !== 'false' && options.userId && hybridResults.length > 0) {
        setCachedSearchResults(embeddingResult.embedding, hybridResults, {
          userId: options.userId,
          dossierId: filters.dossierId,
        }).catch((err) => console.error('[UnifiedRAG] Erreur cache hybride:', err))
      }

      recordRAGMetric({
        searchTimeMs,
        llmTimeMs: 0,
        totalTimeMs: searchTimeMs,
        inputTokens: embeddingResult.tokenCount,
        outputTokens: 0,
        resultsCount: hybridResults.length,
        cacheHit: false,
        degradedMode: false,
        provider: embeddingResult.provider,
      })

      console.log(
        `[UnifiedRAG] ✓ Hybrid search (dual-embed): ${hybridResults.length} résultats (docType=${filters.documentType || 'all'})`
      )
      return hybridResults
    } catch (error) {
      console.warn(
        '[UnifiedRAG] Hybrid search échec, fallback dense:',
        error instanceof Error ? error.message : error
      )
    }
  }

  // 3b. Construire requête SQL dense avec filtres
  const provider = embeddingResult.provider || 'ollama'
  const embeddingColumn = provider === 'openai' ? 'embedding_openai' : provider === 'gemini' ? 'embedding_gemini' : 'embedding'

  const queryParams: unknown[] = [embeddingStr, threshold, limit]
  let paramIndex = 4

  const whereClauses: string[] = [`c.${embeddingColumn} IS NOT NULL`, `1 - (c.${embeddingColumn} <=> $1::vector) >= $2`]

  if (filters.category) {
    whereClauses.push(`kb.category = $${paramIndex}`)
    queryParams.push(filters.category)
    paramIndex++
  }

  if (filters.documentType) {
    whereClauses.push(`kb.doc_type::text = $${paramIndex}`)
    queryParams.push(filters.documentType)
    paramIndex++
  }

  if (filters.tribunal) {
    whereClauses.push(`meta.tribunal_code = $${paramIndex}`)
    queryParams.push(filters.tribunal)
    paramIndex++
  }

  if (filters.chambre) {
    whereClauses.push(`meta.chambre_code = $${paramIndex}`)
    queryParams.push(filters.chambre)
    paramIndex++
  }

  if (filters.domain) {
    whereClauses.push(`kb.domain = $${paramIndex}`)
    queryParams.push(filters.domain)
    paramIndex++
  }

  if (filters.language) {
    whereClauses.push(`kb.language = $${paramIndex}`)
    queryParams.push(filters.language)
    paramIndex++
  }

  if (filters.dateRange?.from) {
    whereClauses.push(`meta.decision_date >= $${paramIndex}`)
    queryParams.push(filters.dateRange.from.toISOString().split('T')[0])
    paramIndex++
  }

  if (filters.dateRange?.to) {
    whereClauses.push(`meta.decision_date <= $${paramIndex}`)
    queryParams.push(filters.dateRange.to.toISOString().split('T')[0])
    paramIndex++
  }

  if (filters.minConfidence) {
    whereClauses.push(`meta.extraction_confidence >= $${paramIndex}`)
    queryParams.push(filters.minConfidence)
    paramIndex++
  }

  // Ajouter OFFSET si pagination (Phase 4.3)
  let offsetClause = ''
  if (offset > 0) {
    offsetClause = `OFFSET $${paramIndex}`
    queryParams.push(offset)
    paramIndex++
  }

  const sqlQuery = `
    SELECT
      kb.id AS kb_id,
      kb.title,
      kb.category,
      1 - (c.${embeddingColumn} <=> $1::vector) AS similarity,
      c.content AS chunk_content,
      c.chunk_index
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON c.knowledge_base_id = kb.id
    LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY similarity DESC
    LIMIT $3
    ${offsetClause}
  `

  const result = await db.query(sqlQuery, queryParams)

  // 4. Enrichir avec métadonnées (batch, 1 query)
  const kbIds = result.rows.map((row) => row.kb_id)
  const enriched = await batchEnrichSourcesWithMetadata(
    result.rows.map((row) => ({ documentId: row.kb_id }))
  )

  // 5. Récupérer toutes les relations en une seule requête SQL (anti N+1)
  const relationsMap = await batchGetDocumentRelations(kbIds, includeRelations)

  // 6. Construire résultats finaux
  const results: RAGSearchResult[] = result.rows.map((row, index) => ({
    kbId: row.kb_id,
    title: row.title,
    category: row.category,
    similarity: parseFloat(row.similarity),
    chunkContent: row.chunk_content,
    chunkIndex: row.chunk_index,
    metadata: enriched[index]?.metadata || NULL_METADATA,
    relations: relationsMap.get(row.kb_id),
  }))

  const searchTimeMs = Date.now() - startTime

  // 7. Mettre en cache (async, pas bloquant) - Skip si pagination ou résultats vides
  if (process.env.ENABLE_SEARCH_CACHE !== 'false' && options.userId && offset === 0 && results.length > 0) {
    const scope: SearchScope = {
      userId: options.userId,
      dossierId: filters.dossierId,
    }
    setCachedSearchResults(embeddingResult.embedding, results, scope).catch((err) =>
      console.error('[UnifiedRAG] Erreur mise en cache:', err)
    )
  }

  // 8. Enregistrer métriques avec timing réel
  recordRAGMetric({
    searchTimeMs,
    llmTimeMs: 0,
    totalTimeMs: searchTimeMs,
    inputTokens: embeddingResult.tokenCount,
    outputTokens: 0,
    resultsCount: results.length,
    cacheHit: false,
    degradedMode: false,
    provider: embeddingResult.provider,
  })

  return results
}

/**
 * Chat RAG avec contexte juridique
 *
 * Orchestre :
 * 1. Recherche sémantique (search())
 * 2. Construction du contexte
 * 3. Appel LLM avec prompt juridique
 * 4. Validation citations + détection abrogations
 *
 * @param question Question utilisateur
 * @param options Options de chat
 * @returns Réponse avec sources et warnings
 *
 * @example
 * ```typescript
 * const response = await chat("Comment calculer la pension alimentaire ?", {
 *   maxContextChunks: 5,
 *   contextType: 'consultation',
 *   usePremiumModel: true,
 *   filters: { category: 'jurisprudence' }
 * })
 * ```
 */
export async function chat(
  question: string,
  options: RAGChatOptions = {}
): Promise<RAGChatResponse> {
  const maxContextChunks = options.maxContextChunks || 5
  const temperature = options.temperature ?? 0.3
  const contextType = options.contextType || 'chat'
  const usePremiumModel = options.usePremiumModel || false

  // 1. Détecter la langue
  const language = detectLanguage(question)

  // 2. Rechercher contexte pertinent
  const searchResults = await search(question, options.filters || {}, {
    limit: maxContextChunks,
    threshold: RAG_THRESHOLDS.minimum,
    includeRelations: false, // Pas besoin pour le chat
    userId: options.userId,
    conversationId: options.conversationId,
  })

  // 3. Construire le contexte
  const contextParts: string[] = searchResults.map((result, index) => {
    let part = `[Source ${index + 1}] ${result.title}\n${result.chunkContent}`

    // Ajouter métadonnées si disponibles
    if (result.metadata.decisionDate) {
      part += `\nDate: ${result.metadata.decisionDate.toLocaleDateString('fr-FR')}`
    }
    if (result.metadata.tribunalLabelFr || result.metadata.tribunalLabelAr) {
      const label = language === 'ar' ? result.metadata.tribunalLabelAr : result.metadata.tribunalLabelFr
      part += `\nTribunal: ${label}`
    }

    return part
  })

  const context = contextParts.join('\n\n---\n\n')

  // 4. Construire le prompt système
  const promptLanguage: 'ar' | 'fr' = language === 'mixed' ? 'fr' : language
  const systemPrompt = getSystemPromptForContext(contextType, promptLanguage)

  // 5. Construire les messages LLM
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: `Contexte juridique :\n\n${context}\n\nQuestion : ${question}`,
    },
  ]

  // 6. Appeler LLM avec fallback
  const llmResponse: LLMResponse = await callLLMWithFallback(messages, {
    temperature,
    maxTokens: 4000,
    context: 'rag-chat' as AIContext,
  }, usePremiumModel)

  // 7. Valider citations
  const chatSources: ChatSource[] = searchResults.map(r => ({
    documentId: r.kbId,
    documentName: r.title,
    chunkContent: r.chunkContent || '',
    similarity: r.similarity,
    metadata: r.metadata as unknown as Record<string, unknown>,
  }))
  const citationWarnings = validateArticleCitations(llmResponse.answer, chatSources)

  // 8. Détecter abrogations
  const abrogationWarnings = await detectAbrogatedReferences(llmResponse.answer)

  return {
    answer: llmResponse.answer,
    sources: searchResults,
    tokensUsed: llmResponse.tokensUsed,
    model: llmResponse.modelUsed,
    conversationId: options.conversationId,
    citationWarnings: citationWarnings.warnings.length > 0 ? citationWarnings.warnings.map(w => w.citation) : undefined,
    abrogationWarnings: abrogationWarnings.length > 0 ? abrogationWarnings : undefined,
    language,
  }
}

// explain() et detectContradictions() — à implémenter en Sprint 4
// Voir explanation-tree-builder.ts et semantic-contradiction-detector.ts
