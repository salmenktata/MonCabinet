/**
 * Storage Manager - Orchestrateur Cloud Storage
 * Gère l'upload/download documents vers cloud providers (Google Drive)
 * Architecture hiérarchique : Clients Qadhya/ → [Client]/ → [Dossier juridique]/ → fichiers
 */

import { query } from '@/lib/db/postgres'
import {
  createGoogleDriveProvider,
  TokenExpiredError,
  CloudStorageError,
  type UploadFileResult,
} from './cloud-storage'

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

export interface ClientFolderInfo {
  folderId: string
  folderUrl: string
  folderName: string
}

export interface DossierFolderInfo {
  folderId: string
  folderUrl: string
  folderName: string
}

/**
 * Classe principale Storage Manager
 */
export class StorageManager {
  constructor() {
    // Plus besoin de client Supabase - on utilise query() directement
  }

  /**
   * Upload document vers cloud storage avec structure hiérarchique
   */
  async uploadDocument(
    params: StorageManagerUploadParams
  ): Promise<StorageManagerUploadResult> {
    try {
      // 1. Récupérer configuration cloud utilisateur
      const cloudConfig = await this.getCloudConfig(params.userId)

      // 2. Vérifier et refresh token si nécessaire
      const accessToken = await this.ensureValidToken(cloudConfig)

      // 3. Récupérer informations dossier et client
      const dossier = await this.getDossier(params.dossierId)
      const client = await this.getClient(dossier.client_id)

      // 4. Créer provider Google Drive
      const provider = createGoogleDriveProvider(accessToken)

      // 5. Créer/vérifier dossier racine "Clients Qadhya/"
      const rootFolderId = await this.ensureRootFolder(
        provider,
        cloudConfig.root_folder_id
      )

      // 6. Créer/vérifier dossier client "[NOM Prénom - CIN]/"
      const clientFolder = await this.ensureClientFolder(
        provider,
        client,
        rootFolderId
      )

      // 7. Créer/vérifier dossier juridique "Dossier 2025-XXX/"
      const dossierFolder = await this.ensureDossierFolder(
        provider,
        dossier,
        clientFolder.folderId
      )

      // 8. Upload fichier vers Google Drive
      const uploadResult = await provider.uploadFile({
        fileName: params.fileName,
        fileBuffer: params.fileBuffer,
        mimeType: params.mimeType,
        parentFolderId: dossierFolder.folderId,
      })

      // 9. Créer entrée dans BDD
      const documentId = await this.createDocumentRecord({
        userId: params.userId,
        dossierId: params.dossierId,
        fileName: params.fileName,
        mimeType: params.mimeType,
        fileSize: uploadResult.fileSize,
        externalFileId: uploadResult.fileId,
        externalFolderClientId: clientFolder.folderId,
        externalFolderDossierId: dossierFolder.folderId,
        externalSharingLink: uploadResult.webViewLink,
        externalMetadata: {
          webContentLink: uploadResult.webContentLink,
          thumbnailLink: uploadResult.thumbnailLink,
          createdTime: uploadResult.createdTime.toISOString(),
          modifiedTime: uploadResult.modifiedTime.toISOString(),
        },
        categorie: params.categorie,
        description: params.description,
        sourceType: params.sourceType || 'manual',
        sourceMetadata: params.sourceMetadata,
      })

      // 10. Mettre à jour dossier racine si nouveau
      if (rootFolderId !== cloudConfig.root_folder_id) {
        await this.updateRootFolder(params.userId, rootFolderId)
      }

      return {
        documentId,
        externalFileId: uploadResult.fileId,
        externalSharingLink: uploadResult.webViewLink,
        success: true,
      }
    } catch (error) {
      // Rollback en cas d'erreur
      console.error('[StorageManager] Upload failed:', error)

      if (error instanceof TokenExpiredError) {
        throw new CloudStorageError(
          'Token Google Drive expiré. Veuillez vous reconnecter.',
          'TOKEN_EXPIRED',
          'google_drive'
        )
      }

      throw error
    }
  }

  /**
   * Récupérer configuration cloud utilisateur
   */
  private async getCloudConfig(userId: string) {
    const result = await query(
      `SELECT * FROM cloud_providers_config
       WHERE user_id = $1 AND provider = 'google_drive' AND enabled = true`,
      [userId]
    )

    const data = result.rows[0]

    if (!data) {
      throw new CloudStorageError(
        'Configuration Google Drive non trouvée. Veuillez connecter votre compte.',
        'CONFIG_NOT_FOUND',
        'google_drive'
      )
    }

    return {
      id: data.id,
      provider: data.provider,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: new Date(data.token_expires_at),
      root_folder_id: data.root_folder_id,
      root_folder_name: data.root_folder_name,
    }
  }

