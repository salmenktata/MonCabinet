/**
 * Service d'indexation des fichiers (PDF, DOCX)
 * Télécharge, parse et indexe les fichiers dans le RAG
 */

import { db } from '@/lib/db/postgres'
import { uploadWebFile, downloadWebFile, isStorageConfigured } from './storage-adapter'
import { parseFile, isTextExtractable } from './file-parser-service'
import { normalizeText, detectTextLanguage } from './content-extractor'
import { isSemanticSearchEnabled, aiConfig } from '@/lib/ai/config'
import type { LinkedFile } from './types'

// =============================================================================
// TYPES
// =============================================================================

export interface FileDownloadResult {
  success: boolean
  file: LinkedFile
  minioPath?: string
  size?: number
  error?: string
}

export interface FileIndexResult {
  success: boolean
  fileId: string
  chunksCreated: number
  knowledgeBaseId?: string
  error?: string
}

export interface BatchFileResult {
  downloaded: number
  indexed: number
  failed: number
  errors: string[]
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const WEB_FILES_BUCKET = 'web-files'
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB max
const DOWNLOAD_TIMEOUT = 60000 // 60 secondes

// =============================================================================
// TÉLÉCHARGEMENT
// =============================================================================

/**
 * Télécharge un fichier depuis une URL et le stocke dans MinIO
 */
export async function downloadAndStoreFile(
  file: LinkedFile,
  sourceId: string,
  pageId: string
): Promise<FileDownloadResult> {
  const url = file.url

  try {
    console.log(`[FileIndexer] Téléchargement: ${file.filename}`)

    // Télécharger le fichier
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'QadhyaBot/1.0 (+https://qadhya.tn)',
      },
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return {
        success: false,
        file,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    // Vérifier la taille
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return {
        success: false,
        file,
        error: `Fichier trop volumineux: ${Math.round(parseInt(contentLength) / 1024 / 1024)}MB`,
      }
    }

    // Lire le contenu
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (buffer.length > MAX_FILE_SIZE) {
      return {
        success: false,
        file,
        error: `Fichier trop volumineux: ${Math.round(buffer.length / 1024 / 1024)}MB`,
      }
    }

    // Nom de fichier nettoyé
    const sanitizedFilename = file.filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100)
    const mimeType = response.headers.get('content-type') || 'application/octet-stream'

    // Upload vers le stockage (MinIO ou Google Drive)
    const uploadResult = await uploadWebFile(buffer, sanitizedFilename, mimeType, {
      sourceId,
      pageId,
      sourceUrl: url,
      originalFilename: file.filename,
      fileType: file.type,
    })

    if (!uploadResult.success) {
      return {
        success: false,
        file,
        error: uploadResult.error || 'Erreur upload',
      }
    }

    console.log(`[FileIndexer] Fichier stocké (${uploadResult.provider}): ${uploadResult.path}`)

    return {
      success: true,
      file: {
        ...file,
        downloaded: true,
        minioPath: uploadResult.path,
        size: buffer.length,
      },
      minioPath: uploadResult.path,
      size: buffer.length,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur téléchargement'
    console.error(`[FileIndexer] Erreur téléchargement ${url}:`, message)
    return {
      success: false,
      file,
      error: message,
    }
  }
}

/**
 * Télécharge les fichiers d'une page et les stocke dans MinIO
 */
