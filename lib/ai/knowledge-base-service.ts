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
import { detectLanguage } from '@/lib/ai/language-utils'
import { normalizeArticleNumbers, removeDocumentBoilerplate } from '@/lib/ai/text-normalization-service'
import { checkDocumentInclusion } from '@/lib/kb/inclusion-rules'
import { trackDocumentVersion } from '@/lib/kb/document-version-tracker'
import type { Chunk } from './chunking-service'
import { buildPageMapFromText, getPageForPosition } from '@/lib/web-scraper/file-parser-service'
import type { PageMapEntry } from '@/lib/web-scraper/file-parser-service'
import { OCR_CONFIDENCE_WARN_THRESHOLD } from '@/lib/types/citation-locator'
import type { CitationLocator } from '@/lib/types/citation-locator'
import { logger } from '@/lib/logger'

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

  // ✨ QUALITY GATE: Détecter contenu corrompu (PDF mal extrait, encodage cassé)
  // Pour documents arabes : au moins 10% de caractères arabes requis
  // Pour tous documents : max 40% de caractères "bruit" (non-alphanum, non-espace, non-ponctuation arabe/latine)
  if (language === 'ar' || category === 'constitution' || category === 'codes' || category === 'legislation') {
    const arabicChars = (fullText.match(/[\u0600-\u06FF]/g) || []).length
    const arabicRatio = arabicChars / fullText.length
    if (arabicRatio < 0.10) {
      logger.warn(
        `[KB Upload] ⚠️ CORRUPTION GATE: "${title}" — ratio arabe ${(arabicRatio * 100).toFixed(1)}% < 10% ` +
        `(PDF probablement corrompu ou encodage cassé). Extraction annulée.`
      )
      throw new Error(
        `Contenu corrompu détecté : seulement ${(arabicRatio * 100).toFixed(1)}% de caractères arabes ` +
        `(minimum 10% requis pour un document ${language === 'ar' ? 'arabe' : 'juridique'}). ` +
        `Vérifiez l'encodage du PDF ou utilisez une source texte alternative.`
      )
    }
  }

  // Insertion en base
  const result = await db.query(
    `INSERT INTO knowledge_base
     (category, subcategory, language, title, description, metadata, tags, source_file, full_text, uploaded_by, doc_type, rag_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::document_type, true)
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
      getDocumentType(category),
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
    logger.error(`Erreur création version initiale pour ${doc.id}:`, error)
  }

  // Auto-indexation async via queue si demandée et service disponible
  if (autoIndex && isSemanticSearchEnabled()) {
    try {
      // Utiliser la queue async au lieu d'indexer synchroniquement
      const { addToQueue } = await import('./indexing-queue-service')
      await addToQueue('knowledge_base', doc.id, 5, { title: doc.title })
      logger.info(`[KB] Document ${doc.id} ajouté à la queue d'indexation`)
    } catch (error) {
      logger.error(`Erreur ajout queue indexation document ${doc.id}:`, error)
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
 * book_number, section_header, citation_locator, etc. en plus de wordCount/charCount.
 * Rétrocompatible : les chunks existants gardent {wordCount, charCount}.
 *
 * @param chunk - Chunk à indexer
 * @param doc - Ligne knowledge_base depuis la DB
 * @param pageMap - Map des pages construite depuis le full_text (optionnel)
 */
function buildChunkMetadata(
  chunk: Chunk,
  doc: Record<string, unknown>,
  pageMap?: PageMapEntry[]
): Record<string, unknown> {
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
  // chunk_type (ex: 'table' pour les chunks tableaux)
  if ((chunk.metadata as Record<string, unknown>).chunkType) {
    meta.chunk_type = (chunk.metadata as Record<string, unknown>).chunkType
  }
  // Propagation doc-level
  if (doc.language) meta.language = doc.language
  if (doc.category) meta.category = doc.category
  if (doc.source_type) meta.source_type = doc.source_type
  if (doc.source_url) meta.source_url = doc.source_url

  // ── SPRINT 1 : Citation Locator ──
  // Construire citation_locator selon le type de source
  const citationLocator = buildCitationLocator(chunk, doc, pageMap)
  if (citationLocator) {
    meta.citation_locator = citationLocator
  }

  // ── SPRINT 2 : OCR Low Confidence Flag ──
  if (pageMap && pageMap.length > 0) {
    const pageEntry = getPageForPosition(chunk.metadata.startPosition, pageMap)
    if (
      pageEntry?.confidence_ocr !== undefined &&
      pageEntry.confidence_ocr < OCR_CONFIDENCE_WARN_THRESHOLD
    ) {
      meta.ocr_low_confidence = true
      meta.ocr_page_confidence = pageEntry.confidence_ocr
    }
  }

  return meta
}

/**
 * Construit un CitationLocator adapté selon le type de document source.
 * Utilise :
 *  - source_file extension pour détecter PDF/DOCX
 *  - présence de marqueurs "--- Page N ---" dans full_text pour détecter PDF OCR
 *  - source_url pour les pages web
 */
function buildCitationLocator(
  chunk: Chunk,
  doc: Record<string, unknown>,
  pageMap?: PageMapEntry[]
): CitationLocator | null {
  const sourceUrl = doc.source_url as string | undefined
  const sourceFile = doc.source_file as string | undefined

  // Détecter le type de fichier depuis source_file
  const fileExt = sourceFile
    ? sourceFile.toLowerCase().split('.').pop() || ''
    : ''

  // Cas 1 : Page web crawlée (source_url défini, pas de source_file)
  if (sourceUrl && !sourceFile) {
    return { type: 'web', url: sourceUrl }
  }

  // Cas 2 : PDF avec page map (OCR ou texte)
  if (fileExt === 'pdf' || (pageMap && pageMap.length > 0)) {
    if (pageMap && pageMap.length > 0) {
      const pageEntry = getPageForPosition(chunk.metadata.startPosition, pageMap)
      if (pageEntry) {
        if (pageEntry.confidence_ocr !== undefined) {
          // PDF OCR : inclure la confiance OCR
          return {
            type: 'pdf_ocr',
            page: pageEntry.pageNum,
            confidence_ocr: pageEntry.confidence_ocr,
          }
        } else {
          return { type: 'pdf_text', page: pageEntry.pageNum }
        }
      }
    }
    // PDF sans page map : page inconnue
    return { type: 'pdf_text', page: 0 }
  }

  // Cas 3 : DOCX — on ne peut pas déduire le paragraph_index ici
  // (serait disponible si parsé par file-parser-service avec custom handler)
  if (fileExt === 'docx' || fileExt === 'doc') {
    return { type: 'docx', paragraph_index: 0 }
  }

  // Cas 4 : Source URL disponible (web page avec source_file aussi)
  if (sourceUrl) {
    return { type: 'web', url: sourceUrl }
  }

  return null
}

/**
 * Indexe un document de la base de connaissances (génère chunks + embeddings)
 */
export async function indexKnowledgeDocument(
  documentId: string,
  options: {
    strategy?: 'adaptive' | 'article' | 'semantic'
    skipExistingGeminiEmbeddings?: boolean
    skipQualityGate?: boolean
  } = {}
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
  // Seulement si quality_score a déjà été calculé (pas NULL) et est < seuil
  const qualityThreshold = parseInt(process.env.MIN_QUALITY_SCORE_FOR_INDEXING || '40')
  if (!options.skipQualityGate && doc.quality_score !== null && doc.quality_score < qualityThreshold) {
    logger.warn(
      `[KB Index] ⚠️ QUALITY GATE: Doc ${documentId} ("${doc.title?.substring(0, 40)}") ` +
      `bloqué pour indexation - quality_score=${doc.quality_score} < ${qualityThreshold}`
    )
    return {
      success: false,
      chunksCreated: 0,
      error: `Quality gate: score ${doc.quality_score}/100 < ${qualityThreshold} (document de très faible qualité)`,
    }
  }

  // ✨ Corruption gate: Bloquer l'indexation des docs OCR arabes corrompus
  if (!options.skipQualityGate) {
    const { detectOcrCorruption } = await import('@/lib/kb/corruption-detector')
    const corruptionCheck = detectOcrCorruption(doc.full_text)
    if (corruptionCheck.isCorrupted) {
      logger.warn(
        `[KB Index] ⚠️ CORRUPTION GATE: Doc ${documentId} ("${doc.title?.substring(0, 40)}") ` +
        `bloqué — score=${corruptionCheck.score} — ${corruptionCheck.reasons.join('; ')}`
      )
      await db.query(
        `UPDATE knowledge_base SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ quality_flag: 'corrupted_ocr', corruption_score: corruptionCheck.score, corruption_reasons: corruptionCheck.reasons }), documentId]
      ).catch(() => {})
      return {
        success: false,
        chunksCreated: 0,
        error: `Corruption gate: OCR corrompu détecté (score ${corruptionCheck.score}) — ${corruptionCheck.reasons[0] || ''}`,
      }
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
    logger.warn(`[KB Index] ⚠️ INCLUSION GATE: Doc ${documentId} bloqué — ${reason}`)
    // Stocker la raison dans metadata pour monitoring
    await db.query(
      `UPDATE knowledge_base SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('exclusion_reason', $1) WHERE id = $2`,
      [reason, documentId]
    ).catch(() => {})
    return { success: false, chunksCreated: 0, error: `Inclusion gate: ${reason}` }
  }
  if (inclusionCheck.warnings.length > 0) {
    logger.info(`[KB Index] ⚠️ Warnings pour ${documentId}: ${inclusionCheck.warnings.join(', ')}`)
  }

  // ✨ C1: Tracking version si re-indexation (Sprint 3)
  if (doc.is_indexed) {
    trackDocumentVersion(documentId, doc.full_text, 'system').catch(err =>
      logger.error(`[KB Index] Erreur version tracking pour ${documentId}:`, err)
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

  // ── SPRINT 1+2 : Construire le page map APRÈS normalisation
  // Les marqueurs "--- Page N ---" survivent à la normalisation (texte anglais)
  // Les positions dans le page map correspondent aux positions des chunks (dans textToChunk)
  const pageMap = buildPageMapFromText(textToChunk)

  // ✨ OPTIMISATION Phase 2.3 : Chunking adaptatif par catégorie
  const category = (doc.category as KnowledgeCategory) || 'autre'
  const chunkConfig = getChunkConfig(category)

  // ✨ PHASE 3: Déterminer stratégie de chunking
  const strategy = options.strategy ||
    (['codes', 'legislation', 'constitution'].includes(category) ? 'article' : 'adaptive')

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
      logger.info(`[KB Index] Semantic chunking: ${chunks.length} chunks (catégorie=${category})`)
    } catch (error) {
      logger.error('[KB Index] Semantic chunking failed, fallback classique:', error instanceof Error ? error.message : error)
      chunks = chunkText(textToChunk, chunkingOptions)
    }
  } else {
    chunks = chunkText(textToChunk, chunkingOptions)
  }

  logger.info(
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

  // Générer les embeddings en parallèle pour OpenAI + Ollama (Gemini supprimé — coût €44/mois)
  // En TURBO mode (OpenAI batch rapide), skip Ollama pour éviter blocage (backfill séparé)
  const isTurboMode = process.env.EMBEDDING_TURBO_MODE === 'true'
  const [embeddingsResult, ollamaEmbeddingsResult] = await Promise.allSettled([
    generateEmbeddingsBatch(chunks.map((c) => c.content)),
    isTurboMode
      ? Promise.reject(new Error('TURBO mode - Ollama skippé (backfill séparé)'))
      : generateEmbeddingsBatch(chunks.map((c) => c.content), { forceOllama: true }),
  ])

  if (embeddingsResult.status === 'rejected') {
    throw new Error(`Échec génération embeddings primaires: ${embeddingsResult.reason}`)
  }
  const primaryEmbeddings = embeddingsResult.value

  // Déterminer la colonne d'embedding selon le provider utilisé
  const embeddingColumn = primaryEmbeddings.provider === 'openai' ? 'embedding_openai' : 'embedding'
  logger.info(`[KB Index] Provider embeddings: ${primaryEmbeddings.provider} → colonne ${embeddingColumn}`)

  if (ollamaEmbeddingsResult.status === 'rejected') {
    logger.warn(`[KB Index] Embeddings Ollama non disponibles: ${ollamaEmbeddingsResult.reason?.message || 'erreur inconnue'}`)
  }
  const hasOllamaEmbeddings = ollamaEmbeddingsResult.status === 'fulfilled' && ollamaEmbeddingsResult.value.embeddings.length > 0
  if (hasOllamaEmbeddings) {
    logger.info(`[KB Index] Embeddings Ollama générés (768-dim nomic) pour ${ollamaEmbeddingsResult.value.embeddings.length} chunks`)
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

        const chunkMeta = JSON.stringify(buildChunkMetadata(batchChunks[i], doc, pageMap))

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

      await client.query(
        `INSERT INTO knowledge_base_chunks (knowledge_base_id, chunk_index, content, ${embeddingColumn}, metadata) VALUES ${placeholders.join(', ')}`,
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
          `UPDATE knowledge_base_chunks kbc SET embedding = batch.vec::vector(768)
           FROM unnest($1::int[], $2::text[]) AS batch(idx, vec)
           WHERE kbc.knowledge_base_id = $3 AND kbc.chunk_index = batch.idx`,
          [indices, vectors, documentId]
        )
        logger.info(`[KB Index] Embeddings Ollama écrits pour ${indices.length} chunks (batch)`)
      }
    }

    // Mettre à jour le document — knowledge_base.embedding est vector(768) nomic-embed-text (Ollama uniquement)
    // Si embedding généré par OpenAI (1536-dim), on ne l'écrit pas dans cette colonne
    const isOllamaEmbedding = docEmbeddingResult.embedding.length === 768
    if (isOllamaEmbedding) {
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
    } else {
      await client.query(
        `UPDATE knowledge_base
         SET is_indexed = true, chunk_count = $1, chunking_strategy = $2, updated_at = NOW()
         WHERE id = $3`,
        [chunks.length, strategy, documentId]
      )
    }

    await client.query('COMMIT')

    // Assigner un quality_score heuristique si le doc n'en a pas encore
    // (sans LLM — évite d'avoir pct_has_quality=0% dans l'audit de santé KB)
    if (doc.quality_score === null || doc.quality_score === undefined) {
      const contentLength = (doc.full_text as string).length
      const chunkCount = chunks.length
      const hasTitle = Boolean(doc.title && (doc.title as string).length > 5)
      let heuristicScore = 50 // baseline
      if (chunkCount >= 1) heuristicScore += 10
      if (chunkCount >= 5) heuristicScore += 10
      if (chunkCount >= 10) heuristicScore += 5
      if (contentLength > 500) heuristicScore += 10
      if (contentLength > 2000) heuristicScore += 5
      if (hasTitle) heuristicScore += 10
      if (contentLength < 100) heuristicScore = 20
      else if (contentLength < 200) heuristicScore = 35
      heuristicScore = Math.max(0, Math.min(100, heuristicScore))
      await db.query(
        `UPDATE knowledge_base
         SET quality_score = $1, quality_llm_provider = 'heuristic', quality_llm_model = 'rule-based',
             quality_assessed_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND quality_score IS NULL`,
        [heuristicScore, documentId]
      ).catch((err) => logger.error('[KB Index] Erreur assignation quality_score heuristique:', err))
    }

    // Sync web_pages.chunks_count si la page est liée (évite le compteur stale)
    await db.query(
      `UPDATE web_pages SET chunks_count = $2, updated_at = NOW()
       WHERE knowledge_base_id = $1 AND chunks_count IS DISTINCT FROM $2`,
      [documentId, chunks.length]
    ).catch((err) => logger.error('[KB Index] Erreur sync chunks_count web_pages:', err))

    // Invalider le cache des documents similaires
    await onKnowledgeDocumentChange(documentId, 'index')

    // Ajouter les jobs d'analyse qualité et détection doublons à la queue
    try {
      const { addToQueue } = await import('./indexing-queue-service')
      await addToQueue('kb_quality_analysis', documentId, 3)
      await addToQueue('kb_duplicate_check', documentId, 2)
    } catch (queueError) {
      logger.error('[KnowledgeBase] Erreur ajout jobs qualité/doublons:', queueError)
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
    `SELECT kb.id, kb.title, kb.category, kb.quality_score
     FROM knowledge_base kb
     WHERE kb.is_indexed = false AND kb.full_text IS NOT NULL
     AND (kb.last_index_error IS NULL OR kb.last_index_attempt_at < NOW() - INTERVAL '1 hour')
     -- Exclure les docs dont la source web a rag_enabled=false
     AND NOT EXISTS (
       SELECT 1 FROM web_pages wp
       JOIN web_sources ws ON wp.web_source_id = ws.id
       WHERE wp.knowledge_base_id = kb.id
         AND ws.rag_enabled = false
     )
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
// BACKFILL OLLAMA EMBEDDINGS
// =============================================================================

/**
 * Génère les embeddings Ollama manquants sur des chunks déjà indexés.
 * Appelé automatiquement après chaque run d'indexation (index-kb cron).
 * Traite 100 chunks max par appel pour limiter la durée.
 */
export async function backfillOllamaEmbeddings(limit = 100): Promise<{
  backfilled: number
  failed: number
  remaining: number
}> {
  const { generateEmbeddingsBatch, formatEmbeddingForPostgres } = await getEmbeddingsService()

  const chunksResult = await db.query(
    `SELECT kbc.id, kbc.content
     FROM knowledge_base_chunks kbc
     JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
     WHERE kbc.embedding IS NULL
       AND kb.is_indexed = true
       AND kb.rag_enabled = true
     ORDER BY kb.created_at DESC
     LIMIT $1`,
    [limit]
  )

  if (chunksResult.rows.length === 0) {
    const remaining = await db.query(
      `SELECT COUNT(*) as count FROM knowledge_base_chunks kbc
       JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
       WHERE kbc.embedding IS NULL AND kb.is_indexed = true AND kb.rag_enabled = true`
    )
    return { backfilled: 0, failed: 0, remaining: parseInt(remaining.rows[0].count) }
  }

  const chunks = chunksResult.rows as { id: string; content: string }[]
  let backfilled = 0
  let failed = 0

  // Traiter par sous-batches de 20 pour éviter timeout Ollama
  const SUB_BATCH = 20
  for (let i = 0; i < chunks.length; i += SUB_BATCH) {
    const sub = chunks.slice(i, i + SUB_BATCH)
    try {
      const result = await generateEmbeddingsBatch(sub.map(c => c.content), { forceOllama: true })
      const ids: string[] = []
      const vectors: string[] = []
      for (let j = 0; j < sub.length; j++) {
        if (result.embeddings[j] && result.embeddings[j].length === 768) {
          ids.push(sub[j].id)
          vectors.push(formatEmbeddingForPostgres(result.embeddings[j]))
        }
      }
      if (ids.length > 0) {
        await db.query(
          `UPDATE knowledge_base_chunks kbc
           SET embedding = batch.vec::vector(768)
           FROM unnest($1::uuid[], $2::text[]) AS batch(chunk_id, vec)
           WHERE kbc.id = batch.chunk_id`,
          [ids, vectors]
        )
        backfilled += ids.length
      }
      failed += sub.length - ids.length
    } catch {
      failed += sub.length
      logger.warn(`[Backfill] Ollama indisponible pour sous-batch ${i}-${i + SUB_BATCH}`)
      break
    }
  }

  const remainingResult = await db.query(
    `SELECT COUNT(*) as count FROM knowledge_base_chunks kbc
     JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
     WHERE kbc.embedding IS NULL AND kb.is_indexed = true AND kb.rag_enabled = true`
  )

  return { backfilled, failed, remaining: parseInt(remainingResult.rows[0].count) }
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
// IMPLICIT ARTICLE MAPS — constantes module (RegExp compilés une seule fois)
// =============================================================================

/** COC (مجلة الالتزامات والعقود) — v19 max 8 articles */
const COC_IMPLICIT_ARTICLE_MAP: Array<[RegExp, number[]]> = [
  // Formation du contrat (AR + FR)
  // Fix v14: "شروط.*عقد" trop large → matchait "شروط فسخ" → exiger "صحة" OU "أركان"
  [/شروط.*صح[ةه]|صح[ةه].*عقد|أركان.*عقد|validit.*contrat|condition.*contrat|contrat.*valid/i, [2, 23, 119]],
  // Prescription / التقادم (AR + FR) — FIX civil_easy_01, ar_civil_02 (R@5=0)
  // v15: +401 (حساب المدة) +408 (آجال راتبة)
  [/تقادم|تعمير.*ذمة|آجال.*تقادم|prescription.*civil|délai.*prescription|prescription.*droit commun/i, [401, 402, 403, 408]],
  // Preuve / Proof (AR uniquement — termes FR déjà dans BM25 expansion)
  [/إثبات.*الالتزام|إثبات.*حق|الإثبات.*مدني/, [443, 401]],
  // Préjudice moral (AR + FR)
  [/ضرر.*معنوي|الضرر.*معنوي|تعويض.*معنوي|préjudice.*moral|dommage.*moral/i, [82, 83]],
  // Résolution du contrat (AR + FR)
  // v15: +44 (جهل) +51 (إكراه) | v17: +61 (غبن) +346 (فسخ جزئي)
  [/فسخ.*عقد|انفساخ.*عقد|résiliation.*contrat|résolution.*contrat/i, [44, 51, 61, 273, 274, 330, 346]],
  // Nullité (AR + FR)
  // v15: +64 (استحالة موضوع) +119 (شرط باطل)
  [/بطلان.*مطلق|بطلان.*نسبي|بطلان.*عقد|nullité.*contrat|nullité.*absol|nullité.*relat/i, [64, 119, 325, 327]],
  // Extinction des obligations (FR + AR) — FIX fr_civil_01 (R@5=0, retrieval cross-langue)
  // v17: pattern FR pour injecter Fsl 339(انقضاء)/340(أداء)/345(تعذر)/351(إبراء)/359(تجديد)/370(مقاصة)
  [/extinction.*obligation|modes.*extinction|انقضاء.*الالتزام|تنقضي.*الالتزام/i, [339, 340, 345, 351, 359, 370]],
]

/** PENAL (المجلة الجزائية) — v16 max 6 articles */
const PENAL_IMPLICIT_ARTICLE_MAP: Array<[RegExp, number[]]> = [
  // Légitime défense (AR + FR) — dossiers جرائم الشخص
  [/دفاع.*شرع|شرع.*دفاع|شروط.*دفاع|حالة.*دفاع|الدفاع الشرعي|légitime défense|défense.*légitime/i, [39, 40, 41]],
  // Homicide intentionnel (AR + FR)
  [/قتل.*عمد|اغتيال|القتل العمد|homicide.*volont|meurtre.*intentionnel/i, [201, 202, 203, 204, 205]],
  // Coup mortel sans intention / ضرب أفضى إلى موت (AR + FR)
  // Art 207: "من أحدث ضربا أو جرحا أفضى إلى الموت دون قصد إحداثه"
  [/ضرب.*أفضى.*موت|جرح.*أفضى.*موت|قتل.*دون.*قصد|coups.*mort sans intention|blessures.*mort/i, [207, 218]],
  // Voies de fait / Agression physique (AR + FR)
  [/الاعتداء.*جسدي|ضرب.*وجرح|الإيذاء.*الجسدي|coups.*blessures|voies de fait/i, [218, 219, 220, 221]],
  // Vol qualifié — volontairement plus large (الفصل 233+ = vol simple, 240+ = vol aggravé)
  [/سرقة|جريمة.*سرقة|vol.*aggrav|vol.*qualifié/i, [233, 234, 235, 240]],
  // Faux et usage de faux
  [/تزوير|تزييف.*وثيق|faux.*document|faux.*acte/i, [172, 173, 174]],
  // Corruption / Rshwa
  [/رشوة|اختلاس.*مال|corruption|détournement.*fonds/i, [83, 84, 85]],
]

/** MCO (المجلة التجارية) — max 6 articles */
const MCO_IMPLICIT_ARTICLE_MAP: Array<[RegExp, number[]]> = [
  // Art.2: définition du commerçant — احتراف + habitude + nom propre
  [/تاجر|من.*يُعدّ.*تاجر|تعريف.*تاجر|هل.*تاجر|احتراف.*تجار|يحترف.*تجار/, [2, 3]],
  // Art.2-6: actes de commerce par nature (بيع، شراء، مقاولة، بنك...)
  [/أعمال تجارية|الأعمال التجارية|أعمال.*بطبيعتها/, [2, 3, 4, 5, 6]],
  // Art.9: capacité d'exercer le commerce
  [/أهلية.*تجارية|أهلية.*احتراف|قاصر.*تجارة/, [9, 10]],
  // Art.214+: conditions de validité du chèque
  [/شيك|شروط.*شيك|صحة.*شيك|عناصر.*شيك/, [214, 215, 216, 217, 218]],
  // Art.432+: faillite — conditions + effets
  [/إفلاس|شهر.*إفلاس|شروط.*إفلاس|توقف.*دفع/, [432, 433, 434, 435]],
  // Art.452+: concordat / taysira qadha'iya
  [/تسوية.*قضائية|الصلح.*الواقي/, [452, 453, 454]],
]

/** PSC (مجلة الأحوال الشخصية) — max 6 articles
 * Numéros vérifiés en prod Mar 3 2026 via audit SQL direct sur knowledge_base_chunks
 */
const PSC_IMPLICIT_ARTICLE_MAP: Array<[RegExp, number[]]> = [
  // Fsl 5: conditions mariage + âge minimum 18 ans (AR + FR)
  [/سن.*زواج|سن.*الزواج|الحد الأدنى.*سن|âge.*mariage|mariage.*mineur|capacité.*mariage/i, [5]],
  // Fsl 38-39-42: nafaqa épouse (obligation alimentaire du mari) — vérifié prod
  // Fsl 38 = "يجب علي الزوج ان ينفق علي زوجته", Fsl 39 = insolvabilité, Fsl 42 = imprescriptible
  [/نفقة.*زوج|نفقة الزوجة|نفقة.*الزوج|واجب النفقة|obligation.*alimentaire|aliment.*épou|devoir.*entretien/i, [38, 39, 42]],
  // Fsl 31-32: divorce (causes + procédure) — vérifié prod
  // Fsl 31 = "يحكم بالطلاق: 1-تراضي 2-ضرر 3-رغبة", Fsl 32 = procédure juge famille
  [/طلاق.*قضائي|التطليق|طلاق للضرر|التفريق للضرر|divorce.*judiciaire|divorce.*tort|divorce.*préjudice/i, [31, 32]],
  // Fsl 31: divorce par consentement mutuel (AR + FR)
  [/طلاق.*تراضي|التراضي.*طلاق|الطلاق بالتراضي|divorce.*consentement|consentement.*mutuel/i, [31]],
  // Fsl 56-63-67: hadana (garde enfant) — vérifié prod
  // Fsl 56 = frais/logement, Fsl 63 = procédure juge, Fsl 67 = après décès parent
  [/حضانة|شروط.*حضانة|الحضانة.*الأم|الحضانة.*الأب|garde.*enfant|droit.*garde|attribution.*garde/i, [56, 63, 67]],
]

/**
 * Cache module-level pour les résultats de pattern matching implicit article maps.
 * Clé: queryText (normalisé), valeur: Set de clés "artNum:titleFrag" matchées.
 * LRU simple (max 50 entrées — une query juridique = ~200 chars, 50 × ~300B = ~15KB).
 */
const _implicitArticleMatchCache = new Map<string, Set<string>>()

/** Regex PSC détection (extraite pour éviter bug SWC avec long regex arabique inline) */
const PSC_CODE_RE =
  /مجلة الأحوال الشخصية|الأحوال الشخصية|طلاق للضرر|التفريق للضرر|حضانة|نقل الحضانة|شروط الحضانة|الحضانة|نفقة.*زوج|نفقة الزوجة|نفقة.*الزوج|نفقة.*أبناء|نفقة.*أطفال|واجب النفقة|تعدد.*زوج|زوجات.*متعدد|الجمع بين زوج|سن.*الزواج|السن.*للزواج|الزواج.*سن|الحد.*للزواج|الطلاق.*تراضي|طلاق.*تراضي|الطلاق.*قضائي|واجبات.*الزوج|واجبات الزوجين|حقوق.*الزوجين|التبني|الكفالة.*طفل|كفالة.*قاصر|الوصية|شروط الوصية|صحة الوصية|اللقب.*العائلي|لقب.*طفل|لقب.*الأبناء|الميراث.*زوج|الميراث.*زوجة|حقوق.*الميراث|حقوق.*المرأة.*ميراث|ميراث.*المرأة|الإرث.*أسرة|divorce|mariage.*tunisien|tunisien.*mariage|garde.*enfant|droit.*visite|pension.*alimentaire|obligation.*alimentaire.*épou|kafala|recueil.*légal|empêchement.*mariage|régime.*successoral.*tunisien/i
const _IMPLICIT_CACHE_MAX = 50

function _evictImplicitCacheIfFull(): void {
  if (_implicitArticleMatchCache.size >= _IMPLICIT_CACHE_MAX) {
    // Supprimer la première entrée (la plus ancienne — Map maintient l'ordre d'insertion)
    const firstKey = _implicitArticleMatchCache.keys().next().value
    if (firstKey !== undefined) _implicitArticleMatchCache.delete(firstKey)
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
    logger.info('[KB Search] ❌ Recherche sémantique DÉSACTIVÉE - isSemanticSearchEnabled()=false')
    logger.info('[KB Search] Debug config:', {
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
  logger.info(`[KB Search] Provider: ${queryEmbedding.provider}, dimensions: ${queryEmbedding.embedding.length}`)

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
  language: 'ar' | 'fr' | 'simple' = 'simple',
): Promise<KnowledgeBaseSearchResult[]> {
  const result = await db.query(
    `SELECT * FROM search_knowledge_base_hybrid($1::text, $2::vector, $3::text, $4::text, $5::integer, $6::double precision, $7::text, $8::text)`,
    [queryText, embeddingStr, category, docType, limit, threshold, provider, language]
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
 * Détecte le fragment de titre du code juridique cible pour les queries arabes.
 * Utilisé dans codes-forced pour appliquer bm25EffSim boost UNIQUEMENT au code pertinent.
 *
 * Fix Feb 26 v6: résout l'inflation BM25 (accord_et_ses_annexe, IRPP) → tous à 1.0.
 * En détectant le code cible, le boost fort (bm25EffSim × CODE_PRIORITY_BOOST) est réservé
 * aux chunks de ce code, tandis que les autres codes n'ont qu'un boost vecSim × boost.
 */
function getTargetCodeTitleFragment(queryText: string, lang: string): string | null {
  // Fix Feb 26 v10c: Fonctionne sur TOUT texte, y.c. queries FR enrichies avec synonymes arabes.
  // ORDRE CRITIQUE: CPP > Pénal > Travail > Famille > Immobilier > Fiscal > Commercial > Procédure > COC
  // (évite collisions : ex "طرد" → Travail avant Famille, "contrat" → COC en dernier)

  // CPP: REQUIERT الإجراءات OU synonymes CPP spécifiques (≠ المجلة الجزائية = Pénal seul)
  if (/الإجراءات الجزائية|اجراءات جزائية|الدعوى العمومية|الدعوى الجزائية|التتبع الجزائي|النيابة العمومية/.test(queryText)) {
    return 'مجلة الإجراءات الجزائية'
  }
  // Penal Code — المجلة الجزائية ou termes pénaux distinctifs
  if (/المجلة الجزائية|الجريمة|عقوبة|جنحة|سرقة|قتل|الجنائي|دفاع.*شرع|شرع.*دفاع|الدفاع الشرعي|أنواع العقوبات|الإيقاف التحفظي|الإفراج الشرطي|جريمة التحيل|خيانة الأمانة|المسؤولية الجزائية|irresponsabilité.*pénale|récidive.*pénal|pénal.*récidive|sursis.*pénal|pénal.*sursis|complicité.*pénale|prescription.*pénale|prescription.*action publique|infraction.*informatique|majorité pénale|âge pénal|causes.*irresponsabilité/.test(queryText)) {
    return 'المجلة الجزائية'
  }
  // Labor — مجلة الشغل (AR + FR étendu)
  if (/مجلة الشغل|عقد الشغل|صاحب العمل|رب العمل|الأجير|الطرد التعسفي|التشغيل|عمل إضافي|حوادث الشغل|المرض المهني|أجر أدنى|فترة التجربة|مفتشية الشغل|إضراب|تحرش معنوي|مدة العمل.*أسبوعية|ساعات العمل|الطرد التأديبي|طرد.*أسباب اقتصادية|حقوق العامل|العامل.*حقوق|حقوق المرأة.*عامل|إجازة.*مدفوعة|العمل الإضافي|licenciement|indemnité.*licenciement|contrat.*travail|durée.*travail|durée.*hebdomadaire|congé annuel|congé.*payé|SMIG|salaire.*minimum|période.*essai|inspection.*travail|accident.*travail|travail.*intérimaire|clause.*non-concurrence|conflit.*collectif|règlement.*intérieur|faute grave.*travail|protection.*maternité|femme.*enceinte.*travail|droits.*salarié|salariée.*enceinte/.test(queryText)) {
    return 'مجلة الشغل'
  }
  // Family (Personal Status Code) — patterns bilingues AR + FR
  // ORDRE: après Pénal/Travail pour éviter collision
  if (PSC_CODE_RE.test(queryText)) {
    return 'مجلة الأحوال الشخصية'
  }
  // Real Property — مجلة الحقوق العينية (avant Commercial pour éviter "baux commerciaux" → Commercial)
  if (/الرسم العقاري|تسجيل.*عقار|العقارات|الشفعة|حقوق عينية|الحقوق العينية|الحيازة المكسبة|حق الانتفاع|الارتفاق|عقد الكراء|المستأجر|الايجار.*عقار|الكراء.*سكني|الكراء.*تجاري|copropriété|servitude|immatriculation foncière|hypothèque|bail.*habitation|bail.*commercial|vente.*immeuble.*constru|expropriation|saisie.*immobilière|droit.*immobilier|propriété.*foncière|registre.*foncier|عقد.*بيع.*عقار|شروط.*بيع.*عقار|حقوق المستأجر|طرد.*مستأجر|expulsion.*locataire|fin.*bail|vente.*immobilière|conflits.*propriétaires.*immeu|شروط.*الكراء/.test(queryText)) {
    return 'مجلة الحقوق العينية'
  }
  // Customs Code — مجلة الديوانة (avant Fiscal/COC pour éviter collision avec الجباية)
  if (/مجلة الديوانة|الديوانة|douane|droit douanier|droits de douane|جمارك|معلوم ديواني|المعلوم الديواني|إجراءات جمركية|التهريب الجمركي/.test(queryText)) {
    return 'مجلة الديوانة'
  }
  // Fiscal — المجلة الجبائية (avant COC pour éviter "prescription civile" collision)
  if (/TVA|IRPP|impôt.*société|impôt.*sociétés|retenue.*source|prescription.*fiscal|tranche.*imposition|contribuable|déclaration.*fiscale|ضريبة على الشركات|ضريبة على الدخل|معدل الضريبة|الجباية|المجلة الجبائية|التهرب الضريبي/.test(queryText)) {
    return 'المجلة الجبائية'
  }
  // Commercial (MCO) — المجلة التجارية (avant COC pour éviter collision "عقد tجاري")
  if (/المجلة التجارية|يُعدّ تاجراً|من.*يُعدّ.*تاجر|تعريف.*تاجر|هل.*تاجر|الأعمال التجارية بطبيعتها|أعمال تجارية بطبيعتها|احتراف.*تجاري|شهر.*إفلاس|التسوية القضائية|إفلاس.*تاجر|تاجر.*إفلاس|الكمبيالة|سند.*أمر|الشركات التجارية|رأس المال.*شركة|تسجيل.*شركة|مسؤولية.*الشريك|دفاتر التجارية|مسؤولية المسير|الشركة ذات المسؤولية|اكتساب صفة التاجر|حل الشركة|حقوق الدائنين.*إفلاس|SARL|registre.*commerce|actes.*commerce.*nature|lettre.*change|fonds.*commerce|redressement judiciaire|responsabilité.*dirigeant.*socié|transports.*commerciaux|obligations.*commerçant|livres.*comptables.*commerçant|transports.*marchandise.*commercial|arbitrage.*commercial.*international|qualifié.*commerçant|conditions.*commerçant/.test(queryText)) {
    return 'المجلة التجارية'
  }
  // Procedure civile — مجلة المرافعات المدنية والتجارية
  if (/اختصاصات.*محكمة|درجات التقاضي|رفع دعوى|آجال الاستئناف|شروط.*الدعوى|التنفيذ الجبري|الطعن بالتعقيب|رد القاضي|compétence.*juge.*cantonal|procédure.*référé|voies.*recours.*ordinaires|aide juridictionnelle|tierce opposition|motivation.*arrêt|compétence.*territoriale.*tribunal|effets.*appel|récusation.*juge|procédure.*civile|référé.*civil|pourvoi.*cassation|recours.*cassation|Cour.*cassation.*civile|cassation.*matière civile|contrôle.*motivation.*arrêt/.test(queryText)) {
    return 'مجلة المرافعات المدنية والتجارية'
  }
  // Civil obligations (COC) — التقادم + tعمير الذمة → art.402
  if (/العقد|الالتزامات|البطلان|الفسخ|الضمان|التقادم|المسؤولية التقصيرية|المسؤولية المدنية|مجلة الالتزامات|أركان العقد|الرضا|الإيجاب والقبول|تعمير الذمة|شروط.*صحة|صحة.*العقد|إثبات.*التزام|وسائل الإثبات|التعويض.*ضرر|ضرر معنوي|حوادث المرور|الكفالة.*مدني|الإثراء.*سبب|المقاصة.*مدني|subrogation|مسؤولية.*أشياء|القوة القاهرة|الإعذار/.test(queryText)) {
    return 'مجلة الالتزامات'
  }
  // Fix Feb 26 v13 (étendu): Queries FR ciblant le COC tunisien
  if (/validit.*contrat|conditions.*contrat|COC tunisien|obligat.*tunisien|résolution.*contrat|nullit.*contrat|garantie.*contrat|preuve.*obligat|prescription.*civil|prescription extinctive|prescription acquisitive|extinction.*obligation|responsabilité.*fait.*choses|responsabilité contractuelle|responsabilité délictuelle|mise en demeure|cautionnement|abus.*droit|enrichissement.*sans cause|théorie.*imprévision|article 243.*COC|dommages.*intérêts.*243|subrogation|compensation.*civil|تنازع.*القوانين.*عقود|العقود.*الدولية|force majeure.*exonération/.test(queryText)) {
    return 'مجلة الالتزامات'
  }
  return null
}

/**
 * Recherche textuelle directe d'un article de code par numéro exact.
 * Fix Feb 26 v8: pour les queries "ماذا ينص الفصل X من مجلة Y",
 * garantit que le chunk de l'article est dans le pool même si sim vectorielle < threshold.
 * Utilise ILIKE pour trouver "الفصل X " (espace après = no false-positive sur الفصل X0).
 */
export async function searchArticleByTextMatch(
  artNum: string,
  targetCodeFragment: string | null,
  categories: string[] = ['codes']
): Promise<KnowledgeBaseSearchResult[]> {
  try {
    // Fix Feb 26 v10: PostgreSQL regex ~ pour gérer "الفصل 23-2" (tiret) sans false-positive "الفصل 230"
    // "الفصل X" suivi d'un caractère non-chiffre (espace, tiret, newline, fin de chaîne)
    // Fix Mar 3 2026 (hamza ordinals): les ordinaux arabes sont normalisés côté query (الأول→الاول)
    // mais le DB peut stocker la forme avec hamza (الأول). Générer un regex qui accepte les deux.
    // Ex: "الاول" → "ال[اأإآ]ول" pour matcher الأول/الاول/الإول/الآول indifféremment.
    // Fix Mar 3 2026: remplacer /ا/g → /[اأإآ]/g pour couvrir tous les variants alef (sans casser
    // les ordinaux comme "الثاني" → l'ancien /ا/g remplaçait TOUS les ا dont ceux non-hamza).
    const artNumRegex = /^\d+$/.test(artNum)
      ? artNum
      : artNum.replace(/[اأإآ]/g, '[اأإآ]')
    const artRegex = `الفصل ${artNumRegex}([^0-9]|$)`
    let sql: string
    let params: (string | string[])[]

    if (targetCodeFragment) {
      // Fix Mar 5 2026: DISTINCT ON (kb_id, chunk_index) pour éviter les doublons de chunks.
      // length > 100 : filtre les chunks-en-tête vides (ex: "الفصل 1" sans contenu).
      // ORDER BY doit commencer par les colonnes DISTINCT ON (PostgreSQL exigence).
      sql = `
        SELECT DISTINCT ON (kbc.knowledge_base_id, kbc.chunk_index)
          kbc.id as chunk_id,
          kbc.content as chunk_content,
          kbc.chunk_index,
          kbc.knowledge_base_id,
          kbc.metadata,
          kb.title,
          kb.category
        FROM knowledge_base_chunks kbc
        JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
        WHERE kb.is_indexed = true
          AND kb.category = ANY($1::text[])
          AND kbc.content ~ $2
          AND kb.title ILIKE $3
          AND length(kbc.content) > 100
        ORDER BY kbc.knowledge_base_id, kbc.chunk_index
        LIMIT 3`
      params = [categories, artRegex, `%${targetCodeFragment}%`]
    } else {
      sql = `
        SELECT DISTINCT ON (kbc.knowledge_base_id, kbc.chunk_index)
          kbc.id as chunk_id,
          kbc.content as chunk_content,
          kbc.chunk_index,
          kbc.knowledge_base_id,
          kbc.metadata,
          kb.title,
          kb.category
        FROM knowledge_base_chunks kbc
        JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
        WHERE kb.is_indexed = true
          AND kb.category = ANY($1::text[])
          AND kbc.content ~ $2
          AND length(kbc.content) > 100
        ORDER BY kbc.knowledge_base_id, kbc.chunk_index
        LIMIT 3`
      params = [categories, artRegex]
    }

    const result = await db.query(sql, params)

    return result.rows.map((row) => ({
      knowledgeBaseId: row.knowledge_base_id,
      chunkId: row.chunk_id,
      title: row.title,
      category: row.category as KnowledgeBaseCategory,
      chunkContent: row.chunk_content,
      chunkIndex: row.chunk_index || 0,
      similarity: 0.75, // Score élevé: match textuel exact > vectoriel sémantique
      metadata: {
        ...(row.metadata || {}),
        searchType: 'article_text_match',
      },
    }))
  } catch (err) {
    logger.warn(`[KB article-text] Erreur pour الفصل ${artNum}:`, err)
    return []
  }
}

/**
 * Construit une OR-query BM25 pour un texte de query arabe en ajoutant
 * les équivalents classiques (COC/Tunisien) des termes juridiques modernes.
 *
 * Fix Feb 26 v11: résout le gap vocabulaire classique ↔ moderne
 * - "شروط صحة العقد" (moderne) → "أركان" (COC Fsl 2)
 * - "التقادم" (moderne) → "تعمير" (COC Fsl 402)
 * - "البطلان" (moderne) → "باطل" (COC Fsl 325)
 * etc.
 *
 * Retourne une string formatée pour `websearch_to_tsquery('simple', ...)` avec OR.
 */
function buildClassicalArabicBM25OR(queryText: string): string {
  // Mapping moderne → classique pour les concepts COC
  const CLASSICAL_EXPANSION: Array<[RegExp, string[]]> = [
    [/شروط|صح[ةه]|أركان/, ['أركان', 'أهلية', 'التراضي', 'رضاء']],
    [/عقد|تعاقد|إيجاب|قبول/, ['أركان', 'رضاء', 'أهلية']],
    [/تقادم|مرور.*زمن|انقضاء.*مد[ةه]/, ['تعمير', 'تسمع']],
    [/بطلان|باطل|إبطال/, ['باطل', 'تبطل', 'بطلان']],
    [/فسخ|انفسخ|انحلال.*عقد/, ['فسخ', 'انفسخ']],
    [/ضمان|ضامن/, ['ضمان', 'ضامن']],
    [/اثراء.*بلا.*سبب|إثراء/, ['الاثراء', 'العين']],
    [/مسؤولية.*عقدية|الالتزام.*عقدي/, ['يرتب', 'التزام', 'تعمير']],
    // Fix Feb 26: المسؤولية التقصيرية (tort) → termes classiques COC art.82/83
    // "من تسبب في ضرر غيره" (art.82) et "من تسبب في مضرة غيره خطأ" (art.83)
    [/مسؤولية.*تقصير|تقصيرية|تسبب.*ضرر|responsabilit.*chose|responsabilit.*fait/, ['تسبب', 'ضرر', 'خطأ', 'جبر']],
    // Fix Feb 26: الضرر المعنوي (moral damage) → termes jurisprudence + COC
    [/ضرر.*معنوي|تعويض.*معنوي|préjudice.*moral/, ['معنوي', 'ضرر', 'جبر', 'تعويض']],
    // Fix Feb 26: conditions validité contrat FR → terms COC art.2
    [/validit.*contrat|conditions.*contrat|COC tunisien/, ['أركان', 'أهلية', 'التراضي', 'رضاء']],
    // Fix Feb 26 v13: إثبات الالتزامات → COC Fsl 443 (types de preuves admissibles)
    [/إثبات.*التزام|إثبات.*عقد|وسائل الإثبات|الإثبات.*مدني/, ['إثبات', 'الكتابة', 'الشهود', 'القرينة', 'اليمين']],
    // Fix Feb 26 v13: البطلان المطلق / البطلان النسبي → Fsl 325 + قابل للإبطال
    [/بطلان.*مطلق|البطلان المطلق/, ['باطل', 'اصله', 'الباطل من اصله']],
    [/بطلان.*نسبي|البطلان النسبي/, ['إبطال', 'القيام', 'الإبطال', 'يجوز القيام']],
    // MCO: تاجر + أعمال تجارية (المجلة التجارية Art.2-6)
    [/تاجر|احتراف.*تجارة|أعمال تجارية|يحترف.*تجارة/, ['يحترف', 'أعمال', 'تجارية', 'احتراف', 'بصفة']],
    [/إفلاس|توقف.*دفع|تسوية.*قضائية/, ['إفلاس', 'توقف', 'الدفع', 'التسوية', 'المفلس']],
    [/شيك|صرف.*شيك|الشيك/, ['الشيك', 'الساحب', 'المسحوب', 'للأمر']],
    // Fix v16: المجلة الجزائية — vocabulaire classique pour BM25 OR
    // Fsl 39: "لا جريمة على من دفع صائلا عرض حياته" (الدفاع الشرعي)
    [/الدفاع الشرعي|دفع الصائل|دفع.*صائل/, ['صائل', 'لا جريمة', 'الخطر', 'الضرورة']],
    // Fsl 201: "يُعدّ قاتلاً عمداً..." — termes classiques المجلة الجزائية
    [/القتل.*عمد|جريمة.*القتل|قتل.*نفس/, ['قاتل', 'يقتل', 'أزهق', 'نيّة']],
    // Fsl 207: "ضرب أو جرح أفضى إلى الموت دون قصد إحداثه"
    [/ضرب.*أفضى.*موت|جرح.*بدون.*قتل|تجاوز.*الدفاع/, ['أفضى', 'الموت', 'الضرب', 'التناسب']],
    // Fsl 218-221: الاعتداء الجسدي (الضرب والجرح الإرادي)
    [/الضرب.*الجرح|الاعتداء.*الجسدي|إيذاء.*جسدي/, ['ضرب', 'جرح', 'الإيذاء', 'بالعمد']],
  ]

  const allTerms = new Set<string>()

  // Ajouter les mots-clés directs de la query (sans stop words arabes communs)
  const ARABIC_STOP_WORDS = new Set(['ما', 'هي', 'هو', 'في', 'من', 'إلى', 'على', 'عن', 'مع', 'التي', 'الذي', 'التونسي', 'التونسية', 'القانون', 'القانوني', 'أحكام', 'نص', 'ينص'])
  const tokens = queryText.replace(/[^\w\u0600-\u06FF]/g, ' ').split(/\s+/).filter(t => t.length > 2)
  for (const token of tokens) {
    const stripped = token.replace(/^(ال|وال|بال|كال|فال)/, '') // Strip article ال
    if (!ARABIC_STOP_WORDS.has(token) && !ARABIC_STOP_WORDS.has(stripped) && stripped.length > 2) {
      allTerms.add(stripped)
    }
  }

  // Ajouter les expansions classiques si un pattern match
  for (const [pattern, expansions] of CLASSICAL_EXPANSION) {
    if (pattern.test(queryText)) {
      for (const exp of expansions) {
        allTerms.add(exp)
      }
    }
  }

  if (allTerms.size === 0) return queryText.substring(0, 50)

  // websearch_to_tsquery('simple', ...) format: "term1 OR term2 OR term3"
  return Array.from(allTerms).join(' OR ')
}

/**
 * Recherche BM25 OR-expanded dans un code juridique cible.
 *
 * Fix Feb 26 v11: combine vectoriel sans threshold (v10) + BM25 OR classique.
 * - Pour les articles COC classiques (Fsl 2/402/325...) introuvables par vecteur seul
 *   car gap vocabulaire classique/moderne trop grand (Fsl 2 à rank 339/500 par vecteur).
 * - BM25 OR avec synonymes classiques: "شروط OR أركان OR أهلية" → match Fsl 2 ✅
 * - "تعمير OR التقادم" → match Fsl 402 ✅
 *
 * @param queryText - Texte de la query (nettoyé)
 * @param titleFragment - Fragment du titre du code cible (ex: 'مجلة الالتزامات')
 * @param limit - Nombre de résultats (défaut: 10)
 */
async function searchTargetCodeByORExpansion(
  queryText: string,
  titleFragment: string,
  limit: number
): Promise<KnowledgeBaseSearchResult[]> {
  const orQuery = buildClassicalArabicBM25OR(queryText)

  try {
    const sql = `
      SELECT
        kbc.id as chunk_id,
        kbc.content as chunk_content,
        kbc.chunk_index,
        kbc.knowledge_base_id,
        kbc.metadata,
        kb.title,
        kb.category,
        ts_rank_cd(kbc.content_tsvector, websearch_to_tsquery('simple', $1)) as bm25_score
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.category = 'codes'
        AND kb.title ILIKE $2
        AND kbc.content_tsvector @@ websearch_to_tsquery('simple', $1)
      ORDER BY bm25_score DESC
      LIMIT $3`

    const result = await db.query(sql, [orQuery, `%${titleFragment}%`, limit])

    if (result.rows.length === 0) {
      logger.info(`[KB target-code-or] 0 chunks BM25-OR pour "${titleFragment}" (or_query="${orQuery.substring(0, 60)}")`)
      return []
    }

    logger.info(`[KB target-code-or] ${result.rows.length} chunks BM25-OR pour "${titleFragment}" (or_query="${orQuery.substring(0, 60)}")`)

    return result.rows.map((row: { knowledge_base_id: string; chunk_id: string; title: string; category: string; chunk_content: string; chunk_index: number; metadata: Record<string, unknown>; bm25_score: string }) => ({
      knowledgeBaseId: row.knowledge_base_id,
      chunkId: row.chunk_id,
      title: row.title,
      category: row.category as KnowledgeBaseCategory,
      chunkContent: row.chunk_content,
      chunkIndex: row.chunk_index || 0,
      similarity: 0.50, // placeholder — remplacé par boost codes-forced-direct dans la boucle merge
      metadata: {
        ...(row.metadata || {}),
        bm25Rank: parseFloat(row.bm25_score) || 0,
        searchType: 'bm25_or_expanded',
      },
    }))
  } catch (err) {
    logger.warn(`[KB target-code-or] Erreur pour "${titleFragment}" (or_query="${orQuery.substring(0, 60)}"):`, err)
    return []
  }
}

/**
 * Recherche vectorielle SANS threshold dans un code juridique cible.
 *
 * Fix Feb 26 v10: récupère les top N chunks COC par distance vectorielle sans threshold.
 * Utilisé en parallèle avec searchTargetCodeByORExpansion (v11) pour couvrir les deux cas :
 * - v10: chunks avec vecSim modéré (0.40-0.60) → articles généraux COC
 * - v11: chunks avec mots-clés classiques (أركان, تعمير) → articles spécifiques COC
 *
 * @param embeddingStr - Embedding formatté pour PostgreSQL
 * @param titleFragment - Fragment du titre du code cible (ex: 'مجلة الالتزامات')
 * @param limit - Nombre de résultats (défaut: 5)
 * @param provider - Provider d'embeddings utilisé ('openai' | 'ollama')
 */
async function searchTargetCodeForced(
  embeddingStr: string,
  titleFragment: string,
  limit: number,
  provider: 'openai' | 'ollama' = 'ollama'
): Promise<KnowledgeBaseSearchResult[]> {
  try {
    const embCol = provider === 'openai' ? 'embedding_openai' : 'embedding'
    const sql = `
      SELECT
        kbc.id as chunk_id,
        kbc.content as chunk_content,
        kbc.chunk_index,
        kbc.knowledge_base_id,
        kbc.metadata,
        kb.title,
        kb.category,
        (1 - (kbc.${embCol} <=> $1::vector)) as vec_sim
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.category = 'codes'
        AND kb.title ILIKE $2
        AND kbc.${embCol} IS NOT NULL
      ORDER BY kbc.${embCol} <=> $1::vector
      LIMIT $3`

    const result = await db.query(sql, [embeddingStr, `%${titleFragment}%`, limit])

    if (result.rows.length === 0) {
      logger.info(`[KB target-code-forced] 0 chunks (sans threshold) pour "${titleFragment}"`)
      return []
    }

    const vecSims = result.rows.map((r: { vec_sim: string }) => parseFloat(r.vec_sim).toFixed(3)).join(', ')
    logger.info(`[KB target-code-forced] ${result.rows.length} chunks vectoriels pour "${titleFragment}" (vecSims: ${vecSims})`)

    return result.rows.map((row: { knowledge_base_id: string; chunk_id: string; title: string; category: string; chunk_content: string; chunk_index: number; metadata: Record<string, unknown>; vec_sim: string }) => ({
      knowledgeBaseId: row.knowledge_base_id,
      chunkId: row.chunk_id,
      title: row.title,
      category: row.category as KnowledgeBaseCategory,
      chunkContent: row.chunk_content,
      chunkIndex: row.chunk_index || 0,
      similarity: 0.50, // placeholder — remplacé par boost codes-forced-direct dans la boucle merge
      metadata: {
        ...(row.metadata || {}),
        vectorSimilarity: parseFloat(row.vec_sim) || 0,
        searchType: 'vector_forced',
      },
    }))
  } catch (err) {
    logger.warn(`[KB target-code-forced] Erreur pour "${titleFragment}":`, err)
    return []
  }
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
    skipJinaRerank?: boolean  // A/B testing : comparer R@5 avec/sans Jina reranker
    originalQuery?: string  // Query originale avant expansion LLM — utilisée pour article-text pattern matching
  } = {}
): Promise<KnowledgeBaseSearchResult[]> {
  if (!isSemanticSearchEnabled()) {
    logger.info('[KB Hybrid Search] ❌ Recherche sémantique DÉSACTIVÉE')
    return []
  }

  const {
    category,
    subcategory,
    docType,
    docTypes,
    limit = aiConfig.rag.maxResults,
    threshold: rawThreshold,
    operationName,
    skipJinaRerank = false,
    originalQuery,
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

  // FIX (Mar 2 2026): Texte pour les regex article-text (constExplicitMatch, articleExplicitMatch).
  // Utiliser originalQuery (avant expansion LLM) pour éviter que l'expansion omette "الفصل X".
  const patternText = originalQuery
    ? originalQuery.replace(/[\u064B-\u065F\u0670]/g, '').replace(/[^\w\s\u0600-\u06FF\u00C0-\u017F]/g, ' ').trim()
    : queryText

  // Fix Mar 4 2026 — BM25 arabe : l'expansion LLM ajoute des termes en arabe classique
  // absents du KB (ex: "فسخ العقد" → "الانفساخ"). Pour BM25, préférer originalQuery
  // (avant expansion) afin d'éviter les termes fantômes qui annulent le score BM25.
  // Pour FR et quand pas d'originalQuery, queryText enrichi reste utilisé (meilleure couverture).
  const bm25QueryText = originalQuery && /[\u0600-\u06FF]/.test(query)
    ? originalQuery.replace(/[\u064B-\u065F\u0670]/g, '').replace(/[^\w\s\u0600-\u06FF\u00C0-\u017F]/g, ' ').trim()
    : queryText

  // P0 fix (Feb 24, 2026) — BM25 bilingue : détecter la langue pour construire
  // une tsquery language-aware (stop-words AR/FR supprimés, meilleure précision BM25)
  const detectedLang = detectLanguage(query)
  const bm25Language: 'ar' | 'fr' | 'simple' = detectedLang === 'ar' ? 'ar' : detectedLang === 'fr' ? 'fr' : 'simple'

  // Fix Mar 4 2026 — Threshold language-aware : l'arabe a des similarités cosinus
  // structurellement plus basses (0.18-0.34) à cause des diacritiques et morphologie.
  // SQL threshold permissif arabe = 0.15 vs 0.35 FR, le quality gate 0.20 filtre ensuite.
  const threshold = rawThreshold ?? (bm25Language === 'ar' ? 0.15 : aiConfig.rag.similarityThreshold - 0.20)

  // Fix Feb 26 v9: pré-calculer targetCodeFragment UNE fois (évite appel par chunk + permet push avant loop)
  const targetCodeFragment = getTargetCodeTitleFragment(queryText, bm25Language as string)

  // ✨ OPTIMISATION Phase 2.4 : Détection auto type de query + poids adaptatifs
  const queryAnalysis = detectQueryType(query)

  // ✨ DUAL EMBEDDING PARALLÈLE - OpenAI + Ollama (Gemini supprimé — coût €44/mois)
  // Génère 2 embeddings en parallèle, lance les recherches en parallèle,
  // fusionne par chunk_id (meilleur score gagne).
  // Fix Mar 4 2026 — Pool candidat language-aware : arabe ×6 (vs ×3 FR) pour compenser
  // les similarités cosinus plus basses et capturer les gold chunks avec sim 0.18-0.34.
  const sqlCandidatePool = bm25Language === 'ar'
    ? Math.min(limit * 6, 180)
    : Math.min(limit * 3, 100)

  // 1. Générer les 2 embeddings en parallèle
  // ✨ FIX C (TTFT): Timeout 8s sur Ollama — CPU-bound, peut prendre 8-10s en prod
  // Augmenté de 3s → 8s (Mar 2026) : timeout 3s trop court sur VPS → fallback OpenAI systématique
  const ollamaTimeoutMs = parseInt(process.env.OLLAMA_EMBEDDING_TIMEOUT_MS || '8000', 10)
  const ollamaWithTimeout = Promise.race([
    generateEmbedding(query, { forceOllama: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Ollama embedding timeout (${ollamaTimeoutMs}ms)`)), ollamaTimeoutMs)),
  ])
  const [openaiEmbResult, ollamaEmbResult] = await Promise.allSettled([
    generateEmbedding(query, { operationName: operationName as any }),       // Provider principal (Ollama 768-dim en prod+dev)
    ollamaWithTimeout,                                                        // Ollama forcé (768-dim nomic, timeout configurable)
  ])

  // Log providers disponibles
  const openaiStatus = openaiEmbResult.status === 'fulfilled' ? openaiEmbResult.value.provider : 'failed'
  const ollamaStatus = ollamaEmbResult.status === 'fulfilled' ? ollamaEmbResult.value.provider : 'failed'
  logger.info(
    `[KB Hybrid Search] Dual-embed: OpenAI=${openaiStatus}, Ollama=${ollamaStatus}, Type: ${queryAnalysis.type}, Weights: vector=${queryAnalysis.weights.vector} / bm25=${queryAnalysis.weights.bm25}, Query: "${queryText.substring(0, 50)}..."`
  )
  logger.info(`[KB Hybrid Search] Rationale: ${queryAnalysis.rationale}`)

  // 2. Lancer les recherches disponibles en parallèle
  const searchPromises: Promise<KnowledgeBaseSearchResult[]>[] = []
  const providerLabels: string[] = []

  if (openaiEmbResult.status === 'fulfilled' && openaiEmbResult.value.provider === 'openai') {
    const embStr = formatEmbeddingForPostgres(openaiEmbResult.value.embedding)
    searchPromises.push(
      searchHybridSingle(bm25QueryText, embStr, category || null, singleDocType, sqlCandidatePool, threshold, 'openai', bm25Language)
    )
    providerLabels.push('openai')
  }

  if (ollamaEmbResult.status === 'fulfilled' && ollamaEmbResult.value.provider === 'ollama') {
    // Guard critique : ne lancer la recherche Ollama QUE si l'embedding est vraiment 768-dim (nomic)
    // Sinon dimension mismatch PostgreSQL (1536 vs 768) → crash → 0% hit@5
    const embStr = formatEmbeddingForPostgres(ollamaEmbResult.value.embedding)
    searchPromises.push(
      searchHybridSingle(bm25QueryText, embStr, category || null, singleDocType, sqlCandidatePool, threshold, 'ollama', bm25Language)
    )
    providerLabels.push('ollama')
  }

  // ✨ RECHERCHE FORCÉE CODES JURIDIQUES (Feb 17, 2026)
  // Problème fondamental : les articles de codes légaux (المجلة الجزائية, مجلة الشغل...)
  // ont une similarité vectorielle intrinsèquement basse (~0.35-0.45) avec les queries
  // en langage naturel ("ما هي شروط الدفاع الشرعي"). Les docs doctrine (~0.55-0.65)
  // les dominent toujours, même avec pool×3.
  // Solution : recherche forcée dans 'codes' avec threshold très bas (0.20) +
  // boost CODE_PRIORITY_BOOST pour compenser l'écart sémantique naturel.
  // N'ajoute rien si on filtre déjà par codes (évite doublons).
  const CODE_PRIORITY_BOOST = detectedLang === 'ar' ? 1.50 : 1.60
  // Fix Feb 26 v7: réduit pour éviter que vector-only COC (vecSim≥0.40) cap à 1.0
  // AR 1.50: BM25-matched (bm25EffSim=0.80) → 0.80×1.50=1.20→1.0 ✅ (capped, WINS)
  //          vector-only (vecSim=0.40) → 0.40×1.50=0.60 < JORT 0.84 → FILTERED ✅
  // FR 1.60: maintenu (régression FR si réduit)
  const shouldForceCodes = !category || category !== 'codes'
  // codes-forced : utilise l'embedding principal disponible (Ollama prioritaire, OpenAI si turbo)
  const primaryEmbResult = ollamaEmbResult.status === 'fulfilled' ? ollamaEmbResult : openaiEmbResult
  const primaryProvider = primaryEmbResult.status === 'fulfilled' ? primaryEmbResult.value.provider : null
  if (shouldForceCodes && primaryEmbResult.status === 'fulfilled' && primaryProvider) {
    const embStr = formatEmbeddingForPostgres(primaryEmbResult.value.embedding)
    searchPromises.push(
      // Fix (Feb 17, 2026) : threshold 0.15 (était 0.20) pour capturer مجلة الالتزامات والعقود
      // et المجلة التجارية qui ont vecSim 0.15-0.20 pour certaines queries juridiques spécifiques.
      // Fix (Feb 25, 2026) : limit 5→15 — KB a 14K+ codes chunks, top 5 insuffisant pour atteindre articles spécifiques
      searchHybridSingle(bm25QueryText, embStr, 'codes', null, Math.max(Math.ceil(limit / 2), 15), 0.15, primaryProvider as 'openai' | 'ollama', bm25Language)
    )
    providerLabels.push('codes-forced')
  }

  // Fix Mar 2 2026: Constitution-forced search — garantit que les chunks constitution
  // entrent dans le pool pour les requêtes constitutionnelles (دستور/constitution).
  // 40 chunks constitution indexés mais jamais récupérés sans chemin dédié.
  // isConstitutionQuery testé sur patternText (original) pour éviter que l'expansion LLM
  // ajoute des termes qui masquent le mot "دستور" original.
  const isConstitutionQuery = /دستور|دستوري|دستورية|constitution|constitutionnel/i.test(patternText)
  if (isConstitutionQuery && primaryEmbResult.status === 'fulfilled' && primaryProvider) {
    const embStr = formatEmbeddingForPostgres(primaryEmbResult.value.embedding)
    searchPromises.push(
      // threshold bas 0.10 : queries constitutionnelles peuvent avoir sim faible vs chunks Fsl-level
      searchHybridSingle(bm25QueryText, embStr, 'constitution', null, 10, 0.10, primaryProvider as 'openai' | 'ollama', bm25Language)
    )
    providerLabels.push('constitution-forced')
  }

  // Fix Feb 26 v8: Recherche textuelle directe pour queries "ماذا ينص الفصل X من مجلة Y"
  // Contourne le threshold vectoriel (0.15) qui peut exclure l'article exact si sim embedding < seuil.
  // Fix Mar 2 2026 (ordinals+hamza): support ordinals arabes (الأول→الاول...) en plus des chiffres.
  // Fix Mar 2 2026 (régression): ordinals sans code cible → 93 faux positifs. Condition targetCodeFragment.
  // Utilise patternText (original) pour garantir "الفصل X" même si expansion LLM l'omettait.
  if (shouldForceCodes) {
    const articleExplicitMatch = patternText.match(/الفصل\s+(\d+|ال[أإاآ]?ول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/)
    if (articleExplicitMatch) {
      const artNum = articleExplicitMatch[1].replace(/[أإآ]/g, 'ا')
      // Ordinals sans code cible = 93 faux positifs. Ne déclencher que si digit OU code identifié.
      if (/^\d+$/.test(artNum) || targetCodeFragment) {
        searchPromises.push(searchArticleByTextMatch(artNum, targetCodeFragment))
        providerLabels.push('article-text')
        // Fix Mar 5 2026: certains codes (مجلة الديوانة) stockent "الفصل 1" (chiffre) au lieu de
        // "الفصل الأول" (ordinal). Chercher aussi la version numérique quand artNum est un ordinal.
        if (!/^\d+$/.test(artNum)) {
          const _ORDINAL_TO_NUM: Record<string, string> = {
            'الاول': '1', 'الثاني': '2', 'الثالث': '3', 'الرابع': '4', 'الخامس': '5',
            'السادس': '6', 'السابع': '7', 'الثامن': '8', 'التاسع': '9', 'العاشر': '10',
          }
          const numVersion = _ORDINAL_TO_NUM[artNum]
          if (numVersion) {
            searchPromises.push(searchArticleByTextMatch(numVersion, targetCodeFragment))
            providerLabels.push('article-text')
          }
        }
      }
    }
  }

  // Fix Mar 2 2026: Article-text match dédié constitution — "الفصل X من الدستور"
  // searchArticleByTextMatch filtre category='codes' par défaut → manque les chunks constitution.
  // Utilise patternText (original) pour garantir "الفصل الأول" même si l'expansion LLM l'omet.
  //
  // Fix Mar 3 2026 (ordinal→numeral): les chunks 9anoun.tn stockent "الفصل 2" (chiffre),
  // mais la query peut avoir "الثاني" (ordinal). Convertir → chiffre avant searchArticleByTextMatch
  // pour garantir le match. Ex: "الفصل الثاني من الدستور" → search "الفصل 2".
  const ARABIC_ORDINAL_TO_NUM: Record<string, string> = {
    'الاول': '1', 'الثاني': '2', 'الثالث': '3', 'الرابع': '4', 'الخامس': '5',
    'السادس': '6', 'السابع': '7', 'الثامن': '8', 'التاسع': '9', 'العاشر': '10',
  }
  if (isConstitutionQuery) {
    // Fix Mar 3 2026 (requêtes françaises): patternText (original) peut être en FR sans "الفصل X".
    // L'expansion LLM (queryText) traduit en arabe → vérifier aussi queryText comme fallback.
    const ARABIC_ARTICLE_RE = /الفصل\s+(\d+|ال[أإاآ]?ول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/
    const constExplicitMatch = patternText.match(ARABIC_ARTICLE_RE) || queryText.match(ARABIC_ARTICLE_RE)
    if (constExplicitMatch) {
      // Normaliser hamza : "الأول" (query) → "الاول"
      const rawMatch = constExplicitMatch[1].replace(/[أإآ]/g, 'ا')
      // Convertir ordinal → chiffre (certains chunks 9anoun.tn stockent "الفصل 2")
      const artSearch = ARABIC_ORDINAL_TO_NUM[rawMatch] || rawMatch
      // Fix Mar 2 2026: ['constitution'] uniquement (pas 'legislation')
      searchPromises.push(searchArticleByTextMatch(artSearch, null, ['constitution']))
      providerLabels.push('article-text')
      // Fix Mar 3 2026: Aussi chercher le format ordinal (9anoun.tn stocke souvent "الفصل الثاني")
      // Un seul appel couvre les deux formats : si conversion s'est faite, chercher aussi l'ordinal brut.
      if (artSearch !== rawMatch) {
        searchPromises.push(searchArticleByTextMatch(rawMatch, null, ['constitution']))
        providerLabels.push('article-text-ordinal')
      }
    }
  }

  // Fix Feb 26 v13: Implicit article mapping pour COC/PENAL/MCO
  //
  // Problème résolu: quand plusieurs chunks scorent 1.0, l'ordre d'insertion dans la Map
  // détermine le ranking → les chunks de regular codes-forced devancent les gold chunks.
  //
  // Solution: searchArticleByTextMatch → sim=1.05 (via articleTextChunkIds post-processing)
  // → STRICTEMENT au-dessus de tout autre chunk (max 1.0) → toujours dans le top-K.
  //
  // Maps déplacées à niveau module (constantes — RegExp compilés une seule fois au chargement).
  // Cache module-level pour éviter re-évaluation des patterns pour la même queryText.
  // Fix v16 (Feb 27): guard detectedLang retiré — patterns bilingues AR+FR.
  // v19 cap: max 8 articles COC / 6 PENAL / 6 MCO (évite explosion combinatoire).
  if (shouldForceCodes) {
    // Fallback COC si targetCodeFragment null (ex: ar_civil_07 "الضرر المعنوي")
    const cocTitleFrag = (targetCodeFragment && targetCodeFragment.includes('الالتزامات'))
      ? targetCodeFragment
      : 'مجلة الالتزامات'
    const penalTitleFrag = 'المجلة الجزائية'

    // Clé cache : queryText + codes ciblés (pour distinguer COC vs PENAL vs MCO)
    const cacheKey = `${queryText}|${cocTitleFrag}`
    let cachedArticleKeys = _implicitArticleMatchCache.get(cacheKey)

    if (!cachedArticleKeys) {
      // Calculer et mettre en cache les clés d'articles matchées (COC + PENAL)
      cachedArticleKeys = new Set<string>()
      const COC_MAX_ARTICLES = 8
      const PENAL_MAX_ARTICLES = 6
      let cocCount = 0
      let penalCount = 0

      for (const [pattern, articles] of COC_IMPLICIT_ARTICLE_MAP) {
        if (cocCount >= COC_MAX_ARTICLES) break
        if (pattern.test(queryText)) {
          for (const artNum of articles) {
            if (cocCount >= COC_MAX_ARTICLES) break
            const key = `coc:${artNum}:${cocTitleFrag}`
            if (!cachedArticleKeys.has(key)) { cachedArticleKeys.add(key); cocCount++ }
          }
        }
      }
      for (const [pattern, articles] of PENAL_IMPLICIT_ARTICLE_MAP) {
        if (penalCount >= PENAL_MAX_ARTICLES) break
        if (pattern.test(queryText)) {
          for (const artNum of articles) {
            if (penalCount >= PENAL_MAX_ARTICLES) break
            const key = `penal:${artNum}:${penalTitleFrag}`
            if (!cachedArticleKeys.has(key)) { cachedArticleKeys.add(key); penalCount++ }
          }
        }
      }

      _evictImplicitCacheIfFull()
      _implicitArticleMatchCache.set(cacheKey, cachedArticleKeys)
    }

    // Lancer searchArticleByTextMatch pour chaque article matché (depuis cache ou calcul frais)
    // Dédup intra-appel via Set local (cache stocke les clés, pas les promesses)
    const launchedKeys = new Set<string>()
    for (const key of cachedArticleKeys) {
      const parts = key.split(':')
      // key format: "coc:artNum:titleFrag" ou "penal:artNum:titleFrag"
      const artNum = parts[1]
      const titleFrag = parts.slice(2).join(':')
      const dedupKey = `${artNum}:${titleFrag}`
      if (!launchedKeys.has(dedupKey)) {
        launchedKeys.add(dedupKey)
        searchPromises.push(searchArticleByTextMatch(artNum, titleFrag))
        providerLabels.push('article-text') // sim=1.05 via articleTextChunkIds post-processing
      }
    }
  }

  // MCO_IMPLICIT_ARTICLE_MAP — المجلة التجارية (Code de Commerce tunisien)
  // Guard detectedLang === 'ar' conservé (MCO patterns arabes uniquement)
  if (detectedLang === 'ar') {
    const mcoTitleFrag = getTargetCodeTitleFragment(queryText, 'ar')
    if (mcoTitleFrag === 'المجلة التجارية') {
      const MCO_MAX_ARTICLES = 6
      const mcoQueuedArticles = new Set<string>()
      for (const [pattern, articles] of MCO_IMPLICIT_ARTICLE_MAP) {
        if (mcoQueuedArticles.size >= MCO_MAX_ARTICLES) break
        if (pattern.test(queryText)) {
          for (const artNum of articles) {
            if (mcoQueuedArticles.size >= MCO_MAX_ARTICLES) break
            const key = `${artNum}:${mcoTitleFrag}`
            if (!mcoQueuedArticles.has(key)) {
              mcoQueuedArticles.add(key)
              searchPromises.push(searchArticleByTextMatch(String(artNum), mcoTitleFrag))
              providerLabels.push('article-text') // sim=1.05 via articleTextChunkIds post-processing
            }
          }
        }
      }
    }
  }

  // PSC_IMPLICIT_ARTICLE_MAP — مجلة الأحوال الشخصية (Code du Statut Personnel)
  // Supporte AR + FR (patterns bilingues dans la map)
  {
    const pscTitleFrag = getTargetCodeTitleFragment(queryText, bm25Language as string)
    if (pscTitleFrag === 'مجلة الأحوال الشخصية') {
      const PSC_MAX_ARTICLES = 6
      const pscQueuedArticles = new Set<string>()
      for (const [pattern, articles] of PSC_IMPLICIT_ARTICLE_MAP) {
        if (pscQueuedArticles.size >= PSC_MAX_ARTICLES) break
        if (pattern.test(queryText)) {
          for (const artNum of articles) {
            if (pscQueuedArticles.size >= PSC_MAX_ARTICLES) break
            const key = `${artNum}:${pscTitleFrag}`
            if (!pscQueuedArticles.has(key)) {
              pscQueuedArticles.add(key)
              searchPromises.push(searchArticleByTextMatch(String(artNum), pscTitleFrag))
              providerLabels.push('article-text') // sim=1.05 via articleTextChunkIds post-processing
            }
          }
        }
      }
    }
  }

  // Fix Feb 26 v11: Dual approach pour le code cible (vectoriel sans threshold + BM25 OR classique)
  //
  // Problème fondamental (post-mortem v9/v10):
  // - v9/v9b BM25 AND: 0 résultats (AND logic + stop words non supprimés + gap vocab classique/moderne)
  // - v10 vecteur sans threshold: retourne les top 5 COC les plus proches mais PAS les gold chunks
  //   (Fsl 2 "أركان العقد" au rang 339/500 pour la query "شروط صحة العقد" → hors top 5)
  //
  // Solution v11 COMBINÉE:
  // - Vectoriel (v10): top 5 COC chunks les plus proches → articles généraux pertinents
  // - BM25 OR-expanded (v11): "شروط OR أركان OR أهلية" → Fsl 2 ✅ | "تعمير OR التقادم" → Fsl 402 ✅
  //   Utilise websearch_to_tsquery('simple', OR_query) qui match si le chunk contient L'UN des termes
  if (shouldForceCodes && targetCodeFragment) {
    if (primaryEmbResult.status === 'fulfilled' && primaryProvider) {
      const embStrForced = formatEmbeddingForPostgres(primaryEmbResult.value.embedding)
      searchPromises.push(
        searchTargetCodeForced(embStrForced, targetCodeFragment, 5, primaryProvider as 'openai' | 'ollama')
      )
      providerLabels.push('codes-forced-direct')
    }

    // Fix Feb 26 v13: BM25 OR pour AR et FR (queries FR enrichies via CLASSICAL_EXPANSION)
    // Pour FR: les tokens arabes ajoutés par CLASSICAL_EXPANSION matchent les chunks COC classiques
    // Pour AR: synonymes classiques (أركان, تعمير, باطل...) → articles COC archaïques
    if (detectedLang === 'ar' || detectedLang === 'fr') {
      // limit=25: Fsl 2 (rang 5), Fsl 119 (rang 17), Fsl 23 (rang 24) → tous couverts
      searchPromises.push(
        searchTargetCodeByORExpansion(queryText, targetCodeFragment, 25)
      )
      providerLabels.push('codes-forced-direct') // même label → même boost
    }
  }

  if (searchPromises.length === 0) {
    logger.warn('[KB Hybrid Search] Aucun embedding disponible (OpenAI + Ollama tous en échec)')
    return []
  }

  const searchResultSets = await Promise.all(searchPromises)

  // 3. Fusionner : dédupliquer par chunk_id, garder meilleur score
  const seen = new Map<string, KnowledgeBaseSearchResult>()
  const countByProvider: Record<string, number> = {}
  // Fix Feb 26 v8c: tracker les chunkIds issus de la recherche article-text
  // (nécessaire car le Map peut être écrasé par codes-forced si sim > 0.75 article-text)
  const articleTextChunkIds = new Set<string>()

  for (let i = 0; i < searchResultSets.length; i++) {
    const resultSet = searchResultSets[i]
    const label = providerLabels[i]
    countByProvider[label] = 0

    for (const r of resultSet) {
      // Appliquer boost aux codes forcés pour compenser l'écart sémantique
      // Fix Feb 26 v4: boost tous les codes-forced sauf branch='autre' explicite
      // category='codes' garantit que c'est un texte législatif (COC, CPP, Code Travail, etc.)
      // Seuls les chunks explicitement branch='autre' (CNSS, Notes-Communes hors-scope) sont exclus
      // NULL-branch = bénéfice du doute → boost appliqué
      if (label === 'codes-forced') {
        const chunkBranch = r.metadata?.branch as string | undefined
        if (chunkBranch !== 'autre') {
          const vecSim = (r.metadata?.vectorSimilarity as number) || 0
          const bm25Rank = (r.metadata?.bm25Rank as number) || 0
          // Fix Feb 26 v6: boost sélectif par code cible (résout l'inflation BM25 accordEtSesAnnexe)
          // targetCodeFragment pré-calculé une fois (v9: évite appel par chunk)
          const isTargetCode = targetCodeFragment ? r.title.includes(targetCodeFragment) : false
          if (isTargetCode) {
            // ✅ Code cible: leverage BM25 signal → bm25EffSim × CODE_PRIORITY_BOOST
            // Fix Feb 26 v7: floor 0.35→0.60 — garantit bm25EffSim > vecSim max codes-forced (~0.55)
            // bm25Rank=0.3 → max(0.60, min(0.80, 3.0))=0.80 → 0.80×1.50=1.0 ✅
            // bm25Rank=0.05 → max(0.60, min(0.80, 0.5))=0.60 → 0.60×1.50=0.90 > JORT 0.84 ✅
            const bm25EffSim = bm25Rank > 0 ? Math.max(0.60, Math.min(0.80, bm25Rank * 10)) : 0
            const baseSim = bm25EffSim > vecSim ? bm25EffSim : r.similarity
            r.similarity = Math.min(1.0, baseSim * CODE_PRIORITY_BOOST)
          } else {
            // Non-target code: vecSim-based boost uniquement (pas de bm25EffSim inflation)
            r.similarity = Math.min(1.0, vecSim * CODE_PRIORITY_BOOST)
          }
        }
      }

      // Fix Feb 26 v12: boost pour codes-forced-direct (vectoriel v10 ET BM25-OR v11)
      // Correction régression ar_civil_06 : le floor 0.60 pour BM25-OR créait 25+ chunks
      // à sim=0.90, noyant Fsl 443 (vecSim=0.45 → 0.90 vectoriel) dans le pool top-21.
      // Fix : floor 0.60 SEULEMENT pour les chunks vectoriels. Chunks BM25-only → pas de floor.
      //
      // Vectoriel (vecSim > 0):
      //   vecSim=0.45 (Fsl 443) → max(0.60, 0.45)=0.60 → 0.60×1.50=0.90 ✅ (stable)
      // BM25-OR uniquement (vecSim=0, bm25Rank > 0):
      //   Fsl 2 "أركان" (bm25Rank~0.30) → min(0.80, 3.0)=0.80 → 0.80×1.50=1.0 ✅
      //   Fsl 402 "تعمير" (bm25Rank~0.25) → min(0.80, 2.5)=0.80 → 0.80×1.50=1.0 ✅
      //   Chunk faible عقد (bm25Rank~0.03) → 0.03×10=0.30 → 0.30×1.50=0.45 < 0.90 ✅
      if (label === 'codes-forced-direct') {
        const vecSim = (r.metadata?.vectorSimilarity as number) || 0
        const bm25Rank = (r.metadata?.bm25Rank as number) || 0

        if (vecSim > 0) {
          // Chunk vectoriel (searchTargetCodeForced): floor 0.60 pour rester > JORT (0.84)
          const vecEffSim = Math.max(0.60, vecSim)
          r.similarity = Math.min(1.0, vecEffSim * CODE_PRIORITY_BOOST)
        } else {
          // Chunk BM25-OR uniquement (searchTargetCodeByORExpansion): pas de floor
          // → chunks forts (أركان, تعمير) dominent, chunks faibles (عقد partout) s'effacent
          const bm25EffSim = Math.min(0.80, bm25Rank * 10)
          r.similarity = Math.min(1.0, bm25EffSim * CODE_PRIORITY_BOOST)
        }
      }

      // Fix Mar 2 2026: Boost plancher pour constitution-forced
      // Les chunks constitution ont souvent une faible sim embedding vs query sémantique
      // (Fsl-level chunks vs question "ما هي أحكام...") → passent le seuil SQL 0.10 mais
      // échouent le filtre app-level effectiveMinimum=0.30 (AR). Plancher 0.32 garantit
      // qu'ils survivent et entrent dans le pool pour le re-ranking Jina.
      if (label === 'constitution-forced') {
        if (r.similarity < 0.32) {
          r.similarity = 0.32
        }
        if (r.metadata) {
          ;(r.metadata as Record<string, unknown>).constitutionForced = true
        }
      }
      const key = r.chunkId || (r.knowledgeBaseId + ':' + r.chunkContent.substring(0, 50))
      // Tracker les chunks issus de la recherche article-text (avant écrasement possible par codes-forced)
      if (label === 'article-text') {
        articleTextChunkIds.add(key)
      }
      const existing = seen.get(key)
      if (!existing || r.similarity > existing.similarity) {
        seen.set(key, r)
        countByProvider[label] = (countByProvider[label] || 0) + 1
      }
    }
  }

  // Fix Feb 26 v8c: post-merge adjustments
  // 1. Pénaliser les chunks "abolis" (ألغي/ملغى) — articles qui ne contiennent que la notice
  //    d'abrogation "(ألغي بالأمر...)" sans contenu juridique utile.
  //    Ces chunks courts ont une sim embedding élevée (même structure que la query) mais
  //    ne fournissent aucun contenu utile au LLM → doivent être exclus du top-5.
  //    Fix regex: \(ألغي (sans restriction longueur) — "(ألغي بالقانون عدد 72...)" > 50 chars.
  // 2. Boost article-text matches → garantit ranking au-dessus des autres codes chunks (~0.80).
  for (const r of seen.values()) {
    const chunkText = r.chunkContent || ''
    const chunkKey = r.chunkId || (r.knowledgeBaseId + ':' + r.chunkContent.substring(0, 50))
    // Penalty pour articles abolis: simple présence de "(ألغي" ou "(ملغى"
    if (/\(ألغي/.test(chunkText) || /\(ملغى/.test(chunkText)) {
      r.similarity = Math.min(r.similarity, 0.10)
    }
    // Boost forcé pour exact article text match — dépasse le cap 1.0 pour garantir rang 1er
    if (articleTextChunkIds.has(chunkKey)) {
      r.similarity = 1.05 // Force au-dessus de tout chunk codes-forced (max 1.0) → toujours 1er
    }
  }

  const results = Array.from(seen.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, sqlCandidatePool)

  const providerSummary = Object.entries(countByProvider).map(([p, c]) => `${c} ${p}`).join(' + ')
  logger.info(`[KB Hybrid Search] Dual-parallel: ${providerSummary} → ${results.length} total après dédup (pool=${sqlCandidatePool})`)

  // Jina Reranking post-hybrid (si configuré et non désactivé)
  // Aligne les métriques eval sur le pipeline prod réel (qui utilise Jina dans rag-search-service)
  if (!skipJinaRerank && process.env.JINA_API_KEY && results.length > 1) {
    try {
      const { rerankDocuments } = await import('./reranker-service')
      const docsToRerank = results.map(r => ({
        content: r.chunkContent,
        originalScore: r.similarity,
      }))
      const reranked = await rerankDocuments(query, docsToRerank, results.length, { skipJinaRerank: false })
      return reranked.map(r => ({ ...results[r.index], similarity: r.score }))
    } catch (err) {
      logger.warn('[KB Hybrid Search] Jina reranking échoué, résultats non-reranked retournés:', err)
    }
  }

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
  const { topKPerQuery = 10, threshold, operationName, limit = 30 } = options

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

  logger.info(`[Multi-Track] ${tracks.length} tracks, ${searchPromises.length} queries → ${merged.length} résultats après dédup`)

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
      logger.error(`Erreur suppression fichier MinIO ${sourceFile}:`, error)
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
        logger.error(`Erreur suppression ancien fichier:`, error)
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
        logger.error(`Échec ré-indexation document ${documentId}: ${indexResult.error}`)
        reindexFailed = true
      }
    } catch (error) {
      logger.error(`Erreur ré-indexation document ${documentId}:`, error)
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
    logger.error('Erreur restauration version:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la restauration',
    }
  }
}
