/**
 * Service de Recherche Hybride BM25 + Dense (Phase 2.1)
 *
 * Combine recherche sparse (BM25) et dense (vectorielle) avec fusion RRF
 * pour améliorer précision et recall de la récupération RAG
 *
 * Pipeline :
 * 1. BM25 Sparse Retrieval → Top 20 (keywords matching)
 * 2. Dense Vector Retrieval → Top 50 (semantic similarity)
 * 3. Reciprocal Rank Fusion (RRF) → Top 30 fusionnés
 * 4. Cross-Encoder Reranking → Top 15-20 finaux
 *
 * @module lib/ai/hybrid-retrieval-service
 */

import { db } from '@/lib/db/postgres'
import { generateEmbedding, formatEmbeddingForPostgres } from './embeddings-service'
import { rerankDocuments, type DocumentToRerank } from './reranker-service'

// =============================================================================
// TYPES
// =============================================================================

export interface HybridSearchOptions {
  category?: string
  language?: string
  bm25Limit?: number
  denseLimit?: number
  rrfK?: number
  enableReranking?: boolean
  rerankLimit?: number
}

export interface HybridSearchResult {
  chunkId: string
  content: string
  category: string
  language: string
  bm25Score: number
  denseScore: number
  rrfScore: number
  hybridRank: number
  rerankScore?: number
  finalRank?: number
}

export interface SearchMetrics {
  bm25Count: number
  denseCount: number
  fusedCount: number
  finalCount: number
  durationMs: number
  method: 'hybrid' | 'dense_only' | 'bm25_only'
}

// =============================================================================
// Configuration par défaut
// =============================================================================

const DEFAULT_OPTIONS: Required<HybridSearchOptions> = {
  category: '',
  language: '',
  bm25Limit: 20,
  denseLimit: 50,
  rrfK: 60, // Paramètre RRF (plus petit = plus de poids sur top ranks)
  enableReranking: true,
  rerankLimit: 20,
}

// =============================================================================
// FONCTION PRINCIPALE : Recherche Hybride
// =============================================================================

