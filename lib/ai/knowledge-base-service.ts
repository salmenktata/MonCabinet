/**
 * Service Base de Connaissances - Gestion des documents de référence juridique
 *
 * Ce service gère:
 * - Upload et extraction de texte des documents de référence
 * - Indexation sémantique (chunking + embeddings)
 * - Recherche sémantique dans la base de connaissances
 * - Statistiques et gestion CRUD
 */

import { db } from '@/lib/db/postgres'
import { uploadFile, deleteFile } from '@/lib/storage/minio'
import { aiConfig, isSemanticSearchEnabled } from './config'
import { onKnowledgeDocumentChange } from './related-documents-service'
import type { KnowledgeCategory } from '@/lib/categories/legal-categories'
import { LEGAL_CATEGORY_TRANSLATIONS } from '@/lib/categories/legal-categories'
import { getChunkConfig } from './adaptive-chunking-config'
import type { DocumentType } from '@/lib/categories/doc-types'
import { getDocumentType } from '@/lib/categories/doc-types'
import { normalizeArabicText } from '@/lib/web-scraper/arabic-text-utils'
import { normalizeArticleNumbers, removeDocumentBoilerplate } from '@/lib/ai/text-normalization-service'
import { checkDocumentInclusion } from '@/lib/kb/inclusion-rules'
import { trackDocumentVersion } from '@/lib/kb/document-version-tracker'
import type { Chunk } from './chunking-service'

// Import dynamique pour éviter les problèmes avec pdf-parse en RSC
async function getDocumentParser() {
  const { extractText, isSupportedMimeType } = await import('./document-parser')
  return { extractText, isSupportedMimeType }
}

async function getChunkingService() {
  const { chunkText, chunkTextSemantic } = await import('./chunking-service')
  return { chunkText, chunkTextSemantic }
}

const SEMANTIC_CHUNKING_ENABLED = process.env.SEMANTIC_CHUNKING_ENABLED === 'true'

async function getEmbeddingsService() {
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await import('./embeddings-service')
  return { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres }
}

// =============================================================================
// TYPES
// =============================================================================

// Utiliser le type du système centralisé
export type KnowledgeBaseCategory = KnowledgeCategory
export type KnowledgeBaseLanguage = 'ar' | 'fr'

// ✨ PHASE 2: Types enrichis
export type LegalStatus = 'en_vigueur' | 'abroge' | 'modifie' | 'suspendu' | 'inconnu'
export type SourceReliability = 'officiel' | 'verifie' | 'interne' | 'commentaire' | 'non_verifie'

export interface KnowledgeBaseDocument {
  id: string
  category: KnowledgeBaseCategory
  subcategory: string | null
  docType?: DocumentType | null  // Meta-catégorie (type de savoir juridique)
  language: KnowledgeBaseLanguage
  title: string
  description: string | null
  metadata: Record<string, unknown>
  tags: string[]
  sourceFile: string | null
  fullText: string | null
  isIndexed: boolean
  isActive: boolean
  version: number
  chunkCount?: number
  uploadedBy: string | null
  createdAt: Date
  updatedAt: Date
  // ✨ PHASE 2: Nouveaux champs métadonnées enrichies
  status?: LegalStatus
  citation?: string | null
  citationAr?: string | null
  articleId?: string | null
  reliability?: SourceReliability
  versionDate?: Date | null
  supersedesId?: string | null
  supersededById?: string | null
  // ✨ PHASE 3: Stratégie de chunking utilisée
  chunkingStrategy?: 'adaptive' | 'article' | 'semantic'
}

export interface KnowledgeBaseUploadInput {
  category: KnowledgeBaseCategory
  subcategory?: string
  language: KnowledgeBaseLanguage
  title: string
  description?: string
  metadata?: Record<string, unknown>
  tags?: string[]
  file?: {
    buffer: Buffer
    filename: string
    mimeType: string
  }
  text?: string // Alternative: texte direct
  autoIndex?: boolean
}

export interface KnowledgeBaseVersion {
  id: string
  knowledgeBaseId: string
  version: number
  title: string
  changeType: 'create' | 'update' | 'content_update' | 'file_replace' | 'restore'
  changeReason: string | null
  changedBy: string | null
  changedByEmail?: string
  changedAt: Date
}

export interface KnowledgeBaseSearchResult {
  knowledgeBaseId: string
  chunkId: string
  title: string
  category: KnowledgeBaseCategory
  chunkContent: string
  chunkIndex: number
  similarity: number
  metadata: Record<string, unknown>
}

export interface KnowledgeBaseStats {
  totalDocuments: number
  indexedDocuments: number
  pendingDocuments: number
  totalChunks: number
  byCategory: Record<KnowledgeBaseCategory, number>
}

// =============================================================================
// CONSTANTES
// =============================================================================

/**
 * @deprecated Utiliser LEGAL_CATEGORY_TRANSLATIONS depuis @/lib/categories/legal-categories
 */
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(LEGAL_CATEGORY_TRANSLATIONS).map(([key, val]) => [key, val.fr])
)

const KNOWLEDGE_BASE_BUCKET = 'knowledge-base'

// =============================================================================
// UPLOAD ET CRÉATION
// =============================================================================

/**
 * Uploade un nouveau document dans la base de connaissances
 */
export async function uploadKnowledgeDocument(
  input: KnowledgeBaseUploadInput,
  uploadedBy: string
): Promise<KnowledgeBaseDocument> {
  const {
    category,
    subcategory,
    language,
    title,
    description,
    metadata = {},
    tags = [],
    file,
    text,
    autoIndex = true,
  } = input

  let fullText: string | null = null
  let sourceFile: string | null = null

  // Extraction du texte
  if (file) {
    const { extractText, isSupportedMimeType } = await getDocumentParser()

    if (!isSupportedMimeType(file.mimeType)) {
      throw new Error(`Type de fichier non supporté: ${file.mimeType}`)
    }

    // Upload vers MinIO
    const filePath = `${category}/${Date.now()}_${file.filename}`
    const uploadResult = await uploadFile(
      file.buffer,
      filePath,
      { category, title },
      KNOWLEDGE_BASE_BUCKET
    )
    sourceFile = uploadResult.path

    // Extraire le texte (avec support stream pour PDF)
    const parseResult = await extractText(file.buffer, file.mimeType)
    fullText = parseResult.text
  } else if (text) {
    fullText = text.trim()
  } else {
    throw new Error('Un fichier ou un texte est requis')
  }

  if (!fullText || fullText.length < 50) {
    throw new Error('Le contenu extrait est trop court (minimum 50 caractères)')
  }

  // Insertion en base
  const result = await db.query(
    `INSERT INTO knowledge_base
     (category, subcategory, language, title, description, metadata, tags, source_file, full_text, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      category,
      subcategory || null,
      language,
      title,
      description || null,
      JSON.stringify(metadata),
      tags,
      sourceFile,
      fullText,
      uploadedBy,
    ]
  )

  const doc = mapRowToKnowledgeBase(result.rows[0])

  // Créer la version initiale
  try {
    await db.query(
      `SELECT create_knowledge_base_version($1, $2, $3, $4)`,
      [doc.id, uploadedBy, 'Version initiale', 'create']
    )
  } catch (error) {
    console.error(`Erreur création version initiale pour ${doc.id}:`, error)
  }

  // Auto-indexation async via queue si demandée et service disponible
  if (autoIndex && isSemanticSearchEnabled()) {
    try {
      // Utiliser la queue async au lieu d'indexer synchroniquement
      const { addToQueue } = await import('./indexing-queue-service')
      await addToQueue('knowledge_base', doc.id, 5, { title: doc.title })
      console.log(`[KB] Document ${doc.id} ajouté à la queue d'indexation`)
    } catch (error) {
      console.error(`Erreur ajout queue indexation document ${doc.id}:`, error)
      // Continue sans échouer - le document est créé mais pas indexé
    }
  }

  return doc
}

