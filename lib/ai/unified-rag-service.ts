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
import { aiConfig, RAG_THRESHOLDS } from './config'
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

/**
 * Options d'explication
 */
export interface RAGExplainOptions {
  /** Niveau de détail (simple, detailed, expert) */
  detailLevel?: 'simple' | 'detailed' | 'expert'

  /** Langue de sortie */
  language?: SupportedLanguage

  /** Mode Premium */
  usePremiumModel?: boolean
}

/**
 * Explication RAG
 */
export interface RAGExplanation {
  reasoning: string
  steps: Array<{
    step: number
    title: string
    content: string
    sources: RAGSearchResult[]
  }>
  confidence: number
  tokensUsed: number
}

// =============================================================================
// HELPERS PRIVÉS
// =============================================================================

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
      metadata: metadataMap.get(source.documentId) || {
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
        citesCount: 0,
        citedByCount: 0,
      },
    }))
  } catch (error) {
    console.error('[UnifiedRAG] Erreur enrichissement métadonnées batch:', error)
    // Retourner sources sans enrichissement en cas d'erreur
    return sources.map((source) => ({
      documentId: source.documentId,
      metadata: {
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
        citesCount: 0,
        citedByCount: 0,
      },
    }))
  }
}

/**
 * Récupère les relations juridiques d'un document
 */
async function getDocumentRelations(
  kbId: string,
  includeRelations: boolean
): Promise<RAGSearchResult['relations'] | undefined> {
  if (!includeRelations) return undefined

  try {
    const result = await db.query(
      `
      SELECT
        relation_type,
        CASE
          WHEN source_kb_id = $1 THEN 'outgoing'
          ELSE 'incoming'
        END AS direction,
        CASE
          WHEN source_kb_id = $1 THEN target_kb_id
          ELSE source_kb_id
        END AS related_kb_id,
        CASE
          WHEN source_kb_id = $1 THEN (SELECT title FROM knowledge_base WHERE id = target_kb_id)
          ELSE (SELECT title FROM knowledge_base WHERE id = source_kb_id)
        END AS related_title,
        CASE
          WHEN source_kb_id = $1 THEN (SELECT category FROM knowledge_base WHERE id = target_kb_id)
          ELSE (SELECT category FROM knowledge_base WHERE id = source_kb_id)
        END AS related_category,
        context,
        confidence
      FROM kb_legal_relations
      WHERE (source_kb_id = $1 OR target_kb_id = $1) AND validated = true
      ORDER BY confidence DESC NULLS LAST
      LIMIT 50
      `,
      [kbId]
    )

    const relations: {
      cites: LegalRelation[]
      citedBy: LegalRelation[]
      supersedes: LegalRelation[]
      supersededBy: LegalRelation[]
      relatedCases: LegalRelation[]
    } = {
      cites: [],
      citedBy: [],
      supersedes: [],
      supersededBy: [],
      relatedCases: [],
    }

    result.rows.forEach((row) => {
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

    return relations
  } catch (error) {
    console.error('[UnifiedRAG] Erreur récupération relations:', error)
    return undefined
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
  const limit = options.limit || 10
  const threshold = options.threshold || RAG_THRESHOLDS.minimum
  const includeRelations = options.includeRelations || false

  // 2. Générer embedding de la requête
  const embeddingResult = await generateEmbedding(query)
  const embeddingStr = formatEmbeddingForPostgres(embeddingResult.embedding)

  // 1. Vérifier le cache Redis (si userId disponible)
  if (process.env.ENABLE_SEARCH_CACHE !== 'false' && options.userId) {
    const scope: SearchScope = {
      userId: options.userId,
      dossierId: filters.dossierId,
    }
    const cached = await getCachedSearchResults(embeddingResult.embedding, scope)
    if (cached) {
      console.log('[UnifiedRAG] ✓ Cache hit pour recherche:', query.substring(0, 50))
      return cached as RAGSearchResult[]
    }
  }

  // 3. Construire requête SQL avec filtres
  const queryParams: unknown[] = [embeddingStr, threshold, limit]
  let paramIndex = 4

  const whereClauses: string[] = [`1 - (embedding <=> $1::vector) >= $2`]

  if (filters.category) {
    whereClauses.push(`kb.category = $${paramIndex}`)
    queryParams.push(filters.category)
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

  const sqlQuery = `
    SELECT
      kb.id AS kb_id,
      kb.title,
      kb.category,
      1 - (c.embedding <=> $1::vector) AS similarity,
      c.content AS chunk_content,
      c.chunk_index
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON c.knowledge_base_id = kb.id
    LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY similarity DESC
    LIMIT $3
  `

  const result = await db.query(sqlQuery, queryParams)

  // 4. Enrichir avec métadonnées (batch, 1 query)
  const enriched = await batchEnrichSourcesWithMetadata(
    result.rows.map((row) => ({
      documentId: row.kb_id,
    }))
  )

  // 5. Construire résultats finaux
  const results: RAGSearchResult[] = await Promise.all(
    result.rows.map(async (row, index) => {
      const relations = await getDocumentRelations(row.kb_id, includeRelations)

      return {
        kbId: row.kb_id,
        title: row.title,
        category: row.category,
        similarity: parseFloat(row.similarity),
        chunkContent: row.chunk_content,
        chunkIndex: row.chunk_index,
        metadata: enriched[index]?.metadata || {
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
        },
        relations,
      }
    })
  )

  // 6. Mettre en cache (async, pas bloquant)
  if (process.env.ENABLE_SEARCH_CACHE !== 'false' && options.userId) {
    const scope: SearchScope = {
      userId: options.userId,
      dossierId: filters.dossierId,
    }
    setCachedSearchResults(embeddingResult.embedding, results, scope).catch((err) =>
      console.error('[UnifiedRAG] Erreur mise en cache:', err)
    )
  }

  // 7. Enregistrer métriques (fonction sync, pas de catch)
  recordRAGMetric({
    searchTimeMs: 0,
    llmTimeMs: 0,
    totalTimeMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    resultsCount: results.length,
    cacheHit: false,
    degradedMode: false,
    provider: 'embeddings',
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

/**
 * Génère une explication détaillée du raisonnement juridique
 *
 * Utilise multi-chain reasoning pour décomposer la réponse en étapes
 *
 * @param question Question juridique
 * @param options Options d'explication
 * @returns Explication structurée avec étapes de raisonnement
 */
export async function explain(
  question: string,
  options: RAGExplainOptions = {}
): Promise<RAGExplanation> {
  // TODO: Implémenter multi-chain reasoning
  // Nécessite explanation-tree-builder.ts (811 lignes à wrapper)
  throw new Error('explain() non implémenté dans Sprint 3 - Prévu Sprint 4')
}

/**
 * Détecte les contradictions juridiques dans les sources
 *
 * @param sources Résultats de recherche
 * @param options Options de détection
 * @returns Contradictions détectées avec contexte
 */
export async function detectContradictions(
  sources: RAGSearchResult[],
  options: { threshold?: number; language?: SupportedLanguage } = {}
): Promise<Array<{ source1: RAGSearchResult; source2: RAGSearchResult; conflictReason: string; severity: 'low' | 'medium' | 'high' }>> {
  // TODO: Implémenter détection contradictions
  // Nécessite semantic-contradiction-detector.ts (543 lignes à wrapper)
  throw new Error('detectContradictions() non implémenté dans Sprint 3 - Prévu Sprint 4')
}
