/**
 * Interface de base pour les cloud storage providers
 * Supporte : Google Drive (MVP), OneDrive (futur), Dropbox (futur)
 */

export interface CloudStorageConfig {
  provider: 'google_drive' | 'onedrive' | 'dropbox'
  userId: string
  accessToken: string
  refreshToken: string
  tokenExpiresAt: Date
  enabled: boolean
  defaultProvider: boolean
  rootFolderId?: string
  rootFolderName?: string
  providerEmail?: string
  scopes?: string[]
}

export interface UploadFileParams {
  fileName: string
  fileBuffer: Buffer
  mimeType: string
  parentFolderId?: string
}

export interface UploadFileResult {
  fileId: string
  fileName: string
  fileSize: number
  mimeType: string
  webViewLink: string
  webContentLink?: string
  thumbnailLink?: string
  createdTime: Date
  modifiedTime: Date
}

export interface CreateFolderParams {
  folderName: string
  parentFolderId?: string
}

export interface CreateFolderResult {
  folderId: string
  folderName: string
  webViewLink: string
  createdTime: Date
}

export interface DownloadFileParams {
  fileId: string
}

export interface DownloadFileResult {
  buffer: Buffer
  mimeType: string
  fileName: string
}

export interface DeleteFileParams {
  fileId: string
}

export interface ListFilesParams {
  folderId?: string
  query?: string
  pageSize?: number
  pageToken?: string
}

export interface FileMetadata {
  id: string
  name: string
  mimeType: string
  size: number
  webViewLink: string
  createdTime: Date
  modifiedTime: Date
  parents?: string[]
}

export interface ListFilesResult {
  files: FileMetadata[]
  nextPageToken?: string
}

export interface WatchFolderParams {
  folderId: string
  webhookUrl: string
  channelId: string
  expirationMs?: number // Durée validité webhook (défaut 7 jours)
}

export interface WatchFolderResult {
  channelId: string
  resourceId: string
  expiration: Date
}

export interface StopWatchingParams {
  channelId: string
  resourceId: string
}

/**
 * Interface commune pour tous les cloud storage providers
 */
export interface ICloudStorageProvider {
  /**
   * Obtenir URL OAuth pour autorisation utilisateur
   */
  getAuthUrl(state?: string): string

  /**
   * Échanger code OAuth contre tokens
   */
  exchangeCodeForTokens(code: string): Promise<{
    accessToken: string
    refreshToken: string
    expiresIn: number
    scope: string
    tokenType: string
  }>

  /**
   * Rafraîchir access token expiré
   */
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string
    expiresIn: number
  }>

  /**
   * Uploader un fichier
   */
  uploadFile(params: UploadFileParams): Promise<UploadFileResult>

  /**
   * Télécharger un fichier
   */
  downloadFile(params: DownloadFileParams): Promise<DownloadFileResult>

  /**
   * Supprimer un fichier
   */
  deleteFile(params: DeleteFileParams): Promise<void>

  /**
   * Créer un dossier
   */
  createFolder(params: CreateFolderParams): Promise<CreateFolderResult>

  /**
   * Lister fichiers dans un dossier
   */
  listFiles(params: ListFilesParams): Promise<ListFilesResult>

  /**
   * Surveiller un dossier pour changements (Push Notifications)
   */
  watchFolder(params: WatchFolderParams): Promise<WatchFolderResult>

  /**
   * Arrêter surveillance dossier
   */
  stopWatching(params: StopWatchingParams): Promise<void>

  /**
   * Obtenir métadonnées fichier
   */
  getFileMetadata(fileId: string): Promise<FileMetadata>

  /**
   * Vérifier si token est expiré
   */
  isTokenExpired(expiresAt: Date): boolean

  /**
   * Obtenir informations utilisateur connecté
   */
  getUserInfo(): Promise<{
    email: string
    name: string
  }>
}

/**
 * Erreurs personnalisées cloud storage
 */
export class CloudStorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'CloudStorageError'
  }
}

export class TokenExpiredError extends CloudStorageError {
  constructor(provider: string) {
    super('Access token expiré', 'TOKEN_EXPIRED', provider)
  }
}

export class QuotaExceededError extends CloudStorageError {
  constructor(provider: string) {
    super('Quota de stockage dépassé', 'QUOTA_EXCEEDED', provider, 429)
  }
}

export class FileNotFoundError extends CloudStorageError {
  constructor(provider: string, fileId: string) {
    super(`Fichier non trouvé: ${fileId}`, 'FILE_NOT_FOUND', provider, 404)
  }
}