// =============================================================================
// INDEXATION
// =============================================================================

/**
 * Construit les métadonnées riches pour un chunk, incluant article_number,
 * book_number, section_header, etc. en plus de wordCount/charCount.
 * Rétrocompatible : les chunks existants gardent {wordCount, charCount}.
 */
function buildChunkMetadata(chunk: Chunk, doc: Record<string, unknown>): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    wordCount: chunk.metadata.wordCount,
    charCount: chunk.metadata.charCount,
  }
  if (chunk.metadata.chunkingStrategy) meta.chunking_strategy = chunk.metadata.chunkingStrategy
  if (chunk.metadata.articleNumber) meta.article_number = chunk.metadata.articleNumber
  if ((chunk.metadata as Record<string, unknown>).bookNumber) meta.book_number = (chunk.metadata as Record<string, unknown>).bookNumber
  if ((chunk.metadata as Record<string, unknown>).chapterNumber) meta.chapter_number = (chunk.metadata as Record<string, unknown>).chapterNumber
  if ((chunk.metadata as Record<string, unknown>).sectionHeader) meta.section_header = (chunk.metadata as Record<string, unknown>).sectionHeader
  if (chunk.metadata.overlapWithPrevious) meta.overlap_prev = true
  if (chunk.metadata.overlapWithNext) meta.overlap_next = true
  // Propagation doc-level
  if (doc.language) meta.language = doc.language
  if (doc.category) meta.category = doc.category
  if (doc.source_type) meta.source_type = doc.source_type
  if (doc.source_url) meta.source_url = doc.source_url
  return meta
}

/**
 * Indexe un document de la base de connaissances (génère chunks + embeddings)
 */