  /**
   * Vérifier et refresh token si expiré
   */
  private async ensureValidToken(cloudConfig: any): Promise<string> {
    const provider = createGoogleDriveProvider(cloudConfig.accessToken)

    // Vérifier si token expiré (buffer 5 min)
    if (provider.isTokenExpired(cloudConfig.tokenExpiresAt)) {
      console.log('[StorageManager] Token expiré, rafraîchissement...')

      // Refresh token
      const refreshed = await provider.refreshAccessToken(
        cloudConfig.refreshToken
      )

      // Mettre à jour BDD
      const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000)

      await query(
        `UPDATE cloud_providers_config
         SET access_token = $1, token_expires_at = $2, updated_at = NOW()
         WHERE id = $3`,
        [refreshed.accessToken, newExpiresAt.toISOString(), cloudConfig.id]
      )

      console.log('[StorageManager] Token rafraîchi avec succès')
      return refreshed.accessToken
    }

    return cloudConfig.accessToken
  }

  /**
   * Récupérer informations dossier
   */
  private async getDossier(dossierId: string) {
    const result = await query(
      `SELECT id, client_id, numero, objet, google_drive_folder_id, google_drive_folder_url
       FROM dossiers WHERE id = $1`,
      [dossierId]
    )

    const data = result.rows[0]

    if (!data) {
      throw new Error(`Dossier non trouvé: ${dossierId}`)
    }

    return data
  }

  /**
   * Récupérer informations client
   */
  private async getClient(clientId: string) {
    const result = await query(
      `SELECT id, nom, prenom, cin, type_client, google_drive_folder_id, google_drive_folder_url
       FROM clients WHERE id = $1`,
      [clientId]
    )

    const data = result.rows[0]

    if (!data) {
      throw new Error(`Client non trouvé: ${clientId}`)
    }

    return data
  }

  /**
   * Créer/vérifier dossier racine "Clients Qadhya/"
   */
  private async ensureRootFolder(
    provider: any,
    existingRootFolderId?: string | null
  ): Promise<string> {
    // Si dossier racine existe déjà
    if (existingRootFolderId) {
      try {
        // Vérifier qu'il existe toujours
        await provider.getFileMetadata(existingRootFolderId)
        return existingRootFolderId
      } catch (error) {
        console.warn(
          '[StorageManager] Dossier racine non trouvé, recréation...'
        )
      }
    }

    // Créer dossier racine
    const rootFolder = await provider.createFolder({
      folderName: 'Clients Qadhya',
    })

    console.log(
      `[StorageManager] Dossier racine créé: ${rootFolder.folderId}`
    )
    return rootFolder.folderId
  }

  /**
   * Créer/vérifier dossier client "[NOM Prénom - CIN]/"
   */
  private async ensureClientFolder(
    provider: any,
    client: any,
    rootFolderId: string
  ): Promise<ClientFolderInfo> {
    // Si dossier client existe déjà en BDD
    if (client.google_drive_folder_id) {
      try {
        const metadata = await provider.getFileMetadata(
          client.google_drive_folder_id
        )
        return {
          folderId: client.google_drive_folder_id,
          folderUrl: client.google_drive_folder_url || metadata.webViewLink,
          folderName: metadata.name,
        }
      } catch (error) {
        console.warn(
          '[StorageManager] Dossier client non trouvé, recréation...'
        )
      }
    }

    // Créer nom dossier client
    let folderName: string
    if (client.type_client === 'personne_morale') {
      folderName = `[${client.nom}]`
    } else {
      const cin = client.cin ? ` - CIN ${client.cin}` : ''
      const prenom = client.prenom ? ` ${client.prenom}` : ''
      folderName = `[${client.nom}${prenom}${cin}]`
    }

    // Créer dossier client
    const clientFolder = await provider.createFolder({
      folderName,
      parentFolderId: rootFolderId,
    })

    // Mettre à jour BDD client
    await query(
      `UPDATE clients
       SET google_drive_folder_id = $1, google_drive_folder_url = $2, updated_at = NOW()
       WHERE id = $3`,
      [clientFolder.folderId, clientFolder.webViewLink, client.id]
    )

    console.log(`[StorageManager] Dossier client créé: ${folderName}`)

    return {
      folderId: clientFolder.folderId,
      folderUrl: clientFolder.webViewLink,
      folderName: clientFolder.folderName,
    }
  }

  /**
   * Créer/vérifier dossier juridique "Dossier 2025-XXX/"
   */
  private async ensureDossierFolder(
    provider: any,
    dossier: any,
    clientFolderId: string
  ): Promise<DossierFolderInfo> {
    // Si dossier juridique existe déjà en BDD
    if (dossier.google_drive_folder_id) {
      try {
        const metadata = await provider.getFileMetadata(
          dossier.google_drive_folder_id
        )
        return {
          folderId: dossier.google_drive_folder_id,
          folderUrl: dossier.google_drive_folder_url || metadata.webViewLink,
          folderName: metadata.name,
        }
      } catch (error) {
        console.warn(
          '[StorageManager] Dossier juridique non trouvé, recréation...'
        )
      }
    }

    // Créer nom dossier juridique
    const objet = dossier.objet ? ` (${dossier.objet})` : ''
    const folderName = `Dossier ${dossier.numero}${objet}`

    // Créer dossier juridique
    const dossierFolder = await provider.createFolder({
      folderName,
      parentFolderId: clientFolderId,
    })

    // Mettre à jour BDD dossier
    await query(
      `UPDATE dossiers
       SET google_drive_folder_id = $1, google_drive_folder_url = $2, updated_at = NOW()
       WHERE id = $3`,
      [dossierFolder.folderId, dossierFolder.webViewLink, dossier.id]
    )

    console.log(`[StorageManager] Dossier juridique créé: ${folderName}`)

    // Créer aussi dossier "Documents non classés/" pour ce client si première fois
    await this.ensureUnclassifiedFolder(provider, clientFolderId)

    return {
      folderId: dossierFolder.folderId,
      folderUrl: dossierFolder.webViewLink,
      folderName: dossierFolder.folderName,
    }
  }

  /**
   * Créer dossier "Documents non classés/" pour zone tampon
   */
  private async ensureUnclassifiedFolder(
    provider: any,
    clientFolderId: string
  ): Promise<string> {
    try {
      // Vérifier si dossier existe déjà
      const result = await provider.listFiles({
        folderId: clientFolderId,
        query: `name = 'Documents non classés' and mimeType = 'application/vnd.google-apps.folder'`,
      })

      if (result.files.length > 0) {
        return result.files[0].id
      }

      // Créer dossier
      const unclassifiedFolder = await provider.createFolder({
        folderName: 'Documents non classés',
        parentFolderId: clientFolderId,
      })

      console.log(
        `[StorageManager] Dossier "Documents non classés" créé pour client`
      )
      return unclassifiedFolder.folderId
    } catch (error) {
      console.warn(
        '[StorageManager] Erreur création dossier non classés:',
        error
      )
      return '' // Non bloquant
    }
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
    externalFileId: string
    externalFolderClientId: string
    externalFolderDossierId: string
    externalSharingLink: string
    externalMetadata: any
    categorie?: string
    description?: string
    sourceType: string
    sourceMetadata?: any
  }): Promise<string> {
    const result = await query(
      `INSERT INTO documents (
        user_id, dossier_id, nom_fichier, type_fichier, taille_fichier,
        storage_provider, external_file_id, external_folder_client_id,
        external_folder_dossier_id, external_sharing_link, external_metadata,
        source_type, source_metadata, categorie, description, needs_classification,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
      RETURNING id`,
      [
        params.userId,
        params.dossierId,
        params.fileName,
        params.mimeType,
        params.fileSize,
        'google_drive',
        params.externalFileId,
        params.externalFolderClientId,
        params.externalFolderDossierId,
        params.externalSharingLink,
        JSON.stringify(params.externalMetadata),
        params.sourceType,
        JSON.stringify(params.sourceMetadata || {}),
        params.categorie,
        params.description,
        false, // needs_classification
      ]
    )

    if (result.rows.length === 0) {
      throw new Error('Échec création entrée document BDD')
    }

    return result.rows[0].id
  }

  /**
   * Mettre à jour dossier racine dans config
   */
  private async updateRootFolder(
    userId: string,
    rootFolderId: string
  ): Promise<void> {
    await query(
      `UPDATE cloud_providers_config
       SET root_folder_id = $1, updated_at = NOW()
       WHERE user_id = $2 AND provider = 'google_drive'`,
      [rootFolderId, userId]
    )
  }
}

/**
 * Créer instance Storage Manager
 */
export function createStorageManager(): StorageManager {
  return new StorageManager()
}