/**
 * Recherche hybride BM25 + Dense avec fusion RRF
 *
 * @param query - Texte de recherche
 * @param options - Options de recherche
 * @returns Résultats triés par pertinence + métriques
 *
 * @example
 * ```ts
 * const results = await hybridSearch('contrat vente immobilier', {
 *   category: 'code',
 *   bm25Limit: 20,
 *   denseLimit: 50,
 *   rerankLimit: 15
 * })
 * console.log(`Trouvé ${results.results.length} chunks pertinents`)
 * ```
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<{
  results: HybridSearchResult[]
  metrics: SearchMetrics
}> {
  const startTime = Date.now()
  const opts = { ...DEFAULT_OPTIONS, ...options }

  try {
    // 1. Générer embedding pour recherche dense
    const queryEmbedding = await generateEmbedding(query)
    const embeddingStr = formatEmbeddingForPostgres(queryEmbedding)

    // 2. Exécuter recherche hybride (BM25 + Dense + RRF) via SQL
    const sqlQuery = `
      SELECT * FROM hybrid_search(
        $1::TEXT,
        $2::VECTOR(1024),
        $3::TEXT,
        $4::TEXT,
        $5::INTEGER,
        $6::INTEGER,
        $7::INTEGER
      )
    `

    const params = [
      query,
      embeddingStr,
      opts.category || null,
      opts.language || null,
      opts.bm25Limit,
      opts.denseLimit,
      opts.rrfK,
    ]

    const result = await db.query(sqlQuery, params)

    let hybridResults: HybridSearchResult[] = result.rows.map(row => ({
      chunkId: row.chunk_id,
      content: row.content,
      category: row.category,
      language: row.language,
      bm25Score: parseFloat(row.bm25_score || '0'),
      denseScore: parseFloat(row.dense_score || '0'),
      rrfScore: parseFloat(row.rrf_score || '0'),
      hybridRank: parseInt(row.hybrid_rank || '0', 10),
    }))

    const fusedCount = hybridResults.length

    // 3. Cross-Encoder Reranking (optionnel)
    if (opts.enableReranking && hybridResults.length > 0) {
      // Limiter au top N pour reranking (économie compute)
      const candidatesForRerank = hybridResults.slice(0, Math.min(30, hybridResults.length))

      const documentsToRerank: DocumentToRerank[] = candidatesForRerank.map(r => ({
        id: r.chunkId,
        content: r.content,
      }))

      const reranked = await rerankDocuments(query, documentsToRerank)

      // Fusionner scores reranking avec résultats hybrides
      const rerankMap = new Map(reranked.map(r => [r.id, r.score]))

      hybridResults = hybridResults.map(r => ({
        ...r,
        rerankScore: rerankMap.get(r.chunkId),
        finalRank: r.hybridRank, // Sera mis à jour après tri
      }))

      // Trier par rerank score (si disponible) sinon par RRF score
      hybridResults.sort((a, b) => {
        const scoreA = a.rerankScore ?? a.rrfScore
        const scoreB = b.rerankScore ?? b.rrfScore
        return scoreB - scoreA
      })

      // Mettre à jour finalRank après tri
      hybridResults.forEach((r, idx) => {
        r.finalRank = idx + 1
      })

      // Limiter au nombre final demandé
      hybridResults = hybridResults.slice(0, opts.rerankLimit)
    }

    const durationMs = Date.now() - startTime

    const metrics: SearchMetrics = {
      bm25Count: opts.bm25Limit,
      denseCount: opts.denseLimit,
      fusedCount,
      finalCount: hybridResults.length,
      durationMs,
      method: 'hybrid',
    }

    console.log(
      `[Hybrid Search] Query: "${query.substring(0, 50)}..." | BM25: ${opts.bm25Limit} + Dense: ${opts.denseLimit} → Fused: ${fusedCount} → Final: ${hybridResults.length} (${durationMs}ms)`
    )

    return {
      results: hybridResults,
      metrics,
    }
  } catch (error) {
    console.error('[Hybrid Search] Erreur:', error)

    // Fallback : Dense only
    console.warn('[Hybrid Search] Fallback → Dense only')
    return fallbackDenseSearch(query, opts, startTime)
  }
}

// =============================================================================
// FALLBACK : Dense Search Only
// =============================================================================

async function fallbackDenseSearch(
  query: string,
  opts: Required<HybridSearchOptions>,
  startTime: number
): Promise<{
  results: HybridSearchResult[]
  metrics: SearchMetrics
}> {
  try {
    const queryEmbedding = await generateEmbedding(query)
    const embeddingStr = formatEmbeddingForPostgres(queryEmbedding)

    const sqlQuery = `
      SELECT
        id as chunk_id,
        content,
        category,
        language,
        1 - (embedding <=> $1::VECTOR(1024)) as similarity_score
      FROM kb_chunks
      WHERE embedding IS NOT NULL
        ${opts.category ? 'AND category = $2' : ''}
        ${opts.language ? `AND language = $${opts.category ? 3 : 2}` : ''}
      ORDER BY embedding <=> $1::VECTOR(1024) ASC
      LIMIT $${opts.category && opts.language ? 4 : opts.category || opts.language ? 3 : 2}
    `

    const params: any[] = [embeddingStr]
    if (opts.category) params.push(opts.category)
    if (opts.language) params.push(opts.language)
    params.push(opts.rerankLimit)

    const result = await db.query(sqlQuery, params)

    const results: HybridSearchResult[] = result.rows.map((row, idx) => ({
      chunkId: row.chunk_id,
      content: row.content,
      category: row.category,
      language: row.language,
      bm25Score: 0,
      denseScore: parseFloat(row.similarity_score || '0'),
      rrfScore: parseFloat(row.similarity_score || '0'),
      hybridRank: idx + 1,
      finalRank: idx + 1,
    }))

    const durationMs = Date.now() - startTime

    return {
      results,
      metrics: {
        bm25Count: 0,
        denseCount: opts.denseLimit,
        fusedCount: results.length,
        finalCount: results.length,
        durationMs,
        method: 'dense_only',
      },
    }
  } catch (error) {
    console.error('[Hybrid Search] Fallback Dense failed:', error)
    return {
      results: [],
      metrics: {
        bm25Count: 0,
        denseCount: 0,
        fusedCount: 0,
        finalCount: 0,
        durationMs: Date.now() - startTime,
        method: 'dense_only',
      },
    }
  }
}

// =============================================================================
// FONCTION UTILITAIRE : BM25 Only (pour tests)
// =============================================================================

export async function bm25SearchOnly(
  query: string,
  options: {
    category?: string
    language?: string
    limit?: number
  } = {}
): Promise<HybridSearchResult[]> {
  const { category, language, limit = 20 } = options

  const sqlQuery = `
    SELECT * FROM bm25_search($1::TEXT, $2::TEXT, $3::TEXT, $4::INTEGER)
  `

  const params = [query, category || null, language || null, limit]

  const result = await db.query(sqlQuery, params)

  return result.rows.map((row, idx) => ({
    chunkId: row.chunk_id,
    content: row.content,
    category: row.category,
    language: row.language,
    bm25Score: parseFloat(row.bm25_score || '0'),
    denseScore: 0,
    rrfScore: parseFloat(row.bm25_score || '0'),
    hybridRank: idx + 1,
    finalRank: idx + 1,
  }))
}

// =============================================================================
// EXPORTS
// =============================================================================

export { hybridSearch as default, bm25SearchOnly }
