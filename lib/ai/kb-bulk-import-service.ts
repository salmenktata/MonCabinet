/**
 * Service d'import en lot pour la base de connaissances
 *
 * Gère l'upload et le traitement de multiples documents en une seule opération.
 */

import { db } from '@/lib/db/postgres'
import type { KnowledgeBaseCategory, KnowledgeBaseLanguage } from './knowledge-base-service'

// =============================================================================
// TYPES
// =============================================================================

export interface BulkImportInput {
  files: Array<{
    buffer: Buffer
    filename: string
    mimeType: string
    title?: string
  }>
  defaultCategory: KnowledgeBaseCategory
  defaultLanguage: KnowledgeBaseLanguage
  defaultTags?: string[]
  autoIndex?: boolean
}

export interface BulkImportResult {
  batchId: string
  totalFiles: number
  completedFiles: number
  failedFiles: number
  status: 'processing' | 'completed' | 'partially_completed' | 'failed'
  documentIds: string[]
  errors: Array<{ filename: string; error: string }>
}

export interface BulkImportProgress {
  batchId: string
  totalFiles: number
  completedFiles: number
  failedFiles: number
  status: string
  documentIds: string[]
  errors: Array<{ filename: string; error: string }>
  createdAt: Date
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Démarre un import en lot
 */
export async function startBulkImport(
  input: BulkImportInput,
  uploadedBy: string
): Promise<BulkImportResult> {
  const {
    files,
    defaultCategory,
    defaultLanguage,
    defaultTags = [],
    autoIndex = true,
  } = input

  // Créer le batch
  const batchResult = await db.query(
    `INSERT INTO kb_bulk_imports
     (uploaded_by, total_files, default_category, default_language, default_tags, auto_index)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [uploadedBy, files.length, defaultCategory, defaultLanguage, defaultTags, autoIndex]
  )

  const batchId = batchResult.rows[0].id
  const documentIds: string[] = []
  const errors: Array<{ filename: string; error: string }> = []

  // Traiter chaque fichier séquentiellement
  for (const file of files) {
    try {
      const { uploadKnowledgeDocument } = await import('./knowledge-base-service')

      const title = file.title || file.filename.replace(/\.[^/.]+$/, '')

      const doc = await uploadKnowledgeDocument(
        {
          category: defaultCategory,
          language: defaultLanguage,
          title,
          tags: defaultTags,
          file: {
            buffer: file.buffer,
            filename: file.filename,
            mimeType: file.mimeType,
          },
          autoIndex,
        },
        uploadedBy
      )

      documentIds.push(doc.id)

      // Lier au batch
      await db.query(
        `UPDATE knowledge_base SET bulk_import_id = $1 WHERE id = $2`,
        [batchId, doc.id]
      )

      // Mettre à jour la progression
      await db.query(
        `UPDATE kb_bulk_imports
         SET completed_files = completed_files + 1,
             document_ids = array_append(document_ids, $1),
             updated_at = NOW()
         WHERE id = $2`,
        [doc.id, batchId]
      )
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
      errors.push({ filename: file.filename, error: errorMsg })

      await db.query(
        `UPDATE kb_bulk_imports
         SET failed_files = failed_files + 1,
             errors = errors || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify([{ filename: file.filename, error: errorMsg }]), batchId]
      )
    }
  }

  // Déterminer le statut final
  let status: BulkImportResult['status']
  if (errors.length === 0) {
    status = 'completed'
  } else if (documentIds.length === 0) {
    status = 'failed'
  } else {
    status = 'partially_completed'
  }

  await db.query(
    `UPDATE kb_bulk_imports SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, batchId]
  )

  return {
    batchId,
    totalFiles: files.length,
    completedFiles: documentIds.length,
    failedFiles: errors.length,
    status,
    documentIds,
    errors,
  }
}

/**
 * Récupère la progression d'un import en lot
 */
export async function getBulkImportProgress(batchId: string): Promise<BulkImportProgress | null> {
  const result = await db.query(
    `SELECT * FROM kb_bulk_imports WHERE id = $1`,
    [batchId]
  )

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  return {
    batchId: row.id,
    totalFiles: row.total_files,
    completedFiles: row.completed_files,
    failedFiles: row.failed_files,
    status: row.status,
    documentIds: row.document_ids || [],
    errors: row.errors || [],
    createdAt: new Date(row.created_at),
  }
}

/**
 * Liste les imports en lot récents
 */
export async function listBulkImports(options?: {
  limit?: number
  offset?: number
}): Promise<BulkImportProgress[]> {
  const { limit = 20, offset = 0 } = options || {}

  const result = await db.query(
    `SELECT bi.*, u.email as uploaded_by_email
     FROM kb_bulk_imports bi
     LEFT JOIN users u ON bi.uploaded_by = u.id
     ORDER BY bi.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  return result.rows.map((row: Record<string, unknown>) => ({
    batchId: row.id as string,
    totalFiles: row.total_files as number,
    completedFiles: row.completed_files as number,
    failedFiles: row.failed_files as number,
    status: row.status as string,
    documentIds: (row.document_ids as string[]) || [],
    errors: (row.errors as Array<{ filename: string; error: string }>) || [],
    createdAt: new Date(row.created_at as string),
  }))
}
