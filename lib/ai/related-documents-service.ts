/**
 * Service Documents Similaires - Recherche KNN avec cache Redis
 *
 * Ce service gère:
 * - Recherche de documents KB similaires via embeddings pgvector
 * - Cache Redis (TTL 24h) pour éviter les calculs répétés
 * - Invalidation du cache lors de modifications de documents
 */

import { db } from '@/lib/db/postgres'
import { getRedisClient, isRedisAvailable } from '@/lib/cache/redis'
import type { KnowledgeBaseCategory } from './knowledge-base-service'
import { getRelatedDocuments as getClusterRelatedDocs, isClusteringEnabled } from './clustering-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

const RELATED_CACHE_TTL = 86400 // 24 heures en secondes
const RELATED_CACHE_PREFIX = 'related:'

// =============================================================================
// TYPES
// =============================================================================

export interface RelatedDocument {
  id: string
  title: string
  description: string | null
  category: KnowledgeBaseCategory
  subcategory: string | null
  language: 'ar' | 'fr'
  similarity: number
  chunkCount: number
  tags: string[]
  createdAt: Date
}

export interface FindRelatedOptions {
  limit?: number
  threshold?: number
  skipCache?: boolean
}

// =============================================================================
// CACHE REDIS
// =============================================================================

/**
 * Génère la clé de cache pour un document
 */
function getCacheKey(documentId: string): string {
  return `${RELATED_CACHE_PREFIX}${documentId}`
}

/**
 * Récupère les documents similaires depuis le cache
 */
async function getCachedRelated(documentId: string): Promise<RelatedDocument[] | null> {
  if (!isRedisAvailable()) return null

  try {
    const client = await getRedisClient()
    if (!client) return null

    const cached = await client.get(getCacheKey(documentId))
    if (!cached) return null

    const parsed = JSON.parse(cached)
    // Reconvertir les dates
    return parsed.map((doc: RelatedDocument & { createdAt: string }) => ({
      ...doc,
      createdAt: new Date(doc.createdAt),
    }))
  } catch (error) {
    console.error('[RelatedDocs] Erreur lecture cache:', error)
    return null
  }
}

/**
 * Stocke les documents similaires dans le cache
 */
async function setCachedRelated(documentId: string, documents: RelatedDocument[]): Promise<void> {
  if (!isRedisAvailable()) return

  try {
    const client = await getRedisClient()
    if (!client) return

    await client.setEx(
      getCacheKey(documentId),
      RELATED_CACHE_TTL,
      JSON.stringify(documents)
    )
  } catch (error) {
    console.error('[RelatedDocs] Erreur écriture cache:', error)
  }
}

/**
 * Invalide le cache pour un document spécifique
 */
export async function invalidateRelatedCache(documentId: string): Promise<void> {
  if (!isRedisAvailable()) return

  try {
    const client = await getRedisClient()
    if (!client) return

    await client.del(getCacheKey(documentId))
    console.log(`[RelatedDocs] Cache invalidé pour ${documentId}`)
  } catch (error) {
    console.error('[RelatedDocs] Erreur invalidation cache:', error)
  }
}

/**
 * Invalide le cache pour tous les documents qui pourraient être affectés
 * par une modification (utilisé lors de update/delete d'un document)
 */
export async function invalidateAllRelatedCaches(): Promise<void> {
  if (!isRedisAvailable()) return

  try {
    const client = await getRedisClient()
    if (!client) return

    // Récupérer toutes les clés related:*
    const keys = await client.keys(`${RELATED_CACHE_PREFIX}*`)
    if (keys.length > 0) {
      await client.del(keys)
      console.log(`[RelatedDocs] ${keys.length} caches invalidés`)
    }
  } catch (error) {
    console.error('[RelatedDocs] Erreur invalidation tous caches:', error)
  }
}

// =============================================================================
// RECHERCHE DOCUMENTS SIMILAIRES
// =============================================================================

/**
 * Trouve les documents similaires à un document donné
 * Combine les résultats du clustering (si activé) avec la recherche sémantique HNSW
 */