export async function downloadPageFiles(
  pageId: string,
  files: LinkedFile[],
  sourceId: string
): Promise<BatchFileResult> {
  const result: BatchFileResult = {
    downloaded: 0,
    indexed: 0,
    failed: 0,
    errors: [],
  }

  const downloadedFiles: LinkedFile[] = []

  for (const file of files) {
    // Ne télécharger que les fichiers non encore téléchargés
    if (file.downloaded && file.minioPath) {
      // Fichier déjà téléchargé, on le garde
      downloadedFiles.push(file)
      continue
    }

    const downloadResult = await downloadAndStoreFile(file, sourceId, pageId)

    if (downloadResult.success) {
      result.downloaded++
      downloadedFiles.push(downloadResult.file)
    } else {
      result.failed++
      if (downloadResult.error) {
        result.errors.push(`${file.filename}: ${downloadResult.error}`)
      }
    }
  }

  // Mettre à jour les fichiers liés dans la page
  if (downloadedFiles.length > 0) {
    await db.query(
      `UPDATE web_pages SET linked_files = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(downloadedFiles), pageId]
    )
  }

  return result
}

// =============================================================================
// INDEXATION
// =============================================================================

/**
 * Indexe un fichier téléchargé dans le RAG
 */
export async function indexFile(
  file: LinkedFile,
  pageId: string,
  sourceId: string,
  sourceName: string,
  category: string
): Promise<FileIndexResult> {
  if (!file.minioPath) {
    return {
      success: false,
      fileId: '',
      chunksCreated: 0,
      error: 'Fichier non téléchargé (pas de minioPath)',
    }
  }

  if (!isTextExtractable(file.type)) {
    return {
      success: false,
      fileId: '',
      chunksCreated: 0,
      error: `Type de fichier non supporté pour extraction: ${file.type}`,
    }
  }

  if (!isSemanticSearchEnabled()) {
    return {
      success: false,
      fileId: '',
      chunksCreated: 0,
      error: 'Service RAG désactivé',
    }
  }

  try {
    // Télécharger depuis MinIO
    const buffer = await downloadFile(file.minioPath, WEB_FILES_BUCKET)

    // Parser le fichier
    const parsed = await parseFile(buffer, file.type)

    if (!parsed.success || !parsed.text || parsed.text.length < 100) {
      return {
        success: false,
        fileId: '',
        chunksCreated: 0,
        error: parsed.error || 'Contenu insuffisant',
      }
    }

    // Normaliser le texte
    const normalizedText = normalizeText(parsed.text)
    const detectedLang = detectTextLanguage(normalizedText) || 'fr'
    const language = (detectedLang === 'ar' || detectedLang === 'fr') ? detectedLang : 'fr'

    // Imports dynamiques
    const { chunkText, getOverlapForCategory } = await import('@/lib/ai/chunking-service')
    const { generateEmbeddingsBatch, formatEmbeddingForPostgres } = await import('@/lib/ai/embeddings-service')

    // Chunking
    const overlap = getOverlapForCategory(category)
    const chunks = chunkText(normalizedText, {
      chunkSize: aiConfig.rag.chunkSize,
      overlap,
      preserveParagraphs: true,
      preserveSentences: true,
      category,
    })

    if (chunks.length === 0) {
      return {
        success: false,
        fileId: '',
        chunksCreated: 0,
        error: 'Aucun chunk généré',
      }
    }

    // Générer les embeddings
    const embeddingsResult = await generateEmbeddingsBatch(chunks.map(c => c.content))
    const embeddings = embeddingsResult.embeddings

    // Transaction pour créer le document KB et les chunks
    const client = await db.getClient()

    try {
      await client.query('BEGIN')

      // Créer le document dans knowledge_base
      const kbResult = await client.query(
        `INSERT INTO knowledge_base (
          title, content, category, language, source_type, source_url,
          is_indexed, word_count
        ) VALUES ($1, $2, $3, $4, 'web_file', $5, true, $6)
        RETURNING id`,
        [
          parsed.metadata.title || file.filename,
          normalizedText,
          category,
          language,
          file.url,
          parsed.metadata.wordCount,
        ]
      )

      const knowledgeBaseId = kbResult.rows[0].id

      // Créer les chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const embedding = embeddings[i]

        if (!embedding) continue

        // Estimer les tokens (~1.3 tokens par mot en moyenne)
        const tokenCount = Math.ceil(chunk.metadata.wordCount * 1.3)

        await client.query(
          `INSERT INTO knowledge_base_chunks (
            knowledge_base_id, chunk_index, content, token_count, embedding
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            knowledgeBaseId,
            i,
            chunk.content,
            tokenCount,
            formatEmbeddingForPostgres(embedding),
          ]
        )
      }

      // Enregistrer le lien fichier -> KB
      await client.query(
        `INSERT INTO web_files (
          web_page_id, web_source_id, knowledge_base_id,
          url, filename, file_type, minio_path, file_size,
          text_content, word_count, chunks_count,
          is_indexed, indexed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW())
        ON CONFLICT (web_page_id, url) DO UPDATE SET
          knowledge_base_id = $3,
          text_content = $9,
          word_count = $10,
          chunks_count = $11,
          is_indexed = true,
          indexed_at = NOW()
        RETURNING id`,
        [
          pageId,
          sourceId,
          knowledgeBaseId,
          file.url,
          file.filename,
          file.type,
          file.minioPath,
          file.size || 0,
          normalizedText.substring(0, 10000), // Limiter pour la colonne
          parsed.metadata.wordCount,
          chunks.length,
        ]
      )

      await client.query('COMMIT')

      console.log(
        `[FileIndexer] Fichier indexé: ${file.filename} (${chunks.length} chunks)`
      )

      return {
        success: true,
        fileId: knowledgeBaseId,
        chunksCreated: chunks.length,
        knowledgeBaseId,
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur indexation'
    console.error(`[FileIndexer] Erreur indexation ${file.filename}:`, message)
    return {
      success: false,
      fileId: '',
      chunksCreated: 0,
      error: message,
    }
  }
}

