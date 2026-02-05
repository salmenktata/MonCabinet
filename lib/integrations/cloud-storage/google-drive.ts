/**
 * Implémentation Google Drive API
 * Provider cloud storage par défaut pour MVP
 */

import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'
import { Readable } from 'stream'
import type {
  ICloudStorageProvider,
  UploadFileParams,
  UploadFileResult,
  CreateFolderParams,
  CreateFolderResult,
  DownloadFileParams,
  DownloadFileResult,
  DeleteFileParams,
  ListFilesParams,
  ListFilesResult,
  FileMetadata,
  WatchFolderParams,
  WatchFolderResult,
  StopWatchingParams,
} from './base-provider'
import {
  CloudStorageError,
  TokenExpiredError,
  QuotaExceededError,
  FileNotFoundError,
} from './base-provider'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file', // Accès fichiers créés par l'app
  'https://www.googleapis.com/auth/userinfo.email', // Email utilisateur
]

export class GoogleDriveProvider implements ICloudStorageProvider {
  private oauth2Client: any
  private drive: drive_v3.Drive | null = null

  constructor(accessToken?: string) {
    this.oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    )

    if (accessToken) {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
      })
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client })
    }
  }

  /**
   * Obtenir URL OAuth pour autorisation utilisateur
   */
  getAuthUrl(state?: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Pour obtenir refresh_token
      scope: SCOPES,
      prompt: 'consent', // Forcer re-consentement pour refresh_token
      state: state || undefined,
    })
  }

  /**
   * Échanger code OAuth contre tokens
   */
  async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string
    refreshToken: string
    expiresIn: number
    scope: string
    tokenType: string
  }> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code)

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new CloudStorageError(
          'Tokens OAuth incomplets',
          'INVALID_TOKENS',
          'google_drive'
        )
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expiry_date
          ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
          : 3600,
        scope: tokens.scope || SCOPES.join(' '),
        tokenType: tokens.token_type || 'Bearer',
      }
    } catch (error: any) {
      throw new CloudStorageError(
        `Échec échange code OAuth: ${error.message}`,
        'OAUTH_EXCHANGE_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Rafraîchir access token expiré
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string
    expiresIn: number
  }> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      })

      const { credentials } = await this.oauth2Client.refreshAccessToken()

      if (!credentials.access_token) {
        throw new CloudStorageError(
          'Access token absent après refresh',
          'REFRESH_FAILED',
          'google_drive'
        )
      }

      return {
        accessToken: credentials.access_token,
        expiresIn: credentials.expiry_date
          ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
          : 3600,
      }
    } catch (error: any) {
      throw new CloudStorageError(
        `Échec rafraîchissement token: ${error.message}`,
        'REFRESH_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Uploader un fichier
   */
  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    if (!this.drive) {
      throw new CloudStorageError(
        'Client Drive non initialisé',
        'NOT_INITIALIZED',
        'google_drive'
      )
    }

    try {
      const fileMetadata: drive_v3.Schema$File = {
        name: params.fileName,
        ...(params.parentFolderId && { parents: [params.parentFolderId] }),
      }

      const media = {
        mimeType: params.mimeType,
        body: Readable.from(params.fileBuffer),
      }

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields:
          'id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink, createdTime, modifiedTime',
      })

      const file = response.data

      if (!file.id || !file.name) {
        throw new CloudStorageError(
          'Réponse Google Drive invalide',
          'INVALID_RESPONSE',
          'google_drive'
        )
      }

      // Rendre fichier partageable (anyone with link can view)
      await this.drive.permissions.create({
        fileId: file.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      })

      return {
        fileId: file.id,
        fileName: file.name,
        fileSize: file.size ? parseInt(file.size) : 0,
        mimeType: file.mimeType || params.mimeType,
        webViewLink: file.webViewLink || '',
        webContentLink: file.webContentLink,
        thumbnailLink: file.thumbnailLink,
        createdTime: file.createdTime ? new Date(file.createdTime) : new Date(),
        modifiedTime: file.modifiedTime
          ? new Date(file.modifiedTime)
          : new Date(),
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      if (error.response?.status === 429 || error.response?.status === 403) {
        throw new QuotaExceededError('google_drive')
      }
      throw new CloudStorageError(
        `Échec upload fichier: ${error.message}`,
        'UPLOAD_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Télécharger un fichier
   */
  async downloadFile(
    params: DownloadFileParams
  ): Promise<DownloadFileResult> {
    if (!this.drive) {
      throw new CloudStorageError(
        'Client Drive non initialisé',
        'NOT_INITIALIZED',
        'google_drive'
      )
    }

    try {
      // Récupérer métadonnées fichier
      const metadataResponse = await this.drive.files.get({
        fileId: params.fileId,
        fields: 'name, mimeType',
      })

      // Télécharger contenu fichier
      const response = await this.drive.files.get(
        {
          fileId: params.fileId,
          alt: 'media',
        },
        { responseType: 'arraybuffer' }
      )

      return {
        buffer: Buffer.from(response.data as ArrayBuffer),
        mimeType: metadataResponse.data.mimeType || 'application/octet-stream',
        fileName: metadataResponse.data.name || 'document',
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new FileNotFoundError('google_drive', params.fileId)
      }
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      throw new CloudStorageError(
        `Échec téléchargement fichier: ${error.message}`,
        'DOWNLOAD_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Supprimer un fichier
   */
  async deleteFile(params: DeleteFileParams): Promise<void> {
    if (!this.drive) {
      throw new CloudStorageError(
        'Client Drive non initialisé',
        'NOT_INITIALIZED',
        'google_drive'
      )
    }

    try {
      await this.drive.files.delete({
        fileId: params.fileId,
      })
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new FileNotFoundError('google_drive', params.fileId)
      }
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      throw new CloudStorageError(
        `Échec suppression fichier: ${error.message}`,
        'DELETE_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Créer un dossier
   */
  async createFolder(params: CreateFolderParams): Promise<CreateFolderResult> {
    if (!this.drive) {
      throw new CloudStorageError(
        'Client Drive non initialisé',
        'NOT_INITIALIZED',
        'google_drive'
      )
    }

    try {
      const fileMetadata: drive_v3.Schema$File = {
        name: params.folderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(params.parentFolderId && { parents: [params.parentFolderId] }),
      }

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink, createdTime',
      })

      const folder = response.data

      if (!folder.id || !folder.name) {
        throw new CloudStorageError(
          'Réponse Google Drive invalide',
          'INVALID_RESPONSE',
          'google_drive'
        )
      }

      return {
        folderId: folder.id,
        folderName: folder.name,
        webViewLink: folder.webViewLink || '',
        createdTime: folder.createdTime
          ? new Date(folder.createdTime)
          : new Date(),
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      throw new CloudStorageError(
        `Échec création dossier: ${error.message}`,
        'CREATE_FOLDER_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Lister fichiers dans un dossier
   */
  async listFiles(params: ListFilesParams): Promise<ListFilesResult> {
    if (!this.drive) {
      throw new CloudStorageError(
        'Client Drive non initialisé',
        'NOT_INITIALIZED',
        'google_drive'
      )
    }

    try {
      let query = "trashed = false"

      if (params.folderId) {
        query += ` and '${params.folderId}' in parents`
      }

      if (params.query) {
        query += ` and ${params.query}`
      }

      const response = await this.drive.files.list({
        q: query,
        pageSize: params.pageSize || 100,
        pageToken: params.pageToken,
        fields:
          'nextPageToken, files(id, name, mimeType, size, webViewLink, createdTime, modifiedTime, parents)',
      })

      const files: FileMetadata[] =
        response.data.files?.map((file) => ({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType || 'application/octet-stream',
          size: file.size ? parseInt(file.size) : 0,
          webViewLink: file.webViewLink || '',
          createdTime: file.createdTime
            ? new Date(file.createdTime)
            : new Date(),
          modifiedTime: file.modifiedTime
            ? new Date(file.modifiedTime)
            : new Date(),
          parents: file.parents,
        })) || []

      return {
        files,
        nextPageToken: response.data.nextPageToken || undefined,
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      throw new CloudStorageError(
        `Échec liste fichiers: ${error.message}`,
        'LIST_FILES_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Surveiller un dossier pour changements (Push Notifications)
   */
  async watchFolder(params: WatchFolderParams): Promise<WatchFolderResult> {
    if (!this.drive) {
      throw new CloudStorageError(
        'Client Drive non initialisé',
        'NOT_INITIALIZED',
        'google_drive'
      )
    }

    try {
      const expirationMs =
        params.expirationMs || 7 * 24 * 60 * 60 * 1000 // 7 jours par défaut
      const expiration = Date.now() + expirationMs

      const response = await this.drive.files.watch({
        fileId: params.folderId,
        requestBody: {
          id: params.channelId,
          type: 'web_hook',
          address: params.webhookUrl,
          expiration: expiration.toString(),
        },
      })

      if (!response.data.resourceId) {
        throw new CloudStorageError(
          'resourceId manquant dans réponse',
          'WATCH_FAILED',
          'google_drive'
        )
      }

      return {
        channelId: params.channelId,
        resourceId: response.data.resourceId,
        expiration: new Date(expiration),
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      throw new CloudStorageError(
        `Échec surveillance dossier: ${error.message}`,
        'WATCH_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Arrêter surveillance dossier
   */
  async stopWatching(params: StopWatchingParams): Promise<void> {
    if (!this.drive) {
      throw new CloudStorageError(
        'Client Drive non initialisé',
        'NOT_INITIALIZED',
        'google_drive'
      )
    }

    try {
      await this.drive.channels.stop({
        requestBody: {
          id: params.channelId,
          resourceId: params.resourceId,
        },
      })
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      // Ignorer erreur 404 (channel déjà expiré)
      if (error.response?.status !== 404) {
        throw new CloudStorageError(
          `Échec arrêt surveillance: ${error.message}`,
          'STOP_WATCHING_FAILED',
          'google_drive',
          error.response?.status
        )
      }
    }
  }

  /**
   * Obtenir métadonnées fichier
   */
  async getFileMetadata(fileId: string): Promise<FileMetadata> {
    if (!this.drive) {
      throw new CloudStorageError(
        'Client Drive non initialisé',
        'NOT_INITIALIZED',
        'google_drive'
      )
    }

    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        fields:
          'id, name, mimeType, size, webViewLink, createdTime, modifiedTime, parents',
      })

      const file = response.data

      if (!file.id || !file.name) {
        throw new CloudStorageError(
          'Métadonnées fichier invalides',
          'INVALID_METADATA',
          'google_drive'
        )
      }

      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType || 'application/octet-stream',
        size: file.size ? parseInt(file.size) : 0,
        webViewLink: file.webViewLink || '',
        createdTime: file.createdTime ? new Date(file.createdTime) : new Date(),
        modifiedTime: file.modifiedTime
          ? new Date(file.modifiedTime)
          : new Date(),
        parents: file.parents,
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new FileNotFoundError('google_drive', fileId)
      }
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      throw new CloudStorageError(
        `Échec récupération métadonnées: ${error.message}`,
        'GET_METADATA_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }

  /**
   * Vérifier si token est expiré
   */
  isTokenExpired(expiresAt: Date): boolean {
    // Considérer expiré si moins de 5 minutes restantes
    const bufferMs = 5 * 60 * 1000
    return Date.now() >= expiresAt.getTime() - bufferMs
  }

  /**
   * Obtenir informations utilisateur connecté
   */
  async getUserInfo(): Promise<{ email: string; name: string }> {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client })
      const response = await oauth2.userinfo.get()

      return {
        email: response.data.email || '',
        name: response.data.name || '',
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new TokenExpiredError('google_drive')
      }
      throw new CloudStorageError(
        `Échec récupération infos utilisateur: ${error.message}`,
        'GET_USER_INFO_FAILED',
        'google_drive',
        error.response?.status
      )
    }
  }
}

/**
 * Créer instance GoogleDriveProvider avec access token
 */
export function createGoogleDriveProvider(
  accessToken: string
): GoogleDriveProvider {
  return new GoogleDriveProvider(accessToken)
}

/**
 * Créer instance GoogleDriveProvider sans token (pour OAuth flow)
 */
export function createGoogleDriveAuthProvider(): GoogleDriveProvider {
  return new GoogleDriveProvider()
}