export async function indexKnowledgeDocument(
  documentId: string,
  options: { strategy?: 'adaptive' | 'article' | 'semantic'; skipExistingGeminiEmbeddings?: boolean } = {}
): Promise<{
  success: boolean
  chunksCreated: number
  error?: string
}> {
  if (!isSemanticSearchEnabled()) {
    return { success: false, chunksCreated: 0, error: 'Service RAG désactivé' }
  }

  // Récupérer le document
  const docResult = await db.query(
    'SELECT * FROM knowledge_base WHERE id = $1',
    [documentId]
  )

  if (docResult.rows.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Document non trouvé' }
  }

  const doc = docResult.rows[0]

  if (!doc.full_text) {
    return { success: false, chunksCreated: 0, error: 'Document sans contenu texte' }
  }

  // ✨ QUALITY GATE: Bloquer l'indexation des docs de très faible qualité
  // Seulement si quality_score a déjà été calculé (pas NULL) et est < 40
  if (doc.quality_score !== null && doc.quality_score < 40) {
    console.warn(
      `[KB Index] ⚠️ QUALITY GATE: Doc ${documentId} ("${doc.title?.substring(0, 40)}") ` +
      `bloqué pour indexation - quality_score=${doc.quality_score} < 40`
    )
    return {
      success: false,
      chunksCreated: 0,
      error: `Quality gate: score ${doc.quality_score}/100 < 40 (document de très faible qualité)`,
    }
  }

  // ✨ C2: Règles d'inclusion/exclusion (Sprint 3)
  const inclusionCheck = checkDocumentInclusion({
    title: doc.title || '',
    fullText: doc.full_text,
    category: doc.category,
    subcategory: doc.subcategory,
    language: doc.language,
  })
  if (!inclusionCheck.accepted) {
    const reason = inclusionCheck.blockers[0] || 'Règle d\'inclusion non satisfaite'
    console.warn(`[KB Index] ⚠️ INCLUSION GATE: Doc ${documentId} bloqué — ${reason}`)
    // Stocker la raison dans metadata pour monitoring
    await db.query(
      `UPDATE knowledge_base SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('exclusion_reason', $1) WHERE id = $2`,
      [reason, documentId]
    ).catch(() => {})
    return { success: false, chunksCreated: 0, error: `Inclusion gate: ${reason}` }
  }
  if (inclusionCheck.warnings.length > 0) {
    console.log(`[KB Index] ⚠️ Warnings pour ${documentId}: ${inclusionCheck.warnings.join(', ')}`)
  }

  // ✨ C1: Tracking version si re-indexation (Sprint 3)
  if (doc.is_indexed) {
    trackDocumentVersion(documentId, doc.full_text, 'system').catch(err =>
      console.error(`[KB Index] Erreur version tracking pour ${documentId}:`, err)
    )
  }

  // Import dynamique des services
  const { chunkText, chunkTextSemantic } = await getChunkingService()
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await getEmbeddingsService()

  // ✨ NORMALISATION: Nettoyer le texte avant chunking (Sprint 1)
  let textToChunk = doc.full_text
  textToChunk = removeDocumentBoilerplate(textToChunk)
  if (doc.language === 'ar') {
    textToChunk = normalizeArabicText(textToChunk, { stripDiacritics: true })
  }
  textToChunk = normalizeArticleNumbers(textToChunk)

  // ✨ OPTIMISATION Phase 2.3 : Chunking adaptatif par catégorie
  const category = (doc.category as KnowledgeCategory) || 'autre'
  const chunkConfig = getChunkConfig(category)

  // ✨ PHASE 3: Déterminer stratégie de chunking
  const strategy = options.strategy || 'adaptive'

  const chunkingOptions = {
    chunkSize: chunkConfig.size,
    overlap: chunkConfig.overlap,
    preserveParagraphs: chunkConfig.preserveParagraphs ?? true,
    preserveSentences: chunkConfig.preserveSentences ?? true,
    category,
    strategy,  // Phase 3: ajouter stratégie
    language: doc.language as 'fr' | 'ar',  // Phase 3: langue pour détection articles
  }

  // Semantic chunking si activé, sinon chunking classique
  let chunks
  if (SEMANTIC_CHUNKING_ENABLED) {
    try {
      chunks = await chunkTextSemantic(
        textToChunk,
        chunkingOptions,
        async (texts: string[]) => {
          const results = await generateEmbeddingsBatch(texts)
          return results.embeddings
        }
      )
      console.log(`[KB Index] Semantic chunking: ${chunks.length} chunks (catégorie=${category})`)
    } catch (error) {
      console.error('[KB Index] Semantic chunking failed, fallback classique:', error instanceof Error ? error.message : error)
      chunks = chunkText(textToChunk, chunkingOptions)
    }
  } else {
    chunks = chunkText(textToChunk, chunkingOptions)
  }

  console.log(
    `[KB Index] Chunking adaptatif: catégorie=${category}, size=${chunkConfig.size}, overlap=${chunkConfig.overlap}, chunks=${chunks.length}`
  )

  if (chunks.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Aucun chunk généré' }
  }

  // Phase 5b: Contextual Retrieval — Préfixer chaque chunk avec contexte structuré
  // Améliore le matching sémantique car l'embedding capture le contexte du document
  for (const chunk of chunks) {
    const headerParts: string[] = []
    if (doc.title) headerParts.push(doc.title)
    if (chunk.metadata.articleNumber) headerParts.push(`الفصل ${chunk.metadata.articleNumber}`)
    if ((chunk.metadata as Record<string, unknown>).sectionHeader) headerParts.push((chunk.metadata as Record<string, unknown>).sectionHeader as string)
    if (doc.category) headerParts.push(`[${doc.category}]`)
    if (headerParts.length > 0) {
      chunk.content = `${headerParts.join(' | ')}\n---\n${chunk.content}`
    }
  }

  // Skip embeddings Gemini si déjà générés (évite re-génération lors mise à jour de métadonnées)
  let savedGeminiEmbeddings: number[][] | null = null
  if (options.skipExistingGeminiEmbeddings) {
    const existingGemini = await db.query(
      'SELECT content, embedding_gemini FROM knowledge_base_chunks WHERE knowledge_base_id = $1 AND embedding_gemini IS NOT NULL ORDER BY chunk_index',
      [documentId]
    )
    if (existingGemini.rows.length > 0) {
      const geminiMap = new Map<string, number[]>(existingGemini.rows.map((r: {content: string; embedding_gemini: number[]}) => [r.content, r.embedding_gemini]))
      const allChunksCovered = chunks.every((c) => geminiMap.has(c.content))
      if (allChunksCovered) {
        savedGeminiEmbeddings = chunks.map((c) => geminiMap.get(c.content)!)
        console.log(`[KB Index] Embeddings Gemini réutilisés (${savedGeminiEmbeddings.length} chunks, skip API Gemini)`)
      }
    }
  }

  // Générer les embeddings en parallèle pour les 3 providers
  const [embeddingsResult, geminiEmbeddingsResult, ollamaEmbeddingsResult] = await Promise.allSettled([
    generateEmbeddingsBatch(chunks.map((c) => c.content)),
    savedGeminiEmbeddings
      ? Promise.resolve({ embeddings: savedGeminiEmbeddings, totalTokens: 0, provider: 'gemini' as const })
      : generateEmbeddingsBatch(chunks.map((c) => c.content), { forceGemini: true }),
    generateEmbeddingsBatch(chunks.map((c) => c.content), { forceOllama: true }),
  ])

  if (embeddingsResult.status === 'rejected') {
    throw new Error(`Échec génération embeddings primaires: ${embeddingsResult.reason}`)
  }
  const primaryEmbeddings = embeddingsResult.value

  // Déterminer la colonne d'embedding selon le provider utilisé
  const embeddingColumn = primaryEmbeddings.provider === 'openai' ? 'embedding_openai' : 'embedding'
  console.log(`[KB Index] Provider embeddings: ${primaryEmbeddings.provider} → colonne ${embeddingColumn}`)

  if (geminiEmbeddingsResult.status === 'rejected') {
    console.warn(`[KB Index] Embeddings Gemini non disponibles: ${geminiEmbeddingsResult.reason?.message || 'erreur inconnue'}`)
  }
  const hasGeminiEmbeddings = geminiEmbeddingsResult.status === 'fulfilled' && geminiEmbeddingsResult.value.embeddings.length > 0
  if (hasGeminiEmbeddings) {
    console.log(`[KB Index] Embeddings Gemini générés (768-dim) pour ${geminiEmbeddingsResult.value.embeddings.length} chunks`)
  }

  if (ollamaEmbeddingsResult.status === 'rejected') {
    console.warn(`[KB Index] Embeddings Ollama non disponibles: ${ollamaEmbeddingsResult.reason?.message || 'erreur inconnue'}`)
  }
  const hasOllamaEmbeddings = ollamaEmbeddingsResult.status === 'fulfilled' && ollamaEmbeddingsResult.value.embeddings.length > 0
  if (hasOllamaEmbeddings) {
    console.log(`[KB Index] Embeddings Ollama générés (1024-dim) pour ${ollamaEmbeddingsResult.value.embeddings.length} chunks`)
  }

  // Générer un embedding pour le document entier (titre + description)
  const docSummary = `${doc.title}. ${doc.description || ''}`
  const docEmbeddingResult = await generateEmbedding(docSummary)

  // Transaction pour insertion
  const client = await db.getClient()

  try {
    await client.query('BEGIN')

    // Supprimer les anciens chunks
    await client.query(
      'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
      [documentId]
    )

    // Bulk INSERT des chunks (réduction 90% overhead transaction)
    const CHUNK_BATCH_SIZE = 50
    for (let batchStart = 0; batchStart < chunks.length; batchStart += CHUNK_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + CHUNK_BATCH_SIZE, chunks.length)
      const batchChunks = chunks.slice(batchStart, batchEnd)

      const values: unknown[] = []
      const placeholders: string[] = []

      for (let i = 0; i < batchChunks.length; i++) {
        const chunkIndex = batchStart + i

        const chunkMeta = JSON.stringify(buildChunkMetadata(batchChunks[i], doc))

        if (hasGeminiEmbeddings) {
          // Insérer embedding primaire + Gemini ensemble
          const offset = i * 6
          placeholders.push(
            `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}::vector, $${offset+5}::vector, $${offset+6})`
          )
          values.push(
            documentId,
            batchChunks[i].index,
            batchChunks[i].content,
            formatEmbeddingForPostgres(primaryEmbeddings.embeddings[chunkIndex]),
            formatEmbeddingForPostgres(geminiEmbeddingsResult.value.embeddings[chunkIndex]),
            chunkMeta
          )
        } else {
          // Insérer uniquement embedding primaire
          const offset = i * 5
          placeholders.push(
            `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}::vector, $${offset+5})`
          )
          values.push(
            documentId,
            batchChunks[i].index,
            batchChunks[i].content,
            formatEmbeddingForPostgres(primaryEmbeddings.embeddings[chunkIndex]),
            chunkMeta
          )
        }
      }

      const insertColumns = hasGeminiEmbeddings
        ? `(knowledge_base_id, chunk_index, content, ${embeddingColumn}, embedding_gemini, metadata)`
        : `(knowledge_base_id, chunk_index, content, ${embeddingColumn}, metadata)`

      await client.query(
        `INSERT INTO knowledge_base_chunks ${insertColumns} VALUES ${placeholders.join(', ')}`,
        values
      )
    }

    // Backfill Ollama embeddings via UPDATE batch (1 requête au lieu de N)
    if (hasOllamaEmbeddings) {
      const ollamaEmbeddings = ollamaEmbeddingsResult.value.embeddings
      const indices: number[] = []
      const vectors: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        if (ollamaEmbeddings[i]) {
          indices.push(i)
          vectors.push(formatEmbeddingForPostgres(ollamaEmbeddings[i]))
        }
      }
      if (indices.length > 0) {
        await client.query(
          `UPDATE knowledge_base_chunks kbc SET embedding = batch.vec::vector(1024)
           FROM unnest($1::int[], $2::text[]) AS batch(idx, vec)
           WHERE kbc.knowledge_base_id = $3 AND kbc.chunk_index = batch.idx`,
          [indices, vectors, documentId]
        )
        console.log(`[KB Index] Embeddings Ollama écrits pour ${indices.length} chunks (batch)`)
      }
    }

    // Mettre à jour le document avec son embedding, stratégie et marquer comme indexé
    await client.query(
      `UPDATE knowledge_base
       SET embedding = $1::vector, is_indexed = true, chunk_count = $2, chunking_strategy = $3, updated_at = NOW()
       WHERE id = $4`,
      [
        formatEmbeddingForPostgres(docEmbeddingResult.embedding),
        chunks.length,
        strategy,
        documentId
      ]
    )

    await client.query('COMMIT')

    // Sync web_pages.chunks_count si la page est liée (évite le compteur stale)
    await db.query(
      `UPDATE web_pages SET chunks_count = $2, updated_at = NOW()
       WHERE knowledge_base_id = $1 AND chunks_count IS DISTINCT FROM $2`,
      [documentId, chunks.length]
    ).catch((err) => console.error('[KB Index] Erreur sync chunks_count web_pages:', err))

    // Invalider le cache des documents similaires
    await onKnowledgeDocumentChange(documentId, 'index')

    // Ajouter les jobs d'analyse qualité et détection doublons à la queue
    try {
      const { addToQueue } = await import('./indexing-queue-service')
      await addToQueue('kb_quality_analysis', documentId, 3)
      await addToQueue('kb_duplicate_check', documentId, 2)
    } catch (queueError) {
      console.error('[KnowledgeBase] Erreur ajout jobs qualité/doublons:', queueError)
    }

    return { success: true, chunksCreated: chunks.length }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Réindexe tous les documents non indexés
 */
