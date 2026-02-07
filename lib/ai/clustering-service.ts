/**
 * Service de Clustering Sémantique pour la Base de Connaissances
 *
 * Utilise UMAP pour la réduction de dimensionnalité et HDBSCAN pour le clustering.
 * Permet de grouper les documents KB par similarité sémantique
 * et de suggérer des "documents liés".
 */

import { UMAP } from 'umap-js'
import { Hdbscan } from 'hdbscan'
import { db } from '@/lib/db/postgres'
import { parseEmbeddingFromPostgres } from './embeddings-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

const KB_CLUSTERING_ENABLED = process.env.KB_CLUSTERING_ENABLED !== 'false'
const KB_MIN_CLUSTER_SIZE = parseInt(process.env.KB_MIN_CLUSTER_SIZE || '3', 10)
const UMAP_N_NEIGHBORS = parseInt(process.env.UMAP_N_NEIGHBORS || '15', 10)
const UMAP_MIN_DIST = parseFloat(process.env.UMAP_MIN_DIST || '0.1')
const UMAP_N_COMPONENTS = parseInt(process.env.UMAP_N_COMPONENTS || '50', 10)

// =============================================================================
// TYPES
// =============================================================================

export interface ClusterInfo {
  clusterId: number
  documentCount: number
  representativeTitle: string
  categories: string[]
}

export interface DocumentClusterResult {
  documentId: string
  clusterId: number
  title: string
  category: string
}

export interface RelatedDocument {
  id: string
  title: string
  category: string
  similarity: number
}

interface KBEmbeddingRow {
  id: string
  title: string
  category: string
  embedding: string
}

// =============================================================================
// UMAP RÉDUCTION DE DIMENSIONNALITÉ
// =============================================================================

/**
 * Réduit les dimensions des embeddings avec UMAP
 * De 1024/1536 dimensions vers N_COMPONENTS dimensions
 */
function reduceEmbeddingDimensions(
  embeddings: number[][],
  nComponents: number = UMAP_N_COMPONENTS
): number[][] {
  if (embeddings.length < UMAP_N_NEIGHBORS + 1) {
    console.log(`[Clustering] Pas assez de documents pour UMAP (${embeddings.length}/${UMAP_N_NEIGHBORS + 1})`)
    return embeddings // Retourner les embeddings originaux si pas assez de données
  }

  console.log(`[Clustering] UMAP: ${embeddings.length} documents, ${embeddings[0].length} dims → ${nComponents} dims`)

  const umap = new UMAP({
    nNeighbors: Math.min(UMAP_N_NEIGHBORS, embeddings.length - 1),
    minDist: UMAP_MIN_DIST,
    nComponents,
    random: Math.random, // Reproductibilité optionnelle
  })

  const reducedEmbeddings = umap.fit(embeddings)
  console.log(`[Clustering] UMAP terminé`)

  return reducedEmbeddings
}

// =============================================================================
// HDBSCAN CLUSTERING
// =============================================================================

/**
 * Cluster les embeddings réduits avec HDBSCAN
 */