export async function findRelatedDocuments(
  documentId: string,
  options: FindRelatedOptions = {}
): Promise<RelatedDocument[]> {
  const { limit = 5, threshold = 0.6, skipCache = false } = options

  // Vérifier le cache d'abord (sauf si skipCache)
  if (!skipCache) {
    const cached = await getCachedRelated(documentId)
    if (cached) {
      console.log(`[RelatedDocs] Cache HIT pour ${documentId} - ${cached.length} documents`)
      // Filtrer et limiter selon les options actuelles
      return cached
        .filter((doc) => doc.similarity >= threshold)
        .slice(0, limit)
    }
  }

  const startTime = Date.now()
  const documents: RelatedDocument[] = []
  const seenIds = new Set<string>()

  // 1. D'abord, essayer le clustering HDBSCAN si activé
  if (isClusteringEnabled()) {
    try {
      const clusterDocs = await getClusterRelatedDocs(documentId, limit)
      for (const doc of clusterDocs) {
        if (!seenIds.has(doc.id) && doc.similarity >= threshold) {
          seenIds.add(doc.id)
          // Récupérer les métadonnées complètes depuis la base
          const fullDoc = await db.query(
            `SELECT description, subcategory, language, tags, created_at,
                    (SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = $1) as chunk_count
             FROM knowledge_base WHERE id = $1`,
            [doc.id]
          )
          if (fullDoc.rows[0]) {
            documents.push({
              id: doc.id,
              title: doc.title,
              description: fullDoc.rows[0].description,
              category: doc.category as KnowledgeBaseCategory,
              subcategory: fullDoc.rows[0].subcategory,
              language: fullDoc.rows[0].language as 'ar' | 'fr',
              similarity: doc.similarity,
              chunkCount: parseInt(fullDoc.rows[0].chunk_count) || 0,
              tags: fullDoc.rows[0].tags || [],
              createdAt: new Date(fullDoc.rows[0].created_at),
            })
          }
        }
      }
      console.log(`[RelatedDocs] Cluster: ${documents.length} documents`)
    } catch (error) {
      console.warn('[RelatedDocs] Erreur clustering:', error)
      // Continuer avec la recherche sémantique
    }
  }

  // 2. Compléter avec la recherche sémantique HNSW si besoin
  if (documents.length < limit) {
    const remainingLimit = limit - documents.length
    const result = await db.query(
      `SELECT * FROM find_related_documents($1, $2, $3)`,
      [documentId, remainingLimit + 5, threshold] // +5 pour filtrer les doublons
    )

    for (const row of result.rows) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id)
        documents.push({
          id: row.id,
          title: row.title,
          description: row.description,
          category: row.category as KnowledgeBaseCategory,
          subcategory: row.subcategory,
          language: row.language as 'ar' | 'fr',
          similarity: parseFloat(row.similarity),
          chunkCount: row.chunk_count,
          tags: row.tags || [],
          createdAt: new Date(row.created_at),
        })
        if (documents.length >= limit) break
      }
    }
  }

  const queryTime = Date.now() - startTime
  console.log(`[RelatedDocs] Query ${documentId}: ${documents.length} résultats en ${queryTime}ms`)

  // Mettre en cache (avec plus de résultats pour flexibilité)
  if (documents.length > 0 && !skipCache) {
    // Récupérer plus de documents pour le cache
    const cacheResult = await db.query(
      `SELECT * FROM find_related_documents($1, $2, $3)`,
      [documentId, 10, 0.5] // Plus large pour le cache
    )
    const cacheDocuments: RelatedDocument[] = cacheResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category as KnowledgeBaseCategory,
      subcategory: row.subcategory,
      language: row.language as 'ar' | 'fr',
      similarity: parseFloat(row.similarity),
      chunkCount: row.chunk_count,
      tags: row.tags || [],
      createdAt: new Date(row.created_at),
    }))
    await setCachedRelated(documentId, cacheDocuments)
  }

  return documents
}

// =============================================================================
// HOOK D'INVALIDATION
// =============================================================================

/**
 * Hook à appeler après modification d'un document KB
 * Invalide les caches appropriés
 */
export async function onKnowledgeDocumentChange(
  documentId: string,
  changeType: 'update' | 'delete' | 'index'
): Promise<void> {
  // Invalider le cache du document modifié
  await invalidateRelatedCache(documentId)

  // Pour les suppressions/réindexations, invalider tous les caches
  // car d'autres documents pourraient avoir ce document dans leurs résultats
  if (changeType === 'delete' || changeType === 'index') {
    await invalidateAllRelatedCaches()
  }
}
