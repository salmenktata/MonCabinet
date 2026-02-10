/**
 * Service d'indexation des pages web dans le RAG
 * Convertit les pages web en documents de la base de connaissances
 */

import { db } from '@/lib/db/postgres'
import type { WebPage, WebSource } from './types'
import { isSemanticSearchEnabled, aiConfig, KB_ARABIC_ONLY } from '@/lib/ai/config'
import { normalizeText, detectTextLanguage } from './content-extractor'

// Import dynamique pour éviter les dépendances circulaires
async function getChunkingService() {
  const { chunkText, getOverlapForCategory } = await import('@/lib/ai/chunking-service')
  return { chunkText, getOverlapForCategory }
}

async function getEmbeddingsService() {
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await import('@/lib/ai/embeddings-service')
  return { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres }
}

// =============================================================================
// TYPES
// =============================================================================

export interface IndexingResult {
  success: boolean
  knowledgeBaseId?: string
  chunksCreated: number
  error?: string
}

// =============================================================================
// INDEXATION
// =============================================================================

/**
 * Indexe une page web dans la base de connaissances
 */
export async function indexWebPage(pageId: string): Promise<IndexingResult> {
  if (!isSemanticSearchEnabled()) {
    return { success: false, chunksCreated: 0, error: 'Service RAG désactivé' }
  }

  // Récupérer la page
  const pageResult = await db.query(
    `SELECT wp.*, ws.category, ws.name as source_name
     FROM web_pages wp
     JOIN web_sources ws ON wp.web_source_id = ws.id
     WHERE wp.id = $1`,
    [pageId]
  )

  if (pageResult.rows.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Page non trouvée' }
  }

  const row = pageResult.rows[0]

  if (!row.extracted_text || row.extracted_text.length < 100) {
    return { success: false, chunksCreated: 0, error: 'Contenu insuffisant pour indexation' }
  }

  // Normaliser le texte
  const normalizedText = normalizeText(row.extracted_text)
  const detectedLang = row.language_detected || detectTextLanguage(normalizedText) || 'fr'

  // Stratégie arabe uniquement : ignorer le contenu non-arabe
  if (KB_ARABIC_ONLY && detectedLang !== 'ar') {
    console.log(`[WebIndexer] Contenu non-arabe ignoré: page ${pageId} (${detectedLang})`)
    return { success: false, chunksCreated: 0, error: `Contenu non-arabe ignoré (${detectedLang})` }
  }

  // Seules les langues 'ar' et 'fr' sont supportées dans knowledge_base
  const language: 'ar' | 'fr' = KB_ARABIC_ONLY ? 'ar' : ((detectedLang === 'ar' || detectedLang === 'fr') ? detectedLang : 'fr')

  // Import des services
  const { chunkText, getOverlapForCategory } = await getChunkingService()
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await getEmbeddingsService()

  // Déterminer l'overlap selon la catégorie
  const overlap = getOverlapForCategory(row.category)

  // Découper en chunks
  const chunks = chunkText(normalizedText, {
    chunkSize: aiConfig.rag.chunkSize,
    overlap,
    preserveParagraphs: true,
    preserveSentences: true,
    category: row.category,
  })

  if (chunks.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Aucun chunk généré' }
  }

  // Vérifier si un document KB existe déjà pour cette page
  let knowledgeBaseId = row.knowledge_base_id
  const wasUpdate = !!knowledgeBaseId

  const client = await db.getClient()

  try {
    await client.query('BEGIN')

    // Créer ou mettre à jour le document KB
    if (!knowledgeBaseId) {
      // Créer un nouveau document KB
      const kbResult = await client.query(
        `INSERT INTO knowledge_base (
          category, subcategory, language, title, description,
          metadata, tags, full_text, source_file, is_indexed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
        RETURNING id`,
        [
          row.category,
          null, // subcategory
          language,
          row.title || row.url,
          row.meta_description,
          JSON.stringify({
            source: 'web_scraper',
            sourceId: row.web_source_id,
            sourceName: row.source_name,
            pageId: pageId,
            url: row.url,
            author: row.meta_author,
            publishedAt: row.meta_date,
            crawledAt: row.last_crawled_at,
          }),
          row.meta_keywords || [],
          normalizedText,
          row.url,
        ]
      )
      knowledgeBaseId = kbResult.rows[0].id
    } else {
      // Créer une version avant la mise à jour (historique)
      try {
        await client.query(
          `INSERT INTO knowledge_base_versions
           (knowledge_base_id, version, title, description, full_text, source_file,
            metadata, category, subcategory, tags, language, changed_by, change_reason, change_type)
           SELECT id, version, title, description, full_text, source_file,
            metadata, category, subcategory, tags, language, NULL,
            'Mise à jour automatique - contenu source modifié', 'content_update'
           FROM knowledge_base WHERE id = $1`,
          [knowledgeBaseId]
        )
      } catch (versionError) {
        // Ne pas bloquer l'indexation si le versioning échoue
        console.warn(`[WebIndexer] Erreur versioning KB ${knowledgeBaseId}:`, versionError)
      }

      // Mettre à jour le document existant + incrémenter version
      await client.query(
        `UPDATE knowledge_base SET
          title = $2,
          description = $3,
          language = $4,
          full_text = $5,
          metadata = metadata || $6::jsonb,
          is_indexed = false,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1`,
        [
          knowledgeBaseId,
          row.title || row.url,
          row.meta_description,
          language,
          normalizedText,
          JSON.stringify({
            lastCrawledAt: row.last_crawled_at,
            updatedAt: new Date().toISOString(),
          }),
        ]
      )

      // Supprimer les anciens chunks
      await client.query(
        'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
        [knowledgeBaseId]
      )
    }

    // Générer les embeddings en batch
    const embeddingsResult = await generateEmbeddingsBatch(
      chunks.map(c => c.content)
    )

    // Générer l'embedding du document (titre + description)
    const docSummary = `${row.title || ''}. ${row.meta_description || ''}`.trim()
    const docEmbeddingResult = await generateEmbedding(docSummary || normalizedText.substring(0, 500))

    // Insérer les chunks
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO knowledge_base_chunks
         (knowledge_base_id, chunk_index, content, embedding, metadata)
         VALUES ($1, $2, $3, $4::vector, $5)`,
        [
          knowledgeBaseId,
          chunks[i].index,
          chunks[i].content,
          formatEmbeddingForPostgres(embeddingsResult.embeddings[i]),
          JSON.stringify({
            wordCount: chunks[i].metadata.wordCount,
            charCount: chunks[i].metadata.charCount,
            sourceUrl: row.url,
          }),
        ]
      )
    }

    // Mettre à jour le document KB avec son embedding
    await client.query(
      `UPDATE knowledge_base SET
        embedding = $2::vector,
        is_indexed = true,
        updated_at = NOW()
      WHERE id = $1`,
      [knowledgeBaseId, formatEmbeddingForPostgres(docEmbeddingResult.embedding)]
    )

    // Mettre à jour la page web
    await client.query(
      `UPDATE web_pages SET
        knowledge_base_id = $2,
        is_indexed = true,
        chunks_count = $3,
        last_indexed_at = NOW(),
        status = 'indexed',
        updated_at = NOW()
      WHERE id = $1`,
      [pageId, knowledgeBaseId, chunks.length]
    )

    await client.query('COMMIT')

    console.log(`[WebIndexer] Page ${pageId} indexée: ${chunks.length} chunks${wasUpdate ? ' (mise à jour)' : ''}`)

    // Notification admin si c'était une mise à jour
    if (wasUpdate) {
      try {
        await db.query(
          `INSERT INTO admin_notifications
           (notification_type, priority, title, message, target_type, target_id, metadata)
           VALUES ('kb_update', 'normal', $1, $2, 'knowledge_base', $3, $4)`,
          [
            `Document KB mis à jour : ${row.title || row.url}`,
            `Contenu modifié détecté sur ${row.url}. Re-indexation automatique (${chunks.length} chunks).`,
            knowledgeBaseId,
            JSON.stringify({ pageId, sourceUrl: row.url, chunksCreated: chunks.length }),
          ]
        )
      } catch (notifError) {
        console.warn(`[WebIndexer] Erreur notification:`, notifError)
      }
    }

    return {
      success: true,
      knowledgeBaseId,
      chunksCreated: chunks.length,
    }

  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`[WebIndexer] Erreur indexation page ${pageId}:`, error)

    return {
      success: false,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : 'Erreur indexation',
    }
  } finally {
    client.release()
  }
}

/**
 * Indexe toutes les pages non indexées d'une source
 */
export async function indexSourcePages(
  sourceId: string,
  options: { limit?: number; reindex?: boolean } = {}
): Promise<{
  processed: number
  succeeded: number
  failed: number
  results: Array<{ pageId: string; success: boolean; error?: string }>
}> {
  const { limit = 50, reindex = false } = options

  // Récupérer les pages à indexer
  // FIX: Inclure aussi les pages 'unchanged' qui n'ont jamais été indexées
  // FIX: Accepter aussi les pages avec fichiers liés (Google Drive) même si extracted_text est vide
  let sql = `
    SELECT id FROM web_pages
    WHERE web_source_id = $1
    AND status IN ('crawled', 'unchanged')
    AND (
      (extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 100)
      OR
      (linked_files IS NOT NULL AND jsonb_array_length(linked_files) > 0)
    )
  `

  if (KB_ARABIC_ONLY) {
    sql += ` AND (language_detected = 'ar' OR language_detected IS NULL)`
  }

  if (!reindex) {
    sql += ' AND is_indexed = false'
  }

  sql += ` ORDER BY last_crawled_at DESC LIMIT $2`

  const pagesResult = await db.query(sql, [sourceId, limit])
  const results: Array<{ pageId: string; success: boolean; error?: string }> = []

  for (const row of pagesResult.rows) {
    const result = await indexWebPage(row.id)
    results.push({
      pageId: row.id,
      success: result.success,
      error: result.error,
    })
  }

  return {
    processed: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

/**
 * Indexe les pages web en attente (toutes sources confondues)
 * Utilisé par le cron d'indexation progressive
 */
export async function indexWebPages(
  limit: number = 10
): Promise<{
  processed: number
  succeeded: number
  failed: number
  results: Array<{ pageId: string; success: boolean; error?: string }>
}> {
  // Récupérer les pages à indexer (toutes sources)
  // FIX: Inclure aussi les pages 'unchanged' qui n'ont jamais été indexées
  // FIX: Accepter aussi les pages avec fichiers liés (Google Drive) même si extracted_text est vide
  const sql = `
    SELECT id FROM web_pages
    WHERE status IN ('crawled', 'unchanged')
    AND is_indexed = false
    AND (
      (extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 100)
      OR
      (linked_files IS NOT NULL AND jsonb_array_length(linked_files) > 0)
    )
    ${KB_ARABIC_ONLY ? `AND (language_detected = 'ar' OR language_detected IS NULL)` : ''}
    ORDER BY last_crawled_at DESC
    LIMIT $1
  `

  const pagesResult = await db.query(sql, [limit])
  const results: Array<{ pageId: string; success: boolean; error?: string }> = []

  for (const row of pagesResult.rows) {
    const result = await indexWebPage(row.id)
    results.push({
      pageId: row.id,
      success: result.success,
      error: result.error,
    })
  }

  return {
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}

/**
 * Ajoute les pages d'une source à la queue d'indexation
 */
export async function queueSourcePagesForIndexing(
  sourceId: string,
  options: { limit?: number; priority?: number } = {}
): Promise<number> {
  const { limit = 100, priority = 5 } = options

  // Récupérer les pages à indexer
  // FIX: Inclure aussi les pages 'unchanged' qui n'ont jamais été indexées
  // FIX: Accepter aussi les pages avec fichiers liés (Google Drive) même si extracted_text est vide
  const pagesResult = await db.query(
    `SELECT id FROM web_pages
     WHERE web_source_id = $1
     AND status IN ('crawled', 'unchanged')
     AND is_indexed = false
     AND (
       (extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 100)
       OR
       (linked_files IS NOT NULL AND jsonb_array_length(linked_files) > 0)
     )
     ORDER BY last_crawled_at DESC
     LIMIT $2`,
    [sourceId, limit]
  )

  if (pagesResult.rows.length === 0) {
    return 0
  }

  // Import du service de queue
  const { addToQueue } = await import('@/lib/ai/indexing-queue-service')

  let queued = 0
  for (const row of pagesResult.rows) {
    try {
      await addToQueue('web_page_index', row.id, priority, {
        sourceId,
        type: 'web_page',
      })
      queued++
    } catch (error) {
      console.error(`[WebIndexer] Erreur ajout queue page ${row.id}:`, error)
    }
  }

  return queued
}

/**
 * Récupère les statistiques d'indexation d'une source
 */
export async function getSourceIndexingStats(sourceId: string): Promise<{
  totalPages: number
  indexedPages: number
  pendingPages: number
  failedPages: number
  totalChunks: number
}> {
  // FIX: Inclure aussi les pages 'unchanged' dans les pending_pages
  const result = await db.query(
    `SELECT
      COUNT(*) as total_pages,
      COUNT(*) FILTER (WHERE is_indexed = true) as indexed_pages,
      COUNT(*) FILTER (WHERE status IN ('crawled', 'unchanged') AND is_indexed = false) as pending_pages,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_pages,
      COALESCE(SUM(chunks_count), 0) as total_chunks
     FROM web_pages
     WHERE web_source_id = $1`,
    [sourceId]
  )

  const row = result.rows[0]
  return {
    totalPages: parseInt(row.total_pages) || 0,
    indexedPages: parseInt(row.indexed_pages) || 0,
    pendingPages: parseInt(row.pending_pages) || 0,
    failedPages: parseInt(row.failed_pages) || 0,
    totalChunks: parseInt(row.total_chunks) || 0,
  }
}

/**
 * Supprime l'indexation d'une page
 */
export async function unindexWebPage(pageId: string): Promise<boolean> {
  try {
    // Récupérer le knowledge_base_id
    const pageResult = await db.query(
      'SELECT knowledge_base_id FROM web_pages WHERE id = $1',
      [pageId]
    )

    if (pageResult.rows.length === 0) return false

    const kbId = pageResult.rows[0].knowledge_base_id

    const client = await db.getClient()

    try {
      await client.query('BEGIN')

      // Supprimer les chunks si KB existe
      if (kbId) {
        await client.query(
          'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
          [kbId]
        )

        // Supprimer le document KB
        await client.query(
          'DELETE FROM knowledge_base WHERE id = $1',
          [kbId]
        )
      }

      // Mettre à jour la page
      await client.query(
        `UPDATE web_pages SET
          knowledge_base_id = NULL,
          is_indexed = false,
          chunks_count = 0,
          last_indexed_at = NULL,
          updated_at = NOW()
        WHERE id = $1`,
        [pageId]
      )

      await client.query('COMMIT')
      return true

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

  } catch (error) {
    console.error(`[WebIndexer] Erreur désindexation page ${pageId}:`, error)
    return false
  }
}