function clusterEmbeddings(
  embeddings: number[][],
  minClusterSize: number = KB_MIN_CLUSTER_SIZE
): number[] {
  if (embeddings.length < minClusterSize) {
    console.log(`[Clustering] Pas assez de documents pour HDBSCAN (${embeddings.length}/${minClusterSize})`)
    return embeddings.map(() => -1) // Tous marqués comme bruit
  }

  console.log(`[Clustering] HDBSCAN: ${embeddings.length} documents, minClusterSize=${minClusterSize}`)

  const clusterer = new Hdbscan(embeddings, minClusterSize, 1)

  // getClusters retourne un tableau de clusters (chaque cluster = indices des points)
  const clusters = clusterer.getClusters()
  const noiseIndices = clusterer.getNoise()

  // Convertir en labels (-1 pour bruit, 0+ pour clusters)
  const labels: number[] = new Array(embeddings.length).fill(-1)

  for (let clusterIdx = 0; clusterIdx < clusters.length; clusterIdx++) {
    for (const pointIdx of clusters[clusterIdx]) {
      labels[pointIdx] = clusterIdx
    }
  }

  console.log(`[Clustering] HDBSCAN terminé: ${clusters.length} clusters, ${noiseIndices.length} bruit`)

  return labels
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Récupère tous les documents KB avec leurs embeddings
 */
async function getKBDocumentsWithEmbeddings(): Promise<{
  documents: Array<{ id: string; title: string; category: string }>
  embeddings: number[][]
}> {
  const result = await db.query<KBEmbeddingRow>(`
    SELECT kb.id, kb.title, kb.category, e.embedding::text as embedding
    FROM knowledge_base kb
    JOIN knowledge_base_embeddings e ON kb.id = e.knowledge_base_id
    WHERE kb.status = 'active'
      AND e.embedding IS NOT NULL
    ORDER BY kb.created_at DESC
  `)

  const documents: Array<{ id: string; title: string; category: string }> = []
  const embeddings: number[][] = []

  for (const row of result.rows) {
    try {
      const embedding = parseEmbeddingFromPostgres(row.embedding)
      if (embedding.length > 0) {
        documents.push({
          id: row.id,
          title: row.title,
          category: row.category,
        })
        embeddings.push(embedding)
      }
    } catch {
      console.warn(`[Clustering] Erreur parsing embedding pour ${row.id}`)
    }
  }

  return { documents, embeddings }
}

/**
 * Exécute le clustering complet sur la base de connaissances
 * Et met à jour la colonne cluster_id
 */
export async function runKBClustering(): Promise<{
  success: boolean
  documentCount: number
  clusterCount: number
  noiseCount: number
}> {
  if (!KB_CLUSTERING_ENABLED) {
    return { success: false, documentCount: 0, clusterCount: 0, noiseCount: 0 }
  }

  console.log('[Clustering] Démarrage du clustering KB...')
  const startTime = Date.now()

  // 1. Récupérer les documents et embeddings
  const { documents, embeddings } = await getKBDocumentsWithEmbeddings()

  if (documents.length === 0) {
    console.log('[Clustering] Aucun document à clusterer')
    return { success: true, documentCount: 0, clusterCount: 0, noiseCount: 0 }
  }

  // 2. Réduire les dimensions avec UMAP
  const reducedEmbeddings = reduceEmbeddingDimensions(embeddings)

  // 3. Clusterer avec HDBSCAN
  const labels = clusterEmbeddings(reducedEmbeddings)

  // 4. Mettre à jour la base de données
  const updatePromises = documents.map((doc, index) => {
    return db.query(
      `UPDATE knowledge_base SET cluster_id = $1 WHERE id = $2`,
      [labels[index], doc.id]
    )
  })

  await Promise.all(updatePromises)

  // 5. Calculer les statistiques
  const clusterSet = new Set(labels.filter((l) => l >= 0))
  const noiseCount = labels.filter((l) => l === -1).length

  console.log(`[Clustering] Terminé en ${Date.now() - startTime}ms`)

  return {
    success: true,
    documentCount: documents.length,
    clusterCount: clusterSet.size,
    noiseCount,
  }
}

/**
 * Récupère les documents liés à un document donné (même cluster ou proches)
 */
export async function getRelatedDocuments(
  documentId: string,
  limit: number = 5
): Promise<RelatedDocument[]> {
  // D'abord, essayer de trouver des documents dans le même cluster
  const result = await db.query<{
    id: string
    title: string
    category: string
    similarity: string
  }>(`
    WITH target AS (
      SELECT cluster_id, id
      FROM knowledge_base
      WHERE id = $1
    ),
    same_cluster AS (
      SELECT kb.id, kb.title, kb.category, 1.0 as similarity
      FROM knowledge_base kb, target t
      WHERE kb.cluster_id = t.cluster_id
        AND kb.cluster_id IS NOT NULL
        AND kb.cluster_id >= 0
        AND kb.id != t.id
        AND kb.status = 'active'
      LIMIT $2
    ),
    semantic_similar AS (
      SELECT DISTINCT ON (kb.id)
        kb.id, kb.title, kb.category,
        (1 - (e.embedding <=> te.embedding)) as similarity
      FROM knowledge_base kb
      JOIN knowledge_base_embeddings e ON kb.id = e.knowledge_base_id
      CROSS JOIN (
        SELECT embedding FROM knowledge_base_embeddings WHERE knowledge_base_id = $1 LIMIT 1
      ) te
      WHERE kb.id != $1
        AND kb.status = 'active'
        AND (1 - (e.embedding <=> te.embedding)) > 0.5
      ORDER BY kb.id, e.embedding <=> te.embedding
      LIMIT $2
    )
    SELECT * FROM same_cluster
    UNION ALL
    SELECT * FROM semantic_similar
    WHERE id NOT IN (SELECT id FROM same_cluster)
    ORDER BY similarity DESC
    LIMIT $2
  `, [documentId, limit])

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    similarity: parseFloat(row.similarity),
  }))
}

/**
 * Récupère les informations sur tous les clusters
 */
export async function getClusterInfo(): Promise<ClusterInfo[]> {
  const result = await db.query<{
    cluster_id: string
    doc_count: string
    representative_title: string
    categories: string[]
  }>(`
    SELECT
      cluster_id,
      COUNT(*) as doc_count,
      (SELECT title FROM knowledge_base WHERE cluster_id = kb.cluster_id ORDER BY created_at LIMIT 1) as representative_title,
      array_agg(DISTINCT category) as categories
    FROM knowledge_base kb
    WHERE cluster_id IS NOT NULL AND cluster_id >= 0 AND status = 'active'
    GROUP BY cluster_id
    ORDER BY doc_count DESC
  `)

  return result.rows.map((row) => ({
    clusterId: parseInt(row.cluster_id),
    documentCount: parseInt(row.doc_count),
    representativeTitle: row.representative_title,
    categories: row.categories,
  }))
}

/**
 * Vérifie si le clustering est activé
 */
export function isClusteringEnabled(): boolean {
  return KB_CLUSTERING_ENABLED
}
