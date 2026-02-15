/**
 * Service d'indexation des pages web dans le RAG
 * Convertit les pages web en documents de la base de connaissances
 */

import { db } from '@/lib/db/postgres'
import type { WebPage, WebSource } from './types'
import { isSemanticSearchEnabled, aiConfig, KB_ARABIC_ONLY, EMBEDDING_TURBO_CONFIG } from '@/lib/ai/config'
import { normalizeText, detectTextLanguage } from './content-extractor'
import type { LegalCategory } from '@/lib/categories/legal-categories'

// Concurrence pour l'indexation de pages (1 = séquentiel, safe pour Ollama)
const WEB_INDEXING_CONCURRENCY = parseInt(process.env.WEB_INDEXING_CONCURRENCY || '1', 10)

// =============================================================================
// TYPES POUR CLASSIFICATION
// =============================================================================

/**
 * Classification IA d'une page (depuis legal_classifications)
 */
interface PageClassification {
  primary_category: LegalCategory
  confidence_score: number
  signals_used: string[] | null
}

/**
 * Détermine la catégorie KB basée UNIQUEMENT sur le contenu (classification IA)
 * ❌ PAS de fallback vers web_source.category
 * ✅ Classification pure par contenu
 */
function determineCategoryForKB(
  classification: PageClassification | null
): LegalCategory {
  // Cas 1 : Classification IA disponible → utiliser primary_category
  if (classification?.primary_category) {
    return classification.primary_category
  }

  // Cas 2 : Pas de classification → "autre" + flag review
  // (Sera détecté via metadata.needs_review dans le dashboard)
  return 'autre'
}

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
 *
 * Si la page appartient à un legal_document consolidé,
 * on délègue à l'indexation document-aware.
 */
