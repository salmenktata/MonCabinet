/**
 * Adaptateur de stockage pour les fichiers web scrapés
 * Supporte MinIO (local/VPS) et Google Drive (cloud)
 */

import { db } from '@/lib/db/postgres'
import { google } from 'googleapis'

// =============================================================================
// TYPES
// =============================================================================

export type StorageProvider = 'minio' | 'google_drive'

export interface StorageConfig {
  provider: StorageProvider
}

export interface UploadResult {
  success: boolean
  path: string
  url?: string
  provider: StorageProvider
  size?: number
  error?: string
}

export interface DownloadResult {
  success: boolean
  buffer?: Buffer
  mimeType?: string
  error?: string
}

export interface DeleteResult {
  success: boolean
  error?: string
}

// =============================================================================
// CONFIGURATION
// =============================================================================

function getStorageProvider(): StorageProvider {
  // Priorité : GOOGLE_DRIVE si configuré, sinon MINIO
  const googleToken = process.env.GOOGLE_DRIVE_SYSTEM_TOKEN
  if (googleToken) {
    return 'google_drive'
  }

  const minioKey = process.env.MINIO_ACCESS_KEY
  if (minioKey) {
    return 'minio'
  }

  // Défaut: essayer MinIO
  return 'minio'
}

// =============================================================================
// MINIO FUNCTIONS
// =============================================================================

async function uploadToMinio(
  buffer: Buffer,
  path: string,
  metadata: Record<string, string>,
  bucket: string
): Promise<UploadResult> {
  try {
    const { uploadFile } = await import('@/lib/storage/minio')
    const result = await uploadFile(buffer, path, metadata, bucket)

    return {
      success: true,
      path: result.path,
      url: result.url,
      provider: 'minio',
      size: buffer.length,
    }
  } catch (error) {
    return {
      success: false,
      path: '',
      provider: 'minio',
      error: error instanceof Error ? error.message : 'Erreur MinIO',
    }
  }
}

async function downloadFromMinio(
  path: string,
  bucket: string
): Promise<DownloadResult> {
  try {
    const { downloadFile } = await import('@/lib/storage/minio')
    const buffer = await downloadFile(path, bucket)

    return {
      success: true,
      buffer,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur MinIO',
    }
  }
}

// =============================================================================
// GOOGLE DRIVE FUNCTIONS
// =============================================================================

/**
 * Obtenir un client Google Drive authentifié
 * Supporte plusieurs méthodes d'authentification:
 * 1. Service Account JSON (recommandé pour production)
 * 2. Token OAuth système (via DB)
 * 3. Variables d'environnement simples (pour test)
 */
export async function getGoogleDriveClient() {
  // Méthode 1: Service Account (recommandé)
  try {
    const saResult = await db.query(
      `SELECT value FROM system_settings WHERE key = 'google_drive_service_account'`
    )

    if (saResult.rows.length > 0) {
      // PostgreSQL JSONB retourne déjà un objet JavaScript, pas besoin de JSON.parse()
      const serviceAccountJson = saResult.rows[0].value
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountJson,
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.metadata.readonly',
        ],
      })
      return google.drive({ version: 'v3', auth })
    }
  } catch (error) {
    // Table n'existe pas encore ou pas de service account configuré
    console.log('[GoogleDrive] Service account non configuré, essai méthode OAuth...')
  }

  // Méthode 2: Token OAuth système (via DB)
  try {
    const tokenResult = await db.query(
      `SELECT value FROM system_settings WHERE key = 'google_drive_system_token'`
    )

    if (tokenResult.rows.length > 0) {
      // PostgreSQL JSONB retourne déjà un objet JavaScript, pas besoin de JSON.parse()
      const tokenData = tokenResult.rows[0].value

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      )

      oauth2Client.setCredentials({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expiry_date: tokenData.expiry_date,
      })

      // Rafraîchir le token si nécessaire
      if (tokenData.expiry_date && Date.now() >= tokenData.expiry_date - 60000) {
        const { credentials } = await oauth2Client.refreshAccessToken()
        oauth2Client.setCredentials(credentials)

        // Mettre à jour le token en base
        await db.query(
          `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = 'google_drive_system_token'`,
          [JSON.stringify({
            ...tokenData,
            access_token: credentials.access_token,
            expiry_date: credentials.expiry_date,
          })]
        )
      }

      return google.drive({ version: 'v3', auth: oauth2Client })
    }
  } catch (error) {
    console.log('[GoogleDrive] Token OAuth système non configuré')
  }

  // Méthode 3: Mode test avec variables d'environnement (pour développement)
  // ATTENTION: Ne fonctionne que si un token valide existe déjà
  if (process.env.GOOGLE_DRIVE_TEST_ACCESS_TOKEN) {
    console.log('[GoogleDrive] Utilisation token de test (dev only)')
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({
      access_token: process.env.GOOGLE_DRIVE_TEST_ACCESS_TOKEN,
    })
    return google.drive({ version: 'v3', auth: oauth2Client })
  }

  // Aucune méthode d'authentification disponible
  throw new Error(
    'Google Drive non configuré. Options:\n' +
    '1. Service Account: Configurer google_drive_service_account dans system_settings\n' +
    '2. OAuth système: Configurer google_drive_system_token dans system_settings\n' +
    '3. Voir documentation: GDRIVE_IMPLEMENTATION.md'
  )
}

async function getOrCreateWebScraperFolder(drive: any): Promise<string> {
  // Chercher le dossier existant
  const searchResponse = await drive.files.list({
    q: "name = 'Qadhya-WebScraper' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name)',
  })

  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    return searchResponse.data.files[0].id
  }

  // Créer le dossier
  const createResponse = await drive.files.create({
    requestBody: {
      name: 'Qadhya-WebScraper',
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })

  console.log('[Storage] Dossier Google Drive créé: Qadhya-WebScraper')
  return createResponse.data.id
}

