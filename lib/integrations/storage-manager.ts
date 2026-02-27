/**
 * Storage Manager - Orchestrateur stockage documents dossiers
 * Gère l'upload/download documents vers MinIO (VPS)
 * Structure chemin : {userId}/{dossierId}/{timestamp}_{filename}
 */

import { query } from '@/lib/db/postgres'
import { uploadFile, deleteFile, getPresignedUrl, downloadFile } from '@/lib/storage/minio'

const DOSSIERS_BUCKET = 'dossiers'

export interface StorageManagerUploadParams {
  userId: string
  dossierId: string
  fileName: string
  fileBuffer: Buffer
  mimeType: string
  categorie?: string
  description?: string
  sourceType?: 'manual' | 'google_drive_sync'
  sourceMetadata?: Record<string, any>
}

export interface StorageManagerUploadResult {
  documentId: string
  externalFileId: string
  externalSharingLink: string
  success: boolean
}

/**
 * Classe principale Storage Manager
 */
export class StorageManager {
  constructor() {}

  /**
   * Upload document vers MinIO (stockage VPS)
   */
  async uploadDocument(
    params: StorageManagerUploadParams
  ): Promise<StorageManagerUploadResult> {
    const { userId, dossierId, fileName, fileBuffer, mimeType, categorie, description, sourceType, sourceMetadata } =
      params

    // 1. Construire le chemin MinIO
    const timestamp = Date.now()
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const minioPath = `${userId}/${dossierId}/${timestamp}_${safeName}`

    // 2. Upload vers MinIO
    await uploadFile(fileBuffer, minioPath, { userId, dossierId, fileName }, DOSSIERS_BUCKET)

    // 3. Créer l'entrée en BDD
    const documentId = await this.createDocumentRecord({
      userId,
      dossierId,
      fileName,
      mimeType,
      fileSize: fileBuffer.length,
      minioPath,
      categorie,
      description,
      sourceType: sourceType || 'manual',
      sourceMetadata,
    })

    return {
      documentId,
      externalFileId: minioPath,
      externalSharingLink: '',
      success: true,
    }
  }

  /**
   * Générer une presigned URL pour accès temporaire (7 jours)
   */
  async getDocumentUrl(minioPath: string): Promise<string> {
    return getPresignedUrl(minioPath, 7 * 24 * 3600, DOSSIERS_BUCKET)
  }

  /**
   * Télécharger le contenu d'un document MinIO
   */
  async downloadDocument(minioPath: string): Promise<Buffer> {
    return downloadFile(minioPath, DOSSIERS_BUCKET)
  }

  /**
   * Supprimer un document de MinIO
   */
  async deleteDocument(minioPath: string): Promise<void> {
    await deleteFile(minioPath, DOSSIERS_BUCKET)
  }

  /**
   * Créer entrée document dans BDD
   */
  private async createDocumentRecord(params: {
    userId: string
    dossierId: string
    fileName: string
    mimeType: string
    fileSize: number
    minioPath: string
    categorie?: string
    description?: string
    sourceType: string
    sourceMetadata?: any
  }): Promise<string> {
    const result = await query(
      `INSERT INTO documents (
        user_id, dossier_id, nom_fichier, type_fichier, taille_fichier,
        storage_provider, minio_path,
        source_type, source_metadata, categorie, description, needs_classification,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'minio', $6, $7, $8, $9, $10, false, NOW(), NOW())
      RETURNING id`,
      [
        params.userId,
        params.dossierId,
        params.fileName,
        params.mimeType,
        params.fileSize,
        params.minioPath,
        params.sourceType,
        JSON.stringify(params.sourceMetadata || {}),
        params.categorie || null,
        params.description || null,
      ]
    )

    if (result.rows.length === 0) {
      throw new Error('Échec création entrée document BDD')
    }

    return result.rows[0].id
  }
}

/**
 * Créer instance Storage Manager
 */
export function createStorageManager(): StorageManager {
  return new StorageManager()
}
