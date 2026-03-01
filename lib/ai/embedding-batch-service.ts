/**
 * Service partagé pour la réindexation des embeddings KB.
 * Élimine la duplication de code entre reindex-kb-openai/ollama/gemini.
 */

import { db } from '@/lib/db/postgres'
import { formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'

// =============================================================================
// Stats multi-providers (partagées entre les 3 routes GET)
// =============================================================================

export interface EmbeddingStats {
  total: number
  ollama: { indexed: number; pct: number }
  openai: { indexed: number; pct: number }
  gemini: { indexed: number; pct: number }
  tsvector: { indexed: number; pct: number }
}

/**
 * Retourne les stats de couverture des 4 providers d'embeddings.
 * Utilisé par les 3 routes GET /api/admin/reindex-kb-*
 */
export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  const result = await db.query(`
    SELECT
      COUNT(*) as total,
      COUNT(embedding)        FILTER (WHERE embedding IS NOT NULL)        as ollama_indexed,
      COUNT(embedding_openai) FILTER (WHERE embedding_openai IS NOT NULL) as openai_indexed,
      COUNT(embedding_gemini) FILTER (WHERE embedding_gemini IS NOT NULL) as gemini_indexed,
      COUNT(content_tsvector) FILTER (WHERE content_tsvector IS NOT NULL) as tsvector_indexed
    FROM knowledge_base_chunks
  `)

  const s = result.rows[0]
  const total = parseInt(s.total, 10) || 1 // évite division par zéro

  const pct = (n: number) => Math.round((n / total) * 100)

  return {
    total,
    ollama:  { indexed: parseInt(s.ollama_indexed, 10),  pct: pct(parseInt(s.ollama_indexed, 10)) },
    openai:  { indexed: parseInt(s.openai_indexed, 10),  pct: pct(parseInt(s.openai_indexed, 10)) },
    gemini:  { indexed: parseInt(s.gemini_indexed, 10),  pct: pct(parseInt(s.gemini_indexed, 10)) },
    tsvector:{ indexed: parseInt(s.tsvector_indexed, 10),pct: pct(parseInt(s.tsvector_indexed, 10)) },
  }
}

// =============================================================================
// Batch processing concurrent (partagé entre Ollama et Gemini POST)
// =============================================================================

export interface ChunkRow {
  id: string
  content: string
  chunk_index: number
  category?: string
  title?: string
}

export interface BatchResult {
  processed: number
  indexed: number
  errors: number
  errorDetails: Array<{ id: string; error: string }>
}

/**
 * Traite une liste de chunks en parallèle par lots de `concurrency`.
 *
 * @param chunks     - Chunks à traiter
 * @param processor  - Fonction qui génère l'embedding et l'écrit en DB
 * @param concurrency - Nombre de requêtes parallèles
 * @param logPrefix  - Préfixe pour les logs (ex: '[ReindexOllama]')
 */
export async function processConcurrentBatch(
  chunks: ChunkRow[],
  processor: (chunk: ChunkRow) => Promise<void>,
  concurrency: number,
  logPrefix: string
): Promise<BatchResult> {
  let indexed = 0
  let errors = 0
  const errorDetails: Array<{ id: string; error: string }> = []

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency)

    const results = await Promise.allSettled(batch.map(processor))

    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled') {
        indexed++
      } else {
        errors++
        const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        errorDetails.push({ id: batch[j].id, error: errMsg })
        console.error(`${logPrefix} Erreur chunk ${batch[j].id}:`, errMsg)
      }
    }

    const processed = Math.min(i + concurrency, chunks.length)
    if (processed % 20 === 0 || processed >= chunks.length) {
      console.log(`${logPrefix} Progression: ${processed}/${chunks.length}`)
    }
  }

  return { processed: chunks.length, indexed, errors, errorDetails: errorDetails.slice(0, 5) }
}

// =============================================================================
// Requête chunks partagée
// =============================================================================

export interface FetchChunksOptions {
  nullColumn: string   // colonne embedding à vérifier (ex: 'embedding', 'embedding_gemini')
  batchSize: number
  category?: string | null
  requireActive?: boolean  // AND kb.is_active = true (défaut: true)
}

/**
 * Récupère les chunks qui n'ont pas encore d'embedding pour un provider donné.
 */
export async function fetchChunksToIndex(options: FetchChunksOptions): Promise<ChunkRow[]> {
  const { nullColumn, batchSize, category, requireActive = true } = options

  let query = `
    SELECT
      kbc.id,
      kbc.content,
      kbc.chunk_index,
      kb.category,
      kb.title
    FROM knowledge_base_chunks kbc
    INNER JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kbc.${nullColumn} IS NULL
  `
  const params: (string | number)[] = []
  let paramIndex = 1

  if (requireActive) {
    query += ` AND kb.is_active = true`
  }

  if (category) {
    query += ` AND kb.category = $${paramIndex++}`
    params.push(category)
  }

  query += ` ORDER BY kbc.id ASC LIMIT $${paramIndex}`
  params.push(batchSize)

  const result = await db.query(query, params)
  return result.rows as ChunkRow[]
}

// =============================================================================
// Helpers pour update embedding
// =============================================================================

/**
 * Met à jour la colonne embedding d'un chunk.
 * @param chunkId    - ID du chunk
 * @param column     - Colonne à mettre à jour (ex: 'embedding', 'embedding_openai')
 * @param embedding  - Tableau de nombres (vecteur)
 * @param dims       - Dimensions attendues (768 ou 1536)
 */
export async function updateChunkEmbedding(
  chunkId: string,
  column: string,
  embedding: number[],
  dims: 768 | 1536
): Promise<void> {
  const embStr = formatEmbeddingForPostgres(embedding)
  await db.query(
    `UPDATE knowledge_base_chunks SET ${column} = $1::vector(${dims}) WHERE id = $2`,
    [embStr, chunkId]
  )
}