/**
 * Indexe tous les fichiers d'une page
 */
export async function indexPageFiles(
  pageId: string,
  sourceId: string,
  sourceName: string,
  category: string
): Promise<BatchFileResult> {
  const result: BatchFileResult = {
    downloaded: 0,
    indexed: 0,
    failed: 0,
    errors: [],
  }

  // Récupérer les fichiers de la page
  const pageResult = await db.query(
    `SELECT linked_files FROM web_pages WHERE id = $1`,
    [pageId]
  )

  if (pageResult.rows.length === 0) {
    return { ...result, errors: ['Page non trouvée'] }
  }

  const files: LinkedFile[] = pageResult.rows[0].linked_files || []
  const textExtractableFiles = files.filter(f => isTextExtractable(f.type))

  if (textExtractableFiles.length === 0) {
    return result
  }

  // D'abord télécharger les fichiers manquants
  const downloadResult = await downloadPageFiles(pageId, textExtractableFiles, sourceId)
  result.downloaded = downloadResult.downloaded
  result.errors.push(...downloadResult.errors)

  // Récupérer les fichiers mis à jour
  const updatedPage = await db.query(
    `SELECT linked_files FROM web_pages WHERE id = $1`,
    [pageId]
  )

  const updatedFiles: LinkedFile[] = updatedPage.rows[0]?.linked_files || []

  // Indexer chaque fichier téléchargé
  for (const file of updatedFiles) {
    if (!file.downloaded || !file.minioPath) continue
    if (!isTextExtractable(file.type)) continue

    const indexResult = await indexFile(file, pageId, sourceId, sourceName, category)

    if (indexResult.success) {
      result.indexed++
    } else {
      result.failed++
      if (indexResult.error) {
        result.errors.push(`${file.filename}: ${indexResult.error}`)
      }
    }
  }

  return result
}

/**
 * Indexe tous les fichiers non indexés d'une source
 */
export async function indexSourceFiles(
  sourceId: string,
  options: { limit?: number } = {}
): Promise<BatchFileResult> {
  const { limit = 50 } = options

  const result: BatchFileResult = {
    downloaded: 0,
    indexed: 0,
    failed: 0,
    errors: [],
  }

  // Récupérer la source
  const sourceResult = await db.query(
    `SELECT name, category FROM web_sources WHERE id = $1`,
    [sourceId]
  )

  if (sourceResult.rows.length === 0) {
    return { ...result, errors: ['Source non trouvée'] }
  }

  const { name: sourceName, category } = sourceResult.rows[0]

  // Récupérer les pages avec des fichiers non indexés
  const pagesResult = await db.query(
    `SELECT wp.id, wp.linked_files
     FROM web_pages wp
     WHERE wp.web_source_id = $1
       AND wp.linked_files IS NOT NULL
       AND wp.linked_files::text != '[]'
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(wp.linked_files) f
         WHERE (f->>'type') IN ('pdf', 'docx', 'doc')
           AND (f->>'downloaded')::boolean IS NOT TRUE
       )
     LIMIT $2`,
    [sourceId, limit]
  )

  console.log(`[FileIndexer] ${pagesResult.rows.length} pages avec fichiers à traiter`)

  for (const page of pagesResult.rows) {
    const pageResult = await indexPageFiles(page.id, sourceId, sourceName, category)
    result.downloaded += pageResult.downloaded
    result.indexed += pageResult.indexed
    result.failed += pageResult.failed
    result.errors.push(...pageResult.errors)
  }

  return result
}
