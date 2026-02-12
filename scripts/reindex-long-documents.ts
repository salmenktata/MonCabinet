/**
 * Service de réindexation des documents longs avec découpage automatique
 */

import { db } from '@/lib/db/postgres'
import { splitLongDocument, generateSectionMetadata } from './document-splitter'
import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'

const MAX_DOCUMENT_SIZE = 50000 // 50KB

export interface ReindexResult {
  success: boolean
  processed: number
  succeeded: number
  failed: number
  sectionsCreated: number
  errors: Array<{ pageId: string; error: string }>
}

/**
 * Réindexer les documents longs (>50KB) avec découpage automatique
 */
export async function reindexLongDocuments(
  sourceId: string,
  options: {
    limit?: number
    dryRun?: boolean
  } = {}
): Promise<ReindexResult> {
  const { limit = 50, dryRun = false } = options

  const result: ReindexResult = {
    success: true,
    processed: 0,
    succeeded: 0,
    failed: 0,
    sectionsCreated: 0,
    errors: [],
  }

  try {
    // Récupérer les pages failed avec documents trop longs
    const pagesResult = await db.query(
      `SELECT id, url, title, extracted_text, LENGTH(extracted_text) as text_length
       FROM web_pages
       WHERE web_source_id = $1
       AND status = 'failed'
       AND error_message LIKE '%trop long%'
       AND LENGTH(extracted_text) > $2
       ORDER BY LENGTH(extracted_text) DESC
       LIMIT $3`,
      [sourceId, MAX_DOCUMENT_SIZE, limit]
    )

    const pages = pagesResult.rows

    console.log(`[ReindexLong] Found ${pages.length} long documents to process`)

    for (const page of pages) {
      result.processed++

      try {
        console.log(
          `[ReindexLong] Processing ${page.title} (${page.text_length} chars)...`
        )

        // Découper le document en sections
        const splitResult = splitLongDocument(page.extracted_text)

        if (!splitResult.success || splitResult.sections.length === 0) {
          throw new Error(`Échec découpage: ${splitResult.error}`)
        }

        console.log(
          `[ReindexLong] Document split into ${splitResult.totalSections} sections`
        )

        if (dryRun) {
          console.log(`[ReindexLong] DRY RUN - Would create ${splitResult.totalSections} sections`)
          result.succeeded++
          result.sectionsCreated += splitResult.totalSections
          continue
        }

        // Créer un document KB pour chaque section
        const client = await db.getClient()
        try {
          await client.query('BEGIN')

          for (const section of splitResult.sections) {
            // Générer embedding pour la section
            const embeddingResult = await generateEmbedding(section.content)

            // Métadonnées de section
            const sectionMetadata = generateSectionMetadata(
              page.id,
              page.title,
              section,
              splitResult.totalSections
            )

            // Insérer document KB
            const kbResult = await client.query(
              `INSERT INTO knowledge_base (
                category, title, description, full_text, embedding,
                is_indexed, language, metadata, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, NOW(), NOW())
              RETURNING id`,
              [
                'google_drive',
                `${page.title} - ${section.title}`,
                `Section ${section.index + 1}/${splitResult.totalSections}`,
                section.content,
                formatEmbeddingForPostgres(embeddingResult.embedding),
                true,
                'ar',
                JSON.stringify({
                  web_source_id: sourceId,
                  web_page_id: page.id,
                  ...sectionMetadata,
                }),
              ]
            )

            const kbId = kbResult.rows[0].id

            // Créer chunks pour cette section
            const chunkSize = 400 // mots
            const words = section.content.split(/\s+/)
            const chunks = []

            for (let i = 0; i < words.length; i += chunkSize) {
              const chunkWords = words.slice(i, i + chunkSize)
              const chunkContent = chunkWords.join(' ')

              // Générer embedding pour le chunk
              const chunkEmbedding = await generateEmbedding(chunkContent)

              if (chunkEmbedding.success && chunkEmbedding.embedding) {
                chunks.push({
                  content: chunkContent,
                  embedding: formatEmbeddingForPostgres(chunkEmbedding.embedding),
                  index: chunks.length,
                })
              }
            }

            // Insérer les chunks
            for (const chunk of chunks) {
              await client.query(
                `INSERT INTO knowledge_base_chunks (
                  knowledge_base_id, chunk_index, content, embedding, created_at
                ) VALUES ($1, $2, $3, $4::vector, NOW())`,
                [kbId, chunk.index, chunk.content, chunk.embedding]
              )
            }

            result.sectionsCreated++

            console.log(
              `[ReindexLong] Created section ${section.index + 1}/${splitResult.totalSections} ` +
                `with ${chunks.length} chunks`
            )
          }

          // Mettre à jour la page source
          await client.query(
            `UPDATE web_pages SET
              status = 'indexed',
              is_indexed = true,
              chunks_count = $2,
              last_indexed_at = NOW(),
              error_message = NULL,
              error_count = 0,
              updated_at = NOW()
            WHERE id = $1`,
            [page.id, result.sectionsCreated]
          )

          await client.query('COMMIT')

          result.succeeded++
          console.log(`[ReindexLong] ✅ ${page.title} - ${splitResult.totalSections} sections créées`)
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      } catch (error) {
        result.failed++
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
        result.errors.push({ pageId: page.id, error: errorMsg })
        console.error(`[ReindexLong] ❌ ${page.title}:`, errorMsg)
      }
    }

    return result
  } catch (error) {
    return {
      ...result,
      success: false,
      errors: [
        ...result.errors,
        {
          pageId: 'global',
          error: error instanceof Error ? error.message : 'Erreur globale',
        },
      ],
    }
  }
}