async function uploadToGoogleDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  metadata: Record<string, string>
): Promise<UploadResult> {
  try {
    const drive = await getGoogleDriveClient()
    const folderId = await getOrCreateWebScraperFolder(drive)

    const { Readable } = await import('stream')

    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
        description: `Source: ${metadata.sourceUrl || 'unknown'}\nType: ${metadata.fileType || 'unknown'}`,
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: 'id, name, webViewLink, webContentLink, size',
    })

    const file = response.data

    // Rendre le fichier accessible via lien
    await drive.permissions.create({
      fileId: file.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    return {
      success: true,
      path: file.id!,
      url: file.webContentLink || file.webViewLink || undefined,
      provider: 'google_drive',
      size: file.size ? parseInt(file.size) : buffer.length,
    }
  } catch (error) {
    console.error('[Storage] Erreur upload Google Drive:', error)
    return {
      success: false,
      path: '',
      provider: 'google_drive',
      error: error instanceof Error ? error.message : 'Erreur Google Drive',
    }
  }
}

async function downloadFromGoogleDrive(fileId: string): Promise<DownloadResult> {
  try {
    const drive = await getGoogleDriveClient()

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    )

    return {
      success: true,
      buffer: Buffer.from(response.data as ArrayBuffer),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur Google Drive',
    }
  }
}

/**
 * Télécharge un fichier Google Drive pour indexation
 * Gère l'export automatique des Google Docs natifs en format standard
 *
 * @param fileId ID du fichier Google Drive
 * @param mimeType MIME type du fichier
 * @returns Buffer du fichier téléchargé avec son MIME type final
 */
export async function downloadGoogleDriveFileForIndexing(
  fileId: string,
  mimeType: string
): Promise<DownloadResult & { mimeType?: string }> {
  try {
    const drive = await getGoogleDriveClient()

    // Google Docs natifs: export en format standard
    if (mimeType.includes('google-apps.document')) {
      const exportMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      const response = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: 'arraybuffer' }
      )
      return {
        success: true,
        buffer: Buffer.from(response.data as ArrayBuffer),
        mimeType: exportMimeType,
      }
    }

    if (mimeType.includes('google-apps.spreadsheet')) {
      const exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const response = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: 'arraybuffer' }
      )
      return {
        success: true,
        buffer: Buffer.from(response.data as ArrayBuffer),
        mimeType: exportMimeType,
      }
    }

    if (mimeType.includes('google-apps.presentation')) {
      const exportMimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      const response = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: 'arraybuffer' }
      )
      return {
        success: true,
        buffer: Buffer.from(response.data as ArrayBuffer),
        mimeType: exportMimeType,
      }
    }

    // Fichiers standards: téléchargement direct
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    )

    return {
      success: true,
      buffer: Buffer.from(response.data as ArrayBuffer),
      mimeType,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur Google Drive',
    }
  }
}

// =============================================================================
// UNIFIED API
// =============================================================================

/**
 * Upload un fichier vers le stockage configuré
 */
export async function uploadWebFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  metadata: Record<string, string>
): Promise<UploadResult> {
  const provider = getStorageProvider()

  if (provider === 'google_drive') {
    return uploadToGoogleDrive(buffer, filename, mimeType, metadata)
  }

  // MinIO
  const bucket = 'web-files'
  const path = `sources/${metadata.sourceId || 'unknown'}/${Date.now()}_${filename}`
  return uploadToMinio(buffer, path, { ...metadata, contentType: mimeType }, bucket)
}

/**
 * Télécharge un fichier depuis le stockage
 */
export async function downloadWebFile(
  path: string,
  provider?: StorageProvider
): Promise<DownloadResult> {
  const actualProvider = provider || getStorageProvider()

  if (actualProvider === 'google_drive') {
    return downloadFromGoogleDrive(path)
  }

  return downloadFromMinio(path, 'web-files')
}

/**
 * Vérifie si le stockage est configuré
 */
export async function isStorageConfigured(): Promise<{
  configured: boolean
  provider: StorageProvider
  error?: string
}> {
  const provider = getStorageProvider()

  if (provider === 'google_drive') {
    try {
      await getGoogleDriveClient()
      return { configured: true, provider }
    } catch (error) {
      return {
        configured: false,
        provider,
        error: error instanceof Error ? error.message : 'Google Drive non configuré',
      }
    }
  }

  // MinIO
  try {
    const { healthCheck } = await import('@/lib/storage/minio')
    const healthy = await healthCheck()
    return {
      configured: healthy,
      provider,
      error: healthy ? undefined : 'MinIO non accessible',
    }
  } catch (error) {
    return {
      configured: false,
      provider,
      error: error instanceof Error ? error.message : 'MinIO non configuré',
    }
  }
}

/**
 * Supprime un fichier du stockage
 */
export async function deleteWebFile(
  path: string,
  provider?: StorageProvider
): Promise<DeleteResult> {
  const actualProvider = provider || getStorageProvider()

  try {
    if (actualProvider === 'google_drive') {
      // Google Drive: le path contient le fileId
      const drive = await getGoogleDriveClient()
      await drive.files.delete({ fileId: path })
      return { success: true }
    }

    // MinIO
    const { deleteFile } = await import('@/lib/storage/minio')
    await deleteFile('web-files', path)
    return { success: true }
  } catch (error) {
    console.error('[StorageAdapter] Erreur suppression:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur suppression',
    }
  }
}
