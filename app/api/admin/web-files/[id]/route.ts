/**
 * API Route: Détail et actions sur un fichier web
 * GET /api/admin/web-files/[id] - Détail d'un fichier
 * DELETE /api/admin/web-files/[id] - Supprimer un fichier
 * POST /api/admin/web-files/[id] - Réindexer un fichier
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { downloadWebFile, deleteWebFile } from '@/lib/web-scraper/storage-adapter'
import { parseFile, isTextExtractable } from '@/lib/web-scraper/file-parser-service'
import { normalizeText, detectTextLanguage } from '@/lib/web-scraper/content-extractor'
import { isSemanticSearchEnabled, aiConfig } from '@/lib/ai/config'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

// =============================================================================
// GET: Détail d'un fichier
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params

    const result = await db.query(
      `SELECT
        wf.*,
        ws.name as source_name,
        ws.category as source_category,
        wp.url as page_url,
        wp.title as page_title,
        kb.title as kb_title
      FROM web_files wf
      LEFT JOIN web_sources ws ON wf.web_source_id = ws.id
      LEFT JOIN web_pages wp ON wf.web_page_id = wp.id
      LEFT JOIN knowledge_base kb ON wf.knowledge_base_id = kb.id
      WHERE wf.id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 })
    }

    const file = result.rows[0]

    // Récupérer les chunks si indexé
    let chunks: Array<{ id: string; chunkIndex: number; content: string; tokenCount: number }> = []
    if (file.knowledge_base_id) {
      const chunksResult = await db.query(
        `SELECT id, chunk_index, content, token_count
         FROM knowledge_base_chunks
         WHERE knowledge_base_id = $1
         ORDER BY chunk_index`,
        [file.knowledge_base_id]
      )
      chunks = chunksResult.rows.map(c => ({
        id: c.id,
        chunkIndex: c.chunk_index,
        content: c.content,
        tokenCount: c.token_count,
      }))
    }

    return NextResponse.json({
      file: {
        id: file.id,
        webPageId: file.web_page_id,
        webSourceId: file.web_source_id,
        knowledgeBaseId: file.knowledge_base_id,
        url: file.url,
        filename: file.filename,
        fileType: file.file_type,
        minioPath: file.minio_path,
        fileSize: file.file_size,
        contentHash: file.content_hash,
        textContent: file.text_content,
        wordCount: file.word_count,
        chunksCount: file.chunks_count,
        extractedTitle: file.extracted_title,
        extractedAuthor: file.extracted_author,
        extractedDate: file.extracted_date,
        pageCount: file.page_count,
        isDownloaded: file.is_downloaded,
        isIndexed: file.is_indexed,
        downloadError: file.download_error,
        parseError: file.parse_error,
        downloadedAt: file.downloaded_at,
        indexedAt: file.indexed_at,
        createdAt: file.created_at,
        updatedAt: file.updated_at,
        sourceName: file.source_name,
        sourceCategory: file.source_category,
        pageUrl: file.page_url,
        pageTitle: file.page_title,
        kbTitle: file.kb_title,
        status: file.download_error || file.parse_error
          ? 'error'
          : file.is_indexed
            ? 'indexed'
            : file.is_downloaded
              ? 'downloaded'
              : 'pending',
      },
      chunks,
    })
  } catch (error) {
    console.error('Erreur récupération fichier:', error)
    return NextResponse.json(
      { error: 'Erreur récupération fichier' },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE: Supprimer un fichier
// =============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params

    // Récupérer le fichier
    const fileResult = await db.query(
      `SELECT minio_path, knowledge_base_id FROM web_files WHERE id = $1`,
      [id]
    )

    if (fileResult.rows.length === 0) {
      return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 })
    }

    const file = fileResult.rows[0]

    // Supprimer du stockage si existe
    if (file.minio_path) {
      try {
        await deleteWebFile(file.minio_path)
      } catch (storageError) {
        console.warn('Erreur suppression stockage:', storageError)
      }
    }

    // Supprimer les chunks et l'entrée knowledge_base si existe
    if (file.knowledge_base_id) {
      await db.query('DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1', [file.knowledge_base_id])
      await db.query('DELETE FROM knowledge_base WHERE id = $1', [file.knowledge_base_id])
    }

    // Supprimer le fichier
    await db.query('DELETE FROM web_files WHERE id = $1', [id])

    return NextResponse.json({ success: true, message: 'Fichier supprimé' })
  } catch (error) {
    console.error('Erreur suppression fichier:', error)
    return NextResponse.json(
      { error: 'Erreur suppression fichier' },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST: Réindexer un fichier
// =============================================================================

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    if (!isSemanticSearchEnabled()) {
      return NextResponse.json({ error: 'Service RAG désactivé' }, { status: 400 })
    }

    const { id } = await params

    // Récupérer le fichier
    const fileResult = await db.query(
      `SELECT wf.*, ws.category as source_category
       FROM web_files wf
       LEFT JOIN web_sources ws ON wf.web_source_id = ws.id
       WHERE wf.id = $1`,
      [id]
    )

    if (fileResult.rows.length === 0) {
      return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 })
    }

    const file = fileResult.rows[0]

    if (!file.minio_path) {
      return NextResponse.json({ error: 'Fichier non téléchargé' }, { status: 400 })
    }

    if (!isTextExtractable(file.file_type)) {
      return NextResponse.json({ error: `Type ${file.file_type} non supporté` }, { status: 400 })
    }

    // Supprimer l'ancienne indexation si existe
    if (file.knowledge_base_id) {
      await db.query('DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1', [file.knowledge_base_id])
      await db.query('DELETE FROM knowledge_base WHERE id = $1', [file.knowledge_base_id])
    }

    // Télécharger le fichier depuis le stockage
    const downloadResult = await downloadWebFile(file.minio_path)
    if (!downloadResult.success || !downloadResult.buffer) {
      await db.query(
        `UPDATE web_files SET parse_error = $1, updated_at = NOW() WHERE id = $2`,
        [downloadResult.error || 'Erreur téléchargement', id]
      )
      return NextResponse.json({ error: downloadResult.error || 'Erreur téléchargement' }, { status: 500 })
    }

    // Parser le fichier
    const parsed = await parseFile(downloadResult.buffer, file.file_type)

    if (!parsed.success || !parsed.text || parsed.text.length < 100) {
      const errorMsg = parsed.error || 'Contenu insuffisant'
      await db.query(
        `UPDATE web_files SET parse_error = $1, updated_at = NOW() WHERE id = $2`,
        [errorMsg, id]
      )
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // Normaliser le texte
    const normalizedText = normalizeText(parsed.text)
    const detectedLang = detectTextLanguage(normalizedText) || 'fr'
    const language = (detectedLang === 'ar' || detectedLang === 'fr') ? detectedLang : 'fr'
    const category = file.source_category || 'general'

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
      await db.query(
        `UPDATE web_files SET parse_error = 'Aucun chunk généré', updated_at = NOW() WHERE id = $1`,
        [id]
      )
      return NextResponse.json({ error: 'Aucun chunk généré' }, { status: 400 })
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
          title, full_text, category, language, source_file,
          is_indexed, chunk_count
        ) VALUES ($1, $2, $3, $4, $5, true, $6)
        RETURNING id`,
        [
          parsed.metadata.title || file.filename,
          normalizedText,
          category,
          language,
          file.url,
          chunks.length,
        ]
      )

      const knowledgeBaseId = kbResult.rows[0].id

      // Créer les chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const embedding = embeddings[i]

        if (!embedding) continue

        const tokenCount = Math.ceil(chunk.metadata.wordCount * 1.3)

        await client.query(
          `INSERT INTO knowledge_base_chunks (
            knowledge_base_id, chunk_index, content, embedding, metadata
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            knowledgeBaseId,
            i,
            chunk.content,
            formatEmbeddingForPostgres(embedding),
            JSON.stringify({ tokenCount, wordCount: chunk.metadata.wordCount }),
          ]
        )
      }

      // Mettre à jour le fichier
      await client.query(
        `UPDATE web_files SET
          knowledge_base_id = $1,
          text_content = $2,
          word_count = $3,
          chunks_count = $4,
          extracted_title = $5,
          extracted_author = $6,
          page_count = $7,
          is_indexed = true,
          indexed_at = NOW(),
          parse_error = NULL,
          updated_at = NOW()
        WHERE id = $8`,
        [
          knowledgeBaseId,
          normalizedText.substring(0, 10000),
          parsed.metadata.wordCount,
          chunks.length,
          parsed.metadata.title,
          parsed.metadata.author,
          parsed.metadata.pageCount,
          id,
        ]
      )

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        message: `Fichier réindexé: ${chunks.length} chunks créés`,
        chunksCreated: chunks.length,
        knowledgeBaseId,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Erreur réindexation fichier:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur réindexation' },
      { status: 500 }
    )
  }
}
