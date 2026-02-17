/**
 * Utilitaires Google Drive pour le système d'ingestion
 *
 * Fonctions helpers pour parser les URLs, valider l'accès,
 * et mapper les MIME types Google Drive.
 */

import type { WebSource, LinkedFile, GoogleDriveFile } from './types'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { getGoogleDriveClient } from './storage-adapter'

/**
 * Parser URL dossier Google Drive → folderId
 *
 * Formats supportés:
 * - https://drive.google.com/drive/folders/1A2B3C4D5E6F
 * - https://drive.google.com/drive/folders/1A2B3C4D5E6F?usp=sharing
 * - gdrive://1A2B3C4D5E6F
 * - 1A2B3C4D5E6F (folderId direct)
 */
export function parseGoogleDriveFolderUrl(url: string): string | null {
  if (!url || url.trim() === '') {
    return null
  }

  url = url.trim()

  // Format direct: gdrive://
  if (url.startsWith('gdrive://')) {
    return url.substring(9)
  }

  // Format direct: folderId uniquement
  if (!/[/:?#]/.test(url) && url.length > 20) {
    return url
  }

  // Format Google Drive URL
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (folderMatch) {
    return folderMatch[1]
  }

  return null
}

/**
 * Construire baseUrl format gdrive://
 */
export function buildGoogleDriveBaseUrl(folderId: string): string {
  return `gdrive://${folderId}`
}

/**
 * Vérifier si une source est Google Drive
 */
export function isGoogleDriveSource(source: WebSource): boolean {
  const baseUrl = source.baseUrl ?? (source as any).base_url
  return baseUrl?.startsWith('gdrive://') ?? false
}

/**
 * Mapper MIME type Google → type fichier LinkedFile
 */
export function mapMimeTypeToFileType(mimeType: string): LinkedFile['type'] {
  // Google Docs natifs (doivent être exportés)
  if (mimeType.includes('google-apps.document')) {
    return 'docx'
  }
  if (mimeType.includes('google-apps.spreadsheet')) {
    return 'xlsx'
  }
  if (mimeType.includes('google-apps.presentation')) {
    return 'pptx'
  }

  // Fichiers standards
  if (mimeType === 'application/pdf') {
    return 'pdf'
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return 'docx'
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return 'xlsx'
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimeType === 'application/vnd.ms-powerpoint'
  ) {
    return 'pptx'
  }
  if (mimeType.startsWith('image/')) {
    return 'image'
  }

  return 'other'
}

/**
 * Vérifier le type de fichier selon la config driveConfig.fileTypes
 */
export function isAllowedFileType(
  file: GoogleDriveFile,
  allowedTypes: ('pdf' | 'docx' | 'doc' | 'xlsx' | 'pptx')[]
): boolean {
  const fileType = mapMimeTypeToFileType(file.mimeType)

  // Mapper les types
  const typeMap: Record<string, string[]> = {
    pdf: ['pdf'],
    docx: ['docx', 'doc'],
    doc: ['docx', 'doc'],
    xlsx: ['xlsx', 'xls'],
    pptx: ['pptx', 'ppt'],
  }

  for (const allowedType of allowedTypes) {
    const mappedTypes = typeMap[allowedType] || [allowedType]
    if (mappedTypes.includes(fileType)) {
      return true
    }
  }

  return false
}

/**
 * Valider accès dossier Google Drive
 * Vérifie que le service account peut accéder au dossier
 * et liste les premiers fichiers
 */
export async function validateDriveFolderAccess(folderId: string): Promise<{
  success: boolean
  fileCount?: number
  error?: string
}> {
  try {
    const drive = await getGoogleDriveClient()

    // Tester l'accès au dossier
    try {
      await drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType',
      })
    } catch (error) {
      const gdriveCode = error && typeof error === 'object' && 'code' in error ? Number((error as { code?: unknown }).code) : 0

      if (gdriveCode === 404) {
        return {
          success: false,
          error: 'Dossier non trouvé. Vérifiez que le dossier existe et est partagé avec le service account.',
        }
      }
      if (gdriveCode === 403) {
        return {
          success: false,
          error: 'Accès refusé. Vérifiez que le dossier est partagé avec le service account en lecture.',
        }
      }
      throw error
    }

    // Lister les 10 premiers fichiers pour validation
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 10,
    })

    const files = response.data.files || []

    return {
      success: true,
      fileCount: files.length,
    }
  } catch (error) {
    console.error('[GDriveUtils] Validation error:', error)
    return {
      success: false,
      error: getErrorMessage(error) || 'Erreur inconnue lors de la validation',
    }
  }
}

/**
 * Construire un LinkedFile depuis un GoogleDriveFile
 */
export function mapGoogleDriveFileToLinkedFile(file: GoogleDriveFile): LinkedFile {
  return {
    url: file.webViewLink,
    type: mapMimeTypeToFileType(file.mimeType),
    filename: file.name,
    size: parseInt(file.size, 10),
    downloaded: false,
    minioPath: file.id, // ⭐ Google Drive fileId stocké comme "minioPath"
    originalUrl: file.webViewLink,
    source: 'gdrive',
  }
}

/**
 * Construire l'URL publique Google Drive pour un fichier
 */
export function buildGoogleDriveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

/**
 * Extraire le folderId depuis une baseUrl format gdrive://
 */
export function extractFolderIdFromBaseUrl(baseUrl: string): string | null {
  if (baseUrl.startsWith('gdrive://')) {
    return baseUrl.substring(9)
  }
  return null
}

/**
 * Vérifier si un MIME type nécessite un export (Google Docs natifs)
 */
export function requiresExport(mimeType: string): boolean {
  return (
    mimeType.includes('google-apps.document') ||
    mimeType.includes('google-apps.spreadsheet') ||
    mimeType.includes('google-apps.presentation')
  )
}

/**
 * Obtenir le MIME type d'export pour un fichier Google natif
 */
export function getExportMimeType(mimeType: string): string | null {
  if (mimeType.includes('google-apps.document')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
  }
  if (mimeType.includes('google-apps.spreadsheet')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // XLSX
  }
  if (mimeType.includes('google-apps.presentation')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation' // PPTX
  }
  return null
}