export async function indexPendingDocuments(limit: number = 10): Promise<{
  processed: number
  succeeded: number
  failed: number
  results: Array<{ id: string; title: string; success: boolean; error?: string }>
}> {
  // ✨ OPTIMISATION Phase 2.2 : Priorisation documents critiques
  // Priorité 1: Catégories critiques (jurisprudence, codes, legislation)
  // Priorité 2: Documents jamais analysés (quality_score IS NULL)
  // Priorité 3: Anciens d'abord (FIFO)
  // Exclure les documents dont l'indexation a échoué récemment (< 1h)
  // pour éviter de les re-tenter à chaque batch et bloquer les autres documents.
  // Après 1h, ils seront retentés automatiquement.
  const pendingResult = await db.query(
    `SELECT id, title, category, quality_score
     FROM knowledge_base
     WHERE is_indexed = false AND full_text IS NOT NULL
     AND (last_index_error IS NULL OR last_index_attempt_at < NOW() - INTERVAL '1 hour')
     ORDER BY
       -- Priorité 1: Catégories critiques
       CASE
         WHEN category IN ('jurisprudence', 'codes', 'legislation') THEN 1
         ELSE 2
       END,
       -- Priorité 2: Jamais analysés
       CASE WHEN quality_score IS NULL THEN 1 ELSE 2 END,
       -- Priorité 3: Anciens d'abord
       COALESCE(quality_assessed_at, created_at) ASC
     LIMIT $1`,
    [limit]
  )

  const results: Array<{ id: string; title: string; success: boolean; error?: string }> = []

  for (const row of pendingResult.rows) {
    try {
      const indexResult = await indexKnowledgeDocument(row.id)
      if (indexResult.success) {
        // Effacer l'erreur précédente si l'indexation réussit
        await db.query(
          `UPDATE knowledge_base SET last_index_error = NULL, last_index_attempt_at = NOW() WHERE id = $1`,
          [row.id]
        ).catch(() => {}) // non-bloquant
      } else {
        // Marquer l'échec pour le cooldown de 1h
        await db.query(
          `UPDATE knowledge_base SET last_index_error = $2, last_index_attempt_at = NOW() WHERE id = $1`,
          [row.id, (indexResult.error || 'Échec indexation').substring(0, 500)]
        ).catch(() => {})
      }
      results.push({
        id: row.id,
        title: row.title,
        success: indexResult.success,
        error: indexResult.error,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
      // Marquer l'échec pour le cooldown de 1h
      await db.query(
        `UPDATE knowledge_base SET last_index_error = $2, last_index_attempt_at = NOW() WHERE id = $1`,
        [row.id, errorMsg.substring(0, 500)]
      ).catch(() => {})
      results.push({
        id: row.id,
        title: row.title,
        success: false,
        error: errorMsg,
      })
    }
  }

  return {
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}

// =============================================================================
// UTILITAIRES RECHERCHE
// =============================================================================

/**
 * Type de query détecté (Phase 2.4)
 */
export type QueryType = 'keyword' | 'semantic'

/**
 * Configuration poids hybrid search
 */
export interface HybridWeights {
  vector: number
  bm25: number
}

/**
 * Détecte le type de query (keyword vs semantic) - Phase 2.4
 *
 * Queries KEYWORD = précises, références légales, articles, numéros
 * Queries SEMANTIC = descriptives, questions ouvertes, concepts
 *
 * @param query - Texte de la query
 * @returns Type détecté + poids optimaux
 */
export function detectQueryType(query: string): {
  type: QueryType
  weights: HybridWeights
  rationale: string
} {
  const normalized = query.toLowerCase().trim()

  // Patterns keywords : articles, codes, références légales, numéros
  const keywordPatterns = [
    /\b(article|art\.?)\s+\d{1,4}/i, // "article 123", "art. 45"
    /\b(فصل|الفصل)\s+\d{1,4}/, // "فصل 123" (article en arabe)
    /\b(code|قانون|مجلة)\s+(civil|pénal|commerce|travail)/i, // "code civil", "قانون الشغل"
    /\b(loi|قانون)\s+(n°|رقم|عدد)\s*\d{4}/i, // "loi n° 2023", "قانون عدد 2023"
    /\b(décret|قرار|أمر)\s+(n°|رقم|عدد)\s*\d{4}/i, // "décret n° 123", "قرار عدد 123"
    /^\d{1,4}$/, // "123" (juste un numéro)
    /\b(tribunal|محكمة)\s+(civil|pénal|commercial|commercial)/i, // "tribunal civil"
    /\b(arrêt|قرار|حكم)\s+(n°|رقم|عدد)?\s*\d{1,6}/i, // "arrêt n° 12345", "قرار عدد 12345"
  ]

  // Vérifier si la query matche un pattern keyword
  for (const pattern of keywordPatterns) {
    if (pattern.test(normalized)) {
      // KEYWORD : Privilégier BM25 (60%) pour précision terminologique
      return {
        type: 'keyword',
        weights: {
          vector: parseFloat(process.env.HYBRID_WEIGHT_VECTOR_KEYWORD || '0.4'),
          bm25: parseFloat(process.env.HYBRID_WEIGHT_BM25_KEYWORD || '0.6'),
        },
        rationale: `Keyword query detected (pattern matched), favoring BM25 for exact term matching`,
      }
    }
  }

  // SEMANTIC : Query descriptive, privilégier vectoriel (70%)
  return {
    type: 'semantic',
    weights: {
      vector: parseFloat(process.env.HYBRID_WEIGHT_VECTOR || '0.7'),
      bm25: parseFloat(process.env.HYBRID_WEIGHT_BM25 || '0.3'),
    },
    rationale: `Semantic query detected (descriptive), favoring vector search for conceptual matching`,
  }
}

// =============================================================================
// RECHERCHE
// =============================================================================

/**
 * Recherche sémantique dans la base de connaissances
 *
 * ✨ OPTIMISATION RAG - Sprint 1 (Feb 2026)
 * Support embeddings OpenAI (1536-dim) pour meilleure qualité
 */
export async function searchKnowledgeBase(
  query: string,
  options: {
    category?: KnowledgeBaseCategory
    subcategory?: string
    limit?: number
    threshold?: number
    operationName?: string  // Pour déterminer le provider d'embeddings
  } = {}
): Promise<KnowledgeBaseSearchResult[]> {
  if (!isSemanticSearchEnabled()) {
    console.log('[KB Search] ❌ Recherche sémantique DÉSACTIVÉE - isSemanticSearchEnabled()=false')
    console.log('[KB Search] Debug config:', {
      'RAG_ENABLED': process.env.RAG_ENABLED,
      'OLLAMA_ENABLED': process.env.OLLAMA_ENABLED,
      'OPENAI_API_KEY': process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'
    })
    return []
  }

  const {
    category,
    subcategory,
    limit = aiConfig.rag.maxResults,
    threshold = aiConfig.rag.similarityThreshold - 0.05, // Seuil légèrement plus bas
    operationName,
  } = options

  // Import dynamique des services
  const { generateEmbedding, formatEmbeddingForPostgres } = await getEmbeddingsService()

  // Générer l'embedding de la requête avec opération spécifique
  // Si operationName fourni, utilisera la config embeddings de l'opération
  const queryEmbedding = await generateEmbedding(query, {
    operationName: operationName as any
  })
  const embeddingStr = formatEmbeddingForPostgres(queryEmbedding.embedding)

  // Déterminer si on utilise OpenAI (basé sur le provider utilisé)
  const useOpenAI = queryEmbedding.provider === 'openai'

  // Log pour debug
  console.log(`[KB Search] Provider: ${queryEmbedding.provider}, dimensions: ${queryEmbedding.embedding.length}`)

  // Recherche via la fonction SQL flexible
  const result = await db.query(
    `SELECT * FROM search_knowledge_base_flexible($1::vector, $2, $3, $4, $5, $6)`,
    [embeddingStr, category || null, subcategory || null, limit, threshold, useOpenAI]
  )

  return result.rows.map((row) => ({
    knowledgeBaseId: row.knowledge_base_id,
    chunkId: row.chunk_id,
    title: row.title,
    category: row.category as KnowledgeBaseCategory,
    chunkContent: row.chunk_content,
    chunkIndex: row.chunk_index,
    similarity: parseFloat(row.similarity),
    metadata: row.metadata || {},
  }))
}

/**
 * Helper : exécute une recherche hybride SQL single-provider
 * Factorise la logique SQL commune pour éviter la duplication.
 */
async function searchHybridSingle(
  queryText: string,
  embeddingStr: string,
  category: string | null,
  docType: string | null,
  limit: number,
  threshold: number,
  provider: 'openai' | 'ollama' | 'gemini',
): Promise<KnowledgeBaseSearchResult[]> {
  const result = await db.query(
    `SELECT * FROM search_knowledge_base_hybrid($1::text, $2::vector, $3::text, $4::text, $5::integer, $6::double precision, $7::text)`,
    [queryText, embeddingStr, category, docType, limit, threshold, provider]
  )

  return result.rows.map((row) => {
    const vecSim = parseFloat(row.similarity) || 0
    const bm25Rank = parseFloat(row.bm25_rank) || 0
    const hybridScore = parseFloat(row.hybrid_score) || 0

    const effectiveSimilarity = vecSim > 0
      ? vecSim
      : Math.max(0.35, Math.min(0.50, bm25Rank * 10))

    return {
      knowledgeBaseId: row.knowledge_base_id,
      chunkId: row.chunk_id,
      title: row.title,
      category: row.category as KnowledgeBaseCategory,
      chunkContent: row.chunk_content,
      chunkIndex: row.chunk_index,
      similarity: effectiveSimilarity,
      metadata: {
        ...row.metadata,
        vectorSimilarity: vecSim,
        bm25Rank,
        hybridScore,
        searchType: vecSim > 0 ? (bm25Rank > 0 ? 'hybrid' : 'vector') : 'bm25',
      },
    }
  })
}

/**
 * Recherche HYBRIDE dans la base de connaissances
 *
 * ✨ OPTIMISATION RAG - Sprint 3 (Feb 2026)
 * Combine recherche vectorielle (sémantique) + BM25 (keywords) avec RRF
 *
 * ✨ AMÉLIORATION (Feb 15, 2026) - Dual-provider search
 * Quand OpenAI retourne < 3 résultats (couverture partielle ~5% des chunks),
 * génère aussi un embedding Ollama pour chercher les 95% de chunks legacy.
 *
 * Impact: +25-30% couverture (capture keywords exacts manqués par vectoriel)
 * Pondération: 70% vectoriel, 30% BM25
 */
export async function searchKnowledgeBaseHybrid(
  query: string,
  options: {
    category?: KnowledgeBaseCategory
    subcategory?: string
    docType?: DocumentType  // Nouveau: filtrage par meta-catégorie
    docTypes?: DocumentType[]  // Nouveau: filtrage par plusieurs meta-catégories
    limit?: number
    threshold?: number
    operationName?: string
  } = {}
): Promise<KnowledgeBaseSearchResult[]> {
  if (!isSemanticSearchEnabled()) {
    console.log('[KB Hybrid Search] ❌ Recherche sémantique DÉSACTIVÉE')
    return []
  }

  const {
    category,
    subcategory,
    docType,
    docTypes,
    limit = aiConfig.rag.maxResults,
    threshold = aiConfig.rag.similarityThreshold - 0.20, // SQL vector_threshold permissif (0.35) ; le HARD_QUALITY_GATE (0.50) filtre ensuite
    operationName,
  } = options

  // Normaliser docTypes en array unique
  const targetDocTypes = docTypes || (docType ? [docType] : null)

  // Pour l'instant, on ne supporte qu'un seul doc_type dans la fonction SQL
  // TODO: Améliorer pour supporter plusieurs doc_types (array) via SQL ANY()
  const singleDocType = targetDocTypes ? targetDocTypes[0] : null

  // Import dynamique des services
  const { generateEmbedding, formatEmbeddingForPostgres } =
    await getEmbeddingsService()

  // Préparer query texte pour BM25 (supprimer ponctuation + diacritiques arabes tashkeel)
  // FIX (Feb 16, 2026): Préserver les accents français/latins pour BM25
  const queryText = query
    .replace(/[\u064B-\u065F\u0670]/g, '') // Strip tashkeel/diacritiques arabes
    .replace(/[^\w\s\u0600-\u06FF\u00C0-\u017F]/g, ' ') // Garde lettres latines étendues (à-ÿ, accents FR)
    .trim()

  // ✨ OPTIMISATION Phase 2.4 : Détection auto type de query + poids adaptatifs
  const queryAnalysis = detectQueryType(query)

  // ✨ TRIPLE EMBEDDING PARALLÈLE (Feb 18, 2026) - OpenAI + Ollama + Gemini
  // Génère les 3 embeddings en parallèle, lance les 3 recherches en parallèle,
  // fusionne par chunk_id (meilleur score gagne) → coverage maximale garantie.
  const sqlCandidatePool = Math.min(limit * 3, 100)

  // 1. Générer les 3 embeddings en parallèle
  // ✨ FIX C (TTFT): Timeout 3s sur Ollama — CPU-bound, peut prendre 8-10s pour 0 résultats en prod
  // OpenAI (1536-dim) + Gemini (768-dim) couvrent ~100% des chunks KB prod → Ollama optionnel
  const ollamaWithTimeout = Promise.race([
    generateEmbedding(query, { forceOllama: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Ollama embedding timeout (3s)')), 3000)),
  ])
  const [openaiEmbResult, ollamaEmbResult, geminiEmbResult] = await Promise.allSettled([
    generateEmbedding(query, { operationName: operationName as any }),       // OpenAI (1536-dim)
    ollamaWithTimeout,                                                        // Ollama (1024-dim, chunks legacy, timeout 3s)
    generateEmbedding(query, { forceGemini: true }),                         // Gemini (768-dim, multilingue AR)
  ])

  // Log providers disponibles
  const openaiStatus = openaiEmbResult.status === 'fulfilled' ? openaiEmbResult.value.provider : 'failed'
  const ollamaStatus = ollamaEmbResult.status === 'fulfilled' ? ollamaEmbResult.value.provider : 'failed'
  const geminiStatus = geminiEmbResult.status === 'fulfilled' ? geminiEmbResult.value.provider : 'failed'
  console.log(
    `[KB Hybrid Search] Triple-embed: OpenAI=${openaiStatus}, Ollama=${ollamaStatus}, Gemini=${geminiStatus}, Type: ${queryAnalysis.type}, Weights: vector=${queryAnalysis.weights.vector} / bm25=${queryAnalysis.weights.bm25}, Query: "${queryText.substring(0, 50)}..."`
  )
  console.log(`[KB Hybrid Search] Rationale: ${queryAnalysis.rationale}`)

  // 2. Lancer les recherches disponibles en parallèle
  const searchPromises: Promise<KnowledgeBaseSearchResult[]>[] = []
  const providerLabels: string[] = []

  if (openaiEmbResult.status === 'fulfilled' && openaiEmbResult.value.provider === 'openai') {
    const embStr = formatEmbeddingForPostgres(openaiEmbResult.value.embedding)
    searchPromises.push(
      searchHybridSingle(queryText, embStr, category || null, singleDocType, sqlCandidatePool, threshold, 'openai')
    )
    providerLabels.push('openai')
  }

  if (ollamaEmbResult.status === 'fulfilled' && ollamaEmbResult.value.provider === 'ollama') {
    // Guard critique : ne lancer la recherche Ollama QUE si l'embedding est vraiment 1024-dim (Ollama)
    // Sinon dimension mismatch PostgreSQL (1536 vs 1024) → crash → 0% hit@5
    const embStr = formatEmbeddingForPostgres(ollamaEmbResult.value.embedding)
    searchPromises.push(
      searchHybridSingle(queryText, embStr, category || null, singleDocType, sqlCandidatePool, threshold, 'ollama')
    )
    providerLabels.push('ollama')
  }

  if (geminiEmbResult.status === 'fulfilled' && geminiEmbResult.value.provider === 'gemini') {
    // Guard critique : ne lancer la recherche Gemini QUE si l'embedding est vraiment 768-dim
    const embStr = formatEmbeddingForPostgres(geminiEmbResult.value.embedding)
    searchPromises.push(
      searchHybridSingle(queryText, embStr, category || null, singleDocType, sqlCandidatePool, threshold, 'gemini')
    )
    providerLabels.push('gemini')
  }

  // ✨ RECHERCHE FORCÉE CODES JURIDIQUES (Feb 17, 2026)
  // Problème fondamental : les articles de codes légaux (المجلة الجزائية, مجلة الشغل...)
  // ont une similarité vectorielle intrinsèquement basse (~0.35-0.45) avec les queries
  // en langage naturel ("ما هي شروط الدفاع الشرعي"). Les docs doctrine (~0.55-0.65)
  // les dominent toujours, même avec pool×3.
  // Solution : recherche forcée dans 'codes' avec threshold très bas (0.20) +
  // boost CODE_PRIORITY_BOOST pour compenser l'écart sémantique naturel.
  // N'ajoute rien si on filtre déjà par codes (évite doublons).
  const CODE_PRIORITY_BOOST = 1.45 // Boost pour rendre codes compétitifs vs doctrine
  const shouldForceCodes = !category || category !== 'codes'
  if (shouldForceCodes && openaiEmbResult.status === 'fulfilled' && openaiEmbResult.value.provider === 'openai') {
    const embStr = formatEmbeddingForPostgres(openaiEmbResult.value.embedding)
    searchPromises.push(
      // Fix (Feb 17, 2026) : threshold 0.15 (était 0.20) pour capturer مجلة الالتزامات والعقود
      // et المجلة التجارية qui ont vecSim 0.15-0.20 pour certaines queries juridiques spécifiques.
      searchHybridSingle(queryText, embStr, 'codes', null, Math.ceil(limit / 2), 0.15, 'openai')
    )
    providerLabels.push('codes-forced')
  }
  // ✨ FORCED CODES - Gemini (multilingue) : couvre les requêtes françaises qui ont
  // faible cross-lingual similarity avec OpenAI pour les codes en arabe.
  if (shouldForceCodes && geminiEmbResult.status === 'fulfilled' && geminiEmbResult.value.provider === 'gemini') {
    const embStr = formatEmbeddingForPostgres(geminiEmbResult.value.embedding)
    searchPromises.push(
      searchHybridSingle(queryText, embStr, 'codes', null, Math.ceil(limit / 2), 0.12, 'gemini')
    )
    providerLabels.push('codes-forced-gemini')
  }

  if (searchPromises.length === 0) {
    console.warn('[KB Hybrid Search] Aucun embedding disponible (OpenAI + Ollama + Gemini tous en échec)')
    return []
  }

  const searchResultSets = await Promise.all(searchPromises)

  // 3. Fusionner : dédupliquer par chunk_id, garder meilleur score
  const seen = new Map<string, KnowledgeBaseSearchResult>()
  const countByProvider: Record<string, number> = {}

  for (let i = 0; i < searchResultSets.length; i++) {
    const resultSet = searchResultSets[i]
    const label = providerLabels[i]
    countByProvider[label] = 0

    for (const r of resultSet) {
      // Appliquer boost aux codes forcés pour compenser l'écart sémantique
      if (label === 'codes-forced' || label === 'codes-forced-gemini') {
        r.similarity = Math.min(1.0, r.similarity * CODE_PRIORITY_BOOST)
      }
      const key = r.chunkId || (r.knowledgeBaseId + ':' + r.chunkContent.substring(0, 50))
      const existing = seen.get(key)
      if (!existing || r.similarity > existing.similarity) {
        seen.set(key, r)
        countByProvider[label] = (countByProvider[label] || 0) + 1
      }
    }
  }

  const results = Array.from(seen.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, sqlCandidatePool)

  const providerSummary = Object.entries(countByProvider).map(([p, c]) => `${c} ${p}`).join(' + ')
  console.log(`[KB Hybrid Search] Triple-parallel: ${providerSummary} → ${results.length} total après dédup (pool=${sqlCandidatePool})`)

  return results
}

/**
 * Recherche Multi-Track — Phase 1 RAG Pipeline v2
 *
 * Exécute plusieurs recherches ciblées en parallèle (une par query de chaque track),
 * puis fusionne les résultats par chunk_id (meilleur score × priorité du track).
 *
 * @param tracks - Pistes juridiques avec queries ciblées
 * @param options - topKPerQuery (défaut 5), threshold, operationName
 * @returns Résultats dédupliqués et triés par score
 */
export async function searchMultiTrack(
  tracks: Array<{ label: string; searchQueries: string[]; targetDocTypes?: string[]; priority: number }>,
  options: { topKPerQuery?: number; threshold?: number; operationName?: string; limit?: number } = {}
): Promise<KnowledgeBaseSearchResult[]> {
  const { topKPerQuery = 5, threshold, operationName, limit = 30 } = options

  // Lancer toutes les queries de tous les tracks en parallèle
  const searchPromises: Array<{ promise: Promise<KnowledgeBaseSearchResult[]>; priority: number }> = []

  for (const track of tracks) {
    for (const query of track.searchQueries) {
      const docType = track.targetDocTypes?.[0] as DocumentType | undefined
      searchPromises.push({
        promise: searchKnowledgeBaseHybrid(query, {
          limit: topKPerQuery,
          threshold,
          operationName,
          docType,
        }),
        priority: track.priority,
      })
    }
  }

  // Exécuter toutes les recherches en parallèle
  const results = await Promise.allSettled(searchPromises.map(sp => sp.promise))

  // Fusionner : dédupliquer par chunk_id, garder meilleur score × priority
  const seen = new Map<string, KnowledgeBaseSearchResult>()

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status !== 'fulfilled') continue

    const priority = searchPromises[i].priority
    for (const r of result.value) {
      const key = r.chunkId || `${r.knowledgeBaseId}:${r.chunkContent.substring(0, 50)}`
      const weightedScore = r.similarity * priority
      const existing = seen.get(key)
      if (!existing || weightedScore > existing.similarity) {
        seen.set(key, { ...r, similarity: weightedScore })
      }
    }
  }

  const merged = Array.from(seen.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  console.log(`[Multi-Track] ${tracks.length} tracks, ${searchPromises.length} queries → ${merged.length} résultats après dédup`)

  return merged
}

/**
 * Recherche full-text simple (fallback sans embeddings)
 */
export async function searchKnowledgeBaseFulltext(
  query: string,
  options: {
    category?: KnowledgeBaseCategory
    limit?: number
  } = {}
): Promise<KnowledgeBaseDocument[]> {
  const { category, limit = 10 } = options

  let sql = `
    SELECT kb.*, COUNT(kbc.id) as chunk_count
    FROM knowledge_base kb
    LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
    WHERE to_tsvector('french', COALESCE(kb.title, '') || ' ' || COALESCE(kb.description, '') || ' ' || COALESCE(kb.full_text, ''))
          @@ plainto_tsquery('french', $1)
  `
  const params: (string | number)[] = [query]

  if (category) {
    sql += ` AND kb.category = $2`
    params.push(category)
  }

  sql += ` GROUP BY kb.id ORDER BY kb.created_at DESC LIMIT $${params.length + 1}`
  params.push(limit)

  const result = await db.query(sql, params)
  return result.rows.map(mapRowToKnowledgeBase)
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * Liste tous les documents de la base de connaissances
 */
export async function listKnowledgeDocuments(options: {
  category?: KnowledgeBaseCategory
  subcategory?: string
  isIndexed?: boolean
  search?: string
  tags?: string[]
  limit?: number
  offset?: number
}): Promise<{ documents: KnowledgeBaseDocument[]; total: number }> {
  const { category, subcategory, isIndexed, search, tags, limit = 50, offset = 0 } = options

  let whereClause = 'WHERE kb.is_active = true'
  const params: (string | number | boolean | string[])[] = []
  let paramIndex = 1

  if (category) {
    whereClause += ` AND kb.category = $${paramIndex++}`
    params.push(category)
  }

  if (subcategory) {
    whereClause += ` AND kb.subcategory = $${paramIndex++}`
    params.push(subcategory)
  }

  if (isIndexed !== undefined) {
    whereClause += ` AND kb.is_indexed = $${paramIndex++}`
    params.push(isIndexed)
  }

  if (search) {
    whereClause += ` AND (
      kb.title ILIKE $${paramIndex} OR
      kb.description ILIKE $${paramIndex}
    )`
    params.push(`%${search}%`)
    paramIndex++
  }

  if (tags && tags.length > 0) {
    whereClause += ` AND kb.tags && $${paramIndex++}`
    params.push(tags)
  }

  // Compter le total
  const countResult = await db.query(
    `SELECT COUNT(*) FROM knowledge_base kb ${whereClause}`,
    params
  )
  const total = parseInt(countResult.rows[0].count)

  // Récupérer les documents avec chunk_count
  const sql = `
    SELECT kb.*, COUNT(kbc.id) as chunk_count
    FROM knowledge_base kb
    LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
    ${whereClause}
    GROUP BY kb.id
    ORDER BY kb.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `
  params.push(limit, offset)

  const result = await db.query(sql, params)

  return {
    documents: result.rows.map(mapRowToKnowledgeBase),
    total,
  }
}

/**
 * Récupère un document par son ID
 */
export async function getKnowledgeDocument(
  documentId: string
): Promise<KnowledgeBaseDocument | null> {
  const result = await db.query(
    `SELECT kb.*, COUNT(kbc.id) as chunk_count
     FROM knowledge_base kb
     LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
     WHERE kb.id = $1
     GROUP BY kb.id`,
    [documentId]
  )

  if (result.rows.length === 0) {
    return null
  }

  return mapRowToKnowledgeBase(result.rows[0])
}

/**
 * Met à jour un document
 */
export async function updateKnowledgeDocument(
  documentId: string,
  updates: {
    title?: string
    description?: string
    category?: KnowledgeBaseCategory
    subcategory?: string
    metadata?: Record<string, unknown>
    tags?: string[]
    language?: KnowledgeBaseLanguage
  }
): Promise<KnowledgeBaseDocument | null> {
  const setClauses: string[] = []
  const params: (string | Record<string, unknown> | string[])[] = []
  let paramIndex = 1

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`)
    params.push(updates.title)
  }

  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`)
    params.push(updates.description)
  }

  if (updates.category !== undefined) {
    setClauses.push(`category = $${paramIndex++}`)
    params.push(updates.category)
  }

  if (updates.subcategory !== undefined) {
    setClauses.push(`subcategory = $${paramIndex++}`)
    params.push(updates.subcategory)
  }

  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIndex++}`)
    params.push(JSON.stringify(updates.metadata))
  }

  if (updates.tags !== undefined) {
    setClauses.push(`tags = $${paramIndex++}`)
    params.push(updates.tags)
  }

  if (updates.language !== undefined) {
    setClauses.push(`language = $${paramIndex++}`)
    params.push(updates.language)
  }

  if (setClauses.length === 0) {
    return getKnowledgeDocument(documentId)
  }

  setClauses.push('updated_at = NOW()')
  params.push(documentId)

  const result = await db.query(
    `UPDATE knowledge_base SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND is_active = true RETURNING *`,
    params
  )

  if (result.rows.length === 0) {
    return null
  }

  // Invalider le cache des documents similaires
  await onKnowledgeDocumentChange(documentId, 'update')

  return mapRowToKnowledgeBase(result.rows[0])
}

/**
 * Supprime un document et ses chunks
 */
export async function deleteKnowledgeDocument(documentId: string): Promise<boolean> {
  // Récupérer le chemin du fichier pour le supprimer de MinIO
  const docResult = await db.query(
    'SELECT source_file FROM knowledge_base WHERE id = $1',
    [documentId]
  )

  if (docResult.rows.length === 0) {
    return false
  }

  const sourceFile = docResult.rows[0].source_file

  // Supprimer en base (les chunks seront supprimés par CASCADE)
  const deleteResult = await db.query(
    'DELETE FROM knowledge_base WHERE id = $1',
    [documentId]
  )

  if ((deleteResult.rowCount || 0) === 0) {
    return false
  }

  // Supprimer le fichier de MinIO si présent
  if (sourceFile) {
    try {
      await deleteFile(sourceFile, KNOWLEDGE_BASE_BUCKET)
    } catch (error) {
      console.error(`Erreur suppression fichier MinIO ${sourceFile}:`, error)
      // Continue sans échouer
    }
  }

  // Invalider le cache des documents similaires
  await onKnowledgeDocumentChange(documentId, 'delete')

  return true
}

// =============================================================================
// STATISTIQUES
// =============================================================================

/**
 * Récupère les statistiques de la base de connaissances
 */
export async function getKnowledgeBaseStats(): Promise<KnowledgeBaseStats> {
  const result = await db.query('SELECT * FROM get_knowledge_base_stats()')
  const row = result.rows[0]

  return {
    totalDocuments: parseInt(row.total_documents) || 0,
    indexedDocuments: parseInt(row.indexed_documents) || 0,
    pendingDocuments:
      (parseInt(row.total_documents) || 0) - (parseInt(row.indexed_documents) || 0),
    totalChunks: parseInt(row.total_chunks) || 0,
    byCategory: row.by_category || {
      jurisprudence: 0,
      code: 0,
      doctrine: 0,
      modele: 0,
      autre: 0,
    },
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function mapRowToKnowledgeBase(row: Record<string, unknown>): KnowledgeBaseDocument {
  const category = row.category as KnowledgeBaseCategory

  return {
    id: row.id as string,
    category,
    subcategory: (row.subcategory as string) || null,
    docType: (row.doc_type as DocumentType) || getDocumentType(category), // Auto-détect si absent
    language: (row.language as KnowledgeBaseLanguage) || 'ar',
    title: row.title as string,
    description: row.description as string | null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    tags: (row.tags as string[]) || [],
    sourceFile: row.source_file as string | null,
    fullText: row.full_text as string | null,
    isIndexed: row.is_indexed as boolean,
    isActive: row.is_active !== false,
    version: (row.version as number) || 1,
    chunkCount: row.chunk_count ? parseInt(row.chunk_count as string) : undefined,
    uploadedBy: row.uploaded_by as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    // ✨ PHASE 2: Mapping nouveaux champs métadonnées enrichies
    status: (row.status as LegalStatus) || 'en_vigueur',
    citation: row.citation as string | null,
    citationAr: row.citation_ar as string | null,
    articleId: row.article_id as string | null,
    reliability: (row.reliability as SourceReliability) || 'verifie',
    versionDate: row.version_date ? new Date(row.version_date as string) : null,
    supersedesId: row.supersedes_id as string | null,
    supersededById: row.superseded_by_id as string | null,
  }
}

// =============================================================================
// VERSIONING
// =============================================================================

/**
 * Met à jour le contenu d'un document (nouveau fichier ou texte)
 */
export async function updateKnowledgeDocumentContent(
  documentId: string,
  data: {
    file?: { buffer: Buffer; filename: string; mimeType: string }
    text?: string
    reindex?: boolean
    changeReason?: string
  },
  changedBy: string
): Promise<{
  success: boolean
  document?: KnowledgeBaseDocument
  versionCreated?: number
  error?: string
  reindexFailed?: boolean
}> {
  const { file, text, reindex = true, changeReason } = data

  if (!file && !text) {
    return { success: false, error: 'Un fichier ou un texte est requis' }
  }

  // Vérifier que le document existe
  const existingDoc = await getKnowledgeDocument(documentId)
  if (!existingDoc) {
    return { success: false, error: 'Document non trouvé' }
  }

  let fullText: string | null = null
  let sourceFile: string | null = existingDoc.sourceFile
  let changeType: 'content_update' | 'file_replace' = 'content_update'

  // Traiter le fichier
  if (file) {
    const { extractText, isSupportedMimeType } = await getDocumentParser()

    if (!isSupportedMimeType(file.mimeType)) {
      return { success: false, error: `Type de fichier non supporté: ${file.mimeType}` }
    }

    // Supprimer l'ancien fichier si présent
    if (existingDoc.sourceFile) {
      try {
        await deleteFile(existingDoc.sourceFile, KNOWLEDGE_BASE_BUCKET)
      } catch (error) {
        console.error(`Erreur suppression ancien fichier:`, error)
      }
    }

    // Upload du nouveau fichier
    const filePath = `${existingDoc.category}/${Date.now()}_${file.filename}`
    const uploadResult = await uploadFile(
      file.buffer,
      filePath,
      { category: existingDoc.category, title: existingDoc.title },
      KNOWLEDGE_BASE_BUCKET
    )
    sourceFile = uploadResult.path

    // Extraire le texte
    const parseResult = await extractText(file.buffer, file.mimeType)
    fullText = parseResult.text
    changeType = 'file_replace'
  } else if (text) {
    fullText = text.trim()
  }

  if (!fullText || fullText.length < 50) {
    return { success: false, error: 'Le contenu extrait est trop court (minimum 50 caractères)' }
  }

  // Créer une version de sauvegarde avant modification
  const versionResult = await db.query(
    `SELECT create_knowledge_base_version($1, $2, $3, $4) as version_id`,
    [documentId, changedBy, changeReason || `Mise à jour du contenu`, changeType]
  )

  // Mettre à jour le document
  const result = await db.query(
    `UPDATE knowledge_base
     SET full_text = $1, source_file = $2, is_indexed = false, updated_at = NOW()
     WHERE id = $3 AND is_active = true
     RETURNING *`,
    [fullText, sourceFile, documentId]
  )

  if (result.rows.length === 0) {
    return { success: false, error: 'Erreur lors de la mise à jour' }
  }

  const doc = mapRowToKnowledgeBase(result.rows[0])

  // Ré-indexer si demandé
  let reindexFailed = false
  if (reindex && isSemanticSearchEnabled()) {
    try {
      const indexResult = await indexKnowledgeDocument(documentId)
      if (!indexResult.success) {
        console.error(`Échec ré-indexation document ${documentId}: ${indexResult.error}`)
        reindexFailed = true
      }
    } catch (error) {
      console.error(`Erreur ré-indexation document ${documentId}:`, error)
      reindexFailed = true
    }
  }

  return {
    success: true,
    document: await getKnowledgeDocument(documentId) || doc,
    versionCreated: doc.version,
    reindexFailed,
  }
}

/**
 * Récupère l'historique des versions d'un document
 */
export async function getKnowledgeDocumentVersions(
  documentId: string,
  options?: { limit?: number; offset?: number }
): Promise<KnowledgeBaseVersion[]> {
  const { limit = 20, offset = 0 } = options || {}

  const result = await db.query(
    `SELECT * FROM get_knowledge_base_versions($1, $2, $3)`,
    [documentId, limit, offset]
  )

  return result.rows.map((row) => ({
    id: row.id as string,
    knowledgeBaseId: documentId,
    version: row.version as number,
    title: row.title as string,
    changeType: row.change_type as KnowledgeBaseVersion['changeType'],
    changeReason: row.change_reason as string | null,
    changedBy: row.changed_by as string | null,
    changedByEmail: row.changed_by_email as string | undefined,
    changedAt: new Date(row.changed_at as string),
  }))
}

/**
 * Restaure une version antérieure d'un document
 */
export async function restoreKnowledgeDocumentVersion(
  documentId: string,
  versionId: string,
  restoredBy: string,
  reason?: string
): Promise<{
  success: boolean
  document?: KnowledgeBaseDocument
  error?: string
}> {
  try {
    const result = await db.query(
      `SELECT restore_knowledge_base_version($1, $2, $3, $4) as success`,
      [documentId, versionId, restoredBy, reason || 'Restauration de version']
    )

    if (!result.rows[0]?.success) {
      return { success: false, error: 'Échec de la restauration' }
    }

    const doc = await getKnowledgeDocument(documentId)
    return { success: true, document: doc || undefined }
  } catch (error) {
    console.error('Erreur restauration version:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la restauration',
    }
  }
}
