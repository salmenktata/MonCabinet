/**
 * Service de suppression complète des sources web
 * Gère la suppression en cascade de toutes les données associées
 * incluant la knowledge base
 */

import { db } from '@/lib/db/postgres'
import { deleteFile } from '@/lib/storage/minio'

// =============================================================================
// TYPES
// =============================================================================

export interface DeleteSourceResult {
  success: boolean
  sourceDeleted: boolean
  stats: {
    knowledgeBaseDocs: number
    knowledgeBaseChunks: number
    webPages: number
    webFiles: number
    crawlJobs: number
    crawlLogs: number
    minioFiles: number
  }
  errors: string[]
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Supprime complètement une source web et TOUTES ses données associées
 *
 * Cette fonction effectue une suppression complète incluant :
 * 1. Documents Knowledge Base (avec chunks et embeddings)
 * 2. Fichiers MinIO (PDFs, docs, images)
 * 3. Pages web (et leurs métadonnées, versions, classifications)
 * 4. Jobs de crawl
 * 5. Logs de crawl
 * 6. Métriques de santé
 * 7. Règles de classification
 * 8. La source web elle-même
 *
 * @param sourceId - ID de la source web à supprimer
 * @returns Résultat détaillé de la suppression
 */
export async function deleteWebSourceComplete(
  sourceId: string
): Promise<DeleteSourceResult> {
  const result: DeleteSourceResult = {
    success: false,
    sourceDeleted: false,
    stats: {
      knowledgeBaseDocs: 0,
      knowledgeBaseChunks: 0,
      webPages: 0,
      webFiles: 0,
      crawlJobs: 0,
      crawlLogs: 0,
      minioFiles: 0,
    },
    errors: [],
  }

  const client = await db.getClient()

  try {
    await client.query('BEGIN')

    // =========================================================================
    // ÉTAPE 1 : Compter les ressources avant suppression
    // =========================================================================

    // Compter les documents KB liés à cette source
    const kbCountResult = await client.query(
      `SELECT COUNT(*) as count
       FROM knowledge_base
       WHERE metadata->>'sourceId' = $1`,
      [sourceId]
    )
    const kbDocsCount = parseInt(kbCountResult.rows[0].count)

    // Compter les chunks KB (via les docs KB)
    const chunksCountResult = await client.query(
      `SELECT COUNT(*) as count
       FROM knowledge_base_chunks kbc
       JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
       WHERE kb.metadata->>'sourceId' = $1`,
      [sourceId]
    )
    const chunksCount = parseInt(chunksCountResult.rows[0].count)

    // Compter les pages web
    const pagesCountResult = await client.query(
      `SELECT COUNT(*) as count
       FROM web_pages
       WHERE web_source_id = $1`,
      [sourceId]
    )
    const pagesCount = parseInt(pagesCountResult.rows[0].count)

    // Compter les fichiers web
    const filesCountResult = await client.query(
      `SELECT COUNT(*) as count
       FROM web_files
       WHERE web_source_id = $1`,
      [sourceId]
    )
    const filesCount = parseInt(filesCountResult.rows[0].count)

    // Compter les jobs
    const jobsCountResult = await client.query(
      `SELECT COUNT(*) as count
       FROM web_crawl_jobs
       WHERE web_source_id = $1`,
      [sourceId]
    )
    const jobsCount = parseInt(jobsCountResult.rows[0].count)

    // Compter les logs
    const logsCountResult = await client.query(
      `SELECT COUNT(*) as count
       FROM web_crawl_logs
       WHERE web_source_id = $1`,
      [sourceId]
    )
    const logsCount = parseInt(logsCountResult.rows[0].count)

    result.stats.knowledgeBaseDocs = kbDocsCount
    result.stats.knowledgeBaseChunks = chunksCount
    result.stats.webPages = pagesCount
    result.stats.webFiles = filesCount
    result.stats.crawlJobs = jobsCount
    result.stats.crawlLogs = logsCount

    // =========================================================================
    // ÉTAPE 2 : Récupérer les chemins de fichiers MinIO avant suppression
    // =========================================================================

    // Récupérer les fichiers web_files
    const webFilesResult = await client.query(
      `SELECT file_path
       FROM web_files
       WHERE web_source_id = $1 AND file_path IS NOT NULL`,
      [sourceId]
    )
    const minioFilePaths = webFilesResult.rows.map(row => row.file_path)

    // Récupérer les fichiers KB
    const kbFilesResult = await client.query(
      `SELECT source_file
       FROM knowledge_base
       WHERE metadata->>'sourceId' = $1 AND source_file IS NOT NULL`,
      [sourceId]
    )
    const kbFilePaths = kbFilesResult.rows.map(row => row.source_file)

    const allMinioFiles = [...minioFilePaths, ...kbFilePaths]

    // =========================================================================
    // ÉTAPE 3 : Supprimer les documents Knowledge Base
    // =========================================================================

    // Supprimer les documents KB (les chunks seront supprimés en cascade)
    await client.query(
      `DELETE FROM knowledge_base
       WHERE metadata->>'sourceId' = $1`,
      [sourceId]
    )

    // =========================================================================
    // ÉTAPE 4 : Supprimer les fichiers MinIO
    // =========================================================================

    let minioDeletedCount = 0

    // Supprimer chaque fichier MinIO
    for (const filePath of allMinioFiles) {
      try {
        // Extraire bucket et path depuis le chemin complet
        // Format attendu : "bucket-name/path/to/file.pdf"
        const parts = filePath.split('/')
        if (parts.length >= 2) {
          const bucket = parts[0]
          const objectPath = parts.slice(1).join('/')
          await deleteFile(bucket, objectPath)
          minioDeletedCount++
        }
      } catch (err) {
        result.errors.push(`Erreur suppression MinIO ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    result.stats.minioFiles = minioDeletedCount

    // =========================================================================
    // ÉTAPE 5 : Supprimer la source web
    // =========================================================================

    // Cette suppression déclenche les cascades automatiques PostgreSQL :
    // - web_pages (et leurs métadonnées, versions, classifications, contradictions)
    // - web_crawl_jobs
    // - web_crawl_logs
    // - web_files
    // - crawler_health_metrics
    // - source_classification_rules
    // - web_source_ban_status

    const deleteSourceResult = await client.query(
      'DELETE FROM web_sources WHERE id = $1',
      [sourceId]
    )

    result.sourceDeleted = (deleteSourceResult.rowCount || 0) > 0

    // =========================================================================
    // COMMIT
    // =========================================================================

    await client.query('COMMIT')
    result.success = true

    return result
  } catch (error) {
    await client.query('ROLLBACK')
    result.errors.push(`Erreur transaction: ${error instanceof Error ? error.message : String(error)}`)
    return result
  } finally {
    client.release()
  }
}

// =============================================================================
// FONCTION DE VÉRIFICATION AVANT SUPPRESSION
// =============================================================================

/**
 * Retourne un aperçu de ce qui sera supprimé
 * Utile pour demander confirmation à l'utilisateur avant suppression
 */
export async function getDeletePreview(sourceId: string): Promise<{
  sourceName: string
  sourceUrl: string
  stats: DeleteSourceResult['stats']
  estimatedSize: string
}> {
  const sourceResult = await db.query(
    'SELECT name, base_url FROM web_sources WHERE id = $1',
    [sourceId]
  )

  if (sourceResult.rows.length === 0) {
    throw new Error('Source non trouvée')
  }

  const source = sourceResult.rows[0]

  // Utiliser la même logique de comptage que deleteWebSourceComplete
  const kbDocsCount = await db.query(
    `SELECT COUNT(*) as count FROM knowledge_base WHERE metadata->>'sourceId' = $1`,
    [sourceId]
  )

  const chunksCount = await db.query(
    `SELECT COUNT(*) as count
     FROM knowledge_base_chunks kbc
     JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
     WHERE kb.metadata->>'sourceId' = $1`,
    [sourceId]
  )

  const pagesCount = await db.query(
    `SELECT COUNT(*) as count FROM web_pages WHERE web_source_id = $1`,
    [sourceId]
  )

  const filesCount = await db.query(
    `SELECT COUNT(*) as count FROM web_files WHERE web_source_id = $1`,
    [sourceId]
  )

  const jobsCount = await db.query(
    `SELECT COUNT(*) as count FROM web_crawl_jobs WHERE web_source_id = $1`,
    [sourceId]
  )

  const logsCount = await db.query(
    `SELECT COUNT(*) as count FROM web_crawl_logs WHERE web_source_id = $1`,
    [sourceId]
  )

  // Estimer la taille totale
  const sizeResult = await db.query(
    `SELECT
       COALESCE(SUM(LENGTH(wp.extracted_text)), 0) +
       COALESCE(SUM(LENGTH(kb.full_text)), 0) as total_text_size
     FROM web_pages wp
     LEFT JOIN knowledge_base kb ON kb.metadata->>'sourceId' = $1
     WHERE wp.web_source_id = $1`,
    [sourceId]
  )

  const sizeBytes = parseInt(sizeResult.rows[0].total_text_size || '0')
  const estimatedSize = formatBytes(sizeBytes)

  return {
    sourceName: source.name,
    sourceUrl: source.base_url,
    stats: {
      knowledgeBaseDocs: parseInt(kbDocsCount.rows[0].count),
      knowledgeBaseChunks: parseInt(chunksCount.rows[0].count),
      webPages: parseInt(pagesCount.rows[0].count),
      webFiles: parseInt(filesCount.rows[0].count),
      crawlJobs: parseInt(jobsCount.rows[0].count),
      crawlLogs: parseInt(logsCount.rows[0].count),
      minioFiles: parseInt(filesCount.rows[0].count), // Estimation
    },
    estimatedSize,
  }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`
}