export async function indexWebPage(pageId: string): Promise<IndexingResult> {
  if (!isSemanticSearchEnabled()) {
    return { success: false, chunksCreated: 0, error: 'Service RAG désactivé' }
  }

  // Vérifier si la page appartient à un document juridique consolidé
  const docLink = await db.query(
    `SELECT wpd.legal_document_id, ld.consolidation_status, ld.citation_key
     FROM web_pages_documents wpd
     JOIN legal_documents ld ON wpd.legal_document_id = ld.id
     WHERE wpd.web_page_id = $1
     AND ld.consolidation_status = 'complete'`,
    [pageId]
  )

  if (docLink.rows.length > 0) {
    const doc = docLink.rows[0]
    console.log(`[WebIndexer] Page ${pageId} appartient au document consolidé ${doc.citation_key} - skip indexation individuelle`)
    return {
      success: true,
      chunksCreated: 0,
      error: `Page partie du document consolidé ${doc.citation_key} - indexation document-level`,
    }
  }

  // Récupérer la page + classification IA
  const pageResult = await db.query(
    `SELECT
       wp.*,
       ws.category as source_category,
       ws.name as source_name,
       lc.primary_category,
       lc.confidence_score,
       lc.signals_used
     FROM web_pages wp
     JOIN web_sources ws ON wp.web_source_id = ws.id
     LEFT JOIN legal_classifications lc ON wp.id = lc.web_page_id
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

  // Extraire la classification IA (si disponible)
  const classification: PageClassification | null = row.primary_category
    ? {
        primary_category: row.primary_category,
        confidence_score: row.confidence_score || 0,
        signals_used: row.signals_used,
      }
    : null

  // Déterminer la catégorie KB basée UNIQUEMENT sur le contenu
  const kbCategory = determineCategoryForKB(classification)

  // Normaliser le texte
  const normalizedText = normalizeText(row.extracted_text)
  const detectedLang = row.language_detected || detectTextLanguage(normalizedText) || 'fr'

  // Stratégie arabe uniquement : ignorer le contenu non-arabe
  // Exception: Google Drive accepte français et mixte
  // NOTE : On utilise source_category pour ce check technique (propriété de la source)
  const isGoogleDrive = row.source_category === 'google_drive'
  if (KB_ARABIC_ONLY && !isGoogleDrive && detectedLang !== 'ar') {
    console.log(`[WebIndexer] Contenu non-arabe ignoré: page ${pageId} (${detectedLang})`)
    return { success: false, chunksCreated: 0, error: `Contenu non-arabe ignoré (${detectedLang})` }
  }

  // Seules les langues 'ar' et 'fr' sont supportées dans knowledge_base
  const language: 'ar' | 'fr' = KB_ARABIC_ONLY ? 'ar' : ((detectedLang === 'ar' || detectedLang === 'fr') ? detectedLang : 'fr')

  // Import des services
  const { chunkText, getOverlapForCategory } = await getChunkingService()
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await getEmbeddingsService()

  // Déterminer l'overlap selon la catégorie KB (basée sur le contenu)
  const overlap = getOverlapForCategory(kbCategory)

  // Découper en chunks selon la catégorie KB
  const chunks = chunkText(normalizedText, {
    chunkSize: aiConfig.rag.chunkSize,
    overlap,
    preserveParagraphs: true,
    preserveSentences: true,
    category: kbCategory, // Catégorie basée sur le contenu (classification IA)
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
      // Créer un nouveau document KB avec classification IA pure
      const kbResult = await client.query(
        `INSERT INTO knowledge_base (
          category, subcategory, language, title, description,
          metadata, tags, full_text, source_file, is_indexed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
        RETURNING id`,
        [
          kbCategory, // ← Classification IA pure (pas de fallback source)
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
            // Tracking classification pour audit
            classification_source: classification ? 'ai' : 'default',
            classification_confidence: classification?.confidence_score || null,
            classification_signals: classification?.signals_used || null,
            needs_review: !classification, // Flag si pas de classification IA
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
            // Tracking classification (mise à jour si classification changée)
            classification_source: classification ? 'ai' : 'default',
            classification_confidence: classification?.confidence_score || null,
            classification_signals: classification?.signals_used || null,
            needs_review: !classification,
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

  const concurrency = EMBEDDING_TURBO_CONFIG.enabled
    ? EMBEDDING_TURBO_CONFIG.concurrency
    : WEB_INDEXING_CONCURRENCY

  // Traitement par lots avec concurrence configurable
  const pageIds = pagesResult.rows.map(r => r.id)
  for (let i = 0; i < pageIds.length; i += concurrency) {
    const batch = pageIds.slice(i, i + concurrency)

    if (concurrency <= 1) {
      // Mode séquentiel (safe pour Ollama)
      for (const pageId of batch) {
        const result = await indexWebPage(pageId)
        results.push({ pageId, success: result.success, error: result.error })
      }
    } else {
      // Mode parallèle (turbo / OpenAI)
      const batchResults = await Promise.allSettled(
        batch.map(pageId => indexWebPage(pageId))
      )
      for (let j = 0; j < batch.length; j++) {
        const settled = batchResults[j]
        if (settled.status === 'fulfilled') {
          results.push({ pageId: batch[j], success: settled.value.success, error: settled.value.error })
        } else {
          results.push({ pageId: batch[j], success: false, error: settled.reason?.message || 'Erreur inconnue' })
        }
      }
    }
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

  const concurrency = EMBEDDING_TURBO_CONFIG.enabled
    ? EMBEDDING_TURBO_CONFIG.concurrency
    : WEB_INDEXING_CONCURRENCY

  // Traitement par lots avec concurrence configurable
  const pageIds = pagesResult.rows.map(r => r.id)
  for (let i = 0; i < pageIds.length; i += concurrency) {
    const batch = pageIds.slice(i, i + concurrency)

    if (concurrency <= 1) {
      // Mode séquentiel (safe pour Ollama)
      for (const pageId of batch) {
        const result = await indexWebPage(pageId)
        results.push({ pageId, success: result.success, error: result.error })
      }
    } else {
      // Mode parallèle (turbo / OpenAI)
      const batchResults = await Promise.allSettled(
        batch.map(pageId => indexWebPage(pageId))
      )
      for (let j = 0; j < batch.length; j++) {
        const settled = batchResults[j]
        if (settled.status === 'fulfilled') {
          results.push({ pageId: batch[j], success: settled.value.success, error: settled.value.error })
        } else {
          results.push({ pageId: batch[j], success: false, error: settled.reason?.message || 'Erreur inconnue' })
        }
      }
    }
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
 * Indexe un document juridique consolidé (legal_document) dans la KB.
 * Utilise le chunking par article au lieu du chunking classique.
 */
export async function indexLegalDocument(documentId: string): Promise<IndexingResult> {
  if (!isSemanticSearchEnabled()) {
    return { success: false, chunksCreated: 0, error: 'Service RAG désactivé' }
  }

  // Charger le document consolidé
  const docResult = await db.query(
    `SELECT * FROM legal_documents WHERE id = $1 AND consolidation_status = 'complete'`,
    [documentId]
  )

  if (docResult.rows.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Document non trouvé ou pas encore consolidé' }
  }

  const doc = docResult.rows[0]

  if (!doc.consolidated_text || doc.consolidated_text.length < 100) {
    return { success: false, chunksCreated: 0, error: 'Texte consolidé insuffisant' }
  }

  const { chunkByArticle } = await import('@/lib/ai/chunking-service')
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await getEmbeddingsService()

  // Chunking par article si structure disponible
  let chunks
  if (doc.structure && doc.structure.books) {
    chunks = chunkByArticle(doc.structure, {
      maxChunkWords: 2000,
      codeName: doc.official_title_ar || doc.citation_key,
    })
  } else {
    // Fallback: chunking classique
    const { chunkText } = await getChunkingService()
    chunks = chunkText(doc.consolidated_text, {
      chunkSize: aiConfig.rag.chunkSize,
      overlap: 100,
      preserveParagraphs: true,
      category: 'code',
    })
  }

  if (chunks.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Aucun chunk généré' }
  }

  const client = await db.getClient()

  try {
    await client.query('BEGIN')

    let knowledgeBaseId = doc.knowledge_base_id

    if (!knowledgeBaseId) {
      // Créer l'entrée KB consolidée
      const kbResult = await client.query(
        `INSERT INTO knowledge_base (
          category, language, title, description, metadata, tags, full_text, source_file, is_indexed
        ) VALUES ($1, 'ar', $2, $3, $4, $5, $6, $7, false)
        RETURNING id`,
        [
          doc.primary_category,
          doc.official_title_ar || doc.citation_key,
          doc.official_title_fr,
          JSON.stringify({
            source: 'legal_document',
            legalDocumentId: doc.id,
            citationKey: doc.citation_key,
            documentType: doc.document_type,
            isCanonical: true,
            consolidatedAt: doc.structure?.consolidatedAt,
            pageCount: doc.page_count,
          }),
          doc.tags || [],
          doc.consolidated_text,
          `legal-doc://${doc.citation_key}`,
        ]
      )
      knowledgeBaseId = kbResult.rows[0].id
    } else {
      // Mettre à jour
      await client.query(
        `UPDATE knowledge_base SET
          title = $2, full_text = $3, is_indexed = false,
          version = version + 1, updated_at = NOW()
        WHERE id = $1`,
        [knowledgeBaseId, doc.official_title_ar || doc.citation_key, doc.consolidated_text]
      )
      await client.query(
        'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
        [knowledgeBaseId]
      )
    }

    // Générer embeddings en batch
    const embeddingsResult = await generateEmbeddingsBatch(
      chunks.map(c => c.content)
    )

    // Embedding document-level
    const docSummary = `${doc.official_title_ar || ''} ${doc.official_title_fr || ''} ${doc.citation_key}`.trim()
    const docEmbedding = await generateEmbedding(docSummary)

    // Insérer les chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkMeta = chunks[i].metadata as any
      await client.query(
        `INSERT INTO knowledge_base_chunks
         (knowledge_base_id, chunk_index, content, embedding, metadata)
         VALUES ($1, $2, $3, $4::vector, $5)`,
        [
          knowledgeBaseId,
          i,
          chunks[i].content,
          formatEmbeddingForPostgres(embeddingsResult.embeddings[i]),
          JSON.stringify({
            wordCount: chunks[i].metadata.wordCount,
            articleNumber: chunkMeta.articleNumber || null,
            bookNumber: chunkMeta.bookNumber || null,
            chapterNumber: chunkMeta.chapterNumber || null,
            codeName: chunkMeta.codeName || null,
            citationKey: doc.citation_key,
            sourceType: 'legal_document',
          }),
        ]
      )
    }

    // Marquer comme indexé
    await client.query(
      `UPDATE knowledge_base SET embedding = $2::vector, is_indexed = true, updated_at = NOW()
       WHERE id = $1`,
      [knowledgeBaseId, formatEmbeddingForPostgres(docEmbedding.embedding)]
    )

    // Lier le document juridique à la KB
    await client.query(
      `UPDATE legal_documents SET
        knowledge_base_id = $2, is_canonical = true, updated_at = NOW()
      WHERE id = $1`,
      [documentId, knowledgeBaseId]
    )

    await client.query('COMMIT')

    console.log(`[WebIndexer] Document juridique ${doc.citation_key} indexé: ${chunks.length} chunks`)

    return {
      success: true,
      knowledgeBaseId,
      chunksCreated: chunks.length,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`[WebIndexer] Erreur indexation document ${doc.citation_key}:`, error)
    return {
      success: false,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : 'Erreur indexation document',
    }
  } finally {
    client.release()
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
